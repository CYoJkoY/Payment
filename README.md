# Payment

一个静态的多用户赞助页面。每个用户对应一个文件夹，构建时把文件夹里的微信、
支付宝收款图片和 Ko-fi 链接放进网页对应的位置，三个卡片分别使用 WeChat、
Alipay、Ko-fi 的官方品牌图标。页面由 GitHub Pages 托管，例如
`https://cyojkoy.github.io/Payment/Yoko/`。

页面只展示收款用的微信/支付宝二维码图片，不含任何指向网页本身的二维码。

## 目录结构

```
site.json                 # 站点级配置（baseUrl、默认主题色、首页展示的用户）
profiles/
  Yoko/                   # 文件夹名 = 用户 slug
    wechat.webp           # 微信收款二维码图片（png/webp/jpg/jpeg/gif）
    alipay.webp           # 支付宝收款二维码图片
    kofi.txt              # 只写一行 Ko-fi 链接
    meta.json             # 可选：显示名、标题、主题色、介绍、备注、页脚
template/page.html        # 页面模板（三个卡片使用微信/支付宝/Ko-fi 官方图标）
scripts/                  # 构建与本地预览脚本
```

## 新增一个用户

1. 建一个文件夹 `profiles/<slug>/`，例如 `profiles/Alex/`。
2. 放入 `wechat.<png|webp|jpg>` 和 `alipay.<png|webp|jpg>` 两张收款二维码图片。
3. 新建 `kofi.txt`，写入一行 Ko-fi 链接，例如 `https://ko-fi.com/alex`。
4. （可选）写 `meta.json` 定制文案与主题色：

```json
{
    "displayName": "Alex",
    "headline": "Support Alex",
    "accent": "#1677ff",
    "intro": ["欢迎支持 Alex。", "Thank you for supporting Alex."],
    "footer": [["感谢您的支持。", "Thank you for your support."]]
}
```

`accent` 用 3 位或 6 位十六进制颜色。页面路由为该文件夹名，`profiles/Alex/`
对应 `/Payment/Alex/`。

## 本地构建与预览

```sh
npm ci
npm run build           # 生成 dist/
npm run preview         # 打开 http://localhost:4173/Yoko/
```

构建产物（`dist/` 由 GitHub Pages 部署）：

- `dist/<slug>/index.html` —— 用户页面
- `dist/index.html` —— `site.json` 中 `primary` 指定用户的页面（站点首页）

`dist/` 与本地构建缓存都不会提交到仓库。

## 站点配置 `site.json`

```json
{
    "baseUrl": "https://cyojkoy.github.io/Payment/",
    "lang": "zh-CN",
    "titleSuffix": "赞助支持",
    "defaultAccent": "#00ff9d",
    "primary": "Yoko"
}
```

`baseUrl` 必须以 `/` 结尾；`primary` 决定站点根路径展示哪个用户的页面。

## 部署

推送到 `main` 会触发 `.github/workflows/static.yml`，构建并部署 `dist/` 到
GitHub Pages。
