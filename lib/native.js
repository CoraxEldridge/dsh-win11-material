/**
 * Native Windows 11 window-material control for the DSH Desktop window.
 *
 * The material itself is a DWM (Desktop Window Manager) property of the top
 * level HWND that Electron created for the main window. A profile plugin runs
 * in the Host process, which is a child of that Electron main process, so the
 * window is reachable through Win32 (DWM) calls rather than through Electron's
 * `BrowserWindow` API.
 *
 * `koffi` is used for the calls. The Desktop runtime bundles a copy, which is
 * the fallback when the profile does not install one.
 */
import { createRequire } from 'node:module'
import { release } from 'node:os'
import { basename, dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

/** Materials this plugin offers, in UI order. */
export const MATERIALS = ['none', 'mica', 'acrylic', 'tabbed']

/** `DWM_SYSTEMBACKDROP_TYPE` values (Windows 11 22H2+). */
const BACKDROP = { none: 1, mica: 2, acrylic: 3, tabbed: 4, auto: 0 }

const DWMWA_USE_IMMERSIVE_DARK_MODE = 20
const DWMWA_WINDOW_CORNER_PREFERENCE = 33
const DWMWA_SYSTEMBACKDROP_TYPE = 38
const DWMWCP_ROUND = 2
const WCA_ACCENT_POLICY = 19
const ACCENT_DISABLED = 0
const ACCENT_ENABLE_HOSTBACKDROP = 5

/** Minimum Windows 11 build: 22H2, where the system backdrop attribute landed. */
const MIN_BUILD = 22621

/**
 * Candidate module specifiers for `koffi`, most local first.
 * @returns {string[]} Require targets to try in order.
 */
function koffiCandidates() {
  const executable = process.execPath ?? ''
  const resources = join(dirname(executable))
  const candidates = []
  // Debug escape hatch: point the loader at a specific koffi install.
  if (process.env.DSH_WIN11_KOFFI) candidates.push(process.env.DSH_WIN11_KOFFI)
  candidates.push('koffi')
  // Desktop runtime: <app>/resources/app.asar.unpacked/dsh/node_modules/koffi
  candidates.push(join(resources, 'resources', 'app.asar.unpacked', 'dsh', 'node_modules', 'koffi', 'index.js'))
  candidates.push(join(resources, 'resources', 'app.asar', 'dsh', 'node_modules', 'koffi', 'index.js'))
  return candidates
}

/**
 * Process-wide cache slot. The Host hot-reloads plugin modules, and koffi keeps
 * struct names in a global registry: defining `ACCENTPOLICY` twice throws
 * "Duplicate type name". Sharing one binding set across module instances keeps
 * reloads working.
 */
const CACHE_KEY = Symbol.for('dsh-win11-material/native-bindings')

/** Module-local mirror of the process-wide binding cache. */
let bindings_

/**
 * Load the Win32/DWM bindings once per process.
 * @returns {object} Bound functions, structs, and `available`/`error` state.
 */
function bindings() {
  const cached = globalThis[CACHE_KEY]
  // Only successful loads are shared: a failed attempt (e.g. from an older build
  // that registered duplicate koffi type names) must not poison later reloads.
  if (cached !== undefined && cached.available === true) {
    bindings_ = cached
    return bindings_
  }
  if (bindings_ !== undefined) return bindings_
  let koffi
  const failures = []
  for (const candidate of koffiCandidates()) {
    try {
      koffi = require(candidate)
      break
    } catch (error) {
      failures.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (koffi === undefined) {
    bindings_ = { available: false, error: `koffi could not be loaded (${failures.join('; ')})` }
    return bindings_
  }
  try {
    const user32 = koffi.load('user32.dll')
    const dwmapi = koffi.load('dwmapi.dll')
    const kernel32 = koffi.load('kernel32.dll')

    // koffi registers struct/proto names process-wide, so a hot reload would
    // otherwise fail with "Duplicate type name". A per-load suffix keeps every
    // registration unique.
    const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const AccentPolicy = koffi.struct(`ACCENTPOLICY_${tag}`, {
      AccentState: 'int',
      AccentFlags: 'int',
      GradientColor: 'uint32',
      AnimationId: 'int',
    })
    const CompositionData = koffi.struct(`WINDOWCOMPOSITIONATTRIBDATA_${tag}`, {
      Attribute: 'int',
      Data: koffi.pointer(AccentPolicy),
      Size: 'size_t',
    })
    const Margins = koffi.struct(`MARGINS_${tag}`, {
      cxLeftWidth: 'int',
      cxRightWidth: 'int',
      cyTopHeight: 'int',
      cyBottomHeight: 'int',
    })
    const EnumProc = koffi.proto(`bool EnumWindowsProc_${tag}(intptr_t hwnd, intptr_t lParam)`)

    bindings_ = {
      available: true,
      koffi,
      AccentPolicy,
      CompositionData,
      Margins,
      EnumProc,
      EnumWindows: user32.func(`bool EnumWindows(EnumWindowsProc_${tag} *callback, intptr_t lParam)`),
      GetForegroundWindow: user32.func('intptr_t GetForegroundWindow()'),
      GetWindowThreadProcessId: user32.func('uint32 GetWindowThreadProcessId(intptr_t hwnd, void *pid)'),
      GetClassNameW: user32.func('int GetClassNameW(intptr_t hwnd, void *buffer, int size)'),
      GetWindowTextW: user32.func('int GetWindowTextW(intptr_t hwnd, void *buffer, int size)'),
      IsWindow: user32.func('bool IsWindow(intptr_t hwnd)'),
      IsWindowVisible: user32.func('bool IsWindowVisible(intptr_t hwnd)'),
      GetWindowRect: user32.func('bool GetWindowRect(intptr_t hwnd, void *rect)'),
      SetWindowCompositionAttribute: user32.func(
        `bool SetWindowCompositionAttribute(intptr_t hwnd, WINDOWCOMPOSITIONATTRIBDATA_${tag} *data)`,
      ),
      DwmSetWindowAttribute: dwmapi.func('long DwmSetWindowAttribute(intptr_t hwnd, uint32 attribute, void *value, uint32 size)'),
      DwmExtendFrameIntoClientArea: dwmapi.func(`long DwmExtendFrameIntoClientArea(intptr_t hwnd, MARGINS_${tag} *margins)`),
      DwmIsCompositionEnabled: dwmapi.func('long DwmIsCompositionEnabled(void *enabled)'),
      OpenProcess: kernel32.func('intptr_t OpenProcess(uint32 access, bool inherit, uint32 pid)'),
      CloseHandle: kernel32.func('bool CloseHandle(intptr_t handle)'),
      QueryFullProcessImageNameW: kernel32.func('bool QueryFullProcessImageNameW(intptr_t process, uint32 flags, void *buffer, void *size)'),
    }
    globalThis[CACHE_KEY] = bindings_
  } catch (error) {
    bindings_ = { available: false, error: error instanceof Error ? error.message : String(error) }
  }
  return bindings_
}

/**
 * Read the running Windows build and whether DWM composition is active.
 * @returns {{ supported: boolean, build: number, major: number, minor: number, composition: boolean }}
 */
function windowsVersion() {
  const api = bindings()
  const result = { supported: false, build: 0, major: 0, minor: 0, composition: false }
  // `os.release()` reads the real NT version, unlike the deprecated Win32 API.
  const parts = release().split('.').map((value) => Number.parseInt(value, 10))
  result.major = Number.isFinite(parts[0]) ? parts[0] : 0
  result.minor = Number.isFinite(parts[1]) ? parts[1] : 0
  result.build = Number.isFinite(parts[2]) ? parts[2] : 0
  if (!api.available) return result
  try {
    const enabled = Buffer.alloc(4)
    api.DwmIsCompositionEnabled(enabled)
    result.composition = enabled.readInt32LE(0) !== 0
  } catch {
    // A missing export leaves composition unknown.
  }
  result.supported = result.major >= 10 && result.build >= MIN_BUILD
  return result
}

/**
 * Resolve a process image path for one PID.
 * @param {object} api - Loaded bindings.
 * @param {number} pid - Target process id.
 * @returns {string} Basename of the image, or an empty string when unavailable.
 */
function processImageName(api, pid) {
  const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
  const handle = api.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
  if (!handle) return ''
  try {
    const buffer = Buffer.alloc(1024 * 2)
    const size = Buffer.alloc(4)
    size.writeUInt32LE(1024, 0)
    if (!api.QueryFullProcessImageNameW(handle, 0, buffer, size)) return ''
    const length = size.readUInt32LE(0)
    return basename(buffer.subarray(0, length * 2).toString('utf16le'))
  } finally {
    api.CloseHandle(handle)
  }
}

/**
 * List visible `Chrome_WidgetWin_1` top-level windows with plausible app geometry.
 * @returns {Array<{ hwnd: number, pid: number, title: string, width: number, height: number }>}
 */
function listWindows() {
  const api = bindings()
  if (!api.available) return []
  const windows = []
  const callback = api.koffi.register((hwnd, _lParam) => {
    try {
      if (!api.IsWindowVisible(hwnd)) return true
      const className = Buffer.alloc(256 * 2)
      const classLength = api.GetClassNameW(hwnd, className, 256)
      if (className.subarray(0, classLength * 2).toString('utf16le') !== 'Chrome_WidgetWin_1') return true
      const rect = Buffer.alloc(16)
      api.GetWindowRect(hwnd, rect)
      const width = rect.readInt32LE(8) - rect.readInt32LE(0)
      const height = rect.readInt32LE(12) - rect.readInt32LE(4)
      if (width < 320 || height < 240) return true
      const pidBuffer = Buffer.alloc(4)
      api.GetWindowThreadProcessId(hwnd, pidBuffer)
      const title = Buffer.alloc(1024 * 2)
      const titleLength = api.GetWindowTextW(hwnd, title, 1024)
      windows.push({
        hwnd: Number(hwnd),
        pid: pidBuffer.readUInt32LE(0),
        title: title.subarray(0, titleLength * 2).toString('utf16le'),
        width,
        height,
      })
    } catch {
      // Skip a window that disappeared mid-enumeration.
    }
    return true
  }, api.koffi.pointer(api.EnumProc))
  try {
    api.EnumWindows(callback, 0)
  } finally {
    api.koffi.unregister(callback)
  }
  return windows
}

/**
 * Find the Desktop main window: same image as this Host process, sized like the app.
 * @returns {null | { hwnd: number, pid: number, title: string, width: number, height: number, matched: string }}
 */
export function findDesktopWindow() {
  const api = bindings()
  if (!api.available) return null
  const self = basename(process.execPath ?? '').toLowerCase()
  const windows = listWindows()
  if (windows.length === 0) return null
  // The Electron main process is our parent; prefer its window explicitly.
  const byParent = windows.find((entry) => entry.pid === process.ppid)
  if (byParent !== undefined) return { ...byParent, matched: 'parent' }
  const byImage = windows.find((entry) => processImageName(api, entry.pid).toLowerCase() === self)
  if (byImage !== undefined) return { ...byImage, matched: 'image' }
  const any = windows.find((entry) => entry.title !== '')
  return any === undefined ? null : { ...any, matched: 'fallback' }
}

/**
 * Read the window that currently owns the foreground.
 * @returns {number} Foreground window handle, or 0 when unavailable.
 */
export function foregroundWindow() {
  const api = bindings()
  if (!api.available) return 0
  try {
    return Number(api.GetForegroundWindow())
  } catch {
    return 0
  }
}

/**
 * Apply one material to the Desktop window.
 * @param {number} hwnd - Top-level window handle.
 * @param {'none'|'mica'|'acrylic'|'tabbed'} material - Requested system backdrop.
 * @returns {{ ok: boolean, backdrop: number, extended: number, accent: boolean, message?: string }}
 */
export function applyMaterial(hwnd, material) {
  const api = bindings()
  if (!api.available) return { ok: false, backdrop: -1, extended: -1, accent: false, message: api.error }
  const version = windowsVersion()
  if (!version.supported) {
    return {
      ok: false,
      backdrop: -1,
      extended: -1,
      accent: false,
      message: `system backdrop needs Windows 11 22H2 (build ${MIN_BUILD}); this build is ${version.build}`,
    }
  }
  if (!api.IsWindow(hwnd)) return { ok: false, backdrop: -1, extended: -1, accent: false, message: 'window is gone' }
  const type = BACKDROP[material] ?? BACKDROP.none
  const value = Buffer.alloc(4)
  value.writeInt32LE(type, 0)
  const backdrop = api.DwmSetWindowAttribute(hwnd, DWMWA_SYSTEMBACKDROP_TYPE, value, 4)

  // Rounded corners keep the material consistent with Windows 11 chrome.
  const corner = Buffer.alloc(4)
  corner.writeInt32LE(DWMWCP_ROUND, 0)
  api.DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, corner, 4)

  // Extending the frame makes the custom caption strip and the window edges
  // part of the material instead of a painted rectangle.
  const margins =
    material === 'none'
      ? { cxLeftWidth: 0, cxRightWidth: 0, cyTopHeight: 0, cyBottomHeight: 0 }
      : { cxLeftWidth: -1, cxRightWidth: -1, cyTopHeight: -1, cyBottomHeight: -1 }
  const extended = api.DwmExtendFrameIntoClientArea(hwnd, margins)

  // Acrylic on some builds needs the host-backdrop hint; off restores the default.
  const policy = {
    AccentState: material === 'none' ? ACCENT_DISABLED : ACCENT_ENABLE_HOSTBACKDROP,
    AccentFlags: 2,
    GradientColor: 0,
    AnimationId: 0,
  }
  const accent = api.SetWindowCompositionAttribute(hwnd, {
    Attribute: WCA_ACCENT_POLICY,
    Data: policy,
    Size: api.koffi.sizeof(api.AccentPolicy),
  })

  return {
    ok: backdrop === 0,
    backdrop,
    extended,
    accent: Boolean(accent),
    message: backdrop === 0 ? undefined : `DwmSetWindowAttribute failed with HRESULT 0x${(backdrop >>> 0).toString(16)}`,
  }
}

/** Reset every attribute this plugin owns, leaving the window as Electron created it. */
export function clearMaterial(hwnd) {
  return applyMaterial(hwnd, 'none')
}

/**
 * Report what the native layer can do without touching any window.
 * @returns {{ available: boolean, error?: string, ...windowsVersion }}
 */
export function nativeStatus() {
  const api = bindings()
  const version = windowsVersion()
  return {
    available: api.available,
    error: api.error,
    ...version,
    platform: process.platform,
  }
}
