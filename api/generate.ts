import type { VercelRequest, VercelResponse } from '@vercel/node'
import { containsSensitiveWord } from './_guard.js'
import type { DecisionStep } from '../src/shared/protocol.js'

export const config = { api: { responseLimit: false } }

// 允许的来源白名单（生产域名 + 本地开发）
const ALLOWED_ORIGINS = [
  'https://parallel-life-generator.vercel.app',
  'https://parallel-life-generator-wnagzhimings-projects.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]

// 深夜电台腔风格指南（提炼自 corpus/ 35 篇授权参考语料，仅注入后端 prompt，前端不展示）
const STYLE_GUIDE = `写作风格要求（深夜电台腔，必须遵守）：
1. 第二人称陪伴感：像坐在对面陪读者聊，不是讲大道理。多用「你」，可以偶尔用「我」以朋友口吻带入一件自己的小事，再回到「你」
2. 从画面切入：开头就是一个具体的场景或物件（绿皮火车、闭店的小店、朋友圈三天可见、深夜的出租车、工位上冷掉的咖啡），绝不用道理开头
3. 对照式叙事：过去 vs 现在、十八岁 vs 二十八岁，在时间对照里让情绪自己浮现，不直接抒情
4. 克制的温柔：落点是「允许」而不是「应该」——「赖个床也没关系」「晚几分钟回也没关系」，不喊口号不灌鸡汤
5. 每段结尾一句短话收住；最终落点是一个具体的小动作或小愿望（去看看海、给自己煮碗面）
6. 可以引用一句真实对话（一问一答，一针见血不解释）
7. 禁止：华丽辞藻、四字成语连用、「愿你我都能…」式收尾、完美结局或彻底悲剧、宏大叙事
风格示例（仅供感受语感，禁止照抄内容）：
例1「如今连动卧高铁都嫌漫长的人，曾经为了见一个人，每个月坐14小时绿皮火车往返两座城市，满身疲惫但又甘之如饴。」
例2「不想起的早上，赖个床也没关系，迟到和扣钱，不会让天塌下来。」
例3「有一间小店，闭店理由永远是那八个字：心情不好，暂不营业。后来我才懂，敢挂出这个牌子的店主，比很多咬着牙死扛的人勇敢得多。」`

const SYSTEM_PROMPT = `你是平行人生档案馆的守馆人，擅长用第二人称书写普通人的另一种人生。\n\n${STYLE_GUIDE}`

const TOTAL_SCENES = 18

/** 人生阶段：给中间幕注入年龄段语境，让 18 幕读起来像完整一生而非重复日常 */
function lifeStageOf(scene: number): string {
  const stages: Array<[number, string]> = [
    [3, '20 岁出头，刚踏入社会，一切都很新，选什么都带着少年气'],
    [5, '二十三四岁，第一次真正为自己的人生做主，既兴奋又不安'],
    [7, '二十五六岁，身边人开始分流，有人结婚有人远方，你在岔路口'],
    [9, '二十八岁上下，事业与生活的拉扯变多，选择开始有重量'],
    [11, '三十岁出头，回头看有些路走对了有些走岔了，但都回不去'],
    [13, '三十五六岁，生活进入深水区，责任比梦想更常出现在清晨'],
    [15, '四十岁上下，开始与过去的自己和解，也更清楚什么最重要'],
    [17, '五十多岁，人生过半，更在意身边的人和还没做的小事'],
  ]
  const hit = stages.filter(([n]) => scene <= n)[0]
  return hit ? `（这一幕对应的年龄段：${hit[1]}）` : '（这一幕对应六十岁以后，回望与安放）'
}

/** 拼接用户背景信息 */
const profileOf = (age?: string, occupation?: string, personality?: string) =>
  [age ? `\n年龄：${age}` : '', occupation ? `\n职业：${occupation}` : '', personality ? `\n性格：${personality}` : '']
    .join('')

/** 第一幕：开题 */
const SCENE_FIRST = (assumption: string, profile: string) => `人生假设：${assumption}${profile}

这个平行人生将以「人生岔路口」的方式展开，一共 18 幕，从青年一路走到人生尽头：你会先写第一幕，结尾抛出两个都合理、但走向不同的选择，读者选一个，你再续写下一幕。请把 18 幕当成一段完整人生来规划——前期开岔、中期深化、后期回望，避免每幕都是相似的日常。

现在写【第一幕】，按以下固定格式输出（三个标签必须齐全，顺序固定）：
【正文】100-150字，第二人称「你」叙述，具体生活细节，把读者带入这个假设人生刚刚展开的时刻（约二十岁上下），结尾留下一个自然的岔路口时刻
【选项A】不超过12字的短语，概括第一种走法，如「留下来，守住眼前的一切」
【选项B】不超过12字的短语，概括另一种走法，与A方向明显不同
除这三个标签和内容外不要输出任何其他内容。`

/** 中间幕：续写 */
const SCENE_MIDDLE = (n: number, prev: string, chosen: string) => `你之前写到：

${prev}

读者选择了：【${chosen}】

现在写【第${n}幕】，承接这个选择往下走，按以下固定格式输出（三个标签必须齐全，顺序固定）：
【正文】100-150字，第二人称「你」叙述，具体生活细节，写这个选择带来的新境遇（不要重复之前幕的桥段），结尾再次留下一个自然的岔路口
【选项A】不超过12字的短语，概括第一种走法
【选项B】不超过12字的短语，与A方向明显不同
除这三个标签和内容外不要输出任何其他内容。`

/** 结局幕：收束 */
const SCENE_FINAL = (prev: string, chosen: string) => `你之前写到：

${prev}

读者选择了：【${chosen}】

现在写【结局幕】，这是最后一段，按以下固定格式输出（两个标签必须齐全，顺序固定）：
【正文】100-160字，第二人称「你」叙述，把这个选择走到的人生落到一个具体的日常画面上，不要完美也不要悲剧，最后落在一个具体的小动作或小愿望上
【感悟】1句话，温暖克制，语感像「允许」而不是「祝愿」——不喊口号不鸡汤，点到为止，能让人想截图
除这两个标签和内容外不要输出任何其他内容。`

// 简单内存级 IP 频控（单实例兜底；生产建议升级 Upstash 滑动窗口）
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 30 // 分幕模式一局 18 次调用，用户连选间隔 2s 以上即可承受
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

/** 从请求体提取分幕参数（history 可选，缺省视为第一幕） */
function validateSceneBody(body: unknown):
  | { ok: true; value: { assumption: string; age: string; occupation: string; personality: string; scene: number; history: DecisionStep[] } }
  | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) return { ok: false, error: '请求体格式错误' }
  const b = body as Record<string, unknown>

  const assumption = typeof b.assumption === 'string' ? b.assumption.trim() : ''
  if (assumption.length < 2 || assumption.length > 50) return { ok: false, error: '假设句长度需在 2-50 字之间' }

  const sceneRaw = b.scene === undefined ? 1 : Number(b.scene)
  if (!Number.isInteger(sceneRaw) || sceneRaw < 1 || sceneRaw > TOTAL_SCENES) {
    return { ok: false, error: '幕序号无效' }
  }

  const historyRaw = Array.isArray(b.history) ? b.history : []
  const history: DecisionStep[] = []
  for (const item of historyRaw) {
    if (typeof item !== 'object' || item === null) continue
    const it = item as Record<string, unknown>
    const s = Number(it.scene)
    const c = Number(it.choice)
    if (Number.isInteger(s) && s >= 1 && s < sceneRaw && (c === 0 || c === 1)) {
      const decision = typeof it.decision === 'string' ? it.decision.trim().slice(0, 120) : ''
      history.push({ scene: s, choice: c as 0 | 1, ...(decision ? { decision } : {}) })
    }
  }
  if (sceneRaw > 1 && history.length !== sceneRaw - 1) {
    return { ok: false, error: '路径不完整' }
  }

  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
  return {
    ok: true,
    value: {
      assumption,
      age: str(b.age, 3),
      occupation: str(b.occupation, 20),
      personality: str(b.personality, 20),
      scene: sceneRaw,
      history,
    },
  }
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

  const parsed = validateSceneBody(req.body)
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error })
    return
  }
  const { assumption, age, occupation, personality, scene, history } = parsed.value

  if (containsSensitiveWord(assumption) || containsSensitiveWord(occupation + personality) || history.some((step) => containsSensitiveWord(step.decision ?? ''))) {
    res.status(422).json({ error: '这个假设超出了档案馆的收录范围，换一个试试吧' })
    return
  }

  const apiKey = process.env.SILICONFLOW_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: '服务配置缺失' })
    return
  }

  // 组装该幕的 user prompt（history 只回传最近一幕的选择即可，prompt 保持精简）
  const profile = profileOf(age, occupation, personality)
  const lastChoice = history.length ? history[history.length - 1] : null
  let userContent: string
  if (scene === 1) {
    userContent = SCENE_FIRST(assumption, profile)
  } else if (scene < TOTAL_SCENES) {
    const chosen = lastChoice?.decision || (lastChoice?.choice === 0 ? '选项A的方向' : '选项B的方向')
    const prevSummary = `「${assumption}」的平行人生，第 ${scene - 1} 幕结束时读者决定：「${chosen}」`
    userContent = SCENE_MIDDLE(scene, prevSummary, chosen) + lifeStageOf(scene)
  } else {
    const prevSummary = `「${assumption}」的平行人生，前面 17 幕读者分别走了 ${history.map((h) => (h.choice === 0 ? 'A' : 'B')).join('→')}`
    userContent = SCENE_FINAL(prevSummary, lastChoice?.decision || (lastChoice?.choice === 0 ? '选项A的方向' : '选项B的方向'))
  }

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
        max_tokens: 900,
        stream: true,
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
      res.end(scene === TOTAL_SCENES ? '【感悟】生成中断，请重试' : '【选项A】请重试【选项B】请重试')
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
