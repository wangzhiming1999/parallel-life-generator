// 线上 18 幕验证：关键档位 + 越界校验
const URL = 'https://parallel-life-generator.vercel.app/api/generate'
const H = { 'Content-Type': 'application/json', Origin: 'https://parallel-life-generator.vercel.app' }
const BASE = { assumption: '如果当年辞职开了咖啡店', age: '28', occupation: '程序员', personality: '内敛' }

function parse(text) {
  const T = { story: '【正文】', a: '【选项A】', b: '【选项B】', ins: '【感悟】' }
  const sI = text.indexOf(T.story), aI = text.indexOf(T.a), bI = text.indexOf(T.b), iI = text.indexOf(T.ins)
  const A = aI >= 0 ? text.slice(aI + T.a.length, bI >= 0 ? bI : undefined).trim().split('\n')[0] : ''
  const B = bI >= 0 ? text.slice(bI + T.b.length, iI >= 0 ? iI : undefined).trim().split('\n')[0] : ''
  const ins = iI >= 0 ? text.slice(iI + T.ins.length).trim().split('\n')[0] : ''
  return { choices: A && B ? [A, B] : null, insight: ins || null }
}

let r = await fetch(URL, { method: 'POST', headers: H, body: JSON.stringify({ ...BASE, scene: 1, history: [] }) })
let t = await r.text()
console.log('第1幕:', r.status, JSON.stringify(parse(t).choices))

r = await fetch(URL, { method: 'POST', headers: H, body: JSON.stringify({ ...BASE, scene: 9, history: Array.from({ length: 8 }, (_, i) => ({ scene: i + 1, choice: i % 2 })) }) })
t = await r.text()
console.log('第9幕(中年段):', r.status, JSON.stringify(parse(t).choices))

r = await fetch(URL, { method: 'POST', headers: H, body: JSON.stringify({ ...BASE, scene: 18, history: Array.from({ length: 17 }, (_, i) => ({ scene: i + 1, choice: i % 2 })) }) })
t = await r.text()
console.log('第18幕(结局):', r.status, '感悟:', parse(t).insight?.slice(0, 40))

r = await fetch(URL, { method: 'POST', headers: H, body: JSON.stringify({ ...BASE, scene: 19, history: [] }) })
console.log('第19幕越界:', r.status, r.status === 400 ? '正确拒绝 [OK]' : 'FAIL')
