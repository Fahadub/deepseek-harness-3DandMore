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
import { once } from 'node:events'
import { DEVICE_PROFILES, keyEvent, validatePlayActions, deliveryGate, type PlayAction, type DeviceProfile } from './lib/playtest-contract.ts'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { toolsDirFor, nowIso } from './lib/util.ts'

export const name = 'tool-playtest'
export const inject = ['tools']

export type { PlayAction } from './lib/playtest-contract.ts'

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
  chaos: Array<{ mode: string; stillResponds: boolean; verified: boolean; note: string }>
  device?: DeviceProfile
  acceptance?: ReturnType<typeof deliveryGate>['checks']
  limitations?: string[]
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
    device?: DeviceProfile
    readyExpr?: string
    failureExpr?: string
    minFps?: number
  },
  signal: AbortSignal | undefined,
): Promise<PlaytestReport> {
  const parsedUrl = new URL(url)
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Playtest URL must be HTTP or HTTPS')
  validatePlayActions(opts.actions)
  const device = opts.device ?? 'desktop'
  if (!Object.hasOwn(DEVICE_PROFILES, device)) throw new Error('device must be desktop, mobile or tablet')
  const viewport = DEVICE_PROFILES[device]
  if (!Number.isFinite(opts.fpsSeconds) || opts.fpsSeconds < 2 || opts.fpsSeconds > 60) throw new Error('fps_seconds must be within 2..60')
  if (opts.chaos.some(mode => !['offline','slow','blockglb'].includes(mode))) throw new Error('Unknown chaos mode')
  const minFps = opts.minFps ?? 15
  if (!Number.isFinite(minFps) || minFps < 1 || minFps > 240) throw new Error('min_fps must be within 1..240')
  let chrome: string | undefined
  for (const c of CHROME_CANDIDATES) { try { await fs.access(c); chrome = c; break } catch { /* next */ } }
  if (chrome === undefined) throw new Error('Chrome/Edge not found for the playtester')
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'playtest-'))
  let port = 0
  const proc: ChildProcess = spawn(chrome, [
    '--headless=new', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`,
    '--use-angle=swiftshader', '--disable-gpu-vsync', '--no-first-run', '--window-size=1280,800', 'about:blank',
  ], { stdio: 'ignore' })
  let spawnError: Error | null = null
  proc.on('error', error => { spawnError = error })
  let socket: WebSocket | null = null
  let deadline: ReturnType<typeof setTimeout> | null = null
  let abortBrowser: (() => void) | null = null
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

  const report: PlaytestReport = {
    ok: false, badge: 'خشب', score: 0, game: opts.game, url, device,
    limitations: ['Browser requestAnimationFrame cadence under software rendering; not engine render FPS or a physical-device guarantee.', 'Visual change is not proof of movement; passing requires explicit state assertions.', 'Emulated touch does not certify a physical phone or tablet.'],
    loaderHidden: false, loaderErrorText: '', consoleErrors: [], networkFails: [],
    avgFps: null, movementRatio: null, hudChecks: [], chaos: [], replayDir: null, at: nowIso(),
  }
  let replayDir: string | null = null
  try {
  if (opts.replay) {
    replayDir = path.join(toolsDirFor(opts.workspaceRoot), 'playtest', `replay-${Date.now()}`)
    await fs.mkdir(replayDir, { recursive: true })
    report.replayDir = path.relative(opts.workspaceRoot, replayDir).replaceAll('\\', '/')
  }

    // connect CDP
    let wsUrl: string | null = null
    for (let i = 0; i < 30; i++) {
      if (spawnError) throw spawnError
      if (signal?.aborted) throw new Error('aborted')
      try {
        port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split(String.fromCharCode(10))[0])
        const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) })).json() as Array<{ type: string; webSocketDebuggerUrl: string }>
        wsUrl = tabs.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? null
        if (wsUrl !== null) break
      } catch { /* retry */ }
      await sleep(500)
    }
    if (wsUrl === null) throw new Error('playtester browser did not start')
    const sock = new WebSocket(wsUrl)
    socket = sock
    // فتح المقبس نفسه يجب أن يكون محدود المدة — وإلا علّق النداء كله قبل تسليح المهلة الكبرى.
    await new Promise<void>((res, rej) => {
      const openTimer = setTimeout(() => rej(new Error('CDP socket open timeout (15s)')), 15_000)
      sock.onopen = () => { clearTimeout(openTimer); res() }
      sock.onerror = () => { clearTimeout(openTimer); rej(new Error('CDP socket failed')) }
    })
    let mid = 0
    const pending = new Map<number, (m: { result?: { result?: { value?: unknown } }; error?: { message: string } }) => void>()
    // Hard safety: a dead browser must NEVER hang the tool forever.
    let stopped: string | null = null
    const failAll = (why: string): void => { stopped = why; for (const [id, fn] of pending) { fn({ error: { message: why } }); pending.delete(id) } }
    abortBrowser = () => { failAll('playtest aborted'); sock.close(); proc.kill() }
    signal?.addEventListener('abort', abortBrowser, { once: true })
    sock.onclose = () => failAll('browser connection closed')
    sock.onerror = () => failAll('browser connection error')
    const DEADLINE_MS = 6 * 60 * 1000
    deadline = setTimeout(() => failAll('playtest deadline exceeded (6min)'), DEADLINE_MS)
    const netFails: string[] = []
    const conErrs: string[] = []
    sock.onmessage = (e: MessageEvent) => {
      let m: { id?: number; method?: string; params?: Record<string, unknown>; result?: { result?: { value?: unknown } }; error?: { message: string } }
      try { m = JSON.parse(String(e.data)) } catch { failAll('malformed browser protocol response'); return }
      if (m.method === 'Page.screencastFrame') { void send('Page.screencastFrameAck', { sessionId: m.params?.sessionId }).catch(error => failAll(String(error))); return }
      if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)?.(m); pending.delete(m.id); return }
      if (m.method === 'Network.loadingFailed') netFails.push(String(m.params?.errorText ?? 'fail'))
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params?.exceptionDetails as { exception?: { description?: string }; text?: string } | undefined
        conErrs.push(String(d?.exception?.description ?? d?.text ?? 'exception').slice(0, 180))
      }
    }
    const send = <T = { result?: { result?: { value?: unknown } } }>(method: string, params: Record<string, unknown> = {}): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        if (stopped || signal?.aborted) { reject(new Error(stopped ?? 'aborted')); return }
        const id = ++mid
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)) }, 15000)
        pending.set(id, (m) => { clearTimeout(timer); if (m.error) reject(new Error(m.error.message)); else (resolve as (v: unknown) => void)(m) })
        try { sock.send(JSON.stringify({ id, method, params })) } catch { clearTimeout(timer); pending.delete(id); reject(new Error('socket closed: ' + method)) }
      })
    const evaluate = async (expression: string): Promise<unknown> => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      const result = r as { result?: { result?: { value?: unknown }; exceptionDetails?: { text?: string } } }
      if (result.result?.exceptionDetails) throw new Error('Playtest expression failed: ' + result.result.exceptionDetails.text)
      return result.result?.result?.value
    }
    const shot = async (name: string): Promise<void> => {
      if (replayDir === null) return
      const r = await send<{ result?: { data?: string } }>('Page.captureScreenshot', { format: 'png' })
      if (r.result?.data !== undefined) await fs.writeFile(path.join(replayDir, `${name}.png`), Buffer.from(r.result.data, 'base64'))
    }

    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
    await send('Emulation.setDeviceMetricsOverride', { ...viewport })
    await send('Emulation.setTouchEmulationEnabled', { enabled: viewport.mobile || opts.actions.some(a => a.type === 'touch'), maxTouchPoints: 5 })
    await send('Page.bringToFront')
    // Screencast (tiny frames, ignored) forces headless Chrome to produce BeginFrames
    // continuously — without it rAF throttles to ~1fps and FPS reads garbage.
    await send('Page.startScreencast', { format: 'jpeg', quality: 8, maxWidth: 32, maxHeight: 32, everyNthFrame: 1 })
    await send('Page.navigate', { url })

    // 1) loader wait (up to 60s)
    for (let i = 0; i < 60; i++) {
      await sleep(1000)
      if (signal?.aborted === true) throw new Error('aborted')
      const ready = opts.readyExpr ?? "(() => { const loader = document.getElementById('loader'); const hidden = !loader || loader.hidden || getComputedStyle(loader).display === 'none' || getComputedStyle(loader).visibility === 'hidden' || loader.classList.contains('hide'); return typeof window.__DSH_TEST_READY__ === 'boolean' ? window.__DSH_TEST_READY__ : document.readyState === 'complete' && hidden; })()"
      report.loaderHidden = (await evaluate(ready)) === true
      report.loaderErrorText = String(await evaluate("document.getElementById('loadErr')?.textContent || ''")).slice(0, 200)
      if (report.loaderHidden) break
    }
    await shot('01-loaded')
    await evaluate("(() => {const c=document.querySelector('canvas'); if(c){c.tabIndex=0;c.focus();}})()")

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
        await send('Input.dispatchKeyEvent', { type: 'keyDown', ...keyEvent(a.key) })
        await shot(`step-${String(step).padStart(2, '0')}-key-${a.key}`)
        await sleep(a.ms ?? 1200)
        await send('Input.dispatchKeyEvent', { type: 'keyUp', ...keyEvent(a.key) })
      } else if (a.type === 'touch') {
        const type = a.phase === 'start' ? 'touchStart' : a.phase === 'move' ? 'touchMove' : 'touchEnd'
        await send('Input.dispatchTouchEvent', { type, touchPoints: (a.points ?? []).map((point, i) => ({ ...point, id: point.id ?? i })) })
        await sleep(a.ms ?? 200)
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
      // Decode pixels before comparing; PNG compressed bytes are not visual evidence.
      const images = JSON.stringify([beforeShot.toString('base64'), afterShot.toString('base64')])
      report.movementRatio = Number(await evaluate('(async () => { const frames=' + images + '; const pixels=[]; for(const data of frames){ const image=new Image(); image.src="data:image/png;base64,"+data; await image.decode(); const canvas=document.createElement("canvas"); canvas.width=64; canvas.height=40; const ctx=canvas.getContext("2d"); ctx.drawImage(image,0,0,64,40); pixels.push(ctx.getImageData(0,0,64,40).data); } let changed=0; for(let i=0;i<pixels[0].length;i+=4){ if(Math.abs(pixels[0][i]-pixels[1][i])+Math.abs(pixels[0][i+1]-pixels[1][i+1])+Math.abs(pixels[0][i+2]-pixels[1][i+2])>30) changed++; } return changed/(64*40); })()'))
    }
    await shot('02-after-actions')

    // 4) Sample at the requested device viewport. Never infer physical-device FPS.
    await evaluate('window.__fc=0; window.__ft=performance.now()')
    await sleep(Math.max(2, opts.fpsSeconds) * 1000)
    const fpsRaw = await evaluate('Math.round(window.__fc / ((performance.now()-window.__ft)/1000))')
    report.avgFps = typeof fpsRaw === 'number' ? fpsRaw : null
    // Low samples fail the chosen test budget; do not silently award performance points.
    // Keep the same viewport for actions, assertions, screenshots and FPS.

    // 5) HUD after
    for (let i = 0; i < opts.hudChecks.length; i++) {
      const c = opts.hudChecks[i]!
      const after = String(await evaluate(c.expr) ?? '')
      report.hudChecks.push({ name: c.name, ok: beforeVals[i] !== after, before: beforeVals[i] ?? '', after })
    }

    // Keep deliberate failure experiments separate from unexpected gameplay network errors.
    report.consoleErrors = conErrs.slice(0, 12)
    report.networkFails = netFails.slice(0, 12)
    for (const mode of opts.chaos) {
      const priorErrors = conErrs.length
      if (mode === 'offline') await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
      if (mode === 'slow') await send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 60 * 1024, uploadThroughput: 20 * 1024 })
      if (mode === 'blockglb') await send('Network.setBlockedURLs', { urls: ['*.glb'] })
      await send('Page.reload', { ignoreCache: true })
      await sleep(mode === 'slow' ? 5000 : 2500)
      const alive = await evaluate('document.readyState')
      const stillResponds = alive === 'complete' || alive === 'interactive'
      let verified = false
      if (opts.failureExpr && stillResponds) {
        try { verified = (await evaluate(opts.failureExpr)) === true && conErrs.length === priorErrors } catch { verified = false }
      }
      report.chaos.push({ mode, stillResponds, verified, note: verified ? 'Failure-state assertion passed after reload under fault' : 'Not verified: supply failure_expr that checks usable offline behavior or a clear recoverable error UI' })
      await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
      await send('Network.setBlockedURLs', { urls: [] })
      await send('Page.reload', { ignoreCache: true })
      await sleep(1000)
    }
    const gate = deliveryGate(report, minFps)
    report.score = gate.score
    report.badge = grade(gate.score)
    report.ok = gate.ok
    report.acceptance = gate.checks
  } finally {
    if (deadline !== null) clearTimeout(deadline)
    if (abortBrowser) signal?.removeEventListener('abort', abortBrowser)
    if (socket) socket.close()
    const closed = proc.exitCode === null && proc.signalCode === null && proc.pid !== undefined ? once(proc, 'close') : Promise.resolve()
    proc.kill()
    await closed
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(error => report.limitations?.push('Browser profile cleanup failed: ' + String(error)))
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
      'PLAYS it with trusted keyboard/mouse/multi-touch input at desktop/mobile/tablet viewports. Requires explicit hud_checks/state expressions that change after input; visual changes alone are not proof of gameplay. Measures software-rendered FPS without claiming physical-device performance. ' +
      'Optional CHAOS modes reload under offline/slow/blockglb and require failure_expr to verify a useful failure state. ' +
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
            type: { type: 'string', required: true, description: 'key|click|move|wait|touch' },
            phase: { type: 'string', description: 'For touch: start|move|end' },
            points: { type: 'array', description: 'Active touch points; stable unique IDs, 1..5 for start/move, empty for end', items: { type: 'object', additionalProperties: false, properties: { x: { type: 'number', required: true }, y: { type: 'number', required: true }, id: { type: 'number' } } } },
            key: { type: 'string' },
            ms: { type: 'number' },
            x: { type: 'number' },
            y: { type: 'number' },
          },
        },
      },
      fps_seconds: { type: 'number', description: 'FPS sampling seconds 2..60 (default 8)' },
      device: { type: 'string', description: 'desktop (1280x800), mobile (390x844), tablet (820x1180). Emulation is not a real-device test.' },
      ready_expr: { type: 'string', description: 'Optional boolean JS readiness assertion; default supports hidden or absent loaders and window.__DSH_TEST_READY__.' },
      failure_expr: { type: 'string', description: 'Boolean JS assertion for clear recoverable error UI or usable offline state after fault-mode reload. Required to pass requested chaos tests.' },
      min_fps: { type: 'number', description: 'Minimum measured FPS 1..240, default 15. Not a prediction of hardware performance.' },
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
        device: (args.device ?? 'desktop') as DeviceProfile, readyExpr: args.ready_expr, failureExpr: args.failure_expr, minFps: args.min_fps,
        hudChecks: (args.hud_checks ?? []) as Array<{ name: string; expr: string }>,
        chaos: (args.chaos ?? []) as string[],
        replay: args.save_replay !== false,
        workspaceRoot: root,
      }, (exec as { signal?: AbortSignal }).signal)
      return {
        certificate: report.badge, score: report.score, ok: report.ok,
        loaderHidden: report.loaderHidden, loaderError: report.loaderErrorText,
        consoleErrors: report.consoleErrors, networkFails: report.networkFails,
        sampledPageRafFps: report.avgFps, avgFps: report.avgFps, visualChangeRatio: report.movementRatio, movementRatio: report.movementRatio,
        device: report.device, acceptance: report.acceptance, limitations: report.limitations,
        hudChecks: report.hudChecks, chaos: report.chaos,
        replayDir: report.replayDir,
        verdict: report.ok ? 'اجتازت اختبارات السلوك المحددة؛ يبقى اختبار الأجهزة الفعلية والعرض النهائي' : 'أكمل الإصلاح واختبارات الحالة المطلوبة ثم أعد المختبر حتى ok=true',
      }
    },
  }))
}
