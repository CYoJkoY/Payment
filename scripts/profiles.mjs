/**
 * Profile loader.
 *
 * Every folder under profiles/ is one user. The folder name is the user's slug,
 * which is also the git tag that publishes them. A folder holds the payment
 * assets that get placed into the site's three card slots:
 *
 *   profiles/<slug>/
 *     meta.json        optional: displayName, headline, accent, intro, footer, notes
 *     wechat.(png|webp|jpg|jpeg|gif)   WeChat pay QR image
 *     alipay.(png|webp|jpg|jpeg|gif)   Alipay pay QR image
 *     kofi.txt         Ko-fi URL (or set meta.kofi.url)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PROFILES_DIR = path.join(ROOT, 'profiles');
const SITE_FILE = path.join(ROOT, 'site.json');

const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const HEX_PATTERN = /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/;
const IMAGE_EXTENSIONS = ['.png', '.webp', '.jpg', '.jpeg', '.gif'];

function fail(message) {
    throw new Error(`[profiles] ${message}`);
}

function readJson(file, label) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        fail(`cannot read ${label}: ${error.message}`);
    }
}

function findImage(dir, base) {
    for (const ext of IMAGE_EXTENSIONS) {
        const candidate = path.join(dir, base + ext);
        if (fs.existsSync(candidate)) return candidate;
    }
    return null;
}

/** Read site.json (baseUrl, lang, defaultAccent, primary) with validation. */
export function readSite() {
    if (!fs.existsSync(SITE_FILE)) fail('site.json is missing');
    const site = readJson(SITE_FILE, 'site.json');
    if (!site.baseUrl) fail('site.json: baseUrl is required, e.g. "https://user.github.io/Payment/"');
    if (!site.baseUrl.endsWith('/')) fail('site.json: baseUrl must end with a slash');
    if (site.defaultAccent && !HEX_PATTERN.test(site.defaultAccent)) {
        fail('site.json: defaultAccent must be a 3- or 6-digit hex color');
    }
    return site;
}

/** Build the URL for a user's page, e.g. https://user.github.io/Payment/Yoko/ */
export function pageUrlFor(site, slug) {
    return new URL(encodeURIComponent(slug) + '/', site.baseUrl).toString();
}

/** Load and validate every profile folder. */
export function loadProfiles() {
    const site = readSite();
    if (!fs.existsSync(PROFILES_DIR)) fail('profiles/ directory is missing');

    const folders = fs
        .readdirSync(PROFILES_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));

    if (folders.length === 0) fail('profiles/ contains no user folders');

    const seen = new Set();
    const profiles = folders.map((slug) => {
        if (!SLUG_PATTERN.test(slug)) {
            fail(`folder "${slug}": name may only contain letters, digits, dot, dash and underscore`);
        }
        const lowered = slug.toLowerCase();
        if (seen.has(lowered)) fail(`duplicate profile folder (ignoring case): ${slug}`);
        seen.add(lowered);

        const dir = path.join(PROFILES_DIR, slug);
        const metaFile = path.join(dir, 'meta.json');
        const meta = fs.existsSync(metaFile) ? readJson(metaFile, `profiles/${slug}/meta.json`) : {};
        if (meta.accent && !HEX_PATTERN.test(meta.accent)) {
            fail(`profiles/${slug}: accent must be a 3- or 6-digit hex color`);
        }

        const wechatFile = findImage(dir, 'wechat');
        const alipayFile = findImage(dir, 'alipay');
        if (!wechatFile) fail(`profiles/${slug}: missing wechat.(png|webp|jpg|jpeg|gif) QR image`);
        if (!alipayFile) fail(`profiles/${slug}: missing alipay.(png|webp|jpg|jpeg|gif) QR image`);

        const kofiFile = path.join(dir, 'kofi.txt');
        let kofiUrl = meta.kofi?.url;
        if (fs.existsSync(kofiFile)) kofiUrl = fs.readFileSync(kofiFile, 'utf8').trim();
        if (!kofiUrl) fail(`profiles/${slug}: missing kofi.txt (Ko-fi URL) or meta.kofi.url`);
        if (!/^https?:\/\//i.test(kofiUrl)) fail(`profiles/${slug}: Ko-fi URL must start with http(s)://`);

        return {
            slug,
            dir,
            meta,
            displayName: meta.displayName || slug,
            headline: meta.headline || 'Support Me',
            accent: meta.accent || site.defaultAccent || '#00ff9d',
            intro: meta.intro || [],
            footer: meta.footer || [],
            wechatNote: meta.wechat?.note || ['WeChat'],
            alipayNote: meta.alipay?.note || ['Alipay'],
            kofiNote: meta.kofi?.note || ['Ko-fi'],
            wechatFile,
            alipayFile,
            wechatExt: path.extname(wechatFile),
            alipayExt: path.extname(alipayFile),
            kofiUrl
        };
    });

    const primary = site.primary || profiles[0].slug;
    if (!profiles.some((profile) => profile.slug === primary)) {
        fail(`site.json: primary "${primary}" does not match any profile folder`);
    }

    return { site, profiles, primary };
}

/**
 * Resolve a git tag to a profile folder. The tag name should match a folder
 * exactly; a leading "v" is also tolerated (tag vYoko -> folder Yoko).
 */
export function resolveProfileByTag(tag) {
    const clean = String(tag || '').replace(/^refs\/tags\//, '').trim();
    if (!clean) fail('empty tag name');
    const { site, profiles } = loadProfiles();
    const direct = profiles.find((profile) => profile.slug === clean);
    if (direct) return { site, profile: direct, tag: clean };
    const stripped = clean.replace(/^v/i, '');
    const fallback = profiles.find((profile) => profile.slug === stripped);
    if (fallback) return { site, profile: fallback, tag: clean };
    fail(`no profile folder matches tag "${clean}" (expected profiles/${clean}/)`);
}
