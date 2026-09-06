import type { VercelRequest, VercelResponse } from '@vercel/node'
import { containsSensitiveWord } from './_guard.js'
import type { DecisionStep } from '../src/shared/protocol.js'
import { formatStoryMemory, type StoryMemoryScene } from '../src/shared/protocol.js'

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
4. 克制的温柔来自具体的人、物和选择后果，不使用可以套在任何人身上的安慰话，不喊口号不灌鸡汤
5. 记忆意象要前后呼应：优先让已经出现过的物件、声音、气味、动作或一句日常对话再次出现，并让它随选择获得新的含义；不要凭空添加灯塔、星空、大海、月亮等漂亮意象
6. 人生允许矛盾同时成立：一次选择可以既带来获得也留下失去，不替读者判定对错，不用成长或命运替伤害开脱
7. 每段结尾一句短话收住；最终落点是一个具体的小动作或小愿望（去看看海、给自己煮碗面）
8. 可以引用一句真实对话（一问一答，一针见血不解释）
9. 禁止：华丽辞藻、四字成语连用、「愿你我都能…」式收尾、完美结局或彻底悲剧、宏大叙事。不得复用本提示词中的示例事物或固定表达，所有细节必须从读者的假设、选择和已经生成的故事中自然生长`

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
const SCENE_MIDDLE = (n: number, prev: string, chosen: string) => `以下是这段人生最近发生的真实内容：

${prev}

读者选择了：【${chosen}】

现在写【第${n}幕】，承接这个选择往下走，按以下固定格式输出（三个标签必须齐全，顺序固定）：
【正文】100-150字，第二人称「你」叙述。开头第一句必须直接写出刚才这个选择造成的新动作或变化，并自然交代时间过去了多久；不得复制、改写或概括上一幕的开头，不得把上一幕整段重新讲一遍。随后承接上一幕最后的地点、人物或动作，进入选择带来的新境遇。优先从最近几幕回收一个已经出现过的物件、声音、气味、动作或一句话，让它在新选择后产生细微变化；不要每幕都新造抒情意象。结尾再次留下一个自然的岔路口
【选项A】不超过12字的短语，概括第一种走法
【选项B】不超过12字的短语，与A方向明显不同
除这三个标签和内容外不要输出任何其他内容。`

/** 结局幕：收束 */
const SCENE_FINAL = (prev: string, chosen: string) => `你之前写到：

${prev}

读者选择了：【${chosen}】

现在写【结局幕】，这是最后一段，按以下固定格式输出（两个标签必须齐全，顺序固定）：
【正文】100-160字，第二人称「你」叙述，把这个选择走到的人生落到一个具体的日常画面上，不要完美也不要悲剧，最后落在一个具体的小动作或小愿望上
【感悟】30-60字的一句话。必须同时做到：回应最初的人生假设；回收全文中真实出现过的一个物件、声音、气味、动作或一句话，并赋予它第二层含义；同时承认这条路带来的获得与失去；让仍然存在的遗憾落到主人公此后一个具体、微小的行动上。不要判定选择对错，不要宣布遗憾已经消失，不用成长或命运替伤害开脱。禁止「你终于明白」「人生就是」「原来我们都」「没关系」「也挺好」「就够了」「允许自己」等说理或万能安慰句；禁止凭空添加灯塔、星空、大海、月亮等漂亮意象。最后一句要像一段记忆自然合拢，不像作者总结
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
  | { ok: true; value: { assumption: string; age: string; occupation: string; personality: string; scene: number; history: DecisionStep[]; context: StoryMemoryScene[] } }
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

  const contextRaw = Array.isArray(b.context) ? b.context.slice(-4) : []
  const context: StoryMemoryScene[] = []
  for (const item of contextRaw) {
    if (typeof item !== 'object' || item === null) continue
    const value = item as Record<string, unknown>
    const contextScene = Number(value.scene)
    const text = typeof value.text === 'string' ? value.text.trim().slice(0, 500) : ''
    const decision = typeof value.decision === 'string' ? value.decision.trim().slice(0, 120) : ''
    if (Number.isInteger(contextScene) && contextScene >= 1 && contextScene < sceneRaw && text) {
      context.push({ scene: contextScene, text, ...(decision ? { decision } : {}) })
    }
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
      context,
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
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error })
    return
  }
  const { assumption, age, occupation, personality, scene, history, context } = parsed.value

  if (containsSensitiveWord(assumption) || containsSensitiveWord(occupation + personality) || history.some((step) => containsSensitiveWord(step.decision ?? '')) || context.some((item) => containsSensitiveWord(item.text + (item.decision ?? '')))) {
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
    const prevSummary = formatStoryMemory(context) || `「${assumption}」的平行人生，第 ${scene - 1} 幕结束时读者决定：「${chosen}」`
    userContent = SCENE_MIDDLE(scene, prevSummary, chosen) + lifeStageOf(scene)
  } else {
    const decisionTrail = history.map((item) => item.decision).filter(Boolean).slice(-8).join(' → ')
    const prevSummary = `${formatStoryMemory(context)}\n\n此前关键决定：${decisionTrail}`
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
