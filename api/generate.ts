import type { VercelRequest, VercelResponse } from '@vercel/node'
import { containsSensitiveWord, validateGenerateBody } from './_guard'

export const config = { api: { responseLimit: false } }

// 允许的来源白名单（生产域名 + 本地开发）
const ALLOWED_ORIGINS = [
  'https://parallel-life-generator.vercel.app',
  'https://parallel-life-generator-wnagzhimings-projects.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]

const SYSTEM_PROMPT = `你是平行人生档案馆的守馆人，擅长用第二人称书写普通人的另一种人生。
用户会输入一个人生假设，以及可选的年龄、职业、性格背景。
请生成一段专属的平行人生故事，严格遵守以下规则：

1. 输出固定为三段，用三个等号「===」作为分隔符连接，格式为：
第一段标题===第二段正文===第三段感悟
2. 第一段：简短有氛围感的标题，不超过12个字，不要书名号
3. 第二段：300-500字正文，分3-4个自然段，自然段之间用单个换行符分隔。用第二人称"你"叙述，写具体的生活细节（比如工位上冷掉的咖啡、傍晚菜市场的烟火、深夜阳台的风），不要宏大叙事。要有真实的喜怒哀乐，不要完美人生，也不要彻底悲剧，就是普通真实的另一种生活，有一个淡淡的落点。
4. 第三段：1句收尾感悟，温暖克制，不鸡汤，点到为止，能让人产生共鸣。
5. 语言风格：平实、有画面感，像在讲真实发生的事，不要华丽辞藻
6. 除这三段内容和两个分隔符外，禁止输出任何解释、问候、书名号、多余说明`

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

  const userContent = [
    `人生假设：${assumption}`,
    age ? `年龄：${age}` : '',
    occupation ? `职业：${occupation}` : '',
    personality ? `性格：${personality}` : '',
  ]
    .filter(Boolean)
    .join('\n')

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
        temperature: 0.85,
        max_tokens: 1500,
        stream: true,
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
      res.end('\n===\n===生成中断，请重试')
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
