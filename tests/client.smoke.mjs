/**
 * Client-half smoke test: evaluates the browser bundle in a fake DOM, mounts the
 * plugin into a fake client context, and drives the settings section.
 *
 *   node tests/client.smoke.mjs
 */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

/** Minimal element object covering what this plugin touches. */
function element(tag) {
  const node = {
    tag,
    dataset: {},
    textContent: '',
    children: [],
    style: {
      properties: {},
      setProperty(name, value) {
        this.properties[name] = value
      },
    },
    appendChild(child) {
      node.children.push(child)
      return child
    },
    append(...nodes) {
      node.children.push(...nodes)
    },
  }
  return node
}

const head = element('head')
const body = element('body')
const html = element('html')
const document = {
  documentElement: html,
  head,
  body,
  createElement: element,
  querySelector: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
}

/** Fake React runtime: hooks keep positional state between renders inside one render pass. */
const hookSlots = []
let hookCursor = 0
const react = {
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children }
  },
  useState(initial) {
    const index = hookCursor++
    if (!(index in hookSlots)) hookSlots[index] = typeof initial === 'function' ? initial() : initial
    return [
      hookSlots[index],
      (next) => {
        hookSlots[index] = typeof next === 'function' ? next(hookSlots[index]) : next
      },
    ]
  },
  useEffect(effect) {
    const index = hookCursor++
    if (!(index in hookSlots)) {
      hookSlots[index] = true
      effect()
    }
  },
  useRef(initial) {
    const index = hookCursor++
    if (!(index in hookSlots)) hookSlots[index] = { current: initial }
    return hookSlots[index]
  },
}

const state = {
  material: 'acrylic',
  tint: 0.42,
  platform: 'win32',
  materials: ['none', 'mica', 'acrylic', 'tabbed'],
  window: { hwnd: 1, title: 'DeepSeek Harness', width: 1280, height: 820 },
  native: { available: true, supported: true, build: 22631, composition: true },
  bridge: { installed: true },
  error: null,
}
const requests = []
const fetch = async (url, init = {}) => {
  requests.push({ url, init })
  if (init.method === 'POST') Object.assign(state, JSON.parse(init.body))
  return { ok: true, json: async () => ({ ...state }) }
}
class MutationObserver {
  observe() {}
  disconnect() {}
}
const window = {
  setTimeout,
  clearTimeout,
  setInterval: () => 0,
  clearInterval: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  requestAnimationFrame: (fn) => {
    fn()
    return 0
  },
  cancelAnimationFrame: () => {},
  __ModuleLoader__: { load: (value) => { window.registration = value } },
}

const code = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
runInNewContext(code, {
  window,
  document,
  fetch,
  MutationObserver,
  getComputedStyle: () => ({ getPropertyValue: (name) => (name === '--dsw-alias-bg-base' ? '#1b1b1c' : 'rgba(27,27,28,0.9)') }),
  setTimeout,
  clearTimeout,
  console,
})

if (window.registration === undefined) throw new Error('bundle did not call __ModuleLoader__.load')
if (window.registration.id !== 'dsh-win11-material') throw new Error(`unexpected bundle id ${window.registration.id}`)

const exports = window.registration.factory((specifier) => {
  if (specifier === 'react') return react
  throw new Error(`unexpected require(${specifier})`)
})
if (typeof exports.apply !== 'function') throw new Error('client bundle has no apply()')
if (!Array.isArray(exports.inject)) throw new Error('client bundle has no inject list')

const styleTags = head.children.filter((node) => node.tag === 'style')
if (styleTags.length !== 1) throw new Error('stylesheet was not injected')
if (!styleTags[0].textContent.includes('data-dsh-win11-material') && !styleTags[0].textContent.includes('_centerCol')) {
  throw new Error('stylesheet does not carry the shell rules')
}

const registrations = []
const ctx = {
  effect(fn) {
    return fn()
  },
  locale: {
    register() {},
    bind: () => (key) => key.split('.').reduce((value, part) => (value ?? {})[part], {
      materials: { none: 'Off', mica: 'Mica', acrylic: 'Acrylic', tabbed: 'Tabbed' },
    }) ?? key,
  },
  slots: {
    inject(name, factory) {
      if (name === 'settings.section') factory()
    },
    register(options, component) {
      registrations.push({ options, component })
      return () => {}
    },
  },
}
exports.apply(ctx)

if (registrations.length !== 1) throw new Error('settings section was not registered')
if (registrations[0].options.id !== 'win11-material') throw new Error('settings section id mismatch')
if (registrations[0].options.name !== 'settings.section') throw new Error('settings section slot mismatch')

await new Promise((resolve) => setTimeout(resolve, 20))
if (html.dataset.dshWin11Material !== 'acrylic') throw new Error(`material attribute was not published: ${html.dataset.dshWin11Material}`)
if (html.dataset.dshWin11Bridge !== 'installed') throw new Error('bridge attribute was not published')
if (html.style.properties['--dsh-win11-base'] !== '#1b1b1c') throw new Error('palette was not captured')

const { component, options } = registrations[0]
hookCursor = 0
component({ t: (key) => key })
// The section reads its state from the Host on mount; render again with the answer.
await new Promise((resolve) => setTimeout(resolve, 20))
hookCursor = 0
const tree = component({ t: (key) => key })
if (tree === undefined) throw new Error('section component returned nothing')

/** Collect every element with a given tag from the fake tree. */
function collect(node, tag, found = []) {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, tag, found)
    return found
  }
  if (node === null || typeof node !== 'object') return found
  if (node.type === tag) found.push(node)
  for (const child of node.children ?? []) collect(child, tag, found)
  return found
}
const buttons = collect(tree, 'button')
if (buttons.length !== 4) throw new Error(`expected four material buttons, found ${buttons.length}`)
const ranges = collect(tree, 'input')
if (ranges.length !== 1) throw new Error(`expected one opacity slider, found ${ranges.length}`)

// Click "Tabbed": the optimistic preview publishes the attribute immediately.
const tabbed = buttons.find((button) => button.props.title === 'materials.tabbed')
if (tabbed === undefined) throw new Error('tabbed button missing')
tabbed.props.onClick()
if (html.dataset.dshWin11Material !== 'tabbed') throw new Error('preview did not publish the new material')
await new Promise((resolve) => setTimeout(resolve, 320))
const post = requests.find((request) => request.init.method === 'POST' && JSON.parse(request.init.body).material === 'tabbed')
if (post === undefined) throw new Error('click did not reach the Host')
if (JSON.parse(post.init.body).material !== 'tabbed') throw new Error('posted material mismatch')

// "Off" removes translucency without dropping the state.
const off = buttons.find((button) => button.props.title === 'materials.none')
off.props.onClick()
if (html.dataset.dshWin11Material !== 'none') throw new Error('off did not disable translucency')

console.log('client smoke: ok', JSON.stringify({ registrations: registrations.length, requests: requests.length, attribute: html.dataset.dshWin11Material }))
process.exit(0)
