/**
 * Site builder.
 *
 * Reads data/users.json, renders one static page per user under /<slug>/, and
 * generates a stylized QR code (SVG + PNG) for each user's page URL.
 *
 * Output goes to dist/, which is what GitHub Pages deploys.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderQrSvg, svgToPngCrisp, qrMatrix } from './qr.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const TEMPLATE = path.join(ROOT, 'template', 'page.html');
const CONFIG_FILE = path.join(ROOT, 'data', 'users.json');

const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function fail(message) {
    throw new Error(`[build] ${message}`);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function paragraphs(lines) {
    return (Array.isArray(lines) ? lines : [lines])
        .filter((line) => line != null && line !== '')
        .map((line) => `        <p>${escapeHtml(line)}</p>`)
        .join('\n');
}

function linesBlock(lines) {
    return (Array.isArray(lines) ? lines : [lines])
        .filter((line) => line != null && line !== '')
        .map((line) => escapeHtml(line))
        .join('<br>');
}

function footerBlock(paragraphsList) {
    return paragraphsList
        .map((pair) => `        <p>${pair.map((line) => escapeHtml(line)).join('<br>')}</p>`)
        .join('\n');
}

function readConfig() {
    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch (error) {
        fail(`cannot read ${path.relative(ROOT, CONFIG_FILE)}: ${error.message}`);
    }

    const site = raw.site || {};
    if (!site.baseUrl) fail('site.baseUrl is required, e.g. "https://user.github.io/Payment/"');
    if (!site.baseUrl.endsWith('/')) fail('site.baseUrl must end with a slash');
    if (!Array.isArray(raw.users) || raw.users.length === 0) fail('users must contain at least one entry');

    const seen = new Set();
    const users = raw.users.map((user, index) => {
        const label = user.slug || `#${index + 1}`;
        if (!SLUG_PATTERN.test(user.slug || '')) {
            fail(`user "${label}": slug may only contain letters, digits, dot, dash and underscore`);
        }
        const lowered = user.slug.toLowerCase();
        if (seen.has(lowered)) fail(`user "${label}": duplicate slug (slugs must differ ignoring case)`);
        seen.add(lowered);

        if (!user.displayName) fail(`user "${label}": displayName is required`);
        if (user.accent && !/^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/.test(user.accent)) {
            fail(`user "${label}": accent must be a 3- or 6-digit hex color`);
        }
        if (!user.wechat?.qr) fail(`user "${label}": wechat.qr is required`);
        if (!user.alipay?.qr) fail(`user "${label}": alipay.qr is required`);
        if (!user.kofi?.url) fail(`user "${label}": kofi.url is required`);
        if (!/^https?:\/\//i.test(user.kofi.url)) fail(`user "${label}": kofi.url must start with http(s)://`);
        for (const file of [user.wechat.qr, user.alipay.qr]) {
            if (!fs.existsSync(path.join(ROOT, file))) fail(`user "${label}": missing file ${file}`);
        }
        return user;
    });

    const primary = site.primary || users[0].slug;
    if (!users.some((user) => user.slug === primary)) {
        fail(`site.primary "${primary}" does not match any user slug`);
    }
    if (site.defaultAccent && !/^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/.test(site.defaultAccent)) {
        fail('site.defaultAccent must be a 3- or 6-digit hex color');
    }

    return { site, users, primary };
}

function pageUrlFor(site, user) {
    return new URL(encodeURIComponent(user.slug) + '/', site.baseUrl).toString();
}

function renderPage({ site, user, assetBase, shareSvg, sharePng }) {
    const accent = user.accent || site.defaultAccent || '#00ff9d';
    const pageUrl = pageUrlFor(site, user);
    const title = `${user.headline || 'Support Me'} | ${site.titleSuffix || '赞助支持'}`;
    const description = (user.intro && user.intro[0]) || `${user.displayName} 的赞助支持页面`;

    const tokens = {
        LANG: escapeHtml(site.lang || 'zh-CN'),
        TITLE: escapeHtml(title),
        DESCRIPTION: escapeHtml(description),
        CANONICAL: escapeHtml(pageUrl),
        OG_IMAGE: escapeHtml(new URL(`qr/${encodeURIComponent(user.slug)}.png`, site.baseUrl).toString()),
        ACCENT: escapeHtml(accent),
        ASSET: assetBase,
        HEADLINE: escapeHtml(user.headline || 'Support Me'),
        INTRO: paragraphs(user.intro || []),
        WECHAT_QR: escapeHtml(assetBase + user.wechat.qr),
        WECHAT_NOTE: linesBlock(user.wechat.note || ['WeChat']),
        ALIPAY_QR: escapeHtml(assetBase + user.alipay.qr),
        ALIPAY_NOTE: linesBlock(user.alipay.note || ['Alipay']),
        KOFI_URL: escapeHtml(user.kofi.url),
        KOFI_NOTE: linesBlock(user.kofi.note || ['Ko-fi']),
        FOOTER: footerBlock(user.footer || []),
        SHARE_SVG: escapeHtml(assetBase + shareSvg),
        SHARE_PNG: escapeHtml(assetBase + sharePng),
        PAGE_URL: escapeHtml(pageUrl),
        SLUG: escapeHtml(user.slug),
        DISPLAY_NAME: escapeHtml(user.displayName),
        PAGE_CONFIG: JSON.stringify({
            slug: user.slug,
            displayName: user.displayName,
            pageUrl,
            kofiLink: user.kofi.url
        }).replace(/</g, '\\u003c')
    };

    let html = fs.readFileSync(TEMPLATE, 'utf8');
    for (const [key, value] of Object.entries(tokens)) {
        html = html.split(`{{${key}}}`).join(value);
    }
    const leftover = html.match(/\{\{[A-Z_]+\}\}/);
    if (leftover) fail(`unreplaced token ${leftover[0]} while rendering ${user.slug}`);
    return html;
}

function writeQrCodes(site, users) {
    for (const user of users) {
        const url = pageUrlFor(site, user);
        const svg = renderQrSvg(url, {
            displayName: user.displayName,
            slug: user.slug,
            accent: user.accent || site.defaultAccent
        });
        const { size } = qrMatrix(url);
        const totalModules = size + (4 + 1.6) * 2;
        const png = svgToPngCrisp(svg, totalModules, 1024);

        fs.writeFileSync(path.join(DIST, 'qr', `${user.slug}.svg`), svg);
        fs.writeFileSync(path.join(DIST, 'qr', `${user.slug}.png`), png);
        console.log(`  qr/${user.slug}.svg  qr/${user.slug}.png  ->  ${url}`);
    }
}

function copyTree(from, to) {
    fs.cpSync(path.join(ROOT, from), path.join(DIST, to), { recursive: true });
}

function writeNotFound(site) {
    const basePath = new URL(site.baseUrl).pathname;
    const links = site.__users
        .map((user) => `      <li><a href="${escapeHtml(basePath + encodeURIComponent(user.slug) + '/')}">${escapeHtml(user.displayName)}</a></li>`)
        .join('\n');
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>页面不存在 | Not Found</title>
    <link rel="stylesheet" href="${escapeHtml(basePath)}css/main.css">
    <style>
        .not-found { font-family: "JetBrains Mono", Consolas, monospace; text-align: center; }
        .not-found ul { list-style: none; margin-top: 1.5rem; display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
        .not-found a { color: var(--accent-color); text-decoration: none; border-bottom: 1px dashed currentColor; }
        .not-found a:hover { border-bottom-style: solid; }
    </style>
</head>
<body>
    <header class="header"><h1>404 <span class="cursor"></span></h1>
        <p>没有这个用户名，试试下面这些页面。</p>
        <p>No page at this address. Try one of these:</p>
    </header>
    <main class="not-found">
        <ul>
${links}
        </ul>
    </main>
</body>
</html>
`;
    fs.writeFileSync(path.join(DIST, '404.html'), html);
}

function main() {
    const { site, users, primary } = readConfig();

    if (path.basename(DIST) !== 'dist' || !DIST.startsWith(ROOT)) fail(`refusing to clean ${DIST}`);
    fs.rmSync(DIST, { recursive: true, force: true });
    fs.mkdirSync(path.join(DIST, 'qr'), { recursive: true });

    for (const dir of ['css', 'js', 'assets']) copyTree(dir, dir);
    fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

    console.log(`[build] ${users.length} user(s) from data/users.json`);
    writeQrCodes(site, users);

    for (const user of users) {
        fs.mkdirSync(path.join(DIST, user.slug), { recursive: true });
        const html = renderPage({
            site,
            user,
            assetBase: '../',
            shareSvg: `qr/${user.slug}.svg`,
            sharePng: `qr/${user.slug}.png`
        });
        fs.writeFileSync(path.join(DIST, user.slug, 'index.html'), html);
        console.log(`  ${user.slug}/index.html`);
    }

    const primaryUser = users.find((user) => user.slug === primary);
    const rootHtml = renderPage({
        site,
        user: primaryUser,
        assetBase: '',
        shareSvg: `qr/${primaryUser.slug}.svg`,
        sharePng: `qr/${primaryUser.slug}.png`
    });
    fs.writeFileSync(path.join(DIST, 'index.html'), rootHtml);
    console.log(`  index.html  (primary user: ${primary})`);

    writeNotFound({ ...site, __users: users });
    console.log('[build] done -> dist/');
}

main();
