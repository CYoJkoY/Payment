/**
 * Site builder.
 *
 * Reads every folder under profiles/ (each folder is one user, named by their
 * tag/slug), renders one static page under /<slug>/, injects that user's
 * WeChat/Alipay/Ko-fi assets into the three card slots, and generates the QR
 * code (SVG + PNG) for the page URL, which ships in the tag's Release rather
 * than on the page itself.
 *
 * Output goes to dist/, which is what GitHub Pages deploys.
 */
import fs from 'node:fs';
import path from 'node:path';
import { renderQrSvg, svgToPngCrisp, qrMatrix } from './qr.mjs';
import { ROOT, loadProfiles, pageUrlFor, escapeHtml } from './profiles.mjs';

const DIST = path.join(ROOT, 'dist');
const TEMPLATE = path.join(ROOT, 'template', 'page.html');

function fail(message) {
    throw new Error(`[build] ${message}`);
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
    return (paragraphsList || [])
        .map((pair) => `        <p>${pair.map((line) => escapeHtml(line)).join('<br>')}</p>`)
        .join('\n');
}

function renderPage({ site, profile, assetBase }) {
    const pageUrl = pageUrlFor(site, profile.slug);
    const title = `${profile.headline || 'Support Me'} | ${site.titleSuffix || '赞助支持'}`;
    const description = (profile.intro && profile.intro[0]) || `${profile.displayName} 的赞助支持页面`;

    const tokens = {
        LANG: escapeHtml(site.lang || 'zh-CN'),
        TITLE: escapeHtml(title),
        DESCRIPTION: escapeHtml(description),
        CANONICAL: escapeHtml(pageUrl),
        OG_IMAGE: escapeHtml(new URL(`qr/${encodeURIComponent(profile.slug)}.png`, site.baseUrl).toString()),
        ACCENT: escapeHtml(profile.accent),
        ASSET: assetBase,
        HEADLINE: escapeHtml(profile.headline || 'Support Me'),
        INTRO: paragraphs(profile.intro || []),
        WECHAT_QR: escapeHtml(`${assetBase}assets/${profile.slug}/wechat${profile.wechatExt}`),
        WECHAT_NOTE: linesBlock(profile.wechatNote),
        ALIPAY_QR: escapeHtml(`${assetBase}assets/${profile.slug}/alipay${profile.alipayExt}`),
        ALIPAY_NOTE: linesBlock(profile.alipayNote),
        KOFI_URL: escapeHtml(profile.kofiUrl),
        KOFI_NOTE: linesBlock(profile.kofiNote),
        FOOTER: footerBlock(profile.footer),
        PAGE_CONFIG: JSON.stringify({
            slug: profile.slug,
            displayName: profile.displayName,
            pageUrl,
            kofiLink: profile.kofiUrl
        }).replace(/</g, '\\u003c')
    };

    let html = fs.readFileSync(TEMPLATE, 'utf8');
    for (const [key, value] of Object.entries(tokens)) {
        html = html.split(`{{${key}}}`).join(value);
    }
    const leftover = html.match(/\{\{[A-Z_]+\}\}/);
    if (leftover) fail(`unreplaced token ${leftover[0]} while rendering ${profile.slug}`);
    return html;
}

function writeQrCodes(site, profiles) {
    for (const profile of profiles) {
        const url = pageUrlFor(site, profile.slug);
        const svg = renderQrSvg(url, {
            displayName: profile.displayName,
            slug: profile.slug,
            accent: profile.accent
        });
        const { size } = qrMatrix(url);
        const totalModules = size + (4 + 1.6) * 2;
        const png = svgToPngCrisp(svg, totalModules, 1024);

        fs.writeFileSync(path.join(DIST, 'qr', `${profile.slug}.svg`), svg);
        fs.writeFileSync(path.join(DIST, 'qr', `${profile.slug}.png`), png);
        console.log(`  qr/${profile.slug}.svg  qr/${profile.slug}.png  ->  ${url}`);
    }
}

function copyTree(from, to) {
    fs.cpSync(path.join(ROOT, from), path.join(DIST, to), { recursive: true });
}

function copyProfileImages(profiles) {
    for (const profile of profiles) {
        const targetDir = path.join(DIST, 'assets', profile.slug);
        fs.mkdirSync(targetDir, { recursive: true });
        fs.copyFileSync(profile.wechatFile, path.join(targetDir, `wechat${profile.wechatExt}`));
        fs.copyFileSync(profile.alipayFile, path.join(targetDir, `alipay${profile.alipayExt}`));
    }
}

function writeNotFound(site, profiles) {
    const basePath = new URL(site.baseUrl).pathname;
    const links = profiles
        .map((profile) => `      <li><a href="${escapeHtml(basePath + encodeURIComponent(profile.slug) + '/')}">${escapeHtml(profile.displayName)}</a></li>`)
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
    const { site, profiles, primary } = loadProfiles();

    if (path.basename(DIST) !== 'dist' || !DIST.startsWith(ROOT)) fail(`refusing to clean ${DIST}`);
    fs.rmSync(DIST, { recursive: true, force: true });
    fs.mkdirSync(path.join(DIST, 'qr'), { recursive: true });

    for (const dir of ['css', 'js', 'assets']) copyTree(dir, dir);
    fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

    console.log(`[build] ${profiles.length} user(s) from profiles/`);
    copyProfileImages(profiles);
    writeQrCodes(site, profiles);

    for (const profile of profiles) {
        fs.mkdirSync(path.join(DIST, profile.slug), { recursive: true });
        const html = renderPage({
            site,
            profile,
            assetBase: '../'
        });
        fs.writeFileSync(path.join(DIST, profile.slug, 'index.html'), html);
        console.log(`  ${profile.slug}/index.html`);
    }

    const primaryProfile = profiles.find((profile) => profile.slug === primary);
    const rootHtml = renderPage({
        site,
        profile: primaryProfile,
        assetBase: ''
    });
    fs.writeFileSync(path.join(DIST, 'index.html'), rootHtml);
    console.log(`  index.html  (primary user: ${primary})`);

    writeNotFound(site, profiles);
    console.log('[build] done -> dist/');
}

main();
