/**
 * Host-half smoke test: mounts the plugin against a fake Cordis context and
 * exercises the state endpoint without a running DSH.
 *
 *   node tests/host.smoke.mjs
 */
import { Readable } from 'node:stream'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const profile = mkdtempSync(join(tmpdir(), 'dsh-win11-material-'))
process.env.DSH_PROFILE_DIR = profile
process.env.DSH_WIN11_KOFFI ??= 'D:/Program Files/DeepseekHarness/resources/app.asar.unpacked/dsh/node_modules/koffi/index.js'

const { apply } = await import('../lib/index.js')

const routes = new Map()
const disposers = []
const server = {
  register(route) {
    routes.set(route.path, route)
    return () => routes.delete(route.path)
  },
}
const effects = []
const ctx = {
  effect(fn) {
    const dispose = fn()
    if (typeof dispose === 'function') effects.push(dispose)
    return dispose
  },
  logger() {
    return { info() {}, warn() {} }
  },
  inject(names, callback) {
    callback({
      get: (name) => (name === 'webServer' ? server : undefined),
      effect(fn) {
        const dispose = fn()
        if (typeof dispose === 'function') effects.push(dispose)
      },
    })
  },
}

apply(ctx, {})

/** Issue a request against the registered route table. */
async function call(method, body) {
  const route = routes.get('/win11-material')
  if (route === undefined) throw new Error('state route was not registered')
  const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  request.method = method
  request.url = '/win11-material/state'
  request.headers = { 'content-type': 'application/json' }
  let status = 0
  let payload = ''
  const response = {
    writeHead(code) {
      status = code
      return this
    },
    end(chunk) {
      payload += chunk ?? ''
      return this
    },
  }
  await route.handler(request, response)
  return { status, body: JSON.parse(payload) }
}

const initial = await call('GET')
if (initial.status !== 200) throw new Error(`GET state: ${initial.status}`)
if (!Array.isArray(initial.body.materials) || initial.body.materials.length !== 4) throw new Error('materials list missing')
if (typeof initial.body.native !== 'object') throw new Error('native status missing')
if (typeof initial.body.bridge?.installed !== 'boolean') throw new Error('bridge status missing')

const updated = await call('POST', { material: 'tabbed', tint: 0.5 })
if (updated.status !== 200) throw new Error(`POST state: ${updated.status}`)
if (updated.body.material !== 'tabbed') throw new Error('material was not updated')
if (Math.abs(updated.body.tint - 0.5) > 1e-9) throw new Error('tint was not updated')

const statePath = join(profile, 'win11-material.json')
if (!existsSync(statePath)) throw new Error('state file was not persisted')
const persisted = JSON.parse(readFileSync(statePath, 'utf8'))
if (persisted.material !== 'tabbed') throw new Error('persisted material mismatch')

// A tint-only patch must keep the material (regression: it used to fall back to acrylic).
const tintOnly = await call('POST', { tint: 0.66 })
if (tintOnly.body.material !== 'tabbed') throw new Error(`tint-only patch switched the material to ${tintOnly.body.material}`)
if (Math.abs(tintOnly.body.tint - 0.66) > 1e-9) throw new Error('tint-only patch did not apply the tint')

// A material-only patch must keep the tint.
const materialOnly = await call('POST', { material: 'mica' })
if (materialOnly.body.material !== 'mica') throw new Error('material-only patch did not apply the material')
if (Math.abs(materialOnly.body.tint - 0.66) > 1e-9) throw new Error(`material-only patch reset the tint to ${materialOnly.body.tint}`)

// With the window unfocused, an Acrylic selection must be applied as Mica.
await new Promise((resolve) => setTimeout(resolve, 600))
const focused = await call('POST', { material: 'acrylic', keepTransparent: true })
if (typeof focused.body.focused !== 'boolean') throw new Error('focus state missing from the snapshot')
const expected = focused.body.focused ? 'acrylic' : 'mica'
if (focused.body.applied !== expected) {
  throw new Error(`applied material should be ${expected} (focused=${focused.body.focused}), got ${focused.body.applied}`)
}

// keepTransparent defaults to true, survives unrelated patches, and can be turned off.
if (initial.body.keepTransparent !== true) throw new Error('keepTransparent should default to true')
const focusOff = await call('POST', { keepTransparent: false })
if (focusOff.body.keepTransparent !== false) throw new Error('keepTransparent was not updated')
if (focusOff.body.material !== 'acrylic') throw new Error('keepTransparent patch reset the material')
const focusOn = await call('POST', { material: 'acrylic' })
if (focusOn.body.keepTransparent !== false) throw new Error('material patch reset keepTransparent')
const focusBack = await call('POST', { keepTransparent: true })
if (focusBack.body.keepTransparent !== true) throw new Error('keepTransparent was not restored')

const rejected = await call('POST', { material: 'glass' })
if (rejected.body.material === 'glass') throw new Error('unknown material was accepted')

for (const dispose of effects.reverse()) dispose()
console.log('host smoke: ok', JSON.stringify({ profile, native: initial.body.native.supported, window: initial.body.window }))
process.exit(0)
