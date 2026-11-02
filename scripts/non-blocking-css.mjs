import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const indexPath = path.resolve('dist/index.html');
let html = await readFile(indexPath, 'utf8');
let rewritten = 0;

html = html.replace(
  /<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']+\.css(?:\?[^"']*)?)["'])[^>]*>/gi,
  (tag) => {
    const href = tag.match(/\bhref=["']([^"']+\.css(?:\?[^"']*)?)["']/i)?.[1];
    if (!href || !href.startsWith('/assets/')) return tag;

    const crossorigin = /\bcrossorigin(?:=["'][^"']*["'])?/i.test(tag) ? ' crossorigin' : '';
    rewritten += 1;
    return `<link rel="preload" as="style" href="${href}"${crossorigin} fetchpriority="high" onload="this.onload=null;this.rel='stylesheet'"><noscript><link rel="stylesheet" href="${href}"${crossorigin}></noscript>`;
  },
);

if (rewritten === 0) {
  throw new Error('Expected Vite to emit an application CSS link in dist/index.html; no stylesheet was rewritten.');
}

await writeFile(indexPath, html, 'utf8');
console.log(`[performance] converted ${rewritten} application stylesheet link(s) to high-priority non-blocking preloads.`);
