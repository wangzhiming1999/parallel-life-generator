// 验证线上 bundle 是否为 18 幕版本
const r = await fetch('https://parallel-life-generator.vercel.app/assets/index-B1EAGGOL.js')
const js = await r.text()
console.log('bundle:', (js.length / 1024).toFixed(1) + 'kB')
console.log('局部窗口渲染(Math.abs):', js.includes('Math.abs') ? 'YES' : 'NO')
console.log('含 v3 存档标志:', js.includes('parallel_life_branch_run') ? 'YES' : 'NO')
