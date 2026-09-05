/**
 * Tools suite — HTTP hub served from the dsh web server under /tools.
 * Ports the TOOLS IDE Pro Mode surface onto DeepSeek Harness:
 * file explorer + editor, live preview, Kanban board, API tester,
 * file version history, auto-agent monitor, project ZIP + email,
 * Git panel, and a health dashboard. Arabic RTL UI.
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { toolsDirFor, readJson, writeJson, sendJson, readJsonBody, sendText, safeJoin, walk, mimeFor, isTextFile } from './lib/util.ts'
import { buildZip } from './lib/zip.ts'
import { sendMail, type SmtpConfig } from './lib/smtp.ts'
import { listSnapshots, getSnapshotContent, restoreSnapshot } from './tool-versions.ts'
import { captureScreenshot } from './tool-screenshot.ts'
import { listAutoAgents, getAutoAgent } from './lib/registry.ts'
import { renderHubPage } from './hub-page.ts'
import { blenderStatus, clearBlenderCache, godotInstalled } from './tool-blender.ts'
import { registeredFolders, addFolder, removeFolder, scanAll, embeddedPackDir } from './tool-assets.ts'

export const name = 'tool-http'
export const inject = ['webServer', 'workspaceRegistry']

/** Background engine (Blender/Godot) download job — one at a time. */
let engineJob: { engine: 'blender' | 'godot', phase: 'downloading' | 'done' | 'error', error: string | null, startedAt: number } | null = null

function startEngineDownload(engine: 'blender' | 'godot'): void {
  engineJob = { engine, phase: 'downloading', error: null, startedAt: Date.now() }
  const script = path.resolve('tools-suite', `download-${engine}.ps1`)
  const ch = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { cwd: process.cwd(), windowsHide: true })
  let tail = ''
  ch.stdout.on('data', (d: Buffer) => { tail = (tail + d.toString()).slice(-2000) })
  ch.stderr.on('data', (d: Buffer) => { tail = (tail + d.toString()).slice(-2000) })
  ch.on('error', (err) => { engineJob = { engine, phase: 'error', error: String(err), startedAt: engineJob?.startedAt ?? Date.now() } })
  ch.on('close', (code) => {
    if (code === 0) {
      engineJob = { engine, phase: 'done', error: null, startedAt: engineJob?.startedAt ?? Date.now() }
      clearBlenderCache()
    } else {
      engineJob = { engine, phase: 'error', error: tail.slice(-1000) || `exit code ${code}`, startedAt: engineJob?.startedAt ?? Date.now() }
    }
  })
}

interface WorkspaceLike { id: string; path: string; title?: string }

function workspacesOf(ctx: Context): WorkspaceLike[] {
  const reg = (ctx as unknown as { workspaceRegistry?: { list(): Array<{ id: string; path: string; title?: string }> } }).workspaceRegistry
  try {
    // Map to plain objects: entity getters survive runtime access but not JSON.
    return (reg?.list() ?? []).map(w => ({ id: w.id, path: w.path, title: w.title }))
  } catch {
    return []
  }
}

function git(ws: string, args: string[]): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn('git', ['-C', ws, ...args], { windowsHide: true })
    let out = ''
    child.stdout.on('data', (d: Buffer) => { if (out.length < 300000) out += d.toString('utf8') })
    child.stderr.on('data', (d: Buffer) => { if (out.length < 300000) out += d.toString('utf8') })
    child.on('error', (err) => resolve({ code: -1, out: String(err) }))
    child.on('close', (code) => resolve({ code, out }))
  })
}

function ok(res: ServerResponse): void {
  sendJson(res, 200, { ok: true })
}

/** مسار مطلق → file:// URL للاستيراد الديناميكي لوحدات tsx داخل المستودع. */
function pathToFileUrlResolve(p: string): string {
  return `file:///${p.replace(/\\/g, '/').replace(/ /g, '%20')}`
}

/** Machine-global Tripo key store — shared by every workspace, survives restarts. */
function tripoKeyFile(): string {
  return path.join(os.homedir(), '.dsh-tools', 'tripo', 'api-key.json')
}

async function readKeyFile(): Promise<string> {
  const j = await readJson<{ key?: string }>(tripoKeyFile(), {})
  return typeof j.key === 'string' ? j.key.trim() : ''
}

function maskKey(k: string): string {
  return k.length <= 12 ? `${k.slice(0, 3)}…` : `${k.slice(0, 7)}…${k.slice(-4)}`
}

async function tripoKeyStatus(): Promise<{ present: boolean, masked: string, source: 'env' | 'file' | 'none' }> {
  const envKey = (process.env.TRIPO_API_KEY ?? '').trim()
  if (envKey !== '') return { present: true, masked: maskKey(envKey), source: 'env' }
  const fileKey = await readKeyFile()
  if (fileKey !== '') return { present: true, masked: maskKey(fileKey), source: 'file' }
  return { present: false, masked: '', source: 'none' }
}

/**
 * Cheap key validation — zero credits. A bad key answers 401/code 1002 on
 * these endpoints (verified against real rejected keys); a good key answers
 * anything else (balance payload, or a param-validation 400 on the probe).
 */
async function testTripoKey(key: string): Promise<{ valid: boolean, message: string, balance?: unknown }> {
  const base = process.env.TRIPO_API_BASE ?? 'https://api.tripo3d.ai'
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${key}` }
  const isAuthReject = (status: number, code: unknown): boolean =>
    status === 401 || status === 403 || code === 1002 || code === '1002' || code === 401
  try {
    let r = await fetch(`${base}/v2/openapi/user/balance`, { headers, signal: AbortSignal.timeout(15000) })
    let j: Record<string, unknown> = {}
    try { j = await r.json() as Record<string, unknown> } catch { /* non-JSON */ }
    if (isAuthReject(r.status, (j as { code?: unknown }).code)) {
      return { valid: false, message: `مرفوض (${r.status}${j.code !== undefined ? ' / ' + String(j.code) : ''}) — مفتاح غير صالح أو منتهي` }
    }
    if (r.status === 200) {
      return { valid: true, message: 'المفتاح يعمل ✓', balance: j.data ?? j }
    }
    // Balance endpoint missing on this API version → probe with an empty task
    // body: auth is checked before params, so the discrimination still holds.
    r = await fetch(`${base}/v2/openapi/task`, { method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(15000) })
    try { j = await r.json() as Record<string, unknown> } catch { /* non-JSON */ }
    if (isAuthReject(r.status, (j as { code?: unknown }).code)) {
      return { valid: false, message: `مرفوض (${r.status}${j.code !== undefined ? ' / ' + String(j.code) : ''}) — مفتاح غير صالح أو منتهي` }
    }
    return { valid: true, message: 'المفتاح يعمل ✓' }
  } catch (err) {
    return { valid: false, message: `تعذر الوصول لخدمة Tripo: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export function apply(ctx: Context): void {
  const token = process.env.TOOLS_ACCESS_TOKEN ?? ''

  // ---- حلقة وكيل الصيانة: لا تعمل إطلاقًا ما لم يفعّلها المستخدم -------
  let guardianTimer: ReturnType<typeof setInterval> | null = null
  async function mergeNewProposalsSafe(s: import('./tool-guardian.ts').GuardianState, found: import('./tool-guardian.ts').GuardianProposal[]): Promise<void> {
    const { mergeNewProposals } = await import('./tool-guardian.ts')
    mergeNewProposals(s, found)
  }
  let guardianGeneration = 0
  let guardianDisposed = false
  let guardianBusy = false
  function restartGuardianLoop(): void {
    const generation = ++guardianGeneration
    if (guardianTimer !== null) clearInterval(guardianTimer)
    guardianTimer = null
    void (async () => {
      const { loadGuardian, detectProblems, mergeNewProposals, saveGuardian } = await import('./tool-guardian.ts')
      const s = await loadGuardian()
      if (guardianDisposed || generation !== guardianGeneration || !s.enabled) return
      const minutes = Number.isFinite(s.intervalMin) ? Math.max(1, Math.min(1440, s.intervalMin)) : 30
      guardianTimer = setInterval(() => {
        if (guardianBusy || guardianDisposed || generation !== guardianGeneration) return
        guardianBusy = true
        void (async () => {
          try {
            const cur = await loadGuardian()
            if (!cur.enabled || guardianDisposed || generation !== guardianGeneration) return
            const found = await detectProblems(workspacesOf(ctx))
            if (guardianDisposed || generation !== guardianGeneration) return
            mergeNewProposals(cur, found)
            await saveGuardian(cur)
          } catch (err) {
            console.error('[tools] Guardian scan failed:', err)
          } finally {
            guardianBusy = false
          }
        })()
      }, minutes * 60_000)
    })().catch(err => console.error('[tools] Guardian initialization failed:', err))
  }
  ctx.effect(() => {
    guardianDisposed = false
    restartGuardianLoop()
    return () => {
      guardianDisposed = true
      ++guardianGeneration
      if (guardianTimer !== null) clearInterval(guardianTimer)
      guardianTimer = null
    }
  }, 'tool-http: guardian lifecycle')

  // خط أنابيب وكيل الباحث: تسلسلي، سقف 20، حذف بعد كل معالجة + علامة MD دائمة.
  async function researchRun(): Promise<void> {
    const r = await import('./tool-research.ts')
    const staging = path.join(r.HARVEST_DIR(), 'staging')
    await fs.mkdir(staging, { recursive: true })
    const s0 = await r.loadResearch()
    r.logEvent(s0, `انطلق الباحث: «${s0.goal}»`)
    await r.saveResearch(s0)
    const candidates = await r.searchCandidates(s0.goal)
    const s1 = await r.loadResearch()
    r.logEvent(s1, `وجد ${candidates.length} مرشحًا من الويب`)
    await r.saveResearch(s1)

    for (const c of candidates) {
      const cur = await r.loadResearch()
      if (!cur.running) break
      if (cur.downloadsThisRun >= cur.maxDownloads) { r.logEvent(cur, `بلغ سقف الـ${cur.maxDownloads} تنزيلًا لهذه الانطلاقة`); await r.saveResearch(cur); break }
      if (await r.isDone(c.provider, c.id)) {
        cur.downloads.unshift({ provider: c.provider, id: c.id, url: c.url, startedAt: new Date().toISOString(), result: 'skipped-done', note: 'علامة «تم الانتهاء» موجودة — تخطٍ' })
        cur.downloads = cur.downloads.slice(0, 60)
        await r.saveResearch(cur)
        continue
      }
      const dlDir = path.join(r.DL_DIR(), `${c.provider}-${c.id.replace(/[^a-zA-Z0-9._-]/g, '_')}-${Date.now()}`)
      await fs.mkdir(dlDir, { recursive: true })
      cur.downloadsThisRun += 1
      let outcome: 'harvested' | 'skipped-risk' | 'failed' | 'empty' = 'failed'
      let harvested: string[] = []
      try {
        // روابط الأرشيف: main ثم master كبديل (فك الضغط بأدوات النظام فقط)
        const urls = c.provider === 'github'
          ? [`https://codeload.github.com/${c.id}/zip/refs/heads/main`, `https://codeload.github.com/${c.id}/zip/refs/heads/master`]
          : [r.archiveUrl(c)]
        let buf: Buffer | null = null
        for (const u of urls) {
          const resp = await fetch(u, { signal: AbortSignal.timeout(120_000) })
          if (!resp.ok) continue
          const b = Buffer.from(await resp.arrayBuffer())
          if (b.length > 60 * 1024 * 1024) throw new Error('الأرشيف أكبر من 60MB — تخطٍ')
          buf = b
          break
        }
        if (buf === null) throw new Error('تعذر التنزيل (لا main ولا master / npm)')
        const archivePath = path.join(dlDir, c.provider === 'npm' ? 'pkg.tgz' : 'repo.zip')
        await fs.writeFile(archivePath, buf)
        const extractDir = path.join(dlDir, 'x')
        await fs.mkdir(extractDir, { recursive: true })
        if (c.provider === 'npm') {
          await new Promise<void>((resolve, reject) => {
            const ch = spawn('tar', ['-xzf', archivePath, '-C', extractDir], { windowsHide: true })
            ch.on('close', code => code === 0 ? resolve() : reject(new Error('tar فشل')))
            ch.on('error', reject)
          })
        } else {
          await new Promise<void>((resolve, reject) => {
            const ch = spawn('powershell', ['-NoProfile', '-Command', 'Expand-Archive', '-LiteralPath', archivePath, '-DestinationPath', extractDir, '-Force'], { windowsHide: true })
            ch.on('close', code => code === 0 ? resolve() : reject(new Error('Expand-Archive فشل')))
            ch.on('error', reject)
          })
        }
        const scan = await r.scanProject(extractDir)
        if (scan.risk === 'high') {
          outcome = 'skipped-risk'
          cur.downloads.unshift({ provider: c.provider, id: c.id, url: c.url, startedAt: new Date().toISOString(), result: 'skipped-risk', note: scan.findings.slice(0, 3).join(' | ') })
        } else {
          harvested = await r.harvestUseful(extractDir, cur.goal, staging, () => false)
          outcome = harvested.length > 0 ? 'harvested' : 'empty'
          cur.downloads.unshift({ provider: c.provider, id: c.id, url: c.url, startedAt: new Date().toISOString(), result: outcome, note: `اقتُطف ${harvested.length} ملفًا` + (scan.findings.length > 0 ? ` | تحذيرات: ${scan.findings[0]}` : '') })
        }
      } catch (err) {
        cur.downloads.unshift({ provider: c.provider, id: c.id, url: c.url, startedAt: new Date().toISOString(), result: 'failed', note: err instanceof Error ? err.message : String(err) })
      }
      // علامة «تم الانتهاء منه» ثم حذف التنزيل نهائيًا — بالترتيب دائمًا
      await r.markDone(c.provider, c.id, c.url, outcome, harvested)
      await fs.rm(dlDir, { recursive: true, force: true })
      cur.downloads = cur.downloads.slice(0, 60)
      await r.saveResearch(cur)
    }
    const fin = await r.loadResearch()
    fin.running = false
    r.logEvent(fin, 'انتهت جولة البحث — المقتطفات في النسخة التجريبية جاهزة للاختبار والاعتماد')
    await r.saveResearch(fin)
  }

  // A key saved once from the hub UI outlives restarts even when the process
  // is launched without TRIPO_API_KEY in its environment.
  void (async () => {
    try {
      if ((process.env.TRIPO_API_KEY ?? '').trim() === '') {
        const saved = await readKeyFile()
        if (saved !== '') process.env.TRIPO_API_KEY = saved
      }
    } catch (err) {
      // فشل قراءة مفتاح Tripo المحفوظ لا يوقف الخادم — يسجل فقط
      console.error('[tools] تعذر استرجاع مفتاح Tripo المحفوظ:', err instanceof Error ? err.message : String(err))
    }
  })()

  const dispatch = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    let url: URL
    let p: string
    try {
      url = new URL(req.url ?? '/', 'http://127.0.0.1')
      p = decodeURIComponent(url.pathname).replace(/\/+$/, '') || '/tools'
    } catch {
      sendJson(res, 400, { error: 'Invalid URL encoding — check percent escapes. / ترميز الرابط غير صالح' })
      return
    }
    const ws = url.searchParams.get('ws') ?? ''

    if (token !== '') {
      const provided = url.searchParams.get('token') ?? req.headers['x-tools-token']
      if (provided !== token) {
        sendJson(res, 401, { error: 'unauthorized: append ?token=… or set x-tools-token' })
        return
      }
    }

    const resolveWs = (): { root: string; meta: WorkspaceLike } => {
      const found = workspacesOf(ctx).find(w => w.path === ws || w.id === ws)
      if (found === undefined) throw new Error(`مساحة العمل غير مسجّلة في المركز («${ws}») — افتح مساحة صحيحة أو أضف المشروع من زر «إضافة مشروع» في الأعلى`)
      return { root: found.path, meta: found }
    }

    try {
      // ---- pages -------------------------------------------------------
      if (req.method === 'GET' && (p === '/tools' || p === '/tools/index.html')) {
        sendText(res, 200, renderHubPage(workspacesOf(ctx)), 'text/html; charset=utf-8')
        return
      }

      if (req.method === 'GET' && p === '/tools/preview') {
        const { root } = resolveWs()
        const target = safeJoin(root, url.searchParams.get('p') ?? 'index.html')
        const data = await fs.readFile(target)
        res.writeHead(200, { 'content-type': mimeFor(target), 'cache-control': 'no-store' })
        res.end(data)
        return
      }

      if (req.method === 'GET' && p === '/tools/zip') {
        const { root, meta } = resolveWs()
        const entries = (await walk(root, { maxEntries: 12000 })).filter(e => e.isFile && e.size < 64 * 1024 * 1024)
        let total = 0
        const files = []
        for (const e of entries) {
          total += e.size
          if (total > 512 * 1024 * 1024) break
          files.push({ path: e.rel, data: await fs.readFile(e.abs) })
        }
        const zip = buildZip(files)
        // HTTP headers are latin-1 only: fall back to an ASCII name and pass
        // the original (possibly Arabic) name via RFC 5987 filename*.
        const base = path.basename(meta.path || meta.id || 'workspace')
        const asciiBase = base.replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '').trim() || 'workspace'
        res.writeHead(200, {
          'content-type': 'application/zip',
          'content-disposition': `attachment; filename="${asciiBase}-archive.zip"; filename*=UTF-8''${encodeURIComponent(`${base}-archive.zip`)}`,
        })
        res.end(zip)
        return
      }

      // ---- JSON API ----------------------------------------------------
      if (p === '/tools/api/workspaces' && req.method === 'GET') {
        sendJson(res, 200, { workspaces: workspacesOf(ctx) })
        return
      }

      if (p === '/tools/api/workspaces/add' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const dirPath = String(body.path ?? '').trim()
        if (dirPath === '') throw new Error('Project path required — enter an absolute folder path. / مسار المشروع مطلوب')
        const stat = await fs.stat(dirPath).catch(() => null)
        if (stat === null || !stat.isDirectory()) throw new Error(`not a directory: ${dirPath}`)
        const reg = (ctx as unknown as { workspaceRegistry?: { create: (path: string, title?: string) => Promise<WorkspaceLike>; resolveByPath: (path: string) => Promise<WorkspaceLike | undefined> } }).workspaceRegistry
        if (reg === undefined) throw new Error('Workspace registry unavailable — reload the page. / سجل مساحات العمل غير متاح')
        const existing = await reg.resolveByPath(dirPath).catch(() => undefined)
        if (existing === undefined) await reg.create(dirPath)
        sendJson(res, 200, { ok: true, workspaces: workspacesOf(ctx) })
        return
      }

      if (p.startsWith('/tools/assets/three/') && req.method === 'GET') {
        const rel = p.slice('/tools/assets/three/'.length)
        const base = path.resolve('tools-suite/three')
        const target = path.resolve(base, rel)
        if (target !== base && !target.startsWith(base + path.sep)) throw new Error('Path outside permitted directory. / المسار خارج المجلد المسموح')
        const data = await fs.readFile(target)
        res.writeHead(200, {
          'content-type': target.endsWith('.js') ? 'text/javascript; charset=utf-8' : target.endsWith('.html') ? 'text/html; charset=utf-8' : target.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/octet-stream',
          'cache-control': 'public, max-age=86400',
        })
        res.end(data)
        return
      }
      if (p === '/tools/api/auto-continue' && req.method === 'GET') {
        const { root } = resolveWs()
        const { loadState } = await import('./tool-auto-continue.ts')
        const s = await loadState(root)
        sendJson(res, 200, { ...s, remainingMs: s.resetAt === null ? null : Math.max(0, s.resetAt - Date.now()) })
        return
      }
      if (p === '/tools/api/auto-continue' && req.method === 'POST') {
        const { root } = resolveWs()
        const body = await readJsonBody(req)
        const { autoContinueApi } = await import('./tool-auto-continue.ts')
        const api = autoContinueApi as { armReal: Function; cancel: Function; loadState: Function; saveState: Function; fire: Function } | undefined
        if (api === undefined) throw new Error('Auto-continue unavailable — restart the server. / الاستئناف التلقائي غير متاح')
        const action = String(body.action ?? 'configure')
        if (action === 'cancel') { sendJson(res, 200, { ok: true, state: await api.cancel(root) }); return }
        if (action === 'fire') { await api.fire(root); sendJson(res, 200, { ok: true, state: await api.loadState(root) }); return }
        if (action === 'arm') {
          const s = await api.armReal(root, null, Number(body.minutes ?? 1), typeof body.model === 'string' ? body.model : null, String(body.note ?? 'اختبار الاستئناف'))
          sendJson(res, 200, { ok: true, state: s })
          return
        }
        // configure
        const s = await api.loadState(root)
        if (body.enabled !== undefined) s.enabled = Boolean(body.enabled)
        if (body.retries !== undefined) s.retries = Math.max(1, Math.min(100, Math.floor(Number(body.retries) || 1)))
        if (body.minutes !== undefined) s.minutes = Math.max(1, Math.min(24 * 60, Math.floor(Number(body.minutes) || 60)))
        await api.saveState(root, s)
        sendJson(res, 200, { ok: true, state: s })
        return
      }
      if (p === '/tools/api/generated-images' && req.method === 'GET') {
        const { root } = resolveWs()
        const out: string[] = []
        for (const dir of [path.join(root, 'assets', 'generated'), path.join(toolsDirFor(root), 'screenshots')]) {
          try {
            for (const f of await fs.readdir(dir)) if (/\.(png|jpg|jpeg|webp)$/i.test(f)) out.push(path.relative(root, path.join(dir, f)).replace(/\\/g, '/'))
          } catch { /* dir absent */ }
        }
        sendJson(res, 200, { images: out.slice(0, 60) })
        return
      }
      if (p === '/tools/api/version' && req.method === 'GET') {
        sendJson(res, 200, { suite: 'tools-suite', version: '1.2.0', features: ['memory','analysis','team','commands','versions','screenshot','todos-sync','media','governance'], languages: ['ar','en','zh'] })
        return
      }

      if (p === '/tools/api/tripo/settings' && req.method === 'GET') {
        const { root } = resolveWs()
        const { loadSettings } = await import('./tool-tripo.ts')
        sendJson(res, 200, await loadSettings(root))
        return
      }
      if (p === '/tools/api/tripo/settings' && req.method === 'POST') {
        const { root } = resolveWs()
        const body = await readJsonBody(req)
        const { loadSettings, saveSettings } = await import('./tool-tripo.ts')
        const s = await loadSettings(root)
        if (body.hardCap === null || body.hardCap === '' || body.hardCap === undefined) s.hardCap = null
        else s.hardCap = Math.max(1, Math.min(200, Math.floor(Number(body.hardCap) || 0)))
        await saveSettings(root, s)
        sendJson(res, 200, { ok: true, settings: s })
        return
      }
      if (p === '/tools/api/tripo/plan' && req.method === 'GET') {
        const { root } = resolveWs()
        const { loadPlan } = await import('./tool-tripo.ts')
        sendJson(res, 200, { plan: await loadPlan(root) })
        return
      }
      if (p === '/tools/api/tripo/plan' && req.method === 'POST') {
        const { root } = resolveWs()
        const body = await readJsonBody(req)
        const { createPlan } = await import('./tool-tripo.ts')
        const plan = await createPlan(root, {
          game: String(body.game ?? ''),
          styleBible: String(body.styleBible ?? body.style_bible ?? ''),
          count: Number(body.count ?? 0),
          assets: Array.isArray(body.assets) ? body.assets : [],
        })
        sendJson(res, 200, { ok: true, plan })
        return
      }
      if (p === '/tools/api/tripo/generate' && req.method === 'POST') {
        const { root } = resolveWs()
        const body = await readJsonBody(req)
        const { generateAsset } = await import('./tool-tripo.ts')
        const asset = await generateAsset(root, String(body.name ?? ''), undefined, typeof body.image === 'string' ? body.image : undefined)
        sendJson(res, 200, { ok: true, asset })
        return
      }
      // ---- Tripo API key: save once from the UI, survives restarts -------
      if (req.method === 'GET' && (p === '/tools/studio' || p === '/tools/studio/index.html')) {
        const { renderStudioPage } = await import('./studio-page.ts')
        sendText(res, 200, renderStudioPage(), 'text/html; charset=utf-8')
        return
      }
      if (req.method === 'GET' && (p === '/tools/godot' || p === '/tools/godot/index.html')) {
        const { renderGodotPage } = await import('./godot-page.ts')
        sendText(res, 200, renderGodotPage(), 'text/html; charset=utf-8')
        return
      }
      if (p === '/tools/api/godot/book' && req.method === 'GET') {
        const data = await fs.readFile(path.resolve('tools-suite/godot/GODOT-CAPABILITIES.md'), 'utf8').catch(() => null)
        if (data === null) throw new Error('كتاب قدرات Godot غير موجود')
        sendText(res, 200, data, 'text/markdown; charset=utf-8')
        return
      }
      // Patch: a relative import inside three-vendor addons resolves to /tools/utils/
      if (p === '/tools/utils/BufferGeometryUtils.js' && req.method === 'GET') {
        const data = await fs.readFile(path.resolve('tools-suite/three/examples/jsm/utils/BufferGeometryUtils.js'))
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=86400' })
        res.end(data)
        return
      }
      if (p.startsWith('/tools/assets-three/') && req.method === 'GET') {
        const rel = p.slice('/tools/assets-three/'.length)
        const base = path.resolve('tools-suite/three-vendor')
        const target = path.resolve(base, rel)
        if (target !== base && !target.startsWith(base + path.sep)) throw new Error('Path outside permitted directory. / المسار خارج المجلد المسموح')
        const data = await fs.readFile(target)
        res.writeHead(200, { 'content-type': target.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'application/octet-stream', 'cache-control': 'public, max-age=86400' })
        res.end(data)
        return
      }
      if (p === '/tools/api/studio/assets' && req.method === 'GET') {
        const { root } = resolveWs()
        const dir = path.join(root, 'assets', '3d')
        const glbs: Array<{ file: string, bytes: number }> = []
        const entries = await walk(dir, { maxEntries: 2000 }).catch(() => [])
        for (const e of entries) if (e.isFile && e.rel.toLowerCase().endsWith('.glb')) glbs.push({ file: 'assets/3d/' + e.rel.replaceAll('\\', '/'), bytes: e.size })
        sendJson(res, 200, { glbs })
        return
      }
      if (p === '/tools/api/studio/asset' && req.method === 'GET') {
        const { root } = resolveWs()
        const target = safeJoin(root, url.searchParams.get('f') ?? '')
        const data = await fs.readFile(target)
        res.writeHead(200, { 'content-type': 'model/gltf-binary', 'cache-control': 'no-store' })
        res.end(data)
        return
      }
      if (p === '/tools/api/studio/clone' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const src = String(body.ws ?? '')
        const found = workspacesOf(ctx).find(w => w.path === src || w.id === src)
        if (found === undefined) throw new Error(`مساحة العمل المصدر غير مسجّلة: ${src}`)
        const dst = found.path.endsWith('-تحرير') ? found.path + '-2' : found.path + '-تحرير'
        const code = await new Promise<number>((resolve) => {
          const ch = spawn('robocopy', [found.path, dst, '/E', '/XD', 'node_modules', '.git', '/NFL', '/NDL', '/NJH', '/NJS'], { windowsHide: true })
          ch.on('close', c => resolve(c ?? -1))
          ch.on('error', () => resolve(-1))
        })
        if (code > 7) throw new Error(`robocopy failed (${code})`)
        const reg = (ctx as unknown as { workspaceRegistry?: { create: (p: string, title?: string) => Promise<WorkspaceLike> } }).workspaceRegistry
        if (reg === undefined) throw new Error('Workspace registry unavailable — reload the page. / سجل مساحات العمل غير متاح')
        await reg.create(dst)
        sendJson(res, 200, { ok: true, path: dst, ws: dst })
        return
      }
      if (p === '/tools/api/engines/status' && req.method === 'GET') {
        sendJson(res, 200, {
          blender: await blenderStatus(),
          godot: { installed: await godotInstalled(), path: path.resolve('tools-suite/godot/Godot.exe') },
          job: engineJob,
        })
        return
      }
      if (p === '/tools/api/engines/download' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const engine = String(body.engine ?? '')
        if (engine !== 'blender' && engine !== 'godot') throw new Error('Choose blender or godot. / اختر blender أو godot فقط')
        if (engineJob !== null && engineJob.phase === 'downloading') {
          sendJson(res, 409, { ok: false, error: `تنزيل ${engineJob.engine} قيد التنفيذ بالفعل`, job: engineJob })
          return
        }
        const already = engine === 'blender' ? (await blenderStatus()).installed : await godotInstalled()
        if (already) {
          sendJson(res, 200, { ok: true, alreadyInstalled: true })
          return
        }
        startEngineDownload(engine)
        sendJson(res, 200, { ok: true, started: true, job: engineJob })
        return
      }
      // ---- مجلدات الأصول الجاهزة (الحزمة المدمجة + مجلدات المستخدم) --------
      if (p === '/tools/api/assets/paths' && req.method === 'GET') {
        sendJson(res, 200, { folders: await registeredFolders(), embedded: embeddedPackDir(), scans: await scanAll() })
        return
      }
      if (p === '/tools/api/assets/paths' && req.method === 'POST') {
        const body = await readJsonBody(req)
        if (body.remove === true) {
          await removeFolder(String(body.path ?? ''))
          sendJson(res, 200, { ok: true, folders: await registeredFolders() })
          return
        }
        const target = String(body.path ?? '').trim()
        if (target === '') throw new Error('أدخل مسار مجلد صحيحاً')
        const stat = await fs.stat(target).catch(() => null)
        if (stat === null || !stat.isDirectory()) throw new Error(`المجلد غير موجود: ${target}`)
        await addFolder(target)
        sendJson(res, 200, { ok: true, folders: await registeredFolders() })
        return
      }
      // ---- تصوير فيديو اللعبة (Godot Movie Writer) ----
      if (p === '/tools/api/record' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const wsPath = String(body.ws ?? '')
        const found = workspacesOf(ctx).find(w => w.path === wsPath || w.id === wsPath)
        if (found === undefined) throw new Error(`workspace not registered: ${wsPath}`)
        const exe = path.resolve('tools-suite/godot/Godot.exe')
        await fs.access(exe).catch(() => { throw new Error('Godot not installed') })
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const videoPath = path.join(os.homedir(), 'Desktop', `game-${stamp}.avi`)
        const fps = Number(body.fps) || 30
        // أوقف أي تسجيل سابق
        if (globalThis.__recProcess) { try { globalThis.__recProcess.kill() } catch { } }
        const ch = spawn(exe, ['--path', found.path, '--write-movie', videoPath, '--fixed-fps', String(fps)],
          { detached: false, stdio: 'ignore', windowsHide: false })
        globalThis.__recProcess = ch
        globalThis.__recVideo = videoPath
        ch.on('close', () => {
          globalThis.__recProcess = null
          // افتح المجلد عند انتهاء التسجيل (إغلاق اللعبة)
          spawn('explorer.exe', ['/select,', videoPath], { detached: true, windowsHide: true })
        })
        // افتح مجلد سطح المكتب فوراً ليرى المستخدم أين سيُحفظ
        sendJson(res, 200, { ok: true, video: videoPath, fps, message: 'Recording started — close the game window to stop' })
        return
      }
      if (p === '/tools/api/record/status' && req.method === 'GET') {
        sendJson(res, 200, {
          recording: globalThis.__recProcess !== null && globalThis.__recProcess !== undefined,
          video: globalThis.__recVideo ?? null,
        })
        return
      }
      if (p === '/tools/api/record/stop' && req.method === 'POST') {
        if (globalThis.__recProcess) {
          globalThis.__recProcess.kill()
          globalThis.__recProcess = null
        }
        const vp = globalThis.__recVideo
        if (vp) spawn('explorer.exe', ['/select,', vp], { detached: true, windowsHide: true })
        sendJson(res, 200, { ok: true, video: vp })
        return
      }
      if (p === '/tools/api/godot/open' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const target = String(body.ws ?? body.path ?? '')
        const found = workspacesOf(ctx).find(w => w.path === target || w.id === target)
        if (found === undefined) throw new Error(`مساحة العمل الهدف غير مسجّلة: ${target}`)
        const exe = path.resolve('tools-suite/godot/Godot.exe')
        await fs.access(exe).catch(() => { throw new Error('Godot غير مثبت في tools-suite/godot — شغّل سكربت التحميل أولًا') })
        const ch = spawn(exe, ['--path', found.path, '-e'], { detached: true, stdio: 'ignore', windowsHide: false })
        ch.unref()
        sendJson(res, 200, { ok: true, opened: found.path })
        return
      }
      // ---- بوابة توليد الصور المرجعية (مزود قابل للتهيئة) ---------------
      // ---- جسر ديب سيك داخل Godot: اكتشاف جلسة مساحة + آخر رد ------------
      if (p === '/tools/api/bridge/session' && req.method === 'GET') {
        const wsParam = url.searchParams.get('ws') ?? ''
        const found = workspacesOf(ctx).find(w => w.path === wsParam || w.id === wsParam)
        if (found === undefined) throw new Error(`مساحة العمل غير مسجّلة: ${wsParam}`)
        // فك ترميز أسماء مجلدات الجلسات (~XXXX → حرف) ومطابقة المعايَرة — أصلح من تخمين التشفير
        const decodeDir = (d: string): string => d.replace(/~([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/-/g, '/')
        // النقطتان في المحرف القرص تضيعان في الترميز (تتحولان لشرطة) — قارن بدونهما
        const norm = (s: string): string => s.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '').replace(/\/+$/, '').replace(/:/g, '').toLowerCase()
        const target = norm(found.path)
        const sessionsRoot = path.join(os.homedir(), '.dsh', 'sessions')
        const dirs = await fs.readdir(sessionsRoot).catch(() => [] as string[])
        let best: { id: string, mtime: number } | null = null
        for (const d of dirs) {
          const decoded = norm(decodeDir(d))
          if (!decoded.startsWith(target.slice(0, Math.max(8, Math.min(target.length, 24))))) continue
          try {
            const entries = await fs.readdir(path.join(sessionsRoot, d))
            for (const e of entries) {
              if (!e.startsWith('session-')) continue
              const st = await fs.stat(path.join(sessionsRoot, d, e))
              if (best === null || st.mtimeMs > best.mtime) best = { id: e, mtime: st.mtimeMs }
            }
          } catch { /* skip */ }
        }
        sendJson(res, 200, { ok: best !== null, sessionId: best?.id ?? null, hint: best === null ? 'افتح دردشة هارنس لهذا المشروع مرة واحدة لإنشاء الجلسة' : null })
        return
      }
      if (p === '/tools/api/bridge/last' && req.method === 'GET') {
        const sid = url.searchParams.get('session') ?? ''
        if (sid === '' || !/^session-[0-9a-f-]+$/.test(sid)) throw new Error('معرّف جلسة غير صالح')
        const sessionsRoot = path.join(os.homedir(), '.dsh', 'sessions')
        const dirs = await fs.readdir(sessionsRoot).catch(() => [] as string[])
        let logFile: string | null = null
        for (const d of dirs) {
          const t = path.join(sessionsRoot, d, sid, 'session.jsonl.zstd')
          if (await fs.stat(t).then(s => s.isFile()).catch(() => false)) { logFile = t; break }
        }
        if (logFile === null) throw new Error('سجل الجلسة غير موجود')
        const { scanZstdFrames, decompressZstdFrame } = await import(pathToFileUrlResolve(
          path.join(process.cwd(), 'packages', 'session', 'session-persistence-jsonl', 'src', 'zstd.ts')))
        const buf = await fs.readFile(logFile)
        const lines: string[] = []
        for (const fr of (scanZstdFrames(buf).frames ?? []).slice(-14)) {
          const text = (await decompressZstdFrame(buf.subarray(fr.start, fr.end))).toString('utf8')
          for (const l of text.split('\n')) if (l.trim() !== '') lines.push(l)
        }
        let lastText = ''
        let busy = false
        let pendingPrompt = ''
        for (const l of lines) {
          try {
            const ev = JSON.parse(l) as { data?: { type?: string, content?: unknown, message?: { role?: string, content?: unknown }, role?: string } }
            const d = ev.data ?? {}
            if (d.type === 'assistant/message' || d.role === 'assistant') {
              const c = d.content ?? d.message?.content
              const t = Array.isArray(c) ? c.filter((b: Record<string, unknown>) => b.type === 'text').map((b: Record<string, unknown>) => String(b.text)).join('\n') : typeof c === 'string' ? c : ''
              if (t.trim() !== '') { lastText = t; busy = false }
            } else if (d.type === 'user/message' || d.type === 'message' && d.role === 'user') {
              const c = d.content ?? d.message?.content
              const t = Array.isArray(c) ? c.map((b: Record<string, unknown>) => String((b as Record<string, unknown>).text ?? '')).join(' ') : typeof c === 'string' ? c : ''
              if (t.trim() !== '') { pendingPrompt = t; busy = true; lastText = '' }
            } else if (d.type === 'turn/end' || d.type === 'step/end') {
              busy = false
            }
          } catch { /* skip */ }
        }
        sendJson(res, 200, { text: lastText.slice(0, 4000), busy, pending: pendingPrompt.slice(0, 200), at: new Date().toISOString() })
        return
      }
      if (p === '/tools/api/imggen/settings' && req.method === 'GET') {
        const { loadImgGenConfig } = await import('./tool-imggen.ts')
        const c = await loadImgGenConfig()
        sendJson(res, 200, { baseUrl: c.baseUrl, model: c.model, keyPresent: c.key !== '', keyMasked: c.key === '' ? '' : c.key.slice(0, 5) + '…' + c.key.slice(-4) })
        return
      }
      if (p === '/tools/api/imggen/settings' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const g = await import('./tool-imggen.ts')
        const c = await g.loadImgGenConfig()
        if (typeof body.baseUrl === 'string' && body.baseUrl.trim() !== '') c.baseUrl = body.baseUrl.trim()
        if (typeof body.model === 'string' && body.model.trim() !== '') c.model = body.model.trim()
        if (typeof body.key === 'string' && body.key.trim() !== '') c.key = body.key.trim()
        if (body.key === null || body.key === '') c.key = c.key
        await g.saveImgGenConfig(c)
        sendJson(res, 200, { ok: true, keyPresent: c.key !== '' })
        return
      }
      if (p === '/tools/api/imggen/generate' && req.method === 'POST') {
        const { root } = resolveWs()
        const body = await readJsonBody(req)
        const { generateImages } = await import('./tool-imggen.ts')
        const out = await generateImages(root, String(body.prompt ?? ''), Number(body.n ?? 1))
        sendJson(res, 200, { ok: true, ...out })
        return
      }
      if (p === '/tools/api/imggen/key/test' && req.method === 'POST') {
        const { loadImgGenConfig } = await import('./tool-imggen.ts')
        const c = await loadImgGenConfig()
        if (c.key === '') throw new Error('مفتاح توليد الصور غير متوفر — أدخله أولًا')
        try {
          const r = await fetch(c.baseUrl.replace(/\/+$/, '') + '/models', { headers: { authorization: `Bearer ${c.key}` }, signal: AbortSignal.timeout(15000) })
          sendJson(res, 200, { valid: r.ok, message: r.ok ? 'المفتاح مقبول لدى المزود ✓' : `رد المزود ${r.status} — قد يكون المفتاح غير صالح أو مسار المزود يحتاج مراجعة` })
        } catch (err) {
          sendJson(res, 200, { valid: false, message: `تعذر الوصول للمزود: ${err instanceof Error ? err.message : String(err)}` })
        }
        return
      }
      if (p === '/tools/api/tripo/key' && req.method === 'GET') {
        const status = await tripoKeyStatus()
        sendJson(res, 200, status)
        return
      }
      if (p === '/tools/api/tripo/key' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const key = String(body.key ?? '').trim()
        if (key.length < 16) throw new Error('المفتاح قصير جداً — الصق مفتاح Tripo كاملاً (يبدأ عادة بـ tsk_)')
        await fs.mkdir(path.dirname(tripoKeyFile()), { recursive: true })
        await writeJson(tripoKeyFile(), { key, savedAt: new Date().toISOString() })
        // Takes effect immediately for every generation tool in this process.
        process.env.TRIPO_API_KEY = key
        sendJson(res, 200, { ok: true, ...(await tripoKeyStatus()) })
        return
      }
      if (p === '/tools/api/tripo/key/test' && req.method === 'POST') {
        const body = await readJsonBody(req).catch(() => ({}) as Record<string, unknown>)
        const key = String(body.key ?? '').trim() !== '' ? String(body.key).trim() : process.env.TRIPO_API_KEY ?? await readKeyFile()
        if (key === '') throw new Error('لا يوجد مفتاح لاختباره — احفظ مفتاحاً أولاً')
        sendJson(res, 200, await testTripoKey(key))
        return
      }
      // ---- وكيل الباحث: معزول، لا يعمل إلا بزر المستخدم -----------------
      if (p === '/tools/api/research' && req.method === 'GET') {
        const { loadResearch } = await import('./tool-research.ts')
        sendJson(res, 200, await loadResearch())
        return
      }
      if (p === '/tools/api/research' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const r = await import('./tool-research.ts')
        const s = await r.loadResearch()
        const action = String(body.action ?? '')
        if (action === 'start') {
          const goal = String(body.goal ?? '').trim()
          if (goal === '') throw new Error('اكتب هدف البحث أولًا')
          s.goal = goal
          s.running = true
          s.downloadsThisRun = 0
          s.downloads = []
          await r.saveResearch(s)
          void researchRun()   // خط الأنابيب يعمل بالخلفية دون تعطيل الرد
          sendJson(res, 200, { ok: true, state: s })
          return
        }
        if (action === 'stop') { s.running = false; r.logEvent(s, 'أوقفه المستخدم'); await r.saveResearch(s); sendJson(res, 200, { ok: true, state: s }); return }
        if (action === 'trial') {
          const staging = path.join(r.HARVEST_DIR(), 'staging')
          const result = await r.runTrialSandbox(staging)
          sendJson(res, 200, { ok: result.ok, checks: result.checks, state: s })
          return
        }
        if (action === 'approve') {
          const staging = path.join(r.HARVEST_DIR(), 'staging')
          let count = 0
          try { count = (await fs.readdir(staging)).length } catch { /* فارغة */ }
          const result = await r.approveTrial(s, staging, count)
          await r.saveResearch(s)
          sendJson(res, 200, { ok: result.ok, message: result.message, state: s })
          return
        }
        if (action === 'delete-version') {
          const result = await r.deleteVersion(s, String(body.name ?? ''))
          await r.saveResearch(s)
          sendJson(res, 200, { ok: result.ok, message: result.message, state: s })
          return
        }
        if (action === 'clear-goal') { s.goal = ''; s.downloads = []; await r.saveResearch(s); sendJson(res, 200, { ok: true, state: s }); return }
        throw new Error(`unknown research action: ${action}`)
      }
      // ---- عقل الوصي: سجل نماذج التشخيص (مفاتيح مقنعة، حفظ تلقائي) ------
      if (p === '/tools/api/guardian/models' && req.method === 'GET') {
        const g = await import('./tool-guardian.ts')
        const s = await g.loadModels()
        sendJson(res, 200, {
          activeId: s.activeId,
          models: s.models.map(m => ({ id: m.id, name: m.name, provider: m.provider, baseUrl: m.baseUrl, model: m.model, keyMasked: m.apiKey.length > 6 ? '••••' + m.apiKey.slice(-4) : '••••' })),
        })
        return
      }
      if (p === '/tools/api/guardian/models' && req.method === 'POST') {
        const g = await import('./tool-guardian.ts')
        const s = await g.loadModels()
        const body = await readJsonBody(req)
        const action = String(body.action ?? '')
        if (action === 'add') {
          const name = String(body.name ?? '').trim(), provider = String(body.provider ?? '').trim()
          const model = String(body.model ?? '').trim(), baseUrl = String(body.baseUrl ?? '').trim(), apiKey = String(body.apiKey ?? '').trim()
          if (!name || !provider || !model || !baseUrl || !apiKey) throw new Error('أكمل كل الحقول')
          if (!/^https?:\/\//.test(baseUrl)) throw new Error('Base URL يجب أن يبدأ بـ http(s)://')
          const m: g.GuardianModel = { id: 'gm-' + Date.now(), name, provider, model, baseUrl, apiKey }
          const test = await g.testModel(m)
          s.models.push(m)
          if (s.activeId === null || test.ok) s.activeId = m.id
          await g.saveModels(s)
          sendJson(res, 200, { ok: true, test })
          return
        }
        if (action === 'select') {
          const m = s.models.find(x => x.id === String(body.id ?? ''))
          if (m === undefined) throw new Error('نموذج غير موجود')
          const test = await g.testModel(m)
          s.activeId = m.id
          await g.saveModels(s)
          sendJson(res, 200, { ok: true, test, name: m.name, provider: m.provider })
          return
        }
        if (action === 'test') {
          const m = s.models.find(x => x.id === String(body.id ?? ''))
          if (m === undefined) throw new Error('نموذج غير موجود')
          sendJson(res, 200, { ok: true, test: await g.testModel(m), name: m.name, provider: m.provider })
          return
        }
        if (action === 'delete') {
          s.models = s.models.filter(x => x.id !== String(body.id ?? ''))
          if (s.activeId === String(body.id ?? '')) s.activeId = s.models[0]?.id ?? null
          await g.saveModels(s)
          sendJson(res, 200, { ok: true })
          return
        }
        throw new Error('action غير معروف')
      }
      // ---- لغة الواجهة الحالية (يستخدمها الوكيل لبناء المحتوى بنفس اللغة) ----
      if (p === '/tools/api/ui-lang' && (req.method === 'POST' || req.method === 'GET')) {
        const file = path.join(os.homedir(), '.dsh-tools', 'ui-lang.json')
        if (req.method === 'POST') {
          const body = await readJsonBody(req)
          const l = String(body.lang ?? '')
          if (l === 'ar' || l === 'en' || l === 'zh') {
            await fs.mkdir(path.dirname(file), { recursive: true })
            await fs.writeFile(file, JSON.stringify({ lang: l }), 'utf8')
            sendJson(res, 200, { ok: true, lang: l })
          } else sendJson(res, 400, { ok: false, error: 'lang must be ar|en|zh' })
          return
        }
        const cur = await fs.readFile(file, 'utf8').then(t => (JSON.parse(t) as { lang?: string }).lang ?? 'ar').catch(() => 'ar')
        sendJson(res, 200, { lang: cur })
        return
      }
      if (p === '/tools/api/guardian' && req.method === 'GET') {
        const { loadGuardian, detectProblems } = await import('./tool-guardian.ts')
        const s = await loadGuardian()
        // فحص لحظي عند الطلب حتى لو كان الوكيل معطلاً (قراءة فقط، لا اقتراحات تُنفذ)
        if (s.enabled) {
          try {
            const { mergeNewProposals } = await import('./tool-guardian.ts')
            mergeNewProposals(s, await detectProblems(workspacesOf(ctx)))
            await (await import('./tool-guardian.ts')).saveGuardian(s)
          } catch (detectErr) {
            console.warn('[guardian] detection error (non-fatal):', String(detectErr).slice(0, 200))
          }
        }
        sendJson(res, 200, s)
        return
      }
      if (p === '/tools/api/guardian' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const g = await import('./tool-guardian.ts')
        const s = await g.loadGuardian()
        if (body.enabled !== undefined) s.enabled = Boolean(body.enabled)
        if (body.intervalMin !== undefined) {
          const n = Number(body.intervalMin)
          if (n === 10 || n === 15 || n === 20) s.intervalMin = n
        }
        if (body.action === 'scan-now') {
          try { await mergeNewProposalsSafe(s, await g.detectProblems(workspacesOf(ctx))) }
          catch (scanErr) { console.warn('[guardian] scan error (non-fatal):', String(scanErr).slice(0, 200)) }
        }
        if (body.action === 'decide' && body.id !== undefined) {
          if (body.accept === true) {
            const r = await g.acceptProposal(s, String(body.id))
            await g.saveGuardian(s)
            // اقتراحات أخطاء الجلسات: بعد القبول أرسل التوجيه الصحيح للوكيل في جلسته فوراً
            if (r.ok && /^err-/.test(String(body.id))) {
              const prop = s.proposals.find(x => x.id === String(body.id))
              const corrective = prop?.meta?.corrective
              const sessionId = prop?.meta?.sessionId
              if (corrective !== undefined && sessionId !== undefined) {
                try {
                  const port = req.socket.localPort
                  await fetch(`http://127.0.0.1:${port}/api/session.prompt`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                      type: 'client-request',
                      rpcId: `guardian-${Date.now()}`,
                      method: 'session.prompt',
                      payload: { sessionId, mode: 'queue', content: [{ type: 'text', text: corrective + '\n(توجيه تصحيحي تلقائي من وكيل الصيانة — بموافقة العميل)' }] },
                    }),
                    signal: AbortSignal.timeout(8000),
                  })
                } catch { /* الجلسة قد تكون مغلقة — التوجيه يبقى مسجلاً في الاقتراح */ }
              }
            }
            sendJson(res, 200, { ok: r.ok, message: r.message, state: s }); return
          }
          if (body.accept === false) { g.rejectProposal(s, String(body.id)); await g.saveGuardian(s); sendJson(res, 200, { ok: true, state: s }); return }
        }
        if (body.action === 'undo' && body.id !== undefined) {
          const r = await g.undoAccepted(s, String(body.id))
          await g.saveGuardian(s)
          sendJson(res, 200, { ok: r.ok, message: r.message, state: s })
          return
        }
        await g.saveGuardian(s)
        restartGuardianLoop()
        sendJson(res, 200, { ok: true, state: s })
        return
      }
      if (p === '/tools/api/health' && req.method === 'GET') {
        const mem = process.memoryUsage()
        sendJson(res, 200, {
          ok: true,
          node: process.version,
          platform: `${os.platform()} ${os.arch()}`,
          uptime_sec: Math.round(process.uptime()),
          rss_mb: Math.round(mem.rss / 1048576),
          heap_used_mb: Math.round(mem.heapUsed / 1048576),
          heap_total_mb: Math.round(mem.heapUsed / 1048576) + Math.round((mem.heapTotal - mem.heapUsed) / 1048576),
          free_mem_mb: Math.round(os.freemem() / 1048576),
          total_mem_mb: Math.round(os.totalmem() / 1048576),
          cpus: os.cpus().length,
          workspaces: workspacesOf(ctx).length,
          auto_agents_running: listAutoAgents().filter(a => a.status === 'running').length,
          ts: new Date().toISOString(),
        })
        return
      }

      if (p === '/tools/api/files/tree' && req.method === 'GET') {
        const { root } = resolveWs()
        const entries = await walk(root, { maxEntries: 4000, maxDepth: 14 })
        type Node = { name: string; path: string; type: 'dir' | 'file'; size?: number; children?: Node[] }
        const root_ = root
        const tree: Node = { name: path.basename(root_) || root_, path: '', type: 'dir', children: [] }
        const dirIndex = new Map<string, Node>([['', tree]])
        for (const e of entries) {
          const parentRel = path.posix.dirname(e.rel === '' ? '.' : e.rel)
          const parentKey = parentRel === '.' ? '' : parentRel
          const parent = dirIndex.get(parentKey)
          if (parent === undefined) continue
          if (e.isFile) {
            parent.children!.push({ name: path.posix.basename(e.rel), path: e.rel, type: 'file', size: e.size })
          } else {
            const node: Node = { name: path.posix.basename(e.rel), path: e.rel, type: 'dir', children: [] }
            parent.children!.push(node)
            dirIndex.set(e.rel, node)
          }
        }
        sendJson(res, 200, { tree })
        return
      }

      if (p === '/tools/api/files/read' && req.method === 'GET') {
        const { root } = resolveWs()
        const target = safeJoin(root, url.searchParams.get('p') ?? '')
        const data = await fs.readFile(target)
        const asText = isTextFile(target) && !data.includes(0)
        sendJson(res, 200, { path: url.searchParams.get('p'), size: data.length, text: asText ? data.toString('utf8') : null })
        return
      }

      if (p === '/tools/api/files/write' && req.method === 'POST') {
        const { root } = resolveWs()
        const body = await readJsonBody(req)
        const rel = String(body.p ?? '')
        const content = String(body.content ?? '')
        if (rel === '') throw new Error('File path required. / مسار الملف مطلوب')
        const target = safeJoin(root, rel)
        await captureQuiet(ctx, root, target, 'hub-write')
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.writeFile(target, content, 'utf8')
        ok(res)
        return
      }

      if (p === '/tools/api/files/mkdir' && req.method === 'POST') {
        const { root } = resolveWs()
        const body = await readJsonBody(req)
        await fs.mkdir(safeJoin(root, String(body.p ?? '')), { recursive: true })
        ok(res)
        return
      }

      if (p === '/tools/api/files/delete' && req.method === 'POST') {
        const { root } = resolveWs()
        const body = await readJsonBody(req)
        const target = safeJoin(root, String(body.p ?? ''))
        await captureQuiet(ctx, root, target, 'hub-delete')
        await fs.rm(target, { recursive: true, force: true })
        ok(res)
        return
      }

      if (p === '/tools/api/files/move' && req.method === 'POST') {
        const { root } = resolveWs()
        const body = await readJsonBody(req)
        const from = safeJoin(root, String(body.from ?? ''))
        const to = safeJoin(root, String(body.to ?? ''))
        if (from === to) { ok(res); return }
        await fs.mkdir(path.dirname(to), { recursive: true })
        await fs.rename(from, to)
        ok(res)
        return
      }

      if (p === '/tools/api/kanban' && req.method === 'GET') {
        const { root } = resolveWs()
        const board = await readJson<{ columns?: Record<string, Array<{ id: string; text: string }>> }>(path.join(toolsDirFor(root), 'kanban.json'), {})
        sendJson(res, 200, board)
        return
      }
      if (p === '/tools/api/kanban' && req.method === 'POST') {
        const { root } = resolveWs()
        const body = await readJsonBody(req)
        await writeJson(path.join(toolsDirFor(root), 'kanban.json'), body)
        ok(res)
        return
      }

      if (p === '/tools/api/versions' && req.method === 'GET') {
        const { root } = resolveWs()
        sendJson(res, 200, { snapshots: await listSnapshots(root, url.searchParams.get('p') ?? undefined) })
        return
      }
      if (p === '/tools/api/versions/get' && req.method === 'GET') {
        const { root } = resolveWs()
        const snap = await getSnapshotContent(root, url.searchParams.get('id') ?? '')
        if (snap === undefined) throw new Error('Snapshot not found — refresh version history. / اللقطة غير موجودة')
        const current = await fs.readFile(path.resolve(root, snap.meta.rel)).catch(() => null)
        sendJson(res, 200, {
          meta: snap.meta,
          content: snap.content.includes(0) ? snap.content.toString('base64') : snap.content.toString('utf8'),
          current: current === null ? null : current.includes(0) ? null : current.toString('utf8'),
        })
        return
      }
      if (p === '/tools/api/versions/restore' && req.method === 'POST') {
        const { root } = resolveWs()
        const body = await readJsonBody(req)
        const meta = await restoreSnapshot(root, String(body.id ?? ''))
        if (meta === undefined) throw new Error('Snapshot not found — refresh version history. / اللقطة غير موجودة')
        sendJson(res, 200, { ok: true, restored: meta })
        return
      }

      if (p === '/tools/api/agents' && req.method === 'GET') {
        sendJson(res, 200, { agents: listAutoAgents() })
        return
      }

      if (p === '/tools/api/screenshot' && req.method === 'GET') {
        const { root } = resolveWs()
        const target = url.searchParams.get('url') ?? 'http://localhost:3000'
        const shot = await captureScreenshot(root, target, Number(url.searchParams.get('w')) || 1280, Number(url.searchParams.get('h')) || 800)
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' })
        res.end(shot.png)
        return
      }

      if (p === '/tools/api/agent-todos' && req.method === 'GET') {
        const { root } = resolveWs()
        const { readAgentTodos } = await import('./tool-todos-sync.ts')
        sendJson(res, 200, (await readAgentTodos(root)) ?? { todos: [], counts: { pending: 0, inProgress: 0, completed: 0 }, updatedAt: null })
        return
      }

      if (p === '/tools/api/search' && req.method === 'GET') {
        const { root } = resolveWs()
        const query = (url.searchParams.get('q') ?? '').trim()
        if (query === '') { sendJson(res, 200, { results: [], scanned: 0 }); return }
        const entries = (await walk(root, { maxEntries: 5000 })).filter(e => e.isFile && isTextFile(e.rel) && e.size < 1_500_000 && !e.rel.startsWith('.dsh-tools/'))
        const needle = query.toLowerCase()
        const results: Array<{ file: string; line: number; text: string }> = []
        let scanned = 0
        outer:
        for (const e of entries) {
          scanned += 1
          let content: string
          try {
            content = await fs.readFile(e.abs, 'utf8')
          } catch {
            continue
          }
          const lines = content.split('\n')
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(needle)) {
              results.push({ file: e.rel, line: i + 1, text: lines[i].trim().slice(0, 200) })
              if (results.length >= 150) break outer
            }
          }
        }
        sendJson(res, 200, { results, scanned, truncated: results.length >= 150 })
        return
      }
      if (p === '/tools/api/agents/stop' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const run = getAutoAgent(String(body.id ?? ''))
        if (run === undefined) throw new Error('Agent not found — refresh the agent list. / الوكيل غير موجود')
        run.stop()
        ok(res)
        return
      }

      if (p === '/tools/api/git/status' && req.method === 'GET') {
        const { root } = resolveWs()
        sendJson(res, 200, { result: (await git(root, ['status', '-b', '--porcelain'])).out })
        return
      }
      if (p === '/tools/api/git/diff' && req.method === 'GET') {
        const { root } = resolveWs()
        sendJson(res, 200, { result: (await git(root, ['diff', 'HEAD'])).out })
        return
      }
      if (p === '/tools/api/git/commit' && req.method === 'POST') {
        const { root } = resolveWs()
        const body = await readJsonBody(req)
        const msg = String(body.message ?? '').trim()
        if (msg === '') throw new Error('Commit message required — describe your changes. / اكتب وصفاً للتغييرات')
        const r = await git(root, ['commit', '-am', msg])
        sendJson(res, 200, { code: r.code, result: r.out })
        return
      }

      if (p === '/tools/api/email/config' && req.method === 'GET') {
        const { root } = resolveWs()
        const cfg = await readJson<Partial<SmtpConfig>>(path.join(toolsDirFor(root), 'smtp.json'), {})
        sendJson(res, 200, { config: { ...cfg, pass: cfg.pass !== undefined && cfg.pass !== '' ? '••••' : '' } })
        return
      }
      if (p === '/tools/api/email/config' && req.method === 'POST') {
        const { root } = resolveWs()
        const body = await readJsonBody(req)
        const file = path.join(toolsDirFor(root), 'smtp.json')
        const prev = await readJson<Partial<SmtpConfig>>(file, {})
        const next: Partial<SmtpConfig> = {
          host: String(body.host ?? prev.host ?? ''),
          port: Number(body.port ?? prev.port ?? 465),
          secure: Boolean(body.secure ?? prev.secure ?? true),
          user: String(body.user ?? prev.user ?? ''),
          pass: String(body.pass ?? '') === '••••' || String(body.pass ?? '') === '' ? prev.pass ?? '' : String(body.pass),
          fromName: String(body.fromName ?? prev.fromName ?? 'الأدوات'),
          fromAddress: String(body.fromAddress ?? prev.fromAddress ?? ''),
        }
        await writeJson(file, next)
        ok(res)
        return
      }
      if (p === '/tools/api/email/send' && req.method === 'POST') {
        const { root, meta } = resolveWs()
        const body = await readJsonBody(req)
        const to = String(body.to ?? '')
        if (to === '' || !to.includes('@')) throw new Error('Valid recipient email required. / أدخل بريد مستلم صالحاً')
        const cfg = await readJson<SmtpConfig>(path.join(toolsDirFor(root), 'smtp.json'), {} as Partial<SmtpConfig> as SmtpConfig)
        if (cfg.host === undefined || cfg.host === '') throw new Error('SMTP not configured — save settings first')
        const entries = (await walk(root, { maxEntries: 8000 })).filter(e => e.isFile && e.size < 32 * 1024 * 1024)
        const files = []
        for (const e of entries) files.push({ path: e.rel, data: await fs.readFile(e.abs) })
        const zip = buildZip(files)
        await sendMail(cfg, {
          to,
          subject: `أرشيف المشروع: ${path.basename(meta.path || 'workspace')}`,
          text: `أرشيف المشروع من DeepSeek Harness — الأدوات.\nWorkspace: ${meta.path}\nFiles: ${files.length}\nZip size: ${(zip.length / 1048576).toFixed(2)} MB`,
          attachments: [{ filename: `${path.basename(meta.path || 'workspace')}.zip`, content: zip }],
        })
        sendJson(res, 200, { ok: true, sent_bytes: zip.length, files: files.length })
        return
      }

      sendJson(res, 404, { error: `not found: ${req.method} ${p}` })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[tools] فشل طلب', req.method, p, '—', msg)
      sendJson(res, 400, { error: msg })
    }
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/tools', handler: dispatch }), 'tool-http: /tools')
}

/** Snapshot before hub-side mutations so version history covers manual edits too. */
async function captureQuiet(ctx: Context, root: string, absPath: string, cause: string): Promise<void> {
  try {
    const mod = await import('./tool-versions.ts')
    await mod.captureSnapshot(root, absPath, cause)
  } catch {
    // Version history is best-effort.
  }
}
