# 途迹路书

基于 React、TypeScript、Vite、高德地图和百度地图的旅行路书编辑器。

## 功能

- 创建、查看、编辑、复制和删除路书
- 连续按天管理行程，支持拖拽跨天、前后移、隐藏、删除和反向排列节点
- 景点、餐厅、酒店、加油站和交通站点等节点类型
- 多角色参与、到达/离开时间、停留时长和付款人
- 地点与路段均支持多项费用、多条文字/图片备注
- 驾车、公交、步行、骑行、火车和飞机分段
- 道路类型、手机信号、高速费与真实导航距离/时长
- 普通/卫星地图、实时路况、测距和高德实景入口
- 高德 / 百度地图供应商切换，选择会保存在当前浏览器
- 全局自驾、单日途经点和单段路线三层地图范围
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

固定访问 `http://127.0.0.1:4173/`，避免端口或主机名变化后进入另一份浏览器
存储。

高德 Web 端 Key 和安全密钥可在 `.env.local` 中覆盖：

```bash
cp .env.example .env.local
```

```dotenv
VITE_AMAP_KEY=your_amap_web_key
VITE_AMAP_SECURITY_CODE=your_amap_security_code
VITE_BAIDU_MAP_KEY=your_baidu_browser_ak
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

`dist` 是可重复生成的静态产物，不应直接编辑。路书编辑数据保存在当前站点域名
对应的浏览器 `localStorage` 中，不在 `dist` 内；重新构建或覆盖部署不会清除。
写入新数据前会保留上一份有效快照，主数据损坏时自动恢复。内置示例一旦保存到
浏览器，也不会再被后续代码版本覆盖。

本地 `127.0.0.1:4173`、艾可秀和 Cloudflare 属于三个独立站点，各自保存各自
的路书修改。代码发布只更新界面与逻辑，不会把某个浏览器中的修改同步到其他
环境。需要跨浏览器或长期归档时，使用“导出 JSON”保存副本。

部署环境仅在用户主动分享时，把不含图片的分享快照写入 Cloudflare KV 并生成
短链接；本地 Vite 开发时自动回退为 URL 片段分享。图片备注保留在本地和 JSON
导出中。

百度导航请求通过全局异步队列发送，启动间隔为 500ms（低于 3 QPS 上限）。失败
请求按 1、2、4、8 秒指数退避重试，失败结果不会写入路线缓存。

## 艾可秀

生产构建使用相对资源路径，可将 `dist` 文件夹或压缩后的 `dist.zip` 直接上传
到艾可秀。艾可秀是静态托管环境，路书编辑、地图和 JSON 导入导出可独立运行；
短链接分享接口仍由 Cloudflare Worker 提供。

```bash
pnpm package:axure
```

命令会生成根目录下的 `tuji-roadbook-axureshow.zip`。
