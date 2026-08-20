# 途迹路书

基于 React、TypeScript、Vite 和高德地图 JS API 2.0 的旅行路书编辑器。

## 功能

- 创建、查看、编辑、复制和删除路书
- 按天管理行程，添加、编辑、上移、下移、删除和反向排列节点
- 景点、餐厅、酒店、交通站点等节点类型
- 到达/离开时间、停留时长、花费和备注
- 驾车、公交、步行和骑行分段，地图路线与距离/时长自动更新
- 浏览器本地持久化、JSON 导入导出
- 分享链接、微信二维码、朋友圈和微博分享入口
- 桌面端双栏与移动端地图/行程切换

## 本地开发

```bash
pnpm install
pnpm dev
```

默认访问 `http://localhost:5173`。

高德 Web 端 Key 和安全密钥可在 `.env.local` 中覆盖：

```bash
cp .env.example .env.local
```

```dotenv
VITE_AMAP_KEY=your_amap_web_key
VITE_AMAP_SECURITY_CODE=your_amap_security_code
```

当前项目内置了项目要求中提供的 Web 端配置，克隆后可直接运行。正式公开仓库前建议在高德控制台配置域名白名单，并改用 Cloudflare 构建环境变量。

## 检查

```bash
pnpm lint
pnpm test
pnpm build
```

## Cloudflare Workers

`wrangler.jsonc` 已配置静态资源和 SPA 回退。

- Build command: `pnpm build`
- Deploy command: `npx wrangler deploy`

首次发布需要登录 Cloudflare：

```bash
npx wrangler login
pnpm deploy
```

路书数据保存在浏览器 `localStorage` 中，不会上传服务器。分享链接将完整路书编码到 URL 片段中，接收者可查看并保存到自己的浏览器。
