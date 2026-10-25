#!/usr/bin/env node
/**
 * Window bridge for dsh-win11-material.
 *
 * A DSH profile plugin can style the page and talk to DWM, but it cannot change
 * `BrowserWindow` options: the window's opaque surface is created by the
 * Electron main process (`resources/app.asar/lib/main.js`). Until that window
 * is transparent, the system material stays hidden behind it.
 *
 * This tool adds two options to the primary window:
 *
 *     backgroundColor: "#00000000"
 *     backgroundMaterial: "<material>"
 *
 * The change is byte-length neutral: the two options are inserted and the same
 * number of bytes is removed from a comment inside `lib/main.js`, so no other
 * entry's offset moves. Only that file's asar integrity hash is recomputed.
 *
 * Commands:
 *   status                 show app root, patch state, backup state
 *   apply [--material m]   patch the installed app.asar (requires DSH closed)
 *   restore                copy the backup back and remove the marker
 *
 * Options:
 *   --app <path>   installation root (default: detected)
 *   --dry-run      compute and validate, write nothing
 *   --force        patch even while the app is running (not recommended)
 *   --yes          do not ask for confirmation
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { homedir, tmpdir } from 'node:os'

const MARKER = '/* dsh-win11-material */'
const BACKUP_SUFFIX = '.dsh-win11-material.backup'
const MATERIALS = new Map([
  ['mica', 2],
  ['acrylic', 3],
  ['tabbed', 4],
])
const DEFAULT_MATERIAL = 'acrylic'

/**
 * Parse command line arguments.
 * @param {string[]} argv - Raw arguments after the script name.
 * @returns {{ command: string, app: string | undefined, material: string, dryRun: boolean, yes: boolean }}
 */
function parseArguments(argv) {
  const options = { command: 'status', app: undefined, material: DEFAULT_MATERIAL, dryRun: false, yes: false, force: false }
  const rest = []
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--app') options.app = argv[++index]
    else if (argument === '--material') options.material = argv[++index] ?? DEFAULT_MATERIAL
    else if (argument === '--dry-run') options.dryRun = true
    else if (argument === '--yes' || argument === '-y') options.yes = true
    else if (argument === '--force') options.force = true
    else if (argument === '--help' || argument === '-h') options.command = 'help'
    else if (!argument.startsWith('-')) rest.push(argument)
  }
  if (rest.length > 0) options.command = rest[0]
  if (!MATERIALS.has(options.material)) throw new Error(`unknown material "${options.material}"; use ${[...MATERIALS.keys()].join(', ')}`)
  return options
}

/**
 * Run one PowerShell expression and return its trimmed output.
 * @param {string} script - PowerShell source.
 * @returns {string} Trimmed standard output.
 */
function powershell(script) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 20000,
  }).trim()
}

/**
 * Find the installation root that owns `resources/app.asar`.
 * @param {string | undefined} explicit - `--app` value.
 * @returns {string} Installation root.
 */
function locateAppRoot(explicit) {
  const candidates = []
  if (explicit !== undefined) candidates.push(explicit)
  if (typeof process.env.DSH_APP_ROOT === 'string' && process.env.DSH_APP_ROOT !== '') candidates.push(process.env.DSH_APP_ROOT)
  try {
    const path = powershell("(Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Path)")
    if (path !== '') candidates.push(dirname(path))
  } catch {
    // No running process, or PowerShell is unavailable.
  }
  try {
    const installed = powershell(
      "$keys = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'; " +
        "Get-ItemProperty $keys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like '*DeepSeek Harness*' -or $_.DisplayName -like '*DeepseekHarness*' } | ForEach-Object { $_.InstallLocation } | Where-Object { $_ }",
    )
    for (const line of installed.split(/\r?\n/u)) if (line.trim() !== '') candidates.push(line.trim())
  } catch {
    // Registry lookup is best effort.
  }
  candidates.push(
    join(process.env.ProgramFiles ?? 'C:\\Program Files', 'DeepSeek Harness'),
    join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'DeepSeek Harness'),
    join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Programs', 'DeepSeek Harness'),
    'D:\\Program Files\\DeepseekHarness',
  )
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === '') continue
    const root = resolve(candidate)
    if (existsSync(join(root, 'resources', 'app.asar'))) return root
  }
  throw new Error('could not find the DeepSeek Harness installation; pass --app "<install dir>"')
}

/**
 * Parse an asar archive.
 * @param {string} path - Archive path.
 * @returns {{ path: string, buffer: Buffer, jsonStart: number, jsonLength: number, dataStart: number, header: object }}
 */
function readArchive(path) {
  const buffer = readFileSync(path)
  const jsonLength = buffer.readUInt32LE(12)
  const jsonStart = 16
  const header = JSON.parse(buffer.subarray(jsonStart, jsonStart + jsonLength).toString('utf8'))
  return { path, buffer, jsonStart, jsonLength, dataStart: jsonStart + jsonLength, header }
}

/**
 * Read one file entry out of a parsed archive.
 * @param {object} archive - Parsed archive.
 * @param {string[]} parts - Path segments inside the archive.
 * @returns {{ entry: object, bytes: Buffer }} Entry metadata and current bytes.
 */
function readEntry(archive, parts) {
  let node = archive.header
  for (const part of parts) {
    node = node?.files?.[part]
    if (node === undefined) throw new Error(`app.asar has no ${parts.join('/')}`)
  }
  const offset = Number(node.offset)
  return { entry: node, bytes: archive.buffer.subarray(archive.dataStart + offset, archive.dataStart + offset + node.size) }
}

/**
 * Whether the renderer process of the app is currently running.
 * @returns {boolean} True when the app is running.
 */
function appRunning() {
  try {
    const count = powershell("(Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue | Measure-Object).Count")
    return Number.parseInt(count, 10) > 0
  } catch {
    return false
  }
}

/**
 * Remove `need` bytes from inside one block comment, so the file length is restored.
 * @param {string} text - JavaScript source.
 * @param {number} need - Byte count to remove.
 * @returns {{ text: string, removed: string }} Trimmed source and what was removed.
 */
function trimComment(text, need) {
  const pattern = /\/\*[\s\S]*?\*\//gu
  let match
  while ((match = pattern.exec(text)) !== null) {
    const block = match[0]
    if (block.length < need + 120) continue
    // Only ASCII runs are safe here: the removal count is a byte count, and the
    // archive must keep exactly the same byte length.
    const latest = match.index + block.length - 2 - need
    for (let attempt = 0; attempt < 400 && latest - attempt > match.index + 2; attempt += 1) {
      const start = latest - attempt
      const removed = text.slice(start, start + need)
      if (removed.includes('*/') || /[^\x00-\x7F]/u.test(removed)) continue
      const next = text.slice(0, start) + text.slice(start + need)
      return { text: next, removed }
    }
  }
  throw new Error('no block comment long enough to balance the insertion; report this build')
}

/**
 * Validate JavaScript syntax in a temporary ESM file with `node --check`.
 * @param {string} source - Candidate main.js source.
 */
function validateSyntax(source) {
  const directory = join(tmpdir(), `dsh-win11-material-${process.pid}`)
  mkdirSync(directory, { recursive: true })
  const file = join(directory, 'main.mjs')
  writeFileSync(file, source, 'utf8')
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
  unlinkSync(file)
}

/**
 * Insert the window options and keep the byte length unchanged.
 * @param {string} source - Original `lib/main.js` source.
 * @param {string} material - Selected material.
 * @returns {{ source: string, inserted: string, removed: string }} Patched source and changes.
 */
function patchMain(source, material) {
  if (source.includes(MARKER)) return { source, inserted: '', removed: '' }
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  const anchor = /process\.platform === "win32" && primary \? \{(\r?\n)([ \t]+)titleBarStyle: "hidden",/u
  const match = anchor.exec(source)
  if (match === null) {
    throw new Error('the primary window options changed in this DSH build; the bridge does not know where to insert')
  }
  const indent = match[2]
  const lines = [
    `${indent}backgroundColor: "#00000000",`,
    `${indent}backgroundMaterial: "${material}", ${MARKER}`,
  ]
  const insertion = lines.map((line) => `${newline}${line}`).join('')
  const need = Buffer.byteLength(insertion)
  const trimmed = trimComment(source, need)
  // Re-find the anchor inside the trimmed source, because trimming can move it.
  const rerun = /process\.platform === "win32" && primary \? \{/u.exec(trimmed.text)
  if (rerun === null) throw new Error('anchor disappeared while balancing the insertion')
  const at = rerun.index + rerun[0].length
  const patched = `${trimmed.text.slice(0, at)}${insertion}${trimmed.text.slice(at)}`
  return { source: patched, inserted: insertion, removed: trimmed.removed }
}

/**
 * Recompute the asar integrity block of one file entry.
 * @param {Buffer} bytes - File content.
 * @param {object} entry - Existing header entry (mutated in place).
 * @param {number} blockSize - Block size recorded by the archive.
 */
function refreshIntegrity(bytes, entry, blockSize) {
  const blocks = []
  for (let offset = 0; offset < bytes.length; offset += blockSize) {
    blocks.push(createHash('SHA256').update(bytes.subarray(offset, Math.min(bytes.length, offset + blockSize))).digest('hex'))
  }
  const hash = createHash('SHA256').update(bytes).digest('hex')
  const integrity = entry.integrity ?? { algorithm: 'SHA256', hash, blockSize, blocks }
  integrity.hash = hash
  integrity.blocks = blocks
  entry.integrity = integrity
}

/**
 * Apply the patch to the installed archive.
 * @param {object} options - Parsed command options.
 */
function applyPatch(options) {
  const root = locateAppRoot(options.app)
  const asarPath = join(root, 'resources', 'app.asar')
  const running = appRunning()
  console.log(`installation : ${root}`)
  console.log(`archive      : ${asarPath}`)
  console.log(`material     : ${options.material}`)
  if (running && !options.dryRun && !options.force) {
    throw new Error('DeepSeek Harness is running; quit it from the tray first, then run this again (or pass --force)')
  }
  const archive = readArchive(asarPath)
  const { entry, bytes } = readEntry(archive, ['lib', 'main.js'])
  const original = bytes.toString('utf8')
  if (original.includes(MARKER)) {
    console.log('state        : already patched')
    return
  }
  const patched = patchMain(original, options.material)
  if (Buffer.byteLength(patched.source) !== bytes.length) {
    throw new Error(`length changed: ${bytes.length} -> ${Buffer.byteLength(patched.source)}`)
  }
  validateSyntax(patched.source)
  console.log('syntax       : node --check passed')
  console.log(`inserted     : ${JSON.stringify(patched.inserted.trim())}`)
  console.log(`balanced by  : ${patched.removed.length} comment bytes`)
  if (options.dryRun) {
    console.log('dry run      : nothing written')
    return
  }
  const backup = `${asarPath}${BACKUP_SUFFIX}`
  if (!existsSync(backup)) {
    copyFileSync(asarPath, backup)
    console.log(`backup       : ${backup}`)
  } else {
    console.log(`backup       : kept existing ${backup}`)
  }
  const nextBytes = Buffer.from(patched.source, 'utf8')
  const originalLength = bytes.length
  refreshIntegrity(nextBytes, entry, entry.integrity?.blockSize ?? 4194304)
  const headerJson = Buffer.from(JSON.stringify(archive.header), 'utf8')
  if (headerJson.length > archive.jsonLength) {
    throw new Error(`header grew by ${headerJson.length - archive.jsonLength} bytes; aborting before writing`)
  }
  const padded = Buffer.alloc(archive.jsonLength, 0x20)
  headerJson.copy(padded)
  nextBytes.copy(archive.buffer, archive.dataStart + Number(entry.offset))
  padded.copy(archive.buffer, archive.jsonStart)
  writeFileSync(asarPath, archive.buffer)
  // Re-read the archive to prove the result parses and carries the marker.
  const check = readArchive(asarPath)
  const verify = readEntry(check, ['lib', 'main.js']).bytes.toString('utf8')
  if (!verify.includes(MARKER) || Buffer.byteLength(verify) !== originalLength) {
    throw new Error(
      `verification after write failed (marker=${String(verify.includes(MARKER))}, bytes=${Buffer.byteLength(verify)}/${originalLength})`,
    )
  }
  writeBridgeRecord(root, asarPath, options.material)
  console.log('state        : patched and verified')
  console.log('next         : launch DeepSeek Harness; pick the material in Settings 鈫?绐楀彛鏉愯川')
}

/**
 * Restore the pristine archive from the backup.
 * @param {object} options - Parsed command options.
 */
function restorePatch(options) {
  const root = locateAppRoot(options.app)
  const asarPath = join(root, 'resources', 'app.asar')
  const backup = `${asarPath}${BACKUP_SUFFIX}`
  if (!existsSync(backup)) throw new Error(`no backup at ${backup}`)
  if (appRunning() && !options.dryRun && !options.force) throw new Error('DeepSeek Harness is running; quit it first, then restore (or pass --force)')
  if (options.dryRun) {
    console.log(`dry run      : would restore ${backup} -> ${asarPath}`)
    return
  }
  copyFileSync(backup, asarPath)
  unlinkSync(backup)
  removeBridgeRecord()
  console.log('state        : restored from backup; the window is opaque again')
}

/**
 * Persist the bridge marker the plugin reads for its status line.
 * @param {string} root - Installation root.
 * @param {string} asarPath - Patched archive.
 * @param {string} material - Seeded material.
 */
function writeBridgeRecord(root, asarPath, material) {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  mkdirSync(home, { recursive: true })
  writeFileSync(
    join(home, 'win11-material-bridge.json'),
    `${JSON.stringify({ installed: true, patchedAt: new Date().toISOString(), appRoot: root, appAsar: asarPath, material }, null, 2)}\n`,
    'utf8',
  )
}

/** Remove the bridge marker. */
function removeBridgeRecord() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  try {
    unlinkSync(join(home, 'win11-material-bridge.json'))
  } catch {
    // Already absent.
  }
}

/**
 * Print installation and patch state.
 * @param {object} options - Parsed command options.
 */
function printStatus(options) {
  const root = locateAppRoot(options.app)
  const asarPath = join(root, 'resources', 'app.asar')
  const backup = `${asarPath}${BACKUP_SUFFIX}`
  const archive = readArchive(asarPath)
  const source = readEntry(archive, ['lib', 'main.js']).bytes.toString('utf8')
  const patched = source.includes(MARKER)
  console.log(`installation : ${root}`)
  console.log(`archive      : ${asarPath}`)
  console.log(`running      : ${appRunning() ? 'yes' : 'no'}`)
  console.log(`patched      : ${patched ? 'yes' : 'no'}`)
  console.log(`backup       : ${existsSync(backup) ? backup : 'none'}`)
  if (patched) {
    const match = /backgroundMaterial: "([a-z]+)"/u.exec(source)
    console.log(`seeded       : ${match?.[1] ?? 'unknown'}`)
  } else {
    console.log('next         : run "node tools/window-bridge.mjs apply" with DSH closed')
  }
}

function usage() {
  console.log('usage: node tools/window-bridge.mjs <status|apply|restore> [--material mica|acrylic|tabbed] [--app <dir>] [--dry-run] [--yes]')
}

try {
  const options = parseArguments(process.argv.slice(2))
  if (process.platform !== 'win32') throw new Error('this plugin only supports Windows')
  if (options.command === 'help') usage()
  else if (options.command === 'status') printStatus(options)
  else if (options.command === 'apply') applyPatch(options)
  else if (options.command === 'restore') restorePatch(options)
  else throw new Error(`unknown command "${options.command}"`)
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
