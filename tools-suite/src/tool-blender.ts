/**
 * tool-blender.ts — Headless Blender integration + Blender→Godot asset pipeline.
 *
 * No MCP addon, no running GUI: every call spawns `blender --background
 * --factory-startup --python <script>` and parses a JSON result printed
 * between @@DSH_BEGIN@@ / @@DSH_END@@ markers, so stdout noise from the
 * operator log never corrupts the payload.
 *
 * Tools:
 *   - blender_code   : run arbitrary bpy Python code headless (bpy preloaded).
 *   - asset_pipeline : import model → apply ops → export GLB → Godot import.
 *
 * Binary resolution order: tools-suite/blender/blender.exe (auto-downloaded by
 * the launcher), BLENDER_PATH env, versioned Program Files install.
 */
import { spawn } from 'node:child_process'
import { promises as fs, constants as fsConstants } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateAssetOps, engineLogErrors, engineRunPassed } from './lib/engine-contract.ts'
import { safeJoin } from './lib/util.ts'
import { buildGameGuide } from './lib/game-build-guide.ts'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-blender'
export const inject = ['tools']

const SUITE_DIR = fileURLToPath(new URL('../', import.meta.url))
export const BLENDER_DIR = path.join(SUITE_DIR, 'blender')
export const GODOT_EXE = path.join(SUITE_DIR, 'godot', 'Godot.exe')

const RESULT_BEGIN = '@@DSH_BEGIN@@'
const RESULT_END = '@@DSH_END@@'

function resolveWorkspace(exec: unknown): string {
  const cwd = (exec as { agent?: { session?: { header?: { cwd?: string } } } })?.agent?.session?.header?.cwd
  if (typeof cwd !== 'string' || cwd === '') throw new Error('no workspace selected for this session')
  return cwd
}

interface RunResult { code: number | null, out: string, timedOut: boolean }

/** Spawn + capture with a hard timeout; kills the whole process tree on Windows. */
export function runCaptured(exe: string, args: string[], opts: { cwd?: string, timeoutMs: number, env?: NodeJS.ProcessEnv }): Promise<RunResult> {
  return new Promise((resolve) => {
    let settled = false
    let timedOut = false
    const child = spawn(exe, args, { cwd: opts.cwd, windowsHide: true, env: opts.env })
    let out = ''
    child.stdout.on('data', (d: Buffer) => { out = (out + d.toString()).slice(-400_000) })
    child.stderr.on('data', (d: Buffer) => { out = (out + d.toString()).slice(-400_000) })
    const finish = (r: RunResult) => { if (!settled) { settled = true; clearTimeout(timer); resolve(r) } }
    const timer = setTimeout(() => {
      timedOut = true
      if (child.pid !== undefined && process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill('SIGKILL'))
      } else {
        child.kill('SIGKILL')
      }
      // Resolve on close, after the engine is terminated and output streams drain.
    }, opts.timeoutMs)
    child.on('error', (err) => finish({ code: -1, out: out + String(err), timedOut: false }))
    child.on('close', (code) => finish({ code, out, timedOut }))
  })
}

/** Extract the JSON payload between the markers; null when absent/truncated. */
function parseMarkers(out: string): { ok: boolean, log?: string, error?: string, [k: string]: unknown } | null {
  const i = out.lastIndexOf(RESULT_BEGIN)
  const j = out.lastIndexOf(RESULT_END)
  if (i === -1 || j === -1 || j <= i) return null
  const body = out.slice(i + RESULT_BEGIN.length, j).trim()
  try {
    return JSON.parse(body) as { ok: boolean, log?: string, error?: string }
  } catch {
    return null
  }
}

export async function resolveBlender(): Promise<string | null> {
  const candidates = [
    path.join(BLENDER_DIR, 'blender.exe'),
    process.env.BLENDER_PATH ?? '',
    'C:\\Program Files\\Blender Foundation\\blender.exe',
  ].filter(p => p !== '')
  for (const c of candidates) {
    try { await fs.access(c, fsConstants.F_OK); return c } catch { /* next */ }
  }
  // Versioned installers: Program Files\Blender Foundation\Blender 4.5\blender.exe
  for (const root of ['C:\\Program Files\\Blender Foundation', 'C:\\Program Files (x86)\\Blender Foundation']) {
    let entries: string[] = []
    try { entries = await fs.readdir(root) } catch { continue }
    for (const e of entries.sort().reverse()) {
      const candidate = path.join(root, e, 'blender.exe')
      try { await fs.access(candidate, fsConstants.F_OK); return candidate } catch { /* next */ }
    }
  }
  return null
}

let blenderCache: { at: number, exe: string | null, version: string | null } | null = null

export function clearBlenderCache(): void { blenderCache = null }

export async function blenderStatus(): Promise<{ installed: boolean, path: string | null, version: string | null }> {
  const now = Date.now()
  if (blenderCache !== null && now - blenderCache.at < 60_000) {
    return { installed: blenderCache.exe !== null, path: blenderCache.exe, version: blenderCache.version }
  }
  const exe = await resolveBlender()
  let version: string | null = null
  if (exe !== null) {
    const r = await runCaptured(exe, ['--version'], { timeoutMs: 20_000 })
    version = /Blender (\d+\.\d+\.\d+)/.exec(r.out)?.[1] ?? null
  }
  blenderCache = { at: now, exe, version }
  return { installed: exe !== null, path: exe, version }
}

export async function resolveGodot(): Promise<string | null> {
  const directory = path.dirname(GODOT_EXE)
  const files = await fs.readdir(directory).catch(() => [] as string[])
  const candidates = [process.env.GODOT_PATH ?? '', ...files.filter(f => f.endsWith('_console.exe')).sort().reverse().map(f => path.join(directory, f)), GODOT_EXE]
  for (const candidate of candidates) {
    if (!candidate) continue
    // Godot Windows console launchers require their same-basename GUI sibling.
    if (candidate.endsWith('_console.exe') && !await fs.access(candidate.replace('_console.exe', '.exe')).then(() => true).catch(() => false)) continue
    if (await fs.stat(candidate).then(s => s.isFile()).catch(() => false)) return candidate
  }
  return null
}

export async function godotInstalled(): Promise<boolean> { return (await resolveGodot()) !== null }

const NOT_INSTALLED_HINT = 'Blender غير مثبت — شغّل «تشغيل-الهارنس-v3.bat» لتنزيله تلقائياً (لمرة واحدة)، أو ثبّته من blender.org، أو اضبط متغير البيئة BLENDER_PATH على مسار blender.exe'

/* Python wrapper for blender_code. The user program is written to a sibling
 * .user file and exec'd with bpy preloaded; stdout during exec is captured.
 * This string intentionally contains no backslashes or ${ sequences. */
const CODE_HEAD = [
  'import bpy, json, traceback, io, contextlib',
  '_g = {"bpy": bpy, "__name__": "__dsh__"}',
  '_result = {"ok": False, "log": "", "error": None}',
  '_cap = io.StringIO()',
  'try:',
  '    with contextlib.redirect_stdout(_cap):',
  '        exec(compile(open(__file__ + ".user", encoding="utf-8").read(), "<dsh-blender>", "exec"), _g)',
  '    _result["ok"] = True',
  'except BaseException:',
  '    _result["error"] = traceback.format_exc(limit=8)[-4000:]',
  'finally:',
  '    _result["log"] = _cap.getvalue()[-4000:]',
  'print("@@DSH_BEGIN@@")',
  'print(json.dumps(_result))',
  'print("@@DSH_END@@")',
  '',
].join('\n')

/* Static pipeline script. Receives its payload path as the last argv entry.
 * This string intentionally contains no backslashes or ${ sequences. */
const PIPELINE_SCRIPT_URL = new URL('./lib/asset-pipeline.py', import.meta.url)

/** Run Blender headless on a prepared script dir; returns parsed payload. */
async function runBlenderScript(exe: string, scriptName: string, extraFiles: Array<{ name: string, content: string }>, timeoutMs: number): Promise<{ payload: { ok: boolean, log?: string, error?: string, [k: string]: unknown } | null, raw: RunResult }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-blender-'))
  try {
    const scriptAbs = path.join(dir, scriptName)
    await fs.writeFile(scriptAbs, scriptName === 'pipeline.py' ? await fs.readFile(PIPELINE_SCRIPT_URL, 'utf8') : CODE_HEAD, 'utf8')
    const args = ['--background', '--factory-startup', '--python', scriptAbs]
    // JSON payloads are passed after `--` so Blender hands them to the script untouched.
    const payloadFile = extraFiles.find(f => f.name.endsWith('.json'))
    for (const f of extraFiles) await fs.writeFile(path.join(dir, f.name), f.content, 'utf8')
    if (payloadFile !== undefined) args.push('--', path.join(dir, payloadFile.name))
    const raw = await runCaptured(exe, args, { timeoutMs })
    return { payload: parseMarkers(raw.out), raw }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => { /* temp cleanup is best-effort */ })
  }
}

async function godotImport(projectDir: string): Promise<{ imported: boolean, note: string }> {
  if (!(await godotInstalled())) return { imported: false, note: 'Godot غير مثبت — شغّل «تشغيل-الهارنس-v3.bat» لتنزيله؛ الملف المصدَّر جاهز بالفعل في الأصول' }
  const exe = await resolveGodot()
  const r1 = await runCaptured(exe as string, ['--headless', '--editor', '--import', '--quit', '--path', projectDir], { cwd: projectDir, timeoutMs: 120_000 })
  if (engineRunPassed(r1)) return { imported: true, note: 'godot --import ok' }
  const r2 = await runCaptured(exe as string, ['--headless', '--editor', '--quit', '--path', projectDir], { timeoutMs: 120_000 })
  if (engineRunPassed(r2)) return { imported: true, note: 'godot editor refresh ok' }
  return { imported: false, note: ('godot import failed: ' + (r2.out || r1.out)).slice(0, 400) }
}

export async function verifyGodot(root: string, frames = 240) {
  if (!Number.isInteger(frames) || frames < 1 || frames > 3600) throw new Error('frames must be an integer from 1 to 3600')
  const project = await fs.readFile(path.join(root, 'project.godot'), 'utf8')
  if (!project.includes('run/main_scene')) throw new Error('No run/main_scene configured in project.godot')
  const exe = await resolveGodot()
  if (!exe) throw new Error('Godot not installed — configure GODOT_PATH or install it from the tools hub')
  const version = await runCaptured(exe, ['--version'], { cwd: root, timeoutMs: 20000 })
  const imported = await runCaptured(exe, ['--headless', '--editor', '--import', '--quit', '--path', root], { cwd: root, timeoutMs: 120000 })
  const ran = engineRunPassed(imported) ? await runCaptured(exe, ['--headless', '--path', root, '--quit-after', String(frames)], { cwd: root, timeoutMs: 120000 }) : null
  return {
    ok: engineRunPassed(imported) && ran !== null && engineRunPassed(ran),
    executable: exe, version: version.out.trim(), requested_frames: frames,
    import: { ok: engineRunPassed(imported), exit_code: imported.code, timed_out: imported.timedOut, errors: engineLogErrors(imported.out), tail: imported.out.slice(-4000) },
    runtime: ran ? { ok: engineRunPassed(ran), exit_code: ran.code, timed_out: ran.timedOut, errors: engineLogErrors(ran.out), tail: ran.out.slice(-4000) } : null,
    limitations: ['Headless import/runtime smoke only; does not prove camera visibility, physics behavior, control quality or physical-device performance.', 'Project scripts may quit before the requested frame count; requested_frames is an upper bound, not measured frames.'],
  }
}

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'game_build_guide',
    description: 'Get a genre-neutral engineering plan for Godot, Three.js or Blender: input, physics, camera, animation, asset preservation, mobile/tablet/desktop/web acceptance tests. Use before implementation; this returns guidance, not a generated game or quality guarantee.',
    parameters: {
      engine: { type: 'string', required: true, description: 'godot | three | blender' },
      dimension: { type: 'string', required: true, description: '2d | 3d' },
      platforms: { type: 'array', required: true, items: { type: 'string' }, description: 'Requested targets: desktop, mobile, tablet, web' },
      genre: { type: 'string', description: 'Client-requested genre/style; never default all projects to the same type' },
    },
    output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }] },
    async execute(args) { return buildGameGuide(args.engine, args.dimension, args.platforms as string[], args.genre) },
  }))
  ctx.tools.register(defineTool({
    name: 'godot_verify',
    description: 'Import and run the current Godot project headlessly (default 240-frame upper bound). Reject nonzero exits, timeouts and SCRIPT ERROR/ERROR logs even when Godot exits 0. Runs project scripts and may update .godot imports. Does not certify visible content, physics or human-like controls; perform viewport and device tests separately.',
    parameters: { frames: { type: 'number', description: 'Frame upper bound: 1..3600, default 240' } },
    output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }] },
    async execute(args, exec) { return verifyGodot(resolveWorkspace(exec), args.frames ?? 240) },
  }))
  ctx.tools.register(defineTool({
    name: 'blender_code',
    description: 'Execute Python (bpy) code in a headless Blender — no GUI, no MCP addon. Each call is an isolated factory-startup session. bpy is preloaded. Build, modify, and inspect scenes/models programmatically; returns { ok, log, error }. Blender is auto-resolved from tools-suite/blender (downloaded by the launcher), BLENDER_PATH, or Program Files.',
    parameters: {
      code: { type: 'string', required: true, description: 'Python code using the bpy API (Blender 4.x)' },
    },
    output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }] },
    async execute(args) {
      const status = await blenderStatus()
      if (!status.installed) throw new Error(NOT_INSTALLED_HINT)
      const { payload, raw } = await runBlenderScript(status.path as string, 'script.py', [{ name: 'script.py.user', content: String(args.code) }], 180_000)
      if (raw.timedOut) throw new Error('انتهت مهلة Blender (180 ثانية) — قسّم العملية إلى خطوات أصغر')
      if (payload === null) {
        return { ok: false, error: 'لم يصل رد صالح من Blender', exit_code: raw.code, tail: raw.out.slice(-1500) }
      }
      if (raw.code !== 0) return { ...payload, ok: false, error: payload.error ?? 'Blender exited with code ' + raw.code }
      return payload
    },
  }))

  ctx.tools.register(defineTool({
    name: 'asset_pipeline',
    description: 'Blender→GLB→Godot pipeline in one call: imports a model (glb/gltf/fbx/obj/ply/stl), applies ordered ops, exports a clean GLB into the workspace, then refreshes a Godot project headlessly. Ops: apply_transforms (bake rotation+scale), origin_to_floor (pivot bottom-center), rotate {axis,degrees}, normalize_size {fit_m}, decimate {ratio}, collision {ratio,suffix} — collision emits a low-poly proxy mesh named <base>-col which Godot can map to collision. Whole-asset transforms preserve hierarchy; rigged or animated assets reject destructive apply/decimate/collision operations. Use -col for static concave proxies or -convcol for convex proxies; collision must be last. Never overwrites the source. Reports bounds and fails if requested Godot import fails.',
    parameters: {
      source: { type: 'string', required: true, description: 'Model path inside the workspace (or absolute): glb/gltf/fbx/obj/ply/stl' },
      out_path: { type: 'string', description: 'Output GLB path inside the workspace — default assets/3d/<name>-fix.glb' },
      ops: {
        type: 'array',
        description: 'Ordered operations, e.g. [{op:"rotate",args:{axis:"X",degrees:-90}},{op:"apply_transforms"},{op:"origin_to_floor"},{op:"collision",args:{ratio:0.25}}]',
        items: {
          type: 'object',
          additionalProperties: true,
          properties: {
            op: { type: 'string', required: true, description: 'apply_transforms | origin_to_floor | rotate | normalize_size | decimate | collision' },
            args: { type: 'object', additionalProperties: true, description: 'op-specific args' },
          },
        },
      },
      godot_import: { type: 'boolean', description: 'Refresh the Godot project after export (default true when the workspace is a Godot project)' },
    },
    output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }] },
    async execute(args, exec) {
      const status = await blenderStatus()
      if (!status.installed) throw new Error(NOT_INSTALLED_HINT)
      const root = resolveWorkspace(exec)
      const srcAbs = path.isAbsolute(String(args.source)) ? path.resolve(String(args.source)) : path.resolve(root, String(args.source))
      await fs.access(srcAbs).catch(() => { throw new Error(`المصدر غير موجود: ${String(args.source)}`) })
      const base = path.basename(srcAbs, path.extname(srcAbs))
      const outRel = args.out_path !== undefined && args.out_path !== '' ? String(args.out_path) : `assets/3d/${base}-fix.glb`
      const outAbs = safeJoin(root, path.isAbsolute(outRel) ? path.relative(root, outRel) : outRel)
      if (path.extname(outAbs).toLowerCase() !== '.glb') throw new Error('Output must end in .glb')
      if (outAbs.toLowerCase() === srcAbs.toLowerCase()) throw new Error('Output must differ from source — original assets are preserved')
      const ops = validateAssetOps(args.ops)
      const payload = { source: srcAbs, out: outAbs, ops: ops.map((o: { op?: unknown, args?: unknown }) => ({ op: String((o as { op?: string })?.op ?? ''), args: ((o as { args?: Record<string, unknown> })?.args ?? {}) })) }
      const { payload: result, raw } = await runBlenderScript(status.path as string, 'pipeline.py', [{ name: 'payload.json', content: JSON.stringify(payload) }], 180_000)
      if (raw.timedOut) throw new Error('انتهت مهلة Blender (180 ثانية) — قلّل عدد العمليات أو حجم المجسم')
      const pipelineOk = result?.ok === true && raw.code === 0 && !raw.timedOut
      const godotWanted = args.godot_import === undefined ? true : Boolean(args.godot_import)
      let godot: { imported: boolean, note: string } | null = null
      let godotRequired = false
      if (pipelineOk && godotWanted) {
        const isGodotProject = await fs.access(path.join(root, 'project.godot')).then(() => true).catch(() => false)
        if (isGodotProject) { godotRequired = true; godot = await godotImport(root) }
        else godot = { imported: false, note: 'مساحة العمل ليست مشروع Godot (لا يوجد project.godot) — تم التصدير فقط' }
      }
      return {
        ok: pipelineOk && (!godotRequired || godot?.imported === true),
        error: result?.error ?? (raw.code !== 0 ? 'Blender process failed: ' + raw.code : godotRequired && !godot?.imported ? godot?.note : null),
        blender: status.path,
        source: path.relative(root, srcAbs).replace(/\\/g, '/'),
        out: path.relative(root, outAbs).replace(/\\/g, '/'),
        ops_applied: (result?.ops_applied as string[] | undefined) ?? [],
        objects: result?.objects ?? 0,
        bounds_m: result?.bounds_m ?? null,
        rigged: result?.rigged ?? false,
        animated: result?.animated ?? false,
        godot,
        tail: pipelineOk ? undefined : raw.out.slice(-1200),
      }
    },
  }))
}
