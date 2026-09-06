import type { VercelRequest, VercelResponse } from '@vercel/node'
import { containsSensitiveWord, validateGenerateBody } from './_guard.js'

export const config = { api: { responseLimit: false } }

// 允许的来源白名单（生产域名 + 本地开发）
const ALLOWED_ORIGINS = [
  'https://parallel-life-generator.vercel.app',
  'https://parallel-life-generator-wnagzhimings-projects.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]

const SYSTEM_PROMPT = '你是平行人生档案馆的守馆人。'

const USER_TEMPLATE = (assumption: string, extra: string) => `人生假设：${assumption}${extra}

写一个平行人生故事，按以下固定格式输出（三个标签必须齐全，顺序固定）：
【标题】不超过12个字
【正文】300-500字（硬性要求），第二人称「你」叙述，写具体的生活细节（清晨的蒸汽、傍晚的风铃、深夜的账本这类真实细节），分3-4个自然段，有真实的喜怒哀乐，不要完美人生也不要彻底悲剧，有一个淡淡的落点
【感悟】1句话，温暖克制，不鸡汤，点到为止
除这三个标签和内容外不要输出任何其他内容。`

// 简单内存级 IP 频控（单实例兜底；生产建议升级 Upstash 滑动窗口）
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10
const rateMap = new Map<string, number[]>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const hits = (rateMap.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  if (hits.length >= RATE_LIMIT_MAX) {
    rateMap.set(ip, hits)
    return true
  }
  hits.push(now)
  rateMap.set(ip, hits)
  if (rateMap.size > 10_000) rateMap.clear()
  return false
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = String(req.headers.origin ?? '')
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    res.status(403).json({ error: '来源不被允许' })
    return
  }
  res.setHeader('Access-Control-Allow-Origin', origin || '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: '仅支持 POST' })
    return
  }

  const ip = String(req.headers['x-forwarded-for'] ?? 'unknown').split(',')[0].trim()
  if (isRateLimited(ip)) {
    res.status(429).json({ error: '时空隧道有点拥堵，请稍后再试' })
    return
  }

  const parsed = validateGenerateBody(req.body)
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error })
    return
  }
  const { assumption, age, occupation, personality } = parsed.value

  if (containsSensitiveWord(assumption) || containsSensitiveWord(occupation + personality)) {
    res.status(422).json({ error: '这个假设超出了档案馆的收录范围，换一个试试吧' })
    return
  }

  const apiKey = process.env.SILICONFLOW_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: '服务配置缺失' })
    return
  }

  const userContent = USER_TEMPLATE(
    assumption,
    [
      age ? `\n年龄：${age}` : '',
      occupation ? `\n职业：${occupation}` : '',
      personality ? `\n性格：${personality}` : '',
    ].join(''),
  )

  try {
    const upstream = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'Qwen/Qwen3-8B',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        temperature: 0.9,
        top_p: 0.95,
        max_tokens: 1500,
        stream: true,
        // 关键：关闭思考模式。Qwen3-8B 默认思考会先输出数百字 reasoning，
        // 耗尽前端首 token 超时（15s），且挤压正文 token 预算
        enable_thinking: false,
      }),
    })

    if (!upstream.ok || !upstream.body) {
      res.status(502).json({ error: '时空隧道暂时失联，请稍后重试' })
      return
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    const reader = upstream.body.getReader()
    const decoder = new TextDecoder()
    let sseBuffer = ''
    let outputText = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      sseBuffer += decoder.decode(value, { stream: true })
      const lines = sseBuffer.split('\n')
      sseBuffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') continue
        try {
          const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content
          if (typeof delta === 'string' && delta) {
            outputText += delta
            res.write(delta)
          }
        } catch {
          // 跳过无法解析的 SSE 片段
        }
      }
    }

    // 输出侧敏感词兜底：发现即终止连接（此时大部分内容已流出，仅作兜底）
    if (containsSensitiveWord(outputText)) {
      res.end('【感悟】生成中断，请重试')
      return
    }
    res.end()
  } catch {
    if (!res.headersSent) {
      res.status(502).json({ error: '时空隧道暂时失联，请稍后重试' })
    } else {
      res.end()
    }
  }
}
