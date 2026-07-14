/**
 * M0 integration probe — Resolume Show Control
 * -----------------------------------------------------------------------------
 * Proves the two calls the whole tool is built on:
 *   1. REST  ← GET http://<host>:8080/api/v1/composition   (discover layers/clips)
 *   2. OSC   → /composition/layers/L/clips/C/connect        (fire a clip)
 *
 * Requires Node 18+ (built-in fetch) and one dependency: node-osc.
 *   cd probe && npm install
 *
 * In Resolume Arena → Preferences:
 *   • Webserver: enabled (default port 8080)
 *   • OSC: Input enabled (default port 7000)
 *
 * Usage:
 *   node resolume-probe.mjs                 # discover + print the clip grid
 *   node resolume-probe.mjs fire <L> <C>    # fire clip at layer L, clip C (1-based)
 *
 * Override targets with env vars if Resolume is on another machine/port:
 *   RESOLUME_HOST=192.168.1.20 RESOLUME_REST_PORT=8080 RESOLUME_OSC_PORT=7000 \
 *     node resolume-probe.mjs
 */
import { Client, Message } from 'node-osc'

const HOST = process.env.RESOLUME_HOST || '127.0.0.1'
const REST_PORT = Number(process.env.RESOLUME_REST_PORT || 8080)
const OSC_PORT = Number(process.env.RESOLUME_OSC_PORT || 7000)
const BASE = `http://${HOST}:${REST_PORT}/api/v1`

// Resolume returns parameters as objects like { id, value, ... }. Names live at
// x.name.value. We read defensively so a shape difference degrades gracefully
// instead of crashing.
const val = (p, fallback = undefined) =>
  p && typeof p === 'object' && 'value' in p ? p.value : fallback

async function getComposition() {
  let res
  try {
    res = await fetch(`${BASE}/composition`)
  } catch (e) {
    throw new Error(
      `Could not reach ${BASE}/composition (${e.code || e.message}). ` +
        `Is Resolume running and the Webserver enabled?`
    )
  }
  if (!res.ok) {
    throw new Error(
      `REST returned ${res.status} from ${BASE}/composition. ` +
        `Enable the Webserver in Arena → Preferences → Webserver.`
    )
  }
  return res.json()
}

function printGrid(comp) {
  const name = val(comp.name, '(untitled)')
  const layers = comp.layers || []
  console.log(`\nComposition: ${name} — ${layers.length} layer(s)\n`)
  layers.forEach((layer, li) => {
    const lname = val(layer.name, `Layer ${li + 1}`)
    const clips = (layer.clips || [])
      .map((c, ci) => {
        const cname = val(c.name, '')
        return cname ? `${ci + 1}·${cname}` : null
      })
      .filter(Boolean)
    console.log(`  L${String(li + 1).padStart(2)}  ${lname}`)
    if (clips.length) console.log(`        ${clips.join('   ')}`)
  })
  console.log(`\nFire one:  node resolume-probe.mjs fire <layer> <clip>\n`)
}

function fireClip(layer, clip) {
  return new Promise((resolve, reject) => {
    const client = new Client(HOST, OSC_PORT)
    const address = `/composition/layers/${layer}/clips/${clip}/connect`
    client.send(new Message(address, 1), (err) => {
      client.close()
      err ? reject(err) : resolve(address)
    })
  })
}

// Best-effort read-back so the probe can confirm the trigger landed without you
// having to watch the Resolume window. Non-fatal if the clip endpoint shape differs.
async function readBackClip(layer, clip) {
  try {
    const res = await fetch(`${BASE}/composition/layers/${layer}/clips/${clip}`)
    if (!res.ok) return null
    const c = await res.json()
    return val(c.connected, '(unknown)')
  } catch {
    return null
  }
}

const [, , cmd, aRaw, bRaw] = process.argv

try {
  if (cmd === 'fire') {
    const layer = Number(aRaw)
    const clip = Number(bRaw)
    if (!layer || !clip) {
      throw new Error('Usage: node resolume-probe.mjs fire <layer> <clip>  (1-based)')
    }
    const address = await fireClip(layer, clip)
    console.log(`OSC → ${HOST}:${OSC_PORT}   ${address}   (value 1)`)
    await new Promise((r) => setTimeout(r, 250))
    const state = await readBackClip(layer, clip)
    if (state != null) {
      console.log(`REST read-back: layer ${layer} clip ${clip} → connected = ${state}`)
    } else {
      console.log('Watch Resolume — the clip should now be connected.')
    }
  } else {
    console.log(`REST ← ${BASE}/composition`)
    printGrid(await getComposition())
  }
} catch (e) {
  console.error(`\nERROR: ${e.message}\n`)
  process.exit(1)
}
