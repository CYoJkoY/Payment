# Payment

一个静态的多用户赞助页面。每个用户对应一个文件夹，也对应一个 **git tag**。
发布某个 tag 时，项目会根据 tag 名称找到同名文件夹，把里面的微信、支付宝图片和
Ko-fi 链接放进网页对应的位置，生成一个指向该用户页面（如
`https://cyojkoy.github.io/Payment/Yoko/`）的二维码（SVG + PNG），并把二维码
作为资产上传到该 tag 的 **GitHub Release**。

## 目录结构

```
site.json                 # 站点级配置（baseUrl、默认主题色、首页展示的用户）
profiles/
  Yoko/                   # 文件夹名 = 用户 slug = git tag
    wechat.webp           # 微信收款二维码图片（png/webp/jpg/jpeg/gif）
    alipay.webp           # 支付宝收款二维码图片
    kofi.txt              # 只写一行 Ko-fi 链接
    meta.json             # 可选：显示名、标题、主题色、介绍、备注、页脚
template/page.html        # 页面模板（三个卡片使用微信/支付宝/Ko-fi 官方图标）
scripts/                  # 构建、二维码、校验、发布脚本
```

## 新增一个用户

1. 建一个文件夹 `profiles/<tag>/`，名字就是以后发布的 tag，例如 `profiles/Alex/`。
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

## 发布 / 生成二维码到 Release

提交并推送后，创建一个与文件夹同名的 tag 并推送：

```sh
git tag Alex
git push origin main
git push origin Alex
```

推送 tag 会触发 `.github/workflows/release-qr.yml`：

- 找到 `profiles/Alex/`，把图片/链接注入网页三个卡片；
- 构建并解码校验二维码；
- 生成二维码，并上传到 `Alex` 这个 tag 的 GitHub Release（`Alex.png`、`Alex.svg`）。

页面本身部署在 GitHub Pages（由推送 `main` 的 `static.yml` 负责），所以要先合并到
`main` 再打 tag。也可以在 Actions 页面手动运行该 workflow 并填入 tag 名。

## 本地构建与预览

```sh
npm ci
npm run check          # 构建 + 解码校验所有二维码
npm run preview         # 打开 http://localhost:4173/Yoko/
node scripts/release.mjs --tag Yoko --dry-run   # 预览发布内容，不联网
```

构建产物（页面、二维码）输出到 `dist/`：

- `dist/<slug>/index.html` —— 用户页面
- `dist/qr/<slug>.svg` / `dist/qr/<slug>.png` —— 发布到 Release 的二维码（页面本身不内嵌）
- `dist/index.html` —— `site.json` 中 `primary` 指定用户的页面（站点首页）

`npm run check` 会重新构建并解码每个二维码，确认它确实指向配置的页面地址；
GitHub Actions 每次推送都会跑同样的检查。

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
