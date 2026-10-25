#!/usr/bin/env node
/**
 * Install this plugin into the local DSH Desktop profile.
 *
 * Two steps, both reversible with `profile:uninstall`:
 *  - link the package into `<profile>/node_modules/dsh-win11-material`;
 *  - record it as a profile dependency and as a bundle in
 *    `<profile>/package.json`.
 *
 * The window bridge is a separate, explicit step because it patches app.asar:
 *   node tools/window-bridge.mjs apply
 */
import { readFileSync, writeFileSync, symlinkSync, cpSync, rmSync, existsSync, mkdirSync, lstatSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const packageName = 'dsh-win11-material'
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const profileDir = process.env.DSH_PROFILE_DIR ?? join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'profiles', 'desktop')
const manifestPath = join(profileDir, 'package.json')
const modulePath = join(profileDir, 'node_modules', packageName)

if (!existsSync(manifestPath)) {
  console.error(`error: no DSH profile at ${profileDir}`)
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
manifest.dependencies ??= {}
manifest.dependencies[packageName] = `link:${sourceRoot.replaceAll('\\', '/')}`
manifest.dsh ??= {}
manifest.dsh.profile ??= {}
manifest.dsh.profile.bundles ??= []
if (!manifest.dsh.profile.bundles.includes(packageName)) manifest.dsh.profile.bundles.push(packageName)
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

mkdirSync(dirname(modulePath), { recursive: true })
if (existsSync(modulePath) || lstatExists(modulePath)) rmSync(modulePath, { recursive: true, force: true })
try {
  // A junction needs no elevation and keeps this checkout as the single source.
  symlinkSync(sourceRoot, modulePath, 'junction')
  console.log(`linked  : ${modulePath} -> ${sourceRoot}`)
} catch {
  cpSync(sourceRoot, modulePath, {
    recursive: true,
    filter: (path) => {
      const name = path.split(/[\\/]/u).pop()
      return name !== '_study' && name !== 'tests' && name !== 'node_modules'
    },
  })
  console.log(`copied  : ${modulePath}`)
}
console.log(`profile : ${manifestPath}`)
console.log('next    : restart DeepSeek Harness, then Settings → 窗口材质')

/** Whether a path exists as a link or file, including broken links. */
function lstatExists(path) {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}
