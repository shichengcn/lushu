# 途迹路书

基于 React、TypeScript、Vite 和高德地图 JS API 2.0 的旅行路书编辑器。

## 功能

- 创建、查看、编辑、复制和删除路书
- 连续按天管理行程，支持拖拽跨天、前后移、隐藏、删除和反向排列节点
- 景点、餐厅、酒店、加油站和交通站点等节点类型
- 多角色参与、到达/离开时间、停留时长和付款人
- 地点与路段均支持多项费用、多条文字/图片备注
- 驾车、公交、步行、骑行、火车和飞机分段
- 道路类型、手机信号、高速费与真实导航距离/时长
- 普通/卫星地图、实时路况、测距和高德实景入口
- 景点、费用、驾车、酒店专题地图及独立图层开关
- 路书汇总分析页：费用分类、每日里程、驾驶时长和角色支出
- 内置青甘大环线反向 12 日多人示例，含住宿、加油与安全备注
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

`wrangler.jsonc` 已配置静态资源、SPA 回退和分享短链接 KV。分享数据保留
30 天，日常编辑数据仍只保存在浏览器。

- Build command: `pnpm build`
- Deploy command: `npx wrangler deploy`

首次发布需要登录 Cloudflare：

```bash
npx wrangler login
pnpm deploy
```

路书编辑数据保存在浏览器 `localStorage` 中。部署环境仅在用户主动分享时，
把不含图片的分享快照写入 Cloudflare KV 并生成短链接；本地 Vite 开发时自动
回退为 URL 片段分享。图片备注保留在本地和 JSON 导出中。
