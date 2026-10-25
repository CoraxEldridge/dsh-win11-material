/**
 * Host half of the Windows 11 window-material plugin.
 *
 * Owns two things:
 *  - the native DWM material applied to the Desktop main window (Mica, Acrylic,
 *    Tabbed, or none), re-applied whenever the window is recreated;
 *  - the small state endpoint the browser half reads and writes, so the
 *    material and the page translucency stay in one place.
 */
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
// The Host hot-reloads plugin modules but keeps the ESM cache for their imports,
// so a cached `./native.js` would keep stale Win32 bindings alive (and koffi
// rejects re-defining its struct names). Import it with a per-load query instead.
const native = await import(`${new URL('./native.js', import.meta.url).href}?v=${Date.now()}`)
const { applyMaterial, applyUnfocusedBackdrop, clearMaterial, findDesktopWindow, foregroundWindow, nativeStatus, MATERIALS } = native

/** Loader entry identity; must match the id in `cordis.patch.yml`. */
export const name = 'ui-win11-material'

const STATE_FILE = 'win11-material.json'
const ROUTE = '/win11-material'
const MAX_BODY = 4096
const POLL_MS = 2000
const FOCUS_POLL_MS = 400
/** Materials Windows renders as a solid colour once the window loses focus. */
const FOCUS_SENSITIVE = new Set(['acrylic', 'tabbed'])

const DEFAULTS = { material: 'acrylic', tint: 0.42, keepTransparent: true, unfocused: 'clear' }

/**
 * Normalize one material name.
 * @param {unknown} value - Candidate value.
 * @returns {'none'|'mica'|'acrylic'|'tabbed'} A supported material.
 */
function normalizeMaterial(value) {
  return typeof value === 'string' && MATERIALS.includes(value) ? value : DEFAULTS.material
}

/**
 * Clamp one translucency ratio.
 * @param {unknown} value - Candidate value, 0..1.
 * @param {number} fallback - Value used when the candidate is not a number.
 * @returns {number} Ratio within 0.1..0.95.
 */
function normalizeRatio(value, fallback) {
  const number = typeof value === 'number' ? value : Number.NaN
  if (!Number.isFinite(number)) return fallback
  return Math.min(0.95, Math.max(0.1, number))
}

/**
 * Merge partial state over the defaults, ignoring unknown fields.
 * @param {unknown} value - Candidate state.
 * @returns {{ material: string, tint: number, keepTransparent: boolean }} Complete state.
 */
function normalizeState(value) {
  const source = value !== null && typeof value === 'object' ? value : {}
  return {
    material: normalizeMaterial(source.material),
    tint: normalizeRatio(source.tint, DEFAULTS.tint),
    keepTransparent: source.keepTransparent !== false,
    unfocused: source.unfocused === 'blur' ? 'blur' : 'clear',
  }
}

/**
 * Resolve the profile directory that owns this plugin's state file.
 * @returns {string} Absolute directory.
 */
function profileDirectory() {
  if (typeof process.env.DSH_PROFILE_DIR === 'string' && process.env.DSH_PROFILE_DIR !== '') return process.env.DSH_PROFILE_DIR
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'profiles', 'desktop')
}

/**
 * Read the persisted state.
 * @param {string} path - State file path.
 * @returns {object | undefined} Parsed state, or undefined when absent or invalid.
 */
function readState(path) {
  try {
    return normalizeState(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return undefined
  }
}

/**
 * Write the state atomically.
 * @param {string} path - State file path.
 * @param {object} state - Complete state to persist.
 */
function writeState(path, state) {
  try {
    mkdirSync(dirname(path), { recursive: true })
    const temporary = `${path}.${process.pid}.tmp`
    writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    renameSync(temporary, path)
  } catch {
    // Persistence is best effort; the in-memory state stays authoritative.
  }
}

/**
 * Report whether the companion window bridge is installed for this app.
 * @returns {{ installed: boolean, patchedAt?: string, appAsar?: string, material?: string }}
 */
function bridgeStatus() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  try {
    const record = JSON.parse(readFileSync(join(home, 'win11-material-bridge.json'), 'utf8'))
    if (record !== null && typeof record === 'object' && record.installed === true) {
      return {
        installed: true,
        patchedAt: typeof record.patchedAt === 'string' ? record.patchedAt : undefined,
        appAsar: typeof record.appAsar === 'string' ? record.appAsar : undefined,
        material: typeof record.material === 'string' ? record.material : undefined,
      }
    }
  } catch {
    // No bridge record means the window surface is still opaque.
  }
  return { installed: false }
}

/**
 * Read a JSON request body with a hard size cap.
 * @param {import('node:http').IncomingMessage} request - Incoming request.
 * @returns {Promise<object>} Parsed JSON object.
 */
async function readJson(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY) throw new Error('request body too large')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  const value = JSON.parse(text)
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('expected a JSON object')
  return value
}

/**
 * Send a JSON response.
 * @param {import('node:http').ServerResponse} response - Response to write.
 * @param {number} status - HTTP status.
 * @param {unknown} body - JSON-serializable body.
 */
function sendJson(response, status, body) {
  const payload = `${JSON.stringify(body)}\n`
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  })
  response.end(payload)
}

/**
 * Mount the plugin.
 * @param {import('@deepseek-ai/cordis').Context} ctx - Host plugin context.
 * @param {object} [config] - Loader entry config (`material`, `tint`).
 */
export function apply(ctx, config) {
  const statePath = join(profileDirectory(), STATE_FILE)
  const options = normalizeState({ ...DEFAULTS, ...(config ?? {}) })
  let state = readState(statePath) ?? options
  let windowHandle = 0
  let focused = true
  let appliedMaterial = null
  let appliedSignature = ''
  /** Ring buffer of the last backdrop applications, for field debugging. */
  const appliedLog = []
  let lastError = ''
  let hits = 0
  let clientAt = null
  let timer
  let focusTimer

  const logger = (() => {
    try {
      const instance = ctx.logger('win11-material')
      if (instance !== undefined && instance !== null && typeof instance.info === 'function' && typeof instance.warn === 'function') {
        return instance
      }
    } catch {
      // Fall through to the console logger below.
    }
    return {
      info(message) {
        console.info(`[win11-material] ${message}`)
      },
      warn(message) {
        console.warn(`[win11-material] ${message}`)
      },
    }
  })()

  /**
   * Apply the current state to the current window, when the window changed or the state did.
   * @param {boolean} force - Re-apply even when the signature is unchanged.
   */
  const sync = (force = false) => {
    if (process.platform !== 'win32') return
    const found = findDesktopWindow()
    if (found === null) {
      windowHandle = 0
      appliedSignature = ''
      appliedMaterial = null
      return
    }
    windowHandle = found.hwnd
    // Every DWM backdrop (Mica included) is replaced by a solid colour while the
    // window is inactive, so an unfocused window keeps its translucency through
    // the legacy accent blur instead.
    const frozen = state.keepTransparent && !focused && state.material !== 'none'
    const strategy = frozen ? state.unfocused : state.material
    const signature = `${found.hwnd}:${strategy}`
    if (!force && signature === appliedSignature) return
    try {
      const result =
        strategy === 'blur'
          ? applyUnfocusedBackdrop(found.hwnd)
          : applyMaterial(found.hwnd, strategy === 'clear' ? 'none' : strategy)
      appliedSignature = signature
      appliedMaterial = frozen ? strategy : state.material
      if (!result.ok) {
        lastError = result.message ?? 'unknown failure'
        logger.warn(`material ${appliedMaterial} was not applied: ${lastError}`)
      } else {
        lastError = ''
        logger.info(`material ${appliedMaterial} applied to window ${found.hwnd} (focused: ${focused})`)
      }
      appliedLog.push({
        at: new Date().toISOString(),
        focused,
        applied: appliedMaterial,
        ok: result.ok,
        accent: result.accent ?? null,
        backdrop: result.backdrop ?? null,
        message: result.message ?? null,
      })
      if (appliedLog.length > 6) appliedLog.shift()
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      logger.warn(`material ${appliedMaterial ?? state.material} failed: ${lastError}`)
    }
  }

  const snapshot = () => {
    const window = findDesktopWindow()
    const status = nativeStatus()
    return {
      ...state,
      applied: appliedMaterial,
      focused,
      appliedLog,
      platform: process.platform,
      materials: MATERIALS,
      window: window === null ? null : { hwnd: window.hwnd, title: window.title, width: window.width, height: window.height },
      native: status,
      bridge: bridgeStatus(),
      hits,
      clientAt,
      error: lastError === '' ? null : lastError,
    }
  }

  const update = (patch) => {
    // A partial patch must not overwrite the other field: an explicit `undefined`
    // would normalize back to the default and silently switch the material.
    const defined = {}
    for (const [key, value] of Object.entries(patch ?? {})) {
      if (value !== undefined) defined[key] = value
    }
    state = normalizeState({ ...state, ...defined })
    writeState(statePath, state)
    sync(true)
    return snapshot()
  }

  /**
   * Re-apply the backdrop when the window gains or loses focus.
   */
  const trackFocus = () => {
    if (process.platform !== 'win32') return
    if (windowHandle === 0) {
      focused = true
      return
    }
    const next = foregroundWindow() === windowHandle
    if (next === focused) return
    focused = next
    sync(true)
  }

  sync()
  // The window can appear after the Host boots, and DSH recreates it on profile reloads.
  timer = setInterval(() => sync(), POLL_MS)
  timer.unref?.()
  focusTimer = setInterval(trackFocus, FOCUS_POLL_MS)
  focusTimer.unref?.()

  ctx.effect(() => () => {
    clearInterval(timer)
    clearInterval(focusTimer)
    if (windowHandle !== 0) {
      try {
        clearMaterial(windowHandle)
      } catch {
        // The window may already be gone during shutdown.
      }
    }
  }, 'win11-material: window controller')

  ctx.inject(['webServer'], (webCtx) => {
    const server = webCtx.get('webServer')
    if (server === undefined) return
    webCtx.effect(() => {
      try {
        return server.register({
          kind: 'prefix',
          path: ROUTE,
          handler: async (request, response) => {
            hits += 1
            try {
              const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
              if (pathname !== `${ROUTE}/state`) {
                response.writeHead(404).end()
                return
              }
              if (request.method === 'GET') {
                sendJson(response, 200, snapshot())
                return
              }
              if (request.method === 'POST') {
                const body = await readJson(request)
                if (body.client === true) {
                  // Liveness signal from the browser half: its settings surface mounted.
                  clientAt = new Date().toISOString()
                  sendJson(response, 200, snapshot())
                  return
                }
                const next = update({ material: body.material, tint: body.tint, keepTransparent: body.keepTransparent, unfocused: body.unfocused })
                sendJson(response, 200, next)
                return
              }
              response.writeHead(405, { allow: 'GET, POST' }).end()
            } catch (error) {
              sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) })
            }
          },
        })
      } catch (error) {
        logger.warn(`state endpoint was not registered: ${error instanceof Error ? error.message : String(error)}`)
        return () => {}
      }
    }, 'win11-material: state endpoint')
  })
}
