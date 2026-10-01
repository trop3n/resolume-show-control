import { cp, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = resolve(process.env.PREVIZ_SRC ?? join(repo, '..', '..', 'samc', 'sanctuary-previz'))
const dest = join(repo, 'resources', 'previz')
const wanted = ['index.html', 'sanctuary.glb', 'vendor']

try {
  await stat(join(src, 'index.html'))
} catch {
  console.error(`No viewer at ${src}\nSet PREVIZ_SRC to the sanctuary-previz checkout.`)
  process.exit(1)
}

await rm(dest, { recursive: true, force: true })
for (const entry of wanted) {
  await cp(join(src, entry), join(dest, entry), { recursive: true })
}

const { size } = await stat(join(dest, 'sanctuary.glb'))
console.log(`Copied viewer from ${src}`)
console.log(`  -> ${dest} (model ${(size / 1e6).toFixed(1)} MB)`)
