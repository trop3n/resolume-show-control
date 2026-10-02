import { cp, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// ~/dev/projects/resolume-show-control alongside ~/dev/samc/sanctuary-previz, or the two as
// siblings as they are checked out on the Windows show machines (C:\\dev\\...).
const candidates = process.env.PREVIZ_SRC
  ? [resolve(process.env.PREVIZ_SRC)]
  : [
      resolve(join(repo, '..', '..', 'samc', 'sanctuary-previz')),
      resolve(join(repo, '..', 'sanctuary-previz'))
    ]
const dest = join(repo, 'resources', 'previz')
const wanted = ['index.html', 'sanctuary.glb', 'vendor']

let src = ''
for (const candidate of candidates) {
  try {
    await stat(join(candidate, 'index.html'))
    src = candidate
    break
  } catch {
    /* try the next one */
  }
}

if (src === '') {
  console.error(
    `No viewer found. Looked in:\n${candidates.map((c) => `  ${c}`).join('\n')}\n` +
      'Set PREVIZ_SRC to the sanctuary-previz checkout.'
  )
  process.exit(1)
}

await rm(dest, { recursive: true, force: true })
for (const entry of wanted) {
  await cp(join(src, entry), join(dest, entry), { recursive: true })
}

const { size } = await stat(join(dest, 'sanctuary.glb'))
console.log(`Copied viewer from ${src}`)
console.log(`  -> ${dest} (model ${(size / 1e6).toFixed(1)} MB)`)
