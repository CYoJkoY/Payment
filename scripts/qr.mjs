/**
 * Stylized QR code renderer.
 *
 * Takes a URL and renders it as a personalized SVG (rounded modules, custom
 * finder patterns, brand-colored frame, center badge) plus a PNG for print
 * and chat sharing.
 */
import QRCode from 'qrcode';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Marcellus (SIL OFL) ships with the repo so the monogram and caption render
// identically on every machine and on CI, instead of falling back to whatever
// font happens to be installed.
export const FONT_FILES = [path.join(HERE, '..', 'assets', 'fonts', 'Marcellus-Regular.ttf')];
const DISPLAY_FONT = 'Marcellus';

const PAPER = '#f7faf8';
const INK = '#0a1020';

const QUIET_ZONE = 4; // modules, QR spec minimum
const FRAME_PAD = 1.6; // modules between quiet zone and frame
const CAPTION_H = 4.6; // modules of strip below the code
const DOT_SIZE = 0.93; // module fill ratio
const DOT_RADIUS = 0.36;
const SEAL_RADIUS = 2.75; // modules, paper disc of the center seal
const SEAL_RING = 0.24; // modules, accent ring outside the seal
const BADGE_HOLE = SEAL_RADIUS + SEAL_RING + 0.55; // modules cleared around it

function clampByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function hexToRgb(hex) {
    const clean = String(hex || '').replace('#', '').trim();
    const full = clean.length === 3
        ? clean.split('').map((c) => c + c).join('')
        : clean.padEnd(6, '0').slice(0, 6);
    const int = Number.parseInt(full, 16);
    if (!Number.isFinite(int)) return { r: 0x00, g: 0xff, b: 0x9d };
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function rgbToHex({ r, g, b }) {
    return '#' + [r, g, b].map((v) => clampByte(v).toString(16).padStart(2, '0')).join('');
}

/** Blend `to` into `from` by ratio t (0..1). */
function mix(from, to, t) {
    const a = hexToRgb(from);
    const b = hexToRgb(to);
    return rgbToHex({
        r: a.r + (b.r - a.r) * t,
        g: a.g + (b.g - a.g) * t,
        b: a.b + (b.b - a.b) * t
    });
}

/** Scale a color towards black so accents stay dark enough for scanning. */
function darken(hex, amount) {
    return mix(hex, '#000000', amount);
}

function escapeXml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function badgeLetter(displayName, slug) {
    const source = String(displayName || slug || '?').trim();
    const match = source.match(/[0-9A-Za-z\u4e00-\u9fa5]/u);
    return (match ? match[0] : '?').toUpperCase();
}

function isFinderCell(row, col, size) {
    const inTopLeft = row < 7 && col < 7;
    const inTopRight = row < 7 && col >= size - 7;
    const inBottomLeft = row >= size - 7 && col < 7;
    return inTopLeft || inTopRight || inBottomLeft;
}

function finderOrigins(size) {
    return [
        { row: 0, col: 0 },
        { row: 0, col: size - 7 },
        { row: size - 7, col: 0 }
    ];
}

function finderMarkup(row, col) {
    // Stroke is centered on the path, so inset the outer square by 0.5 module
    // to keep the ring exactly one module thick and aligned to the grid.
    return [
        `<rect x="${col + 0.5}" y="${row + 0.5}" width="6" height="6" rx="1.9" fill="none" stroke="url(#inkGrad)" stroke-width="1"/>`,
        `<rect x="${col + 2}" y="${row + 2}" width="3" height="3" rx="0.95" fill="url(#inkGrad)"/>`
    ].join('');
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

/**
 * Render a stylized QR code as an SVG document.
 *
 * @param {string} url        content to encode
 * @param {object} options    { displayName, slug, accent, caption }
 * @returns {string} SVG markup
 */
export function renderQrSvg(url, options = {}) {
    const { size, grid } = qrMatrix(url);
    const accent = options.accent || '#00ff9d';
    const darkTint = mix(darken(accent, 0.45), INK, 0.35);
    const letter = badgeLetter(options.displayName, options.slug);

    const offset = QUIET_ZONE + FRAME_PAD;
    const width = size + offset * 2;
    const height = width + CAPTION_H;

    const dots = [];
    const center = size / 2;
    for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
            if (!grid[row][col]) continue;
            if (isFinderCell(row, col, size)) continue;
            // Drop modules that the center badge would cover.
            const dx = col + 0.5 - center;
            const dy = row + 0.5 - center;
            if (Math.hypot(dx, dy) < BADGE_HOLE) continue;
            const x = offset + col + (1 - DOT_SIZE) / 2;
            const y = offset + row + (1 - DOT_SIZE) / 2;
            dots.push(`<rect x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${DOT_SIZE}" height="${DOT_SIZE}" rx="${DOT_RADIUS}"/>`);
        }
    }

    const finders = finderOrigins(size)
        .map(({ row, col }) => finderMarkup(offset + row, offset + col))
        .join('');

    const badgeCx = offset + center;
    const badgeCy = offset + center;
    const caption = escapeXml(String(options.displayName || options.slug || '').toUpperCase());

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(url)}">
  <title>QR code for ${escapeXml(url)}</title>
  <defs>
    <linearGradient id="inkGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${INK}"/>
      <stop offset="1" stop-color="${darkTint}"/>
    </linearGradient>
    <linearGradient id="sealGrad" x1="0.15" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="${mix(accent, '#ffffff', 0.14)}"/>
      <stop offset="1" stop-color="${mix(accent, '#ffffff', 0.02)}"/>
    </linearGradient>
    <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${mix(accent, INK, 0.25)}"/>
      <stop offset="1" stop-color="${darken(accent, 0.35)}"/>
    </linearGradient>
    <linearGradient id="monoGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${INK}"/>
      <stop offset="1" stop-color="${mix(INK, accent, 0.22)}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="${PAPER}"/>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="4.4" fill="none" stroke="${accent}" stroke-opacity="0.42" stroke-width="0.42"/>
  <rect x="1.25" y="1.25" width="${width - 2.5}" height="${height - 2.5}" rx="3.7" fill="none" stroke="${INK}" stroke-opacity="0.06" stroke-width="0.3"/>
  <g fill="url(#inkGrad)">
    ${dots.join('\n    ')}
  </g>
  <g>
    ${finders}
  </g>
  <g>
    <circle cx="${badgeCx}" cy="${badgeCy}" r="${SEAL_RADIUS + SEAL_RING * 0.9}" fill="none" stroke="url(#ringGrad)" stroke-width="${SEAL_RING}"/>
    <circle cx="${badgeCx}" cy="${badgeCy}" r="${SEAL_RADIUS}" fill="${PAPER}" stroke="${INK}" stroke-opacity="0.16" stroke-width="0.1"/>
    <circle cx="${badgeCx}" cy="${badgeCy}" r="${SEAL_RADIUS - 0.36}" fill="none" stroke="${INK}" stroke-opacity="0.22" stroke-width="0.08"/>
    <text x="${badgeCx}" y="${badgeCy - 0.34}" text-anchor="middle" dominant-baseline="central" font-family="${DISPLAY_FONT}" font-size="4.05" letter-spacing="0.04" fill="url(#monoGrad)">${escapeXml(letter)}</text>
    <path d="M${badgeCx} ${badgeCy + 1.0} l0.3 0.36 -0.3 0.36 -0.3 -0.36z" fill="${accent}"/>
  </g>
  <text x="${width / 2}" y="${width + CAPTION_H * 0.5}" text-anchor="middle" font-family="${DISPLAY_FONT}" font-size="1.95" letter-spacing="0.46" fill="${INK}" fill-opacity="0.86">${caption}</text>
  <rect x="${width / 2 - 1.15}" y="${width + CAPTION_H * 0.7}" width="2.3" height="0.26" rx="0.13" fill="url(#ringGrad)"/>
</svg>
`;
}

/**
 * Rasterize an SVG string to PNG bytes.
 * @param {string} svg
 * @param {number} width target pixel width
 */
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
