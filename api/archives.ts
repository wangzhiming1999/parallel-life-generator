import type { VercelRequest, VercelResponse } from '@vercel/node'
import postgres from 'postgres'
import { containsSensitiveWord } from './_guard.js'
import type { ArchivePublishInput, PublicArchive } from '../src/shared/archive.js'

const ALLOWED_ORIGINS = [
  'https://parallel-life-generator.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]
const rateMap = new Map<string, number[]>()

function allowRequest(ip: string, limit: number): boolean {
  const now = Date.now()
  const recent = (rateMap.get(ip) ?? []).filter((time) => now - time < 60_000)
  if (recent.length >= limit) return false
  rateMap.set(ip, [...recent, now])
  return true
}

function error(res: VercelResponse, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } })
}

export function validateArchive(body: unknown): ArchivePublishInput | null {
  if (!body || typeof body !== 'object') return null
  const value = body as Record<string, unknown>
  const assumption = typeof value.assumption === 'string' ? value.assumption.trim() : ''
  const universeTitle = typeof value.universeTitle === 'string' ? value.universeTitle.trim() : ''
  const insight = typeof value.insight === 'string' ? value.insight.trim() : ''
  if (assumption.length < 2 || assumption.length > 50 || universeTitle.length < 2 || universeTitle.length > 30 || insight.length < 1 || insight.length > 500) return null
  if (!Array.isArray(value.scenes) || value.scenes.length !== 18 || !Array.isArray(value.path) || value.path.length !== 17) return null

  const scenes = value.scenes.map((scene) => {
    if (!scene || typeof scene !== 'object') return null
    const item = scene as Record<string, unknown>
    if (!Number.isInteger(item.scene) || !Array.isArray(item.paragraphs)) return null
    const paragraphs = item.paragraphs.filter((text): text is string => typeof text === 'string').map((text) => text.slice(0, 500))
    if (!paragraphs.length) return null
    const choices = Array.isArray(item.choices) && item.choices.length === 2 && item.choices.every((choice) => typeof choice === 'string')
      ? [String(item.choices[0]).slice(0, 120), String(item.choices[1]).slice(0, 120)] as [string, string]
      : null
    return { scene: Number(item.scene), paragraphs, choices, insight: typeof item.insight === 'string' ? item.insight.slice(0, 500) : null }
  })
  if (scenes.some((scene) => scene === null)) return null

  const path = value.path.map((step) => {
    if (!step || typeof step !== 'object') return null
    const item = step as Record<string, unknown>
    if (!Number.isInteger(item.scene) || (item.choice !== 0 && item.choice !== 1)) return null
    return { scene: Number(item.scene), choice: item.choice, decision: typeof item.decision === 'string' ? item.decision.trim().slice(0, 120) : undefined }
  })
  if (path.some((step) => step === null)) return null

  const allText = [assumption, insight, ...scenes.flatMap((scene) => scene?.paragraphs ?? []), ...path.map((step) => step?.decision ?? '')].join('\n')
  if (containsSensitiveWord(allText)) return null
  return { assumption, universeTitle, insight, scenes: scenes as ArchivePublishInput['scenes'], path: path as ArchivePublishInput['path'] }
}

function publicArchive(row: Record<string, unknown>): PublicArchive {
  return {
    id: String(row.id),
    archiveCode: String(row.archive_code),
    assumption: String(row.assumption),
    universeTitle: String(row.universe_title),
    scenes: row.scenes as PublicArchive['scenes'],
    path: row.path as PublicArchive['path'],
    insight: String(row.insight),
    salvageCount: Number(row.salvage_count),
    createdAt: new Date(String(row.created_at)).toISOString(),
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = String(req.headers.origin ?? '')
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return error(res, 403, 'FORBIDDEN_ORIGIN', '来源不被允许')
  res.setHeader('Access-Control-Allow-Origin', origin || ALLOWED_ORIGINS[0])
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET' && req.method !== 'POST') return error(res, 405, 'METHOD_NOT_ALLOWED', '不支持这个操作')

  const ip = String(req.headers['x-forwarded-for'] ?? 'unknown').split(',')[0].trim()
  if (!allowRequest(ip, req.method === 'POST' ? 5 : 30)) return error(res, 429, 'RATE_LIMITED', '海面有些拥挤，请稍后再试')
  const connectionString = process.env.POSTGRES_URL
  if (!connectionString) return error(res, 503, 'STORAGE_UNAVAILABLE', '档案海暂时没有开放')
  const sql = postgres(connectionString, { max: 1, idle_timeout: 5 })

  try {
    if (req.method === 'POST') {
      const archive = validateArchive(req.body)
      if (!archive) return error(res, 422, 'INVALID_ARCHIVE', '这份档案暂时无法投入大海')
      const archiveCode = `SEA-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
      const [row] = await sql`
        insert into public.drifting_archives (archive_code, assumption, universe_title, scenes, path, insight)
        values (${archiveCode}, ${archive.assumption}, ${archive.universeTitle}, ${sql.json(JSON.parse(JSON.stringify(archive.scenes)))}, ${sql.json(JSON.parse(JSON.stringify(archive.path)))}, ${archive.insight})
        returning *
      `
      return res.status(201).json({ data: publicArchive(row) })
    }

    const [row] = await sql`
      update public.drifting_archives
      set salvage_count = salvage_count + 1
      where id = (
        select id from public.drifting_archives where status = 'published' order by random() limit 1
      )
      returning *
    `
    if (!row) return error(res, 404, 'OCEAN_EMPTY', '海面还很安静，成为第一个投递档案的人吧')
    return res.status(200).json({ data: publicArchive(row) })
  } catch {
    return error(res, 500, 'ARCHIVE_FAILURE', '档案海暂时起了风浪，请稍后再试')
  } finally {
    await sql.end()
  }
}
