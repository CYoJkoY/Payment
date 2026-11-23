/**
 * Ink-wash (水墨) QR renderer.
 *
 * Renders a URL as a hand-inked QR card: rice-paper ground, ink clouds bleeding
 * in from the margins, brush-dot modules with wet-edge bleed, brush-drawn finder
 * rings, a vermilion carved seal at the centre, and the owner's name set in a
 * brush typeface.
 *
 * Scannability comes first: the code square keeps a clean quiet zone, every
 * dark module stays solid ink (>= 88% contrast against paper), finder patterns
 * keep their exact 7/5/3 proportions, and the seal stays inside what error
 * correction level H can rebuild. verify-qr.mjs decodes the PNG and the SVG to
 * prove it.
 */
import QRCode from 'qrcode';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Ma Shan Zheng (SIL OFL 1.1, bundled) is a brush-written face with full Latin
// coverage, so the seal monogram and the caption render the same on every
// machine and on CI instead of falling back to a system font.
export const FONT_FILES = [path.join(HERE, '..', 'assets', 'fonts', 'MaShanZheng-Regular.ttf')];
const DISPLAY_FONT = 'MaShanZheng';

const PAPER = '#f6f2e9';
const PAPER_WARM = '#efe7d6';
const INK = '#0d1014';
const INK_MID = '#1d232b';
const INK_PALE = '#3a424e';
const CINNABAR = '#b0342a';

export const QUIET_ZONE = 4; // modules, QR spec minimum
export const FRAME_PAD = 2; // modules between quiet zone and the ink frame (integer keeps modules pixel-aligned)
export const MODULE_PAD = QUIET_ZONE + FRAME_PAD;
const CAPTION_H = 7.2; // modules of caption strip below the code

const SEAL_HALF = 2.55; // modules, half-width of the vermilion seal
const BADGE_HOLE = 3.55; // modules cleared around the seal

/** Deterministic 32-bit PRNG so a rebuild produces byte-identical artwork. */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function seedFrom(text) {
    let hash = 2166136261;
    for (const ch of String(text)) {
        hash ^= ch.codePointAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function escapeXml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function fixed(n) {
    return Number(n.toFixed(3));
}

/** Smooth closed path through jittered ring points — an ink pool, not a circle. */
function inkBlob(cx, cy, radius, wobble, rand, points = 8) {
    const pts = [];
    for (let i = 0; i < points; i += 1) {
        const angle = (i / points) * Math.PI * 2;
        const r = radius * (1 + wobble * (rand() * 2 - 1));
        pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, ]);
    }
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let m = mid(pts[points - 1], pts[0]);
    let d = `M${fixed(m[0])} ${fixed(m[1])}`;
    for (let i = 0; i < points; i += 1) {
        const p = pts[i];
        const nm = mid(p, pts[(i + 1) % points]);
        d += `Q${fixed(p[0])} ${fixed(p[1])} ${fixed(nm[0])} ${fixed(nm[1])}`;
    }
    return `${d}Z`;
}

function badgeLetter(displayName, slug) {
    const source = String(displayName || slug || '?').trim();
    const match = source.match(/[0-9A-Za-z\u4e00-\u9fa5]/u);
    return match ? match[0] : '?';
}

/** Build the QR matrix (1 = dark module). */
export function qrMatrix(text) {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'H' });
    const { size } = qr.modules;
    const data = qr.modules.data;
    const grid = [];
    for (let row = 0; row < size; row += 1) {
        const line = [];
        for (let col = 0; col < size; col += 1) line.push(data[row * size + col] ? 1 : 0);
        grid.push(line);
    }
    return { size, grid };
}

/** Total width of the artwork in module units, code + padding only. */
export function moduleSpan(size) {
    return size + MODULE_PAD * 2;
}

/**
 * Render an ink-wash QR card as an SVG document.
 *
 * @param {string} url    content to encode
 * @param {object} options { displayName, slug, subtitle }
 * @returns {string} SVG markup
 */
export function renderQrSvg(url, options = {}) {
    const { size, grid } = qrMatrix(url);
    const seed = seedFrom(`${url}|${options.slug || ''}|${options.displayName || ''}`);
    const rand = mulberry32(seed);

    const offset = MODULE_PAD;
    const width = moduleSpan(size);
    const height = width + CAPTION_H;
    const center = offset + size / 2;

    // Data modules render as clean, full-size squares (finder patterns too).
    // A stylised dot-matrix was tried and rejected: rounded, gapped or rotated
    // modules stop jsQR/ZBar decoding at some scales, which means the printed or
    // on-screen card can fail to scan. Keeping the payload modules crisp keeps the
    // code reliable at any size; the ink-wash character lives in the card artwork
    // (paper, clouds, margin brush sweeps, seal, brush caption) instead.
    // The seal sits over the centre at EC level H, so clear a disc of modules
    // beneath it and draw the vermilion stamp there.
    const modules = [];
    for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
            if (!grid[row][col]) continue;
            const cx = offset + col + 0.5;
            const cy = offset + row + 0.5;
            if (Math.hypot(cx - center, cy - center) < BADGE_HOLE) continue;
            modules.push(`<rect x="${fixed(offset + col)}" y="${fixed(offset + row)}" width="1" height="1"/>`);
        }
    }

    // Splatter: dry ink specks, kept clear of the code square.
    const specks = [];
    let guard = 0;
    while (specks.length < 46 && guard < 4000) {
        guard += 1;
        const x = rand() * width;
        const y = rand() * height;
        const insideCode = x > offset - 0.5 && x < width - offset + 0.5 && y > offset - 0.5 && y < width - offset + 0.5;
        if (insideCode) continue;
        specks.push(`<path d="${inkBlob(x, y, 0.05 + rand() * 0.11, 0.3, rand, 6)}" fill-opacity="${fixed(0.1 + rand() * 0.14)}"/>`);
    }
    const letter = escapeXml(badgeLetter(options.displayName, options.slug));
    const caption = escapeXml(String(options.displayName || options.slug || '').toUpperCase());
    const subtitle = escapeXml(options.subtitle || '扫码进入支持页');
    const frameInset = 0.9;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${fixed(width)}" height="${fixed(height)}" viewBox="0 0 ${fixed(width)} ${fixed(height)}" role="img" aria-label="${escapeXml(url)}">
  <title>QR code for ${escapeXml(url)}</title>
  <defs>
    <linearGradient id="inkBrush" x1="0" y1="0" x2="0.65" y2="1">
      <stop offset="0" stop-color="${INK}"/>
      <stop offset="0.55" stop-color="${INK}"/>
      <stop offset="1" stop-color="${INK_MID}"/>
    </linearGradient>
    <linearGradient id="sealInk" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="${CINNABAR}"/>
      <stop offset="1" stop-color="#87231c"/>
    </linearGradient>
    <radialGradient id="cloudEdge" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${INK_MID}" stop-opacity="0.3"/>
      <stop offset="0.45" stop-color="${INK_MID}" stop-opacity="0.14"/>
      <stop offset="0.78" stop-color="${INK_PALE}" stop-opacity="0.05"/>
      <stop offset="1" stop-color="${INK_PALE}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="cloudSoft" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${INK_MID}" stop-opacity="0.19"/>
      <stop offset="0.6" stop-color="${INK_MID}" stop-opacity="0.07"/>
      <stop offset="1" stop-color="${INK_PALE}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="cloudFaint" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${INK_MID}" stop-opacity="0.045"/>
      <stop offset="1" stop-color="${INK_MID}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="paperSheen" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${PAPER_WARM}" stop-opacity="0.75"/>
      <stop offset="1" stop-color="${PAPER_WARM}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- rice paper ground -->
  <rect width="${fixed(width)}" height="${fixed(height)}" fill="${PAPER}"/>
  <ellipse cx="${fixed(width * 0.7)}" cy="${fixed(height * 0.28)}" rx="${fixed(width * 0.5)}" ry="${fixed(width * 0.42)}" fill="url(#paperSheen)"/>

  <!-- ink clouds: heavy where the paper is bare, a whisper across the code so the sheet still reads as wet -->
  <ellipse cx="${fixed(width * 0.1)}" cy="${fixed(width * 0.05)}" rx="${fixed(width * 0.36)}" ry="${fixed(width * 0.26)}" fill="url(#cloudEdge)"/>
  <ellipse cx="${fixed(width * 0.94)}" cy="${fixed(width * 0.9)}" rx="${fixed(width * 0.42)}" ry="${fixed(width * 0.34)}" fill="url(#cloudSoft)"/>
  <ellipse cx="${fixed(width * 0.86)}" cy="${fixed(width * 0.06)}" rx="${fixed(width * 0.24)}" ry="${fixed(width * 0.16)}" fill="url(#cloudSoft)"/>
  <ellipse cx="${fixed(width * 0.08)}" cy="${fixed(width * 0.96)}" rx="${fixed(width * 0.3)}" ry="${fixed(width * 0.2)}" fill="url(#cloudSoft)"/>
  <ellipse cx="${fixed(width * 0.5)}" cy="${fixed(width * 0.5)}" rx="${fixed(width * 0.42)}" ry="${fixed(width * 0.42)}" fill="url(#cloudFaint)"/>

  <!-- dry-brush sweeps in the margins -->
  <path d="M${fixed(width * 0.05)} ${fixed(width * 0.55)} q ${fixed(width * 0.09)} ${fixed(-width * 0.045)} ${fixed(width * 0.15)} ${fixed(width * 0.008)}" stroke="${INK_MID}" stroke-opacity="0.13" stroke-width="${fixed(width * 0.014)}" fill="none" stroke-linecap="round"/>
  <path d="M${fixed(width * 0.8)} ${fixed(width * 0.16)} q ${fixed(width * 0.08)} ${fixed(width * 0.028)} ${fixed(width * 0.12)} ${fixed(-width * 0.018)}" stroke="${INK_MID}" stroke-opacity="0.1" stroke-width="${fixed(width * 0.01)}" fill="none" stroke-linecap="round"/>

  <g fill="${INK_MID}">
    ${specks.join('\n')}
  </g>

  <!-- ink frame: outer wash line, inner cinnabar hairline -->
  <rect x="${fixed(frameInset)}" y="${fixed(frameInset)}" width="${fixed(width - frameInset * 2)}" height="${fixed(width - frameInset * 2)}" rx="${fixed(width * 0.045)}" fill="none" stroke="${INK}" stroke-opacity="0.32" stroke-width="${fixed(width * 0.008)}" stroke-dasharray="${fixed(width * 0.19)} ${fixed(width * 0.006)} ${fixed(width * 0.11)} ${fixed(width * 0.009)}"/>
  <rect x="${fixed(frameInset + width * 0.014)}" y="${fixed(frameInset + width * 0.014)}" width="${fixed(width - frameInset * 2 - width * 0.028)}" height="${fixed(width - frameInset * 2 - width * 0.028)}" rx="${fixed(width * 0.04)}" fill="none" stroke="${CINNABAR}" stroke-opacity="0.26" stroke-width="${fixed(width * 0.0022)}"/>

  <!-- payload modules: crisp so the code decodes at any scale -->
  <g fill="url(#inkBrush)" shape-rendering="crispEdges">
    ${modules.join('\n')}
  </g>

  <!-- carved seal -->
  <g>
    <rect x="${fixed(center - SEAL_HALF)}" y="${fixed(center - SEAL_HALF)}" width="${fixed(SEAL_HALF * 2)}" height="${fixed(SEAL_HALF * 2)}" rx="${fixed(SEAL_HALF * 0.2)}" fill="url(#sealInk)"/>
    <rect x="${fixed(center - SEAL_HALF + 0.32)}" y="${fixed(center - SEAL_HALF + 0.32)}" width="${fixed(SEAL_HALF * 2 - 0.64)}" height="${fixed(SEAL_HALF * 2 - 0.64)}" rx="${fixed(SEAL_HALF * 0.15)}" fill="none" stroke="${PAPER}" stroke-opacity="0.6" stroke-width="0.13"/>
    <text x="${fixed(center)}" y="${fixed(center + 0.07)}" text-anchor="middle" dominant-baseline="central" font-family="${DISPLAY_FONT}" font-size="${fixed(SEAL_HALF * 1.45)}" fill="${PAPER}">${letter}</text>
  </g>

  <!-- caption -->
  <text x="${fixed(width / 2)}" y="${fixed(width + CAPTION_H * 0.42)}" text-anchor="middle" font-family="${DISPLAY_FONT}" font-size="${fixed(width * 0.056)}" letter-spacing="${fixed(width * 0.012)}" fill="${INK}" fill-opacity="0.9">${caption}</text>
  <path d="M${fixed(width * 0.28)} ${fixed(width + CAPTION_H * 0.55)} q ${fixed(width * 0.11)} ${fixed(CAPTION_H * 0.05)} ${fixed(width * 0.22)} 0 q ${fixed(width * 0.11)} ${fixed(-CAPTION_H * 0.04)} ${fixed(width * 0.22)} 0" stroke="${INK}" stroke-opacity="0.3" stroke-width="${fixed(width * 0.0038)}" fill="none" stroke-linecap="round"/>
  <text x="${fixed(width / 2)}" y="${fixed(width + CAPTION_H * 0.83)}" text-anchor="middle" font-family="${DISPLAY_FONT}" font-size="${fixed(width * 0.031)}" letter-spacing="${fixed(width * 0.004)}" fill="${INK_MID}" fill-opacity="0.72">${subtitle}</text>
</svg>
`;
}

/** Rasterize an SVG string to PNG bytes. */
export function svgToPng(svg, width = 1024) {
    const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: width },
        background: PAPER,
        font: {
            fontFiles: FONT_FILES,
            loadSystemFonts: true,
            defaultFontFamily: DISPLAY_FONT
        }
    });
    return resvg.render().asPng();
}

/**
 * Rasterize at an integer number of pixels per module so module edges stay
 * crisp. Aliased edges are what break strict decoders most often.
 */
export function svgToPngCrisp(svg, totalModules, targetWidth = 1024) {
    const pixelsPerModule = Math.max(8, Math.round(targetWidth / totalModules));
    return svgToPng(svg, Math.round(totalModules * pixelsPerModule));
}
