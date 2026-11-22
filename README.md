# Payment

Payment is a static, multi-user support page. Each configured username gets a
page such as `https://cyojkoy.github.io/Payment/Yoko/`, along with a branded QR
code in SVG and PNG that opens that page.

## Add a user

1. Put the user's payment QR images in `assets/` (PNG, WebP, or another browser-supported image format).
2. Add a user entry to `data/users.json`. Copy the existing Yoko entry and change its values:

```json
{
    "slug": "Alex",
    "displayName": "Alex",
    "headline": "Support Alex",
    "accent": "#1677ff",
    "intro": ["欢迎支持 Alex。", "Thank you for supporting Alex."],
    "wechat": {
        "qr": "assets/Alex-WeChat.png",
        "note": ["微信支付", "支持微信余额"]
    },
    "alipay": {
        "qr": "assets/Alex-Alipay.png",
        "note": ["支付宝", "支持支付宝余额"]
    },
    "kofi": {
        "url": "https://ko-fi.com/alex",
        "note": ["International", "Support via Credit Card or PayPal"]
    },
    "footer": [
        ["感谢您的支持。", "Thank you for your support."]
    ]
}
```

`slug` becomes the URL path, so `Alex` creates `/Payment/Alex/`. Slugs can use
letters, digits, dots, dashes, and underscores, and must be unique ignoring
case. Add a real Ko-fi URL and both QR image paths; the build checks these
values and rejects a missing image. Use a 3- or 6-digit hex value for `accent`.

`site.baseUrl` in `data/users.json` is the Pages site root and must end with a
slash. `site.primary` selects which user's page appears at `/Payment/`; the
named `/Payment/<slug>/` page is generated for every user regardless.

## Build and preview

```sh
npm ci
npm run check
npm run preview
```

Open `http://localhost:4173/Yoko/` to preview a generated page. The build writes
static pages and QR files to `dist/`:

- `dist/<slug>/index.html` — the user's support page
- `dist/qr/<slug>.svg` — scalable share QR artwork
- `dist/qr/<slug>.png` — 1024-pixel share QR image
- `dist/index.html` — the selected primary user's page

`npm run check` rebuilds the site and decodes each QR export to verify it
contains the exact configured page URL. GitHub Actions runs the same check and
publishes `dist/` to GitHub Pages after changes reach `main`.
