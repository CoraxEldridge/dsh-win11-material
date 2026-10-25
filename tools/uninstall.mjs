#!/usr/bin/env node
/**
 * Remove this plugin from the local DSH Desktop profile.
 * The window bridge, when installed, is restored separately:
 *   node tools/window-bridge.mjs restore
 */
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const packageName = 'dsh-win11-material'
const profileDir = process.env.DSH_PROFILE_DIR ?? join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'profiles', 'desktop')
const manifestPath = join(profileDir, 'package.json')

if (!existsSync(manifestPath)) {
  console.error(`error: no DSH profile at ${profileDir}`)
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (manifest.dependencies !== undefined) delete manifest.dependencies[packageName]
if (Array.isArray(manifest.dsh?.profile?.bundles)) {
  manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter((name) => name !== packageName)
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

const modulePath = join(profileDir, 'node_modules', packageName)
if (existsSync(modulePath)) rmSync(modulePath, { recursive: true, force: true })
console.log(`removed : ${modulePath}`)
console.log(`profile : ${manifestPath}`)
console.log('next    : restart DeepSeek Harness')
