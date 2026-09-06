// 模拟浏览器真实流式消费（ReadableStream 逐 chunk），验证客户端解析路径
const URL = 'https://parallel-life-generator.vercel.app/api/generate'
const res = await fetch(URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://parallel-life-generator.vercel.app' },
  body: JSON.stringify({ assumption: '如果当年没放弃吉他', scene: 1, history: [] }),
})
const reader = res.body.getReader()
const decoder = new TextDecoder()
let buffer = ''
let finalText = ''
let chunks = 0
let gotChoicesAt = -1
while (true) {
  const { done, value } = await reader.read()
  if (done) break
  chunks++
  buffer += decoder.decode(value, { stream: true })
  const lines = buffer.split('\n')
  buffer = lines.pop() ?? ''
  const chunk = lines.join('')
  if (!chunk) continue
  finalText += chunk
  if (gotChoicesAt < 0 && finalText.includes('【选项B】')) gotChoicesAt = chunks
}
const hasA = finalText.includes('【选项A】')
const hasB = finalText.includes('【选项B】')
console.log('HTTP', res.status, '| chunks:', chunks, '| 选项B出现在第', gotChoicesAt, '个chunk')
console.log('流式消费完整协议:', hasA && hasB ? 'OK — 岔路口会亮起' : 'FAIL')
