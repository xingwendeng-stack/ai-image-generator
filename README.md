# AI Image Generator

轻量化的 AI 图片生成网站（前端 + Cloudflare Worker 后端），对接 Hugging Face Inference API。项目已经精简为：

- public/: 静态前端页面（index.html）
- worker.js: Cloudflare Worker（处理 /api/generate，支持 demo 与 Hugging Face）
- wrangler.jsonc: Wrangler 配置（Worker 入口 & assets）
- package.json: 依赖及脚本
- .github/workflows/deploy.yml: 可选的自动部署 CI（需在仓库 Secrets 中配置 CF_API_TOKEN）

## 快速说明

- 本项目默认会把前端托管到 Cloudflare Workers 的域名（workers.dev），并在 Worker 内暴露 POST /api/generate API。前端会向此接口发送 { prompt } 并接收 { images: [data-uri...] }。
- 若没有配置 Hugging Face Token，Worker 会在 demo 模式下返回占位 SVG 图片用于测试。

## 本地测试（开发）

1. 安装依赖：

```bash
npm install
```

2. 本地运行（需要安装并登录 wrangler）：

```bash
# 安装 wrangler（如未安装）
npm i -g wrangler
wrangler login

# 本地预览（会启动 dev 环境）
wrangler dev
```

3. 在浏览器打开 dev 给出的地址，测试图片生成功能。

## 部署到 Cloudflare Workers

1. 在本地安装并登录 wrangler（如上）。

2. 添加 Hugging Face Token（可选，若需要真实图片）：

```bash
wrangler secret put HF_API_TOKEN
# 按提示粘入你的 HF token
```

3. 发布：

```bash
wrangler publish
```

发布成功后，wrangler 会输出 workers.dev 的域名，例如 `https://ai-image-generator.xingwendeng.workers.dev`。

4. 使用 curl 测试 API：

```bash
curl -v -X POST 'https://<your-worker>.workers.dev/api/generate' \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"一头狼在满月下嗥叫，剪影风格"}'
```

期望返回 HTTP 200 且 body 为 JSON：{ "images": ["data:image/...", ...] }

## 自动部署（GitHub Actions）

仓库包含了一个示例 GitHub Actions 工作流 `.github/workflows/deploy.yml`。若你希望在每次 push 到 main 时自动部署：

1. 在仓库 Settings → Secrets and variables → Actions → New repository secret 中添加 `CF_API_TOKEN`（Cloudflare API Token，需给予 workers:scripts:deploy 权限）。
2. Push 到 main 分支，Actions 会自动触发并运行 `wrangler publish`。

## 调试与排查

- 若前端报 `Unexpected end of JSON input`：打开 DevTools → Network → 选中 `/api/generate` 请求，查看 Response（raw body）、Status、Content-Type。若返回 404/HTML 则说明 Worker 未正确部署或出错；把原始 response 和状态贴给我，我会协助定位。
- 使用 `wrangler tail` 可以查看 Worker 的实时日志。

## 安全说明

- 切勿把 `HF_API_TOKEN` 或任何密钥提交到仓库。使用 `wrangler secret put` 或 Cloudflare Dashboard 的 Secrets 来保存密钥。

---

如需我继续自动化（例如替你把 CI Secrets 写入或在 Cloudflare 上直接发布），请在安全范围内提供授权或把必要的 tokens 以你认可的方式上传到 GitHub Secrets；我将基于这些自动化脚本完成发布。