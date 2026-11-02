import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const dist = path.resolve('dist');
const requiredFiles = [
  'ai-catalog.json',
  '.well-known/ai-catalog.json',
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

const rootCatalog = JSON.parse(await readFile(path.join(dist, 'ai-catalog.json'), 'utf8'));
const wellKnownCatalog = JSON.parse(
  await readFile(path.join(dist, '.well-known/ai-catalog.json'), 'utf8'),
);

if (JSON.stringify(rootCatalog) !== JSON.stringify(wellKnownCatalog)) {
  throw new Error('Root and .well-known AI Catalog files must contain identical JSON.');
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

console.log('[ai-catalog] build output and static SEO asset checks passed.');

