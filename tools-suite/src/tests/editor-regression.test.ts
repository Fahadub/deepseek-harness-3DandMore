/** Run from V2: node --import tsx/esm --test tools-suite/src/tests/editor-regression.test.ts */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { Script, createContext, runInContext } from 'node:vm'
import { stripTypeScriptTypes } from 'node:module'
import { renderHubPage } from '../hub-page.ts'
import { readJsonBody } from '../lib/util.ts'

const html = renderHubPage([])
const scripts = html.split('<script').slice(1).filter(s => !s.slice(0, s.indexOf('>')).includes('type=')).map(s => s.slice(s.indexOf('>') + 1, s.indexOf('</script>')))
const main = scripts.find(s => s.includes('function api('))!
function section(source: string, start: string, end: string) {
  const a = source.indexOf(start), b = source.indexOf(end, a)
  assert.ok(a >= 0 && b > a, 'source boundary must exist')
  return source.slice(a, b)
}

test('all emitted classic inline scripts parse', () => {
  for (const script of scripts) new Script(script)
})

test('request bodies reject invalid JSON and non-object values', async () => {
  for (const input of ['{bad', 'null', '[]', '42', 'true', '"text"']) {
    await assert.rejects(readJsonBody(Readable.from([Buffer.from(input)]) as any), /JSON/)
  }
  assert.deepEqual(await readJsonBody(Readable.from([Buffer.from('{"ok":true}')]) as any), { ok: true })
  assert.deepEqual(await readJsonBody(Readable.from([]) as any), {})
})

for (const kind of ['valid', 'http-error', 'html-200', 'offline', 'callback-error']) {
  test('UI API helper: ' + kind, async () => {
    const calls: any[] = [], errors: any[] = []
    const ctx = createContext({
      fetch: async () => {
        if (kind === 'offline') throw Error('offline')
        return { status: kind === 'http-error' ? 400 : 200, text: async () => kind === 'html-200' ? '<html>bad</html>' : '{"ok":true}' }
      },
      console: { error: (...e: any[]) => errors.push(e) }, toast() {}, tr: (s: string) => s,
      cb: (err: any, response: any) => { calls.push([err, response]); if (kind === 'callback-error') throw Error('render failed') },
    })
    runInContext(section(main, 'function api(', 'function toast('), ctx)
    await runInContext('api("/test", null, cb)', ctx)
    assert.equal(calls.length, 1)
    assert.ok(calls[0][1].j, 'failure still supplies a safe response object')
    assert.equal(Boolean(calls[0][0]), kind === 'html-200' || kind === 'offline')
    if (kind === 'http-error') assert.equal(calls[0][1].s, 400)
    assert.equal(errors.length, kind === 'callback-error' ? 1 : 0)
  })
}

const serverSource = await readFile(new URL('../hub-server.ts', import.meta.url), 'utf8')
test('API error messages contain no known mojibake sequences', () => {
  for (const marker of ['ط§', 'ظ„', 'ظ…', 'â€']) assert.equal(serverSource.includes(marker), false, marker)
})
const flush = () => new Promise(resolve => setImmediate(resolve))

test('all tools-suite tool entrypoints import and register unique callable tools', async () => {
  const { readdir } = await import('node:fs/promises')
  const dir = new URL('../', import.meta.url)
  const tools: any[] = [], cleanup: (() => void)[] = []
  const ctx = {
    tools: { register: (definition: any) => { tools.push(definition); return () => {} } },
    commands: { register: () => () => {} },
    on: () => () => {}, effect: (fn: () => any) => { const dispose = fn(); if (typeof dispose === 'function') cleanup.push(dispose) },
  }
  try {
    for (const file of await readdir(dir)) {
      if (!file.startsWith('tool-') || !file.endsWith('.ts')) continue
      const plugin = await import(new URL(file, dir).href)
      if (typeof plugin.apply === 'function') plugin.apply(ctx)
    }
    const names = tools.map(t => t.name)
    assert.ok(names.length > 20)
    assert.equal(new Set(names).size, names.length, 'duplicate tool name')
    for (const tool of tools) {
      assert.equal(typeof tool.name, 'string')
      assert.equal(typeof tool.execute, 'function', tool.name + ' must have an execute handler')
    }
    console.log('REGISTERED TOOLS (' + names.length + '):', names.join(', '))
  } finally { cleanup.reverse().forEach(dispose => dispose()) }
})

test('translation updates dynamic text and restores Arabic placeholders', () => {
  const ctx = createContext({ lang: 'en', DICT: { en: { 'جاهز': 'Ready', 'يعمل': 'Running' }, zh: { 'جاهز': '就绪' } }, PLACEHOLDER_EN: { 'المسار': 'Path' } })
  runInContext(section(main, 'var origText =', 'function applyLang()'), ctx)
  const attributes: Record<string, string> = { placeholder: 'المسار' }
  const el = { children: [], textContent: 'جاهز', closest: () => null,
    getAttribute: (name: string) => attributes[name] || null,
    setAttribute: (name: string, value: string) => { attributes[name] = value },
  }
  ctx.el = el
  runInContext('trNode(el)', ctx)
  assert.equal(el.textContent, 'Ready'); assert.equal(attributes.placeholder, 'Path')
  el.textContent = 'يعمل'
  runInContext('trNode(el)', ctx)
  assert.equal(el.textContent, 'Running', 'must not restore stale Ready text')
  runInContext('lang = "ar"; trNode(el)', ctx)
  assert.equal(el.textContent, 'يعمل'); assert.equal(attributes.placeholder, 'المسار')
  el.textContent = 'جاهز'
  runInContext('lang = "zh"; trNode(el)', ctx)
  assert.equal(el.textContent, '就绪')
})

function guardianHarness() {
  const callbacks = new Map<number, () => void>(), disposers: (() => void)[] = [], errors: any[] = []
  let id = 0, scans = 0, release: (() => void) | undefined
  const guardian = {
    loadGuardian: async () => ({ enabled: true, intervalMin: 1 }),
    detectProblems: async () => { scans++; await new Promise<void>(r => { release = r }); return [] },
    mergeNewProposals() {}, saveGuardian: async () => {},
  }
  const ctx = createContext({ guardian, workspacesOf: () => [], console: { error: (...e: any[]) => errors.push(e) },
    setInterval: (fn: () => void) => { callbacks.set(++id, fn); return id }, clearInterval: (n: number) => callbacks.delete(n),
    ctx: { effect: (fn: () => (() => void)) => disposers.push(fn()) },
  })
  const block = section(serverSource, '  let guardianTimer:', '  // خط أنابيب')
    .replaceAll("import('./tool-guardian.ts')", 'Promise.resolve(guardian)')
  // Remove a type-only helper before replacing dynamic imports.
  const executable = block.slice(0, block.indexOf('  async function mergeNewProposalsSafe')) + block.slice(block.indexOf('  let guardianGeneration'))
  runInContext(stripTypeScriptTypes(executable), ctx)
  return { ctx, callbacks, disposers, errors, guardian, scans: () => scans, release: () => release?.() }
}

test('guardian restart races leave one timer; disposal clears it', async () => {
  const h = guardianHarness()
  runInContext('restartGuardianLoop(); restartGuardianLoop()', h.ctx)
  await flush()
  assert.equal(h.callbacks.size, 1)
  h.disposers[0]()
  assert.equal(h.callbacks.size, 0)
})

test('guardian prevents overlapping scans', async () => {
  const h = guardianHarness(); await flush()
  const tick = [...h.callbacks.values()][0]
  tick(); tick(); await flush()
  assert.equal(h.scans(), 1)
  h.release(); await flush(); h.disposers[0]()
})

test('guardian disposal before async initialization does not leak a timer', async () => {
  const h = guardianHarness(); h.disposers[0](); await flush()
  assert.equal(h.callbacks.size, 0)
})

test('guardian initializer rejection is reported, not unhandled', async () => {
  const h = guardianHarness(); await flush()
  h.guardian.loadGuardian = async () => { throw Error('unavailable') }
  runInContext('restartGuardianLoop()', h.ctx); await flush()
  assert.equal(h.callbacks.size, 0)
  assert.equal(h.errors.length, 1)
  h.disposers[0]()
})
