// 线上冒烟：连续打 scene 1 接口 3 次，验证每次都返回完整标签协议（含选项A/B）
const URL = 'https://parallel-life-generator.vercel.app/api/generate'
const BODY = { assumption: '如果当年辞职开了咖啡店', age: '28', occupation: '程序员', personality: '内敛', scene: 1, history: [] }

for (let i = 1; i <= 3; i++) {
  const t0 = Date.now()
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://parallel-life-generator.vercel.app' },
    body: JSON.stringify(BODY),
  })
  if (!res.ok) { console.log('run' + i + ': HTTP ' + res.status + ' FAIL'); continue }
  const text = await res.text()
  const hasStory = text.includes('【正文】')
  const hasA = text.includes('【选项A】')
  const hasB = text.includes('【选项B】')
  const ok = hasStory && hasA && hasB
  console.log('run' + i + ': ' + ((Date.now() - t0) / 1000).toFixed(1) + 's 正文:' + hasStory + ' 选项A:' + hasA + ' 选项B:' + hasB + ' ' + (ok ? '[OK] 完整' : '[X] 不完整'))
  if (!ok) console.log('  内容: ' + text.slice(0, 120))
}
