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
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-blender'
export const inject = ['tools']

export const BLENDER_DIR = path.resolve('tools-suite/blender')
export const GODOT_EXE = path.resolve('tools-suite/godot/Godot.exe')

const RESULT_BEGIN = '@@DSH_BEGIN@@'
const RESULT_END = '@@DSH_END@@'

function resolveWorkspace(exec: unknown): string {
  const cwd = (exec as { agent?: { session?: { header?: { cwd?: string } } } })?.agent?.session?.header?.cwd
  if (typeof cwd !== 'string' || cwd === '') throw new Error('no workspace selected for this session')
  return cwd
}

interface RunResult { code: number | null, out: string, timedOut: boolean }

/** Spawn + capture with a hard timeout; kills the whole process tree on Windows. */
function runCaptured(exe: string, args: string[], opts: { cwd?: string, timeoutMs: number, env?: NodeJS.ProcessEnv }): Promise<RunResult> {
  return new Promise((resolve) => {
    let settled = false
    const child = spawn(exe, args, { cwd: opts.cwd, windowsHide: true, env: opts.env })
    let out = ''
    child.stdout.on('data', (d: Buffer) => { if (out.length < 400_000) out += d.toString() })
    child.stderr.on('data', (d: Buffer) => { if (out.length < 400_000) out += d.toString() })
    const finish = (r: RunResult) => { if (!settled) { settled = true; clearTimeout(timer); resolve(r) } }
    const timer = setTimeout(() => {
      if (child.pid !== undefined && process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
      } else {
        child.kill('SIGKILL')
      }
      finish({ code: null, out, timedOut: true })
    }, opts.timeoutMs)
    child.on('error', (err) => finish({ code: -1, out: out + String(err), timedOut: false }))
    child.on('close', (code) => finish({ code, out, timedOut: false }))
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

export async function godotInstalled(): Promise<boolean> {
  try { await fs.access(GODOT_EXE, fsConstants.F_OK); return true } catch { return false }
}

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
const PIPELINE_SCRIPT = [
  'import bpy, json, sys, os, traceback',
  'from math import radians',
  'from mathutils import Vector',
  '',
  'payload = json.load(open(sys.argv[-1], encoding="utf-8"))',
  'src = payload["source"]; out = payload["out"]; ops = payload.get("ops", [])',
  'R = {"ok": False, "log": [], "error": None, "ops_applied": [], "objects": 0}',
  'log = R["log"]',
  '',
  'def meshes():',
  '    return [o for o in bpy.context.scene.objects if o.type == "MESH"]',
  '',
  'def world_bbox(objs):',
  '    pts = []',
  '    for o in objs:',
  '        for c in o.bound_box:',
  '            pts.append(o.matrix_world @ Vector(c))',
  '    xs = [p.x for p in pts]; ys = [p.y for p in pts]; zs = [p.z for p in pts]',
  '    return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))',
  '',
  'try:',
  '    bpy.ops.wm.read_factory_settings(use_empty=True)',
  '    ext = src.rsplit(".", 1)[-1].lower()',
  '    if ext in ("glb", "gltf"):',
  '        bpy.ops.import_scene.gltf(filepath=src)',
  '    elif ext == "fbx":',
  '        bpy.ops.import_scene.fbx(filepath=src)',
  '    elif ext == "obj":',
  '        bpy.ops.wm.obj_import(filepath=src)',
  '    elif ext == "ply":',
  '        bpy.ops.wm.ply_import(filepath=src)',
  '    elif ext == "stl":',
  '        bpy.ops.wm.stl_import(filepath=src)',
  '    else:',
  '        raise ValueError("unsupported source type: " + ext)',
  '    ms = meshes()',
  '    if not ms:',
  '        raise ValueError("no meshes imported")',
  '    R["objects"] = len(ms)',
  '    log.append("imported " + str(len(ms)) + " mesh(es) from ." + ext)',
  '',
  '    for op in ops:',
  '        name = op.get("op", ""); a = op.get("args", {})',
  '        if name == "apply_transforms":',
  '            for o in meshes():',
  '                with bpy.context.temp_override(selected_editable_objects=[o]):',
  '                    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)',
  '            R["ops_applied"].append(name)',
  '        elif name == "origin_to_floor":',
  '            lo, _hi = world_bbox(meshes())',
  '            bpy.context.scene.cursor.location = ((lo[0] + _hi[0]) / 2.0, (lo[1] + _hi[1]) / 2.0, lo[2])',
  '            for o in meshes():',
  '                with bpy.context.temp_override(selected_editable_objects=[o], active_object=o):',
  '                    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")',
  '            R["ops_applied"].append(name)',
  '        elif name == "rotate":',
  '            axis = str(a.get("axis", "X")).upper()',
  '            if axis not in ("X", "Y", "Z"): raise ValueError("rotate: axis must be X, Y or Z")',
  '            deg = float(a.get("degrees", 90.0))',
  '            for o in meshes():',
  '                o.rotation_euler.rotate_axis(axis, radians(deg))',
  '            R["ops_applied"].append(name + " " + axis + " " + str(deg))',
  '        elif name == "normalize_size":',
  '            fit = float(a.get("fit_m", 2.0))',
  '            if fit <= 0: raise ValueError("normalize_size: fit_m must be positive")',
  '            lo, hi = world_bbox(meshes())',
  '            cur = max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])',
  '            if cur > 0:',
  '                f = fit / cur',
  '                for o in meshes():',
  '                    o.scale = (o.scale.x * f, o.scale.y * f, o.scale.z * f)',
  '            R["ops_applied"].append(name + " fit=" + str(fit) + "m")',
  '        elif name == "decimate":',
  '            ratio = float(a.get("ratio", 0.5))',
  '            if not (0.01 <= ratio <= 1.0): raise ValueError("decimate: ratio must be within 0.01..1.0")',
  '            for o in meshes():',
  '                mod = o.modifiers.new("dsh_decimate", "DECIMATE")',
  '                mod.ratio = ratio',
  '                with bpy.context.temp_override(object=o):',
  '                    bpy.ops.object.modifier_apply(modifier=mod.name)',
  '            R["ops_applied"].append(name + " ratio=" + str(ratio))',
  '        elif name == "collision":',
  '            ratio = float(a.get("ratio", 0.25))',
  '            suffix = str(a.get("suffix", "-col"))',
  '            base = os.path.splitext(os.path.basename(out))[0]',
  '            dups = []',
  '            for o in meshes():',
  '                dup = o.copy(); dup.data = o.data.copy()',
  '                dup.name = "dsh_col_tmp"; bpy.context.scene.collection.objects.link(dup); dups.append(dup)',
  '            for o in meshes():',
  '                o.select_set(False)',
  '            with bpy.context.temp_override(selected_objects=dups, active_object=dups[0]):',
  '                bpy.ops.object.join()',
  '            joined = dups[0]; joined.name = base + suffix',
  '            mod = joined.modifiers.new("dsh_col_dec", "DECIMATE"); mod.ratio = ratio',
  '            with bpy.context.temp_override(object=joined):',
  '                bpy.ops.object.modifier_apply(modifier=mod.name)',
  '            log.append("collision proxy: " + joined.name)',
  '            R["ops_applied"].append(name + " ratio=" + str(ratio))',
  '        else:',
  '            log.append("unknown op skipped: " + name)',
  '',
  '    for o in bpy.context.scene.objects:',
  '        o.select_set(o.type == "MESH")',
  '    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)',
  '    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True)',
  '    R["ok"] = True',
  '    log.append("exported " + out)',
  'except BaseException:',
  '    R["error"] = traceback.format_exc(limit=8)[-4000:]',
  '',
  'print("@@DSH_BEGIN@@")',
  'print(json.dumps(R))',
  'print("@@DSH_END@@")',
  '',
].join('\n')

/** Run Blender headless on a prepared script dir; returns parsed payload. */
async function runBlenderScript(exe: string, scriptName: string, extraFiles: Array<{ name: string, content: string }>, timeoutMs: number): Promise<{ payload: { ok: boolean, log?: string, error?: string, [k: string]: unknown } | null, raw: RunResult }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-blender-'))
  try {
    const scriptAbs = path.join(dir, scriptName)
    await fs.writeFile(scriptAbs, extraFiles.length === 0 ? CODE_HEAD : PIPELINE_SCRIPT, 'utf8')
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
  const r1 = await runCaptured(GODOT_EXE, ['--headless', '--import', '--path', projectDir], { timeoutMs: 120_000 })
  if (r1.code === 0) return { imported: true, note: 'godot --import ok' }
  const r2 = await runCaptured(GODOT_EXE, ['--headless', '--editor', '--quit', '--path', projectDir], { timeoutMs: 120_000 })
  if (r2.code === 0) return { imported: true, note: 'godot editor refresh ok' }
  return { imported: false, note: ('godot import failed: ' + (r2.out || r1.out)).slice(0, 400) }
}

export function apply(ctx: Context): void {
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
      return payload
    },
  }))

  ctx.tools.register(defineTool({
    name: 'asset_pipeline',
    description: 'Blender→GLB→Godot pipeline in one call: imports a model (glb/gltf/fbx/obj/ply/stl), applies ordered ops, exports a clean GLB into the workspace, then refreshes a Godot project headlessly. Ops: apply_transforms (bake rotation+scale), origin_to_floor (pivot bottom-center), rotate {axis,degrees}, normalize_size {fit_m}, decimate {ratio}, collision {ratio,suffix} — collision emits a low-poly proxy mesh named <base>-col which Godot can map to collision. Fixes the classic imported-asset problems: wrong orientation, broken pivot, wild scale, missing collision.',
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
      const outAbs = path.isAbsolute(outRel) ? path.resolve(outRel) : path.resolve(root, outRel)
      const ops = Array.isArray(args.ops) ? args.ops : []
      const payload = { source: srcAbs, out: outAbs, ops: ops.map((o: { op?: unknown, args?: unknown }) => ({ op: String((o as { op?: string })?.op ?? ''), args: ((o as { args?: Record<string, unknown> })?.args ?? {}) })) }
      const { payload: result, raw } = await runBlenderScript(status.path as string, 'pipeline.py', [{ name: 'payload.json', content: JSON.stringify(payload) }], 180_000)
      if (raw.timedOut) throw new Error('انتهت مهلة Blender (180 ثانية) — قلّل عدد العمليات أو حجم المجسم')
      const pipelineOk = result?.ok === true
      const godotWanted = args.godot_import === undefined ? true : Boolean(args.godot_import)
      let godot: { imported: boolean, note: string } | null = null
      if (pipelineOk && godotWanted) {
        const isGodotProject = await fs.access(path.join(root, 'project.godot')).then(() => true).catch(() => false)
        if (isGodotProject) godot = await godotImport(root)
        else godot = { imported: false, note: 'مساحة العمل ليست مشروع Godot (لا يوجد project.godot) — تم التصدير فقط' }
      }
      return {
        ok: pipelineOk,
        error: result?.error ?? null,
        blender: status.path,
        source: path.relative(root, srcAbs).replace(/\\/g, '/'),
        out: path.relative(root, outAbs).replace(/\\/g, '/'),
        ops_applied: (result?.ops_applied as string[] | undefined) ?? [],
        objects: result?.objects ?? 0,
        godot,
        tail: pipelineOk ? undefined : raw.out.slice(-1200),
      }
    },
  }))
}
