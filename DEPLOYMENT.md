# 本地数据与自动部署

## 发布目标

- GitHub：`git@github-personal:shichengcn/lushu`
- Cloudflare Pages 项目：`lushu`
- Pages 默认域名：`https://lushu-dk3.pages.dev`
- 自定义域名：`https://shicheng.qd.je`

地图凭据保存在 `.env.local`，本机路书数据库保存在
`.local-data/roadbooks.json`。两者均被 Git 忽略，不会推送到 GitHub。
构建后的地图凭据会进入 `dist` 浏览器代码，因此只应把 `dist` 部署到
受地图控制台 Referer 白名单约束的域名。

## 首次配置

1. 安装依赖：

```bash
pnpm install
```

2. 登录 Cloudflare CLI：

```bash
pnpm exec wrangler login
```

3. 确认 GitHub 仓库已经创建，并检查远端：

```bash
git remote -v
```

`origin` 应指向 `git@github-personal:shichengcn/lushu`。

## 一键部署

本地编辑保存完成后运行：

```bash
pnpm deploy
```

脚本会依次执行：

1. 检查 `.env.local` 与 `.local-data/roadbooks.json`。
2. 运行 `pnpm lint` 和 `pnpm test`。
3. 运行 `pnpm export:local`，重新构建并把本机数据库写入 `dist/data`。
4. 暂存并检查 Git 变更，阻止 `.env.local` 凭据进入提交。
5. 有源码变更时自动创建发布提交，然后推送 `origin/main`。
6. 自动创建缺失的 `lushu` Pages 项目。
7. 将 `dist` 直接部署到 Cloudflare Pages。

指定提交信息：

```bash
pnpm deploy -- --message "feat: update Qinghai itinerary"
```

只发布 Cloudflare，不提交和推送 Git：

```bash
pnpm deploy -- --skip-git
```

跳过 lint 和测试：

```bash
pnpm deploy -- --skip-checks
```

只验证检查与导出，不进行任何网络部署：

```bash
pnpm deploy -- --dry-run
```

## 自定义域名

首次 Pages 部署成功后，在 Cloudflare Dashboard 中进入：

`Workers 和 Pages` → `lushu` → `自定义域` → `设置自定义域`

填写：

```text
shicheng.qd.je
```

然后在 `qd.je` 的 DNS 管理平台添加：

```text
类型：CNAME
主机记录：shicheng
目标：lushu-dk3.pages.dev
```

如果平台专门管理 `shicheng.qd.je` 这个二级域名，主机记录可能要求填写
`@`；以平台提示为准。DNS 生效后回到 Cloudflare 验证，等待 HTTPS 状态变为
`Active`。

可在终端检查：

```bash
dig +short shicheng.qd.je CNAME
curl -I https://shicheng.qd.je
```

## 地图域名白名单

上线后在百度地图控制台把浏览器端 AK 的 Referer 白名单加入：

```text
shicheng.qd.je*
*.pages.dev*
```

高德开放平台的 Web 端 Key 同样需要允许：

```text
shicheng.qd.je
lushu-dk3.pages.dev
```

生产发布后若地图底图正常但路线或地点搜索失败，优先检查这两个平台的域名
白名单和配额。
