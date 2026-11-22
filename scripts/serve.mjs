/**
 * Tiny static server for local preview of dist/.
 * Mimics GitHub Pages' directory handling so /Yoko/ resolves to Yoko/index.html.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'dist');
const PORT = Number(process.env.PORT || 4173);

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.json': 'application/json'
};

http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let filePath = path.join(ROOT, urlPath);
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403).end('Forbidden');
        return;
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }
    if (!fs.existsSync(filePath)) {
        filePath = path.join(ROOT, '404.html');
        res.statusCode = 404;
    }
    res.setHeader('Content-Type', TYPES[path.extname(filePath)] || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
}).listen(PORT, () => {
    console.log(`preview: http://localhost:${PORT}/`);
});
