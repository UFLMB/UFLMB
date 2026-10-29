import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const inputDir = path.join(root, 'input')
const outputDir = path.join(root, 'public', 'input')
const supported = /\.(png|jpe?g|webp)$/i

await rm(outputDir, { recursive: true, force: true })
await mkdir(outputDir, { recursive: true })

let files = []
try {
  files = (await readdir(inputDir, { withFileTypes: true }))
    .filter(entry => entry.isFile() && supported.test(entry.name))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b, 'en'))
} catch (error) {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
    files = []
  } else {
    throw error
  }
}

const manifestFiles = []
for (const name of files) {
  const source = path.join(inputDir, name)
  const target = path.join(outputDir, name)
  const info = await stat(source)
  await cp(source, target)
  manifestFiles.push({ name, size: info.size })
}

await writeFile(
  path.join(outputDir, 'manifest.json'),
  JSON.stringify({ version: 1, files: manifestFiles }, null, 2) + '\n',
  'utf8',
)
console.log(`Card image input manifest created: ${manifestFiles.length} image(s).`)
