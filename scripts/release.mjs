/**
 * Publish a user's QR code into the GitHub Release for their tag.
 *
 * Flow:
 *   1. The tag name identifies a profile folder (profiles/<tag>/) - see
 *      profiles.mjs#resolveProfileByTag.
 *   2. The profile's page + QR must already be built (npm run build), which
 *      writes the QR artwork to build/qr/ — build/ is never deployed to Pages,
 *      so the Release is the only place this image exists.
 *   3. This script creates (or updates) the Release for that tag and uploads
 *      the QR assets (PNG + SVG) so anyone can scan or download them.
 *
 * Usage:
 *   node scripts/release.mjs --tag Yoko
 *   node scripts/release.mjs --tag Yoko --dry-run
 *
 * Env:
 *   GITHUB_TOKEN       token with contents:write (auto-provided in Actions)
 *   GITHUB_REPOSITORY  owner/repo (auto-provided in Actions)
 *
 * Flags:
 *   --tag <tag>        tag/profile to publish (defaults to GITHUB_REF_NAME)
 *   --repo <o/r>       override owner/repo
 *   --dry-run          print what would be uploaded, touch no network
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, resolveProfileByTag, pageUrlFor } from './profiles.mjs';

const API = 'https://api.github.com';
const UPLOADS = 'https://uploads.github.com';
const HDRS = {
    'X-GitHub-Api-Version': '2022-11-28'
};

function parseArgs(argv) {
    const args = { tag: process.env.GITHUB_REF_NAME, repo: process.env.GITHUB_REPOSITORY, dryRun: false };
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === '--dry-run') args.dryRun = true;
        else if (a === '--tag') args.tag = argv[++i];
        else if (a.startsWith('--tag=')) args.tag = a.slice(6);
        else if (a === '--repo') args.repo = argv[++i];
        else if (a.startsWith('--repo=')) args.repo = a.slice(7);
    }
    return args;
}

function fail(message) {
    throw new Error(`[release] ${message}`);
}

async function gh(method, url, { token, body, headers = {}, raw = false } = {}) {
    const res = await fetch(url, {
        method,
        headers: {
            ...HDRS,
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            ...headers
        },
        body
    });
    if (!res.ok) {
        const text = await res.text();
        const err = new Error(`[release] ${method} ${url} -> ${res.status} ${text.slice(0, 400)}`);
        err.status = res.status;
        throw err;
    }
    if (raw) return res;
    if (res.status === 204) return null;
    return res.json();
}

async function getRelease(token, repo, tag) {
    try {
        return await gh('GET', `${API}/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, { token });
    } catch (error) {
        if (error.status === 404) return null;
        throw error;
    }
}

async function ensureRelease(token, repo, tag, name, body) {
    let release = await getRelease(token, repo, tag);
    if (release) {
        console.log(`[release] updating existing release for tag "${tag}" (id ${release.id})`);
        release = await gh('PATCH', `${API}/repos/${repo}/releases/${release.id}`, {
            token,
            body: JSON.stringify({ name, body }),
            headers: { 'Content-Type': 'application/json' }
        });
        return release;
    }
    console.log(`[release] creating release for tag "${tag}"`);
    const target = process.env.GITHUB_SHA || undefined;
    return gh('POST', `${API}/repos/${repo}/releases`, {
        token,
        body: JSON.stringify({ tag_name: tag, name, body, target_commitish: target, draft: false, prerelease: false }),
        headers: { 'Content-Type': 'application/json' }
    });
}

async function uploadAsset(token, repo, release, filePath, name) {
    // Replace any asset of the same name so re-runs stay idempotent.
    const existing = (release.assets || []).find((asset) => asset.name === name);
    if (existing) {
        console.log(`[release] replacing existing asset ${name} (id ${existing.id})`);
        await gh('DELETE', `${API}/repos/${repo}/releases/assets/${existing.id}`, { token });
    }
    const data = fs.readFileSync(filePath);
    const contentType = name.endsWith('.png') ? 'image/png' : 'image/svg+xml';
    const uploaded = await gh(
        'POST',
        `${UPLOADS}/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
        { token, body: data, headers: { 'Content-Type': contentType } }
    );
    console.log(`[release] uploaded ${name} (${data.length} bytes) -> ${uploaded.browser_download_url}`);
    return uploaded;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.tag) fail('no tag given; pass --tag <tag> or set GITHUB_REF_NAME');

    const { site, profile, tag } = resolveProfileByTag(args.tag);
    const url = pageUrlFor(site, profile.slug);
    console.log(`[release] tag "${tag}" -> profile "${profile.slug}" -> ${url}`);

    const pngFile = path.join(ROOT, 'build', 'qr', `${profile.slug}.png`);
    const svgFile = path.join(ROOT, 'build', 'qr', `${profile.slug}.svg`);
    for (const file of [pngFile, svgFile]) {
        if (!fs.existsSync(file)) fail(`missing ${path.relative(ROOT, file)}; run "npm run build" first`);
    }

    const displayName = profile.displayName || profile.slug;
    const body = [
        `赞助页面 / Support page: ${url}`,
        '',
        '扫码或下载二维码即可进入该页面：',
        'Scan the QR or download the image to open this page:',
        '',
        `- \`${profile.slug}.png\` — 1024px PNG`,
        `- \`${profile.slug}.svg\` — 矢量 SVG`
    ].join('\n');
    const name = `${displayName} · QR`;

    if (args.dryRun) {
        console.log('[release] DRY RUN — would create/update release:');
        console.log(`  tag:  ${tag}`);
        console.log(`  name: ${name}`);
        console.log(`  repo: ${args.repo || '(from GITHUB_REPOSITORY)'}`);
        console.log(`  file: ${path.relative(ROOT, pngFile)}`);
        console.log(`  file: ${path.relative(ROOT, svgFile)}`);
        return;
    }

    const token = process.env.GITHUB_TOKEN;
    const repo = args.repo || process.env.GITHUB_REPOSITORY;
    if (!token) fail('GITHUB_TOKEN is not set');
    if (!repo || !/^[^/]+\/[^/]+$/.test(repo)) fail('repo must be "owner/repo" (set --repo or GITHUB_REPOSITORY)');

    const release = await ensureRelease(token, repo, tag, name, body);
    await uploadAsset(token, repo, release, pngFile, `${profile.slug}.png`);
    await uploadAsset(token, repo, release, svgFile, `${profile.slug}.svg`);
    console.log(`[release] done: ${release.html_url}`);
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
