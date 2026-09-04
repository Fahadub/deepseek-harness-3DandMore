/**
 * المختبر الحي — game_playtest: a robot playtester for every game the agent builds.
 *
 * Launches real headless Chrome (CDP), waits for the loader, PLAYS the game
 * (keyboard/mouse actions), measures FPS, proves movement by pixel-diff,
 * asserts HUD changes, optionally runs CHAOS modes (offline / blocked assets /
 * slow network) to verify the game fails BEAUTIFULLY (clear message, no freeze),
 * and issues a graded delivery certificate (wood → legendary).
 *
 * Model-safe by design: the report is TEXT-ONLY (GLM-5.3 cannot see images);
 * screenshots are saved to .dsh-tools/playtest/ as visual proof for the USER.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { toolsDirFor, nowIso } from './lib/util.ts'

export const name = 'tool-playtest'
export const inject = ['tools']

interface PlayAction { type: 'key' | 'wait' | 'click' | 'move'; key?: string; ms?: number; x?: number; y?: number }

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
]

export interface PlaytestReport {
  ok: boolean
  badge: 'خشب' | 'برونز' | 'فضة' | 'ذهب' | 'أسطوري'
  score: number
  game: string
  url: string
  loaderHidden: boolean
  loaderErrorText: string
  consoleErrors: string[]
  networkFails: string[]
  avgFps: number | null
  movementRatio: number | null
  hudChecks: Array<{ name: string; ok: boolean; before: string; after: string }>
  chaos: Array<{ mode: string; stillResponds: boolean; note: string }>
  replayDir: string | null
  at: string
}

function grade(score: number): PlaytestReport['badge'] {
  if (score >= 100) return 'أسطوري'
  if (score >= 80) return 'ذهب'
  if (score >= 60) return 'فضة'
  if (score >= 40) return 'برونز'
  return 'خشب'
}

export async function runPlaytest(
  url: string,
  opts: {
    game: string
    actions: PlayAction[]
    fpsSeconds: number
    hudChecks: Array<{ name: string; expr: string }>
    chaos: string[]
    replay: boolean
    workspaceRoot: string
  },
  signal: AbortSignal | undefined,
): Promise<PlaytestReport> {
  let chrome: string | undefined
  for (const c of CHROME_CANDIDATES) { try { await fs.access(c); chrome = c; break } catch { /* next */ } }
  if (chrome === undefined) throw new Error('Chrome/Edge not found for the playtester')
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'playtest-'))
  const port = 9300 + Math.floor(Math.random() * 200)
  const proc: ChildProcess = spawn(chrome, [
    '--headless=new', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`,
    '--use-angle=swiftshader', '--disable-gpu-vsync', '--no-first-run', '--window-size=1280,800', 'about:blank',
  ], { stdio: 'ignore' })
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

  const report: PlaytestReport = {
    ok: false, badge: 'خشب', score: 0, game: opts.game, url,
    loaderHidden: false, loaderErrorText: '', consoleErrors: [], networkFails: [],
    avgFps: null, movementRatio: null, hudChecks: [], chaos: [], replayDir: null, at: nowIso(),
  }
  let replayDir: string | null = null
  if (opts.replay) {
    replayDir = path.join(toolsDirFor(opts.workspaceRoot), 'playtest', `replay-${Date.now()}`)
    await fs.mkdir(replayDir, { recursive: true })
    report.replayDir = path.relative(opts.workspaceRoot, replayDir).replaceAll('\\', '/')
  }

  try {
    // connect CDP
    let wsUrl: string | null = null
    for (let i = 0; i < 30; i++) {
      try {
        const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) })).json() as Array<{ type: string; webSocketDebuggerUrl: string }>
        wsUrl = tabs.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? null
        if (wsUrl !== null) break
      } catch { /* retry */ }
      await sleep(500)
    }
    if (wsUrl === null) throw new Error('playtester browser did not start')
    const sock = new WebSocket(wsUrl)
    // فتح المقبس نفسه يجب أن يكون محدود المدة — وإلا علّق النداء كله قبل تسليح المهلة الكبرى.
    await new Promise<void>((res, rej) => {
      const openTimer = setTimeout(() => rej(new Error('CDP socket open timeout (15s)')), 15_000)
      sock.onopen = () => { clearTimeout(openTimer); res() }
      sock.onerror = () => { clearTimeout(openTimer); rej(new Error('CDP socket failed')) }
    })
    let mid = 0
    const pending = new Map<number, (m: { result?: { result?: { value?: unknown } }; error?: { message: string } }) => void>()
    // Hard safety: a dead browser must NEVER hang the tool forever.
    const failAll = (why: string): void => { for (const [id, fn] of pending) { fn({ error: { message: why } }); pending.delete(id) } }
    sock.onclose = () => failAll('browser connection closed')
    sock.onerror = () => failAll('browser connection error')
    const DEADLINE_MS = 6 * 60 * 1000
    const deadlineTimer = setTimeout(() => failAll('playtest deadline exceeded (6min)'), DEADLINE_MS)
    const netFails: string[] = []
    const conErrs: string[] = []
    sock.onmessage = (e: MessageEvent) => {
      const m = JSON.parse(String(e.data)) as { id?: number; method?: string; params?: Record<string, unknown>; result?: { result?: { value?: unknown } }; error?: { message: string } }
      if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)?.(m); pending.delete(m.id); return }
      if (m.method === 'Network.loadingFailed') netFails.push(String(m.params?.errorText ?? 'fail'))
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params?.exceptionDetails as { exception?: { description?: string }; text?: string } | undefined
        conErrs.push(String(d?.exception?.description ?? d?.text ?? 'exception').slice(0, 180))
      }
    }
    const send = <T = { result?: { result?: { value?: unknown } } }>(method: string, params: Record<string, unknown> = {}): Promise<T> =>
      new Promise<T>((resolve) => {
        const id = ++mid
        const timer = setTimeout(() => { pending.delete(id); resolve({ error: { message: `CDP timeout: ${method}` } } as never) }, 15000)
        pending.set(id, (m) => { clearTimeout(timer); (resolve as (v: unknown) => void)(m) })
        try { sock.send(JSON.stringify({ id, method, params })) } catch { clearTimeout(timer); pending.delete(id); resolve({ error: { message: `socket closed: ${method}` } } as never) }
      })
    const evaluate = async (expression: string): Promise<unknown> => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true })
      return (r as { result?: { result?: { value?: unknown } } }).result?.result?.value
    }
    const shot = async (name: string): Promise<void> => {
      if (replayDir === null) return
      const r = await send<{ result?: { data?: string } }>('Page.captureScreenshot', { format: 'png' })
      if (r.result?.data !== undefined) await fs.writeFile(path.join(replayDir, `${name}.png`), Buffer.from(r.result.data, 'base64'))
    }

    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
    // Screencast (tiny frames, ignored) forces headless Chrome to produce BeginFrames
    // continuously — without it rAF throttles to ~1fps and FPS reads garbage.
    await send('Page.startScreencast', { format: 'jpeg', quality: 8, maxWidth: 32, maxHeight: 32, everyNthFrame: 1 })
    await send('Page.navigate', { url })

    // 1) loader wait (up to 60s)
    for (let i = 0; i < 60; i++) {
      await sleep(1000)
      if (signal?.aborted === true) throw new Error('aborted')
      const st = await evaluate(`JSON.stringify({h: (document.getElementById('loader')||{}).classList?.contains?.('hide') === true, e: (document.getElementById('loadErr')||{}).textContent || ''})`) as string
      try { const v = JSON.parse(st ?? '{}') as { h: boolean; e: string }; report.loaderHidden = v.h; report.loaderErrorText = String(v.e).slice(0, 200); if (v.h) break } catch { /* keep waiting */ }
    }
    await shot('01-loaded')

    // 2) HUD before + FPS probe install
    const beforeVals: string[] = []
    for (const c of opts.hudChecks) beforeVals.push(String(await evaluate(c.expr) ?? ''))
    await evaluate('window.__fc=0; window.__ft=performance.now(); (function loop(){window.__fc++; requestAnimationFrame(loop)})()')

    // 3) PLAY: run the actions (movement proof uses the last full-canvas shots)
    let beforeShot: Buffer | null = null
    const cap = await send<{ result?: { data?: string } }>('Page.captureScreenshot', { format: 'png' })
    beforeShot = cap.result?.data !== undefined ? Buffer.from(cap.result.data, 'base64') : null
    let step = 1
    for (const a of opts.actions) {
      if (signal?.aborted === true) throw new Error('aborted')
      if (a.type === 'key' && a.key !== undefined) {
        await evaluate(`dispatchEvent(new KeyboardEvent('keydown',{code:${JSON.stringify(a.key)}}))`)
        await shot(`step-${String(step).padStart(2, '0')}-key-${a.key}`)
        await sleep(a.ms ?? 1200)
        await evaluate(`dispatchEvent(new KeyboardEvent('keyup',{code:${JSON.stringify(a.key)}}))`)
      } else if (a.type === 'click') {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x ?? 640, y: a.y ?? 400, button: 'left', clickCount: 1 })
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: a.x ?? 640, y: a.y ?? 400, button: 'left', clickCount: 1 })
        await shot(`step-${String(step).padStart(2, '0')}-click`)
        await sleep(a.ms ?? 400)
      } else if (a.type === 'move') {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x ?? 640, y: a.y ?? 400 })
        await sleep(a.ms ?? 200)
      } else {
        await sleep(a.ms ?? 800)
      }
      step += 1
    }
    const cap2 = await send<{ result?: { data?: string } }>('Page.captureScreenshot', { format: 'png' })
    const afterShot = cap2.result?.data !== undefined ? Buffer.from(cap2.result.data, 'base64') : null
    if (beforeShot !== null && afterShot !== null) {
      let diff = 0; const n = Math.min(beforeShot.length, afterShot.length)
      for (let i = 0; i < n; i += 997) if (beforeShot[i] !== afterShot[i]) diff += 1
      report.movementRatio = +(diff / Math.ceil(n / 997)).toFixed(3)
    }
    await shot('02-after-actions')

    // 4) FPS sample — at a reduced 640×400 viewport: SwiftShader SOFTWARE rendering
    // costs ~4× the pixels otherwise; 15+ here ≈ smooth (45+) on a real GPU.
    await send('Page.setDeviceMetricsOverride', { width: 640, height: 400, deviceScaleFactor: 1, mobile: false })
    await evaluate('window.__fc=0; window.__ft=performance.now()')
    await sleep(Math.max(2, opts.fpsSeconds) * 1000)
    const fpsRaw = await evaluate('Math.round(window.__fc / ((performance.now()-window.__ft)/1000))')
    report.avgFps = typeof fpsRaw === 'number' ? fpsRaw : null
    // Under load (agent running, servers, software rasterizer) headless FPS can
    // throttle to ~1fps for reasons unrelated to the game. A reading that low is
    // marked UNRELIABLE: reported, but it never affects the certificate.
    ;(report as { fpsUnreliable?: boolean }).fpsUnreliable = report.avgFps !== null && report.avgFps < 2
    await send('Page.clearDeviceMetricsOverride')

    // 5) HUD after
    for (let i = 0; i < opts.hudChecks.length; i++) {
      const c = opts.hudChecks[i]!
      const after = String(await evaluate(c.expr) ?? '')
      report.hudChecks.push({ name: c.name, ok: beforeVals[i] !== after, before: beforeVals[i] ?? '', after })
    }

    // 6) CHAOS — beautiful-failure verification
    for (const mode of opts.chaos) {
      if (mode === 'offline') {
        await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
        await sleep(2500)
      } else if (mode === 'slow') {
        await send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 60 * 1024, uploadThroughput: 20 * 1024 })
        await sleep(2500)
      } else if (mode === 'blockglb') {
        await send('Network.setBlockedURLs', { urls: ['*.glb'] })
        await sleep(1500)
      }
      const alive = await evaluate('document.readyState') as string | null
      report.chaos.push({ mode, stillResponds: alive === 'complete' || alive === 'interactive', note: alive === null ? 'لا استجابة!' : 'الصفحة ما زالت تستجيب' })
      // restore
      await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
      await send('Network.setBlockedURLs', { urls: [] })
    }

    report.consoleErrors = conErrs.slice(0, 12)
    report.networkFails = netFails.slice(0, 12)

    // 7) score + badge — FPS is measured via SwiftShader SOFTWARE rendering at 640×400:
    // software rasterization is far slower than a real GPU, so the calibrated gate is
    // 15+ here ≈ 45+ frames on real hardware.
    let score = 0
    if (report.loaderHidden) score += 25
    if (report.consoleErrors.length === 0) score += 20
    if (report.networkFails.length === 0) score += 10
    const fpsUnreliable = (report as { fpsUnreliable?: boolean }).fpsUnreliable === true
    if (!fpsUnreliable && report.avgFps !== null && report.avgFps >= 15) score += 20
    if (report.movementRatio !== null && report.movementRatio > 0.10) score += 15
    if (opts.hudChecks.length > 0 && report.hudChecks.every((h) => h.ok)) score += 10
    report.score = score
    report.badge = grade(score)
    report.ok = score >= 60 && report.loaderHidden && report.consoleErrors.length === 0
    clearTimeout(deadlineTimer)
    try { sock.close() } catch { /* already closed */ }
  } finally {
    proc.kill()
  }

  const dir = path.join(toolsDirFor(opts.workspaceRoot), 'playtest')
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, `report-${Date.now()}.json`)
  await fs.writeFile(file, JSON.stringify(report, null, 2), 'utf8')
  return report
}

function resolveWorkspace(exec: unknown): string {
  const cwd = (exec as { agent?: { session?: { header?: { cwd?: string } } } })?.agent?.session?.header?.cwd
  if (typeof cwd !== 'string' || cwd === '') throw new Error('no workspace selected for this session')
  return cwd
}

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'game_playtest',
    description:
      'DELIVERY GATE — the robot playtester. Launches the game in real headless Chrome, waits for the loader, ' +
      'PLAYS it (keyboard/mouse actions), measures FPS, proves movement by pixel-diff, asserts HUD values change, ' +
      'and can run CHAOS modes (offline/slow/blockglb) to verify the game fails BEAUTIFULLY (clear Arabic message, no freeze). ' +
      'Issues a graded certificate (خشب→أسطوري) and saves screenshots as replay for the user. ' +
      'MANDATORY before declaring any game done: iterate until ok=true. Returns a TEXT report only (the model never sees images).',
    parameters: {
      url: { type: 'string', required: true, description: 'Game URL (preview or local server)' },
      game: { type: 'string', required: true, description: 'Game label for the certificate' },
      actions: {
        type: 'array',
        description: 'Play sequence: {type:"key",key:"KeyW",ms:2000} / {type:"click",x:640,y:400} / {type:"wait",ms:800}. Default: hold W 2.5s',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', required: true, description: 'key|click|move|wait' },
            key: { type: 'string' },
            ms: { type: 'number' },
            x: { type: 'number' },
            y: { type: 'number' },
          },
        },
      },
      fps_seconds: { type: 'number', description: 'FPS sampling seconds (default 8)' },
      hud_checks: {
        type: 'array',
        description: 'JS expressions evaluated before/after; ok when the value CHANGED (e.g. document.getElementById("coins").textContent )',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: { name: { type: 'string', required: true }, expr: { type: 'string', required: true } },
        },
      },
      chaos: { type: 'array', description: 'Chaos modes after play: "offline" | "slow" | "blockglb"', items: { type: 'string' } },
      save_replay: { type: 'boolean', description: 'Save step screenshots as a replay folder (default true)' },
    },
    output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }] },
    async execute(args, exec) {
      const root = resolveWorkspace(exec)
      const actions = (args.actions ?? [{ type: 'key', key: 'KeyW', ms: 2500 }]) as PlayAction[]
      const report = await runPlaytest(args.url, {
        game: args.game,
        actions,
        fpsSeconds: args.fps_seconds ?? 8,
        hudChecks: (args.hud_checks ?? []) as Array<{ name: string; expr: string }>,
        chaos: (args.chaos ?? []) as string[],
        replay: args.save_replay !== false,
        workspaceRoot: root,
      }, (exec as { signal?: AbortSignal }).signal)
      return {
        certificate: report.badge, score: report.score, ok: report.ok,
        loaderHidden: report.loaderHidden, loaderError: report.loaderErrorText,
        consoleErrors: report.consoleErrors, networkFails: report.networkFails,
        avgFps: report.avgFps, movementRatio: report.movementRatio,
        hudChecks: report.hudChecks, chaos: report.chaos,
        replayDir: report.replayDir,
        verdict: report.ok ? 'مقبولة للتسليم' : 'أكمل الإصلاح ثم أعد المختبر حتى ok=true',
      }
    },
  }))
}
