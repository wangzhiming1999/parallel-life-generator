# 平行人生「如果」生成器 · 开发与部署说明

## 技术栈

- 前端：React 19 + Vite 8 + TypeScript + Tailwind CSS v4
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
│   └── _guard.ts        # 字段校验 + 敏感词过滤
├── src/
│   ├── App.tsx          # 三态视图（输入/加载/结果）
│   ├── hooks/useGenerate.ts  # 流式请求 + 双超时 + 中断
│   ├── lib/storage.ts   # localStorage + 复制降级
│   └── shared/protocol.ts    # 前后端共享协议
├── tests/guard.test.ts  # 守卫单测（9 例）
└── index.html
```
