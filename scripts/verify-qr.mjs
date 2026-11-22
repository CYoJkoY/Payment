/**
 * Decodes every generated QR code and checks it points at the right page URL.
 * Both the PNG export and the SVG artwork are checked, so a styling change that
 * breaks scanning fails the build instead of shipping.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { svgToPngCrisp, qrMatrix } from './qr.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

function decode(buffer) {
    const image = PNG.sync.read(buffer);
    const result = jsQR(new Uint8ClampedArray(image.data), image.width, image.height, {
        inversionAttempts: 'attemptBoth'
    });
    return result ? result.data : null;
}

function main() {
    const { site, users } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'users.json'), 'utf8'));
    if (!fs.existsSync(DIST)) {
        throw new Error('[verify] dist/ is missing, run "npm run build" first');
    }

    let failures = 0;
    for (const user of users) {
        const expected = new URL(encodeURIComponent(user.slug) + '/', site.baseUrl).toString();
        const pngFile = path.join(DIST, 'qr', `${user.slug}.png`);
        const svgFile = path.join(DIST, 'qr', `${user.slug}.svg`);
        const pageFile = path.join(DIST, user.slug, 'index.html');

        if (!fs.existsSync(pngFile) || !fs.existsSync(svgFile) || !fs.existsSync(pageFile)) {
            console.log(`FAIL ${user.slug}: page or qr/{svg,png} missing`);
            failures += 1;
            continue;
        }

        const page = fs.readFileSync(pageFile, 'utf8');
        const pageOk = page.includes(`<link rel="canonical" href="${expected}">`)
            && page.includes(`src="../qr/${user.slug}.svg"`)
            && !/\{\{[A-Z_]+\}\}/.test(page);
        const fromPng = decode(fs.readFileSync(pngFile));
        const svg = fs.readFileSync(svgFile, 'utf8');
        const { size } = qrMatrix(expected);
        const fromSvg = decode(svgToPngCrisp(svg, size + (4 + 1.6) * 2, 1024));

        const pngOk = fromPng === expected;
        const svgOk = fromSvg === expected;
        console.log(`${pngOk && svgOk && pageOk ? 'ok  ' : 'FAIL'} ${user.slug.padEnd(12)} page=${pageOk ? 'match' : 'invalid'} png=${pngOk ? 'match' : fromPng || 'unreadable'} svg=${svgOk ? 'match' : fromSvg || 'unreadable'}`);
        if (!pngOk || !svgOk || !pageOk) failures += 1;
    }

    if (failures > 0) {
        throw new Error(`[verify] ${failures} QR code(s) failed to decode`);
    }
    console.log(`[verify] ${users.length} QR code(s) decode to the expected URLs`);
}

main();
