import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const dist = path.resolve('dist');
const requiredFiles = [
  'ai-catalog.json',
  '.well-known/ai-catalog.json',
  '.well-known/ard.json',
  'llms.txt',
  'robots.txt',
  'sitemap.xml',
];

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(dist, relativePath);
  let info;
  try {
    info = await stat(absolutePath);
  } catch {
    throw new Error(`Required static asset missing from build output: dist/${relativePath}`);
  }
  if (!info.isFile()) {
    throw new Error(`Expected a physical file in build output: dist/${relativePath}`);
  }
  console.log(`[ai-catalog] verified dist/${relativePath}`);
}

const builtIndexHtml = await readFile(path.join(dist, 'index.html'), 'utf8');
if (!builtIndexHtml.includes('id="uflmb-critical-css"')) {
  throw new Error('Production index.html must include the critical above-the-fold CSS.');
}
if (/<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["'][^"']*\/assets\/[^"']+\.css["'])[^>]*>/i.test(builtIndexHtml)) {
  throw new Error('The compiled application stylesheet must not be linked as a render-blocking HTML stylesheet.');
}
const assetFiles = await readdir(path.join(dist, 'assets'));
if (!assetFiles.some(file => file.endsWith('.css'))) {
  throw new Error('The deferred application stylesheet must still be emitted as a production CSS asset.');
}
console.log('[performance] verified critical CSS and non-render-blocking application stylesheet output.');

const rootCatalogText = await readFile(path.join(dist, 'ai-catalog.json'), 'utf8');
const wellKnownCatalogText = await readFile(path.join(dist, '.well-known/ai-catalog.json'), 'utf8');
for (const [label, content] of [['root ai-catalog.json', rootCatalogText], ['.well-known ai-catalog.json', wellKnownCatalogText]]) {
  if (content.charCodeAt(0) === 0xfeff || !content.trimStart().startsWith('{')) throw new Error(`${label} must be plain UTF-8 JSON without BOM or HTML wrapper.`);
}
if (rootCatalogText !== wellKnownCatalogText) throw new Error('Root and .well-known AI Catalog files must be byte-for-byte identical.');
const rootCatalog = JSON.parse(rootCatalogText);
const wellKnownCatalog = JSON.parse(wellKnownCatalogText);
const ardManifestText = await readFile(path.join(dist, '.well-known/ard.json'), 'utf8');
if (ardManifestText.charCodeAt(0) === 0xfeff || !ardManifestText.trimStart().startsWith('{')) {
  throw new Error('ARD manifest must be plain UTF-8 JSON without BOM or HTML wrapper.');
}
const ardManifest = JSON.parse(ardManifestText);
if (!Array.isArray(ardManifest.entries) || ardManifest.entries.length === 0) {
  throw new Error('ARD manifest must contain a non-empty entries array.');
}
if (JSON.stringify(ardManifest.entries) !== JSON.stringify(rootCatalog.entries)) {
  throw new Error('ARD and AI Catalog manifests must publish the same entries.');
}

if (rootCatalog.specVersion !== '1.0' || !Array.isArray(rootCatalog.entries)) {
  throw new Error('AI Catalog must declare specVersion "1.0" and an entries array.');
}
if (!rootCatalog.host || typeof rootCatalog.host.displayName !== 'string') {
  throw new Error('AI Catalog host.displayName is required.');
}

const identifierPattern = /^urn:air:[a-zA-Z0-9.-]+(:[a-zA-Z0-9._-]+)+$/;
for (const [index, entry] of rootCatalog.entries.entries()) {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`AI Catalog entry ${index} must be an object.`);
  }
  for (const field of ['identifier', 'displayName', 'type']) {
    if (typeof entry[field] !== 'string' || !entry[field].trim()) {
      throw new Error(`AI Catalog entry ${index} requires a non-empty ${field}.`);
    }
  }
  if (!identifierPattern.test(entry.identifier)) {
    throw new Error(`AI Catalog entry ${index} has an invalid urn:air identifier.`);
  }
  const hasUrl = typeof entry.url === 'string' && entry.url.length > 0;
  const hasData = Object.hasOwn(entry, 'data');
  if (hasUrl === hasData) {
    throw new Error(`AI Catalog entry ${index} must define exactly one of url or data.`);
  }
  if (hasUrl) {
    const url = new URL(entry.url);
    if (url.protocol !== 'https:') {
      throw new Error(`AI Catalog entry ${index} URL must use HTTPS.`);
    }
  }
  if (!Array.isArray(entry.representativeQueries) ||
      entry.representativeQueries.length < 2 ||
      entry.representativeQueries.length > 5) {
    throw new Error(`AI Catalog entry ${index} must contain 2–5 representativeQueries.`);
  }
}


const robots = await readFile(path.join(dist, 'robots.txt'), 'utf8');
if (!robots.includes('User-agent: *') || !robots.includes('Allow: /') ||
    !robots.includes('Sitemap: https://uflmb.web.app/sitemap.xml')) {
  throw new Error('robots.txt must allow crawling and reference the production sitemap.');
}
const sitemap = await readFile(path.join(dist, 'sitemap.xml'), 'utf8');
if (!sitemap.includes('<urlset') || !sitemap.includes('<loc>https://uflmb.web.app/</loc>')) {
  throw new Error('sitemap.xml must contain a valid urlset and the production homepage URL.');
}


const firebaseConfig = JSON.parse(await readFile(path.resolve('firebase.json'), 'utf8'));
const hosting = Array.isArray(firebaseConfig.hosting) ? firebaseConfig.hosting[0] : firebaseConfig.hosting;
for (const catalogPath of ['/ai-catalog.json', '/.well-known/ai-catalog.json', '/.well-known/ard.json']) {
  const rule = hosting?.headers?.find(item => item.source === catalogPath);
  if (!rule?.headers?.some(header => header.key.toLowerCase() === 'content-type' && header.value.toLowerCase().startsWith('application/json'))) throw new Error(`Firebase must serve ${catalogPath} with application/json content type.`);
}
const assetCacheRule = hosting?.headers?.find(rule => rule.source === '**/*.@(js|css)');
if (!assetCacheRule?.headers?.some(header =>
  header.key.toLowerCase() === 'cache-control' &&
  header.value.includes('max-age=31536000') &&
  header.value.includes('immutable')
)) {
  throw new Error('Firebase must cache versioned JS/CSS assets for one year as immutable.');
}

const indexCacheRule = hosting?.headers?.find(rule => rule.source === '/index.html');
if (!indexCacheRule?.headers?.some(header =>
  header.key.toLowerCase() === 'cache-control' &&
  header.value.includes('max-age=0') &&
  header.value.includes('must-revalidate')
)) {
  throw new Error('Firebase must revalidate index.html so new hashed bundles are discovered promptly.');
}
const serviceWorkerCacheRule = hosting?.headers?.find(rule => rule.source === '/sw.js');
if (!serviceWorkerCacheRule?.headers?.some(header =>
  header.key.toLowerCase() === 'cache-control' &&
  header.value.includes('max-age=0') &&
  header.value.includes('must-revalidate')
)) {
  throw new Error('Firebase must revalidate sw.js so service worker updates are discovered promptly.');
}
const imageCacheRule = hosting?.headers?.find(rule => rule.source === '**/*.@(png|jpg|jpeg|webp|avif|svg|ico)');
if (!imageCacheRule?.headers?.some(header =>
  header.key.toLowerCase() === 'cache-control' &&
  header.value.includes('max-age=2592000') &&
  header.value.includes('must-revalidate')
)) {
  throw new Error('Firebase must cache static images for 30 days with revalidation.');
}

console.log('[ai-catalog] build output, SEO assets and cache headers checks passed.');
