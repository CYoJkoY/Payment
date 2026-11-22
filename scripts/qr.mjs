/**
 * Stylized QR code renderer.
 *
 * Takes a URL and renders it as a personalized SVG (rounded modules, custom
 * finder patterns, brand-colored frame, center badge) plus a PNG for print
 * and chat sharing.
 */
import QRCode from 'qrcode';
import { Resvg } from '@resvg/resvg-js';

const PAPER = '#f7faf8';
const INK = '#0a1020';

const QUIET_ZONE = 4; // modules, QR spec minimum
const FRAME_PAD = 1.6; // modules between quiet zone and frame
const CAPTION_H = 4.6; // modules of strip below the code
const DOT_SIZE = 0.93; // module fill ratio
const DOT_RADIUS = 0.36;
const BADGE_HOLE = 3.1; // modules cleared around the badge
const BADGE_RADIUS = 2.5;

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
    const badgeTop = mix(accent, '#ffffff', 0.12);
    const badgeBottom = darken(accent, 0.3);
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
    <linearGradient id="badgeGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${badgeTop}"/>
      <stop offset="1" stop-color="${badgeBottom}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="${PAPER}"/>
  <rect x="0.45" y="0.45" width="${width - 0.9}" height="${height - 0.9}" rx="4.2" fill="none" stroke="${accent}" stroke-opacity="0.55" stroke-width="0.5"/>
  <rect x="1.15" y="1.15" width="${width - 2.3}" height="${height - 2.3}" rx="3.6" fill="none" stroke="${INK}" stroke-opacity="0.07" stroke-width="0.35"/>
  <g fill="url(#inkGrad)">
    ${dots.join('\n    ')}
  </g>
  <g>
    ${finders}
  </g>
  <circle cx="${badgeCx}" cy="${badgeCy}" r="${BADGE_RADIUS + 0.42}" fill="${PAPER}"/>
  <circle cx="${badgeCx}" cy="${badgeCy}" r="${BADGE_RADIUS}" fill="url(#badgeGrad)" stroke="${INK}" stroke-opacity="0.12" stroke-width="0.12"/>
  <text x="${badgeCx}" y="${badgeCy}" text-anchor="middle" dominant-baseline="central" font-family="'JetBrains Mono','DejaVu Sans Mono',Consolas,monospace" font-size="2.9" font-weight="700" fill="#08111d">${escapeXml(letter)}</text>
  <text x="${width / 2}" y="${width + CAPTION_H * 0.52}" text-anchor="middle" font-family="'DejaVu Sans','Segoe UI',Arial,sans-serif" font-size="1.65" font-weight="600" letter-spacing="0.32" fill="${INK}" fill-opacity="0.82">${caption}</text>
  <rect x="${width / 2 - 0.9}" y="${width + CAPTION_H * 0.68}" width="1.8" height="0.34" rx="0.17" fill="${accent}"/>
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
        font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' }
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
