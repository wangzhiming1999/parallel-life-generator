# 平行人生「如果」生成器 · 开发与部署说明

## 技术栈

- 前端：React 19 + Vite 8 + TypeScript + Tailwind CSS v4
- 动效：anime.js v4（全站动画单一来源，含画布帧循环）
- 中转函数：Vercel Functions（Node runtime，`api/generate.ts`）
- 大模型：硅基流动 `Qwen/Qwen3-8B`（免费档，1000 RPM / 50K TPM，OpenAI 兼容接口）
- 存储：仅浏览器 localStorage（版本化 + try-catch 防损坏）

## 本地开发

```bash
npm install
npm run dev        # http://localhost:5173
```

本地调 `/api/generate` 需配合 Vercel CLI：`npx vercel dev`（或先用 mock 验证前端流程）。

## 环境变量（Vercel 项目 Settings → Environment Variables 配置）

| 变量 | 说明 |
|------|------|
| `SILICONFLOW_API_KEY` | 硅基流动 API Key（cloud.siliconflow.cn 注册获取，手机号注册即可） |

## 部署（Vercel）

1. 推送 GitHub 仓库 → Vercel 导入
2. 配置 `SILICONFLOW_API_KEY` 环境变量
3. 部署后把实际域名加进 `api/generate.ts` 的 `ALLOWED_ORIGINS` 白名单
4. 绑定自定义域名（国内访问体验更好）

## 已落实的评审 P0 修复

- ✅ 放弃 `response_format json_object`，改为「===」分隔符分段流式输出（真流式）
- ✅ max_tokens 提至 1500 + 截断容错（解析失败兜底标题「平行人生」）
- ✅ 首 token 15s 超时 + 流中空闲 10s 双计时（长故事不误杀）
- ✅ 服务端字段二次校验 + 敏感词过滤（输入/输出双侧）
- ✅ IP 频控（内存级 10 次/分钟兜底；生产建议升级 Upstash）
- ✅ Origin 白名单 + CORS
- ✅ localStorage try-catch + 数据版本化
- ✅ Clipboard execCommand 降级（微信内置浏览器兼容）
- ✅ 暗色模式（prefers-color-scheme 暖黑方案）
- ✅ 按钮对比度达 WCAG AA（深棕文字 #3D2B1F）
- ✅ 感悟卡片视觉锚点（✶ + #C77B4A）

## 已知待办（上线前）

- [ ] 微信内置浏览器 SSE 兼容实测（X5/XWeb 内核对 fetch ReadableStream 的支持；若不可用需加轮询降级）
- [ ] 频控升级 Upstash 滑动窗口（Vercel Function 多实例下内存频控不共享）
- [ ] LLM 平台配置消费告警（硅基流动控制台）
- [ ] 埋点：分享截图数/日（北极星）+ 生成完成率 + 人均再写次数 + 7 日回访
- [ ] 「再写一个」prompt 基调差异化（或按产品官建议砍掉）
- [ ] 真机测试矩阵：iOS Safari / 安卓 Chrome / 微信内置浏览器

## 目录结构

```
parallel-life-generator/
├── api/
│   ├── generate.ts      # Vercel Function：中转硅基流动，流式转发
│   ├── archives.ts      # 档案海：投递 / 打捞
│   └── _guard.ts        # 字段校验 + 敏感词过滤
├── src/
│   ├── App.tsx          # 视图编排（输入 / 故事 / 档案海）
│   ├── hooks/
│   │   ├── useBranch.ts        # 18 幕流式请求 + 分支路径 + 断点续传
│   │   ├── useAmbientMusic.tsx # 背景乐单源复用 + 音量渐变
│   │   └── useMotion.ts        # anime.js 在 React 里的统一接线
│   ├── components/      # 各自动画自治的展示组件（见下）
│   ├── lib/
│   │   ├── motion.ts    # 动效令牌 + 颜色/节奏纯函数
│   │   ├── storage.ts   # localStorage + 复制降级
│   │   └── universe.ts  # 宇宙维度脉冲与世界线计算
│   └── shared/protocol.ts    # 前后端共享协议
├── corpus/              # 结局感悟的风格参考语料（仅后端 prompt 使用）
├── tests/               # 守卫 / 协议 / 流式切分 / 动效纯函数
└── index.html
```

## 动效约定（anime.js v4）

全站动画统一由 anime.js 驱动，CSS 里不再保留任何 `@keyframes`。

- 时长与缓动取 `src/lib/motion.ts` 的 `DURATION` / `EASE`，不要在组件里另写一套节奏。
- React 接线统一走 `src/hooks/useMotion.ts`：`useEnter`（挂载入场）、`useAnime`（状态变化过渡）、`useAnimeChildren`（容器内一组子元素 + stagger）、`useAnimeLoop`（无限循环）。内部用 `useLayoutEffect`，首帧在浏览器绘制前落位，所以不会闪一下再动画。
- **不要把初始隐藏态写进 CSS**。起点一律写在动画参数里（`opacity: [0, 1]`），这样 `prefers-reduced-motion` 降级成 0 时长时元素天然停在终态，不会出现「动画被禁用后内容永久隐形」。
- 「值状态」型动画（脉冲条宽度、幕进度点尺寸）的 cleanup 用 `animation.cancel()` 保留已落位值；入场型动画用 `animation.revert()` 清掉 inline style。混用会让 dev 的 StrictMode 双挂载出现「值被抹掉」的假 bug。
- 需要跟随主题色的发光/描边要先用 `themeColor()` 把 CSS 变量解析成 rgba 再交给 anime.js —— 库无法插值 `var(...)`。
- 画布类逐帧循环也交给 `createTimer`，页面只保留一套帧调度（见 `components/ParticleBackground.tsx`）。

