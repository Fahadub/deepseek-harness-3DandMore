/**
 * tool-assets.ts — Local ready-made assets (the embedded free pack + any
 * user-registered folders). Gives the agent one discovery point for existing
 * GLB/FBX/OBJ models and PNG/JPG images BEFORE any generation.
 *
 * Policy baked into the tool description: use these first; generate via Tripo
 * only when the client explicitly asks for generation (or nothing suitable
 * exists locally). Ready images double as reference images.
 *
 * Storage: machine-local ~/.dsh-tools/assets-paths.json (survives restarts,
 * never published — it lives outside the repo). The embedded pack at
 * tools-suite/assets-pack/ is always registered implicitly.
 */
import { promises as fs, constants as fsConstants } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

async function uiLangSync(): Promise<string> {
  try {
    const f = path.join(os.homedir(), '.dsh-tools', 'ui-lang.json')
    const t = await fs.readFile(f, 'utf8')
    const l = (JSON.parse(t) as { lang?: string }).lang
    return l === 'en' || l === 'zh' ? l : 'ar'
  } catch { return 'ar' }
}

function fileURLToPathLocal(u: string): string {
  let p = u.replace(/^file:\/\/\//, '')
  p = p.replace(/%20/g, ' ')
  if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1)
  return decodeURIComponent(p)
}

export const name = 'tool-assets'
export const inject = ['tools']

export const MODEL_EXT = new Set(['.glb', '.gltf', '.fbx', '.obj', '.ply', '.stl'])
export const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const SKIP_DIRS = new Set(['node_modules', '.git', '.dsh-tools', '.godot', 'dist', 'build'])
const MAX_FILES_PER_FOLDER = 400
const MAX_SCAN_BYTES_HINT = 12_000_000_000

export function embeddedPackDir(): string {
  return path.resolve('tools-suite/assets-pack')
}

function pathsFile(): string {
  return path.join(os.homedir(), '.dsh-tools', 'assets-paths.json')
}

export async function registeredFolders(): Promise<string[]> {
  const embedded = embeddedPackDir()
  const exists = await fs.access(embedded).then(() => true).catch(() => false)
  let stored: string[] = []
  try {
    const j = JSON.parse(await fs.readFile(pathsFile(), 'utf8')) as { folders?: string[] }
    stored = Array.isArray(j.folders) ? j.folders.filter(p => typeof p === 'string' && p !== '') : []
  } catch { /* first run */ }
  const all = [...(exists ? [embedded] : []), ...stored]
  return [...new Set(all)]
}

export async function addFolder(p: string): Promise<void> {
  const list = await registeredFolders()
  if (list.includes(p)) return
  list.push(p)
  await fs.mkdir(path.dirname(pathsFile()), { recursive: true })
  await fs.writeFile(pathsFile(), JSON.stringify({ folders: list }, null, 2), 'utf8')
}

export async function removeFolder(p: string): Promise<void> {
  if (p === embeddedPackDir()) throw new Error('الحزمة المدمجة دائماً مسجلة ولا تُزال')
  const list = (await registeredFolders()).filter(x => x !== p)
  await fs.writeFile(pathsFile(), JSON.stringify({ folders: list }, null, 2), 'utf8')
}

export interface AssetFile { name: string, rel: string, abs: string, size: number, kind: 'model' | 'image' }
export interface FolderScan { path: string, embedded: boolean, models: number, images: number, total_bytes: number, files: AssetFile[] }

export async function scanFolder(p: string): Promise<FolderScan> {
  const out: AssetFile[] = []
  let models = 0
  let images = 0
  let bytes = 0
  const walk = async (dir: string, rel: string): Promise<void> => {
    let entries: import('node:fs').Dirent[] = []
    try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue
      const full = path.join(dir, e.name)
      const r = rel === '' ? e.name : `${rel}/${e.name}`
      if (e.isDirectory()) {
        await walk(full, r)
      } else {
        const ext = path.extname(e.name).toLowerCase()
        const kind = MODEL_EXT.has(ext) ? 'model' : IMAGE_EXT.has(ext) ? 'image' : null
        if (kind === null) continue
        let size = 0
        try { size = (await fs.stat(full)).size } catch { continue }
        bytes += size
        if (kind === 'model') models++
        else images++
        if (out.length < MAX_FILES_PER_FOLDER) out.push({ name: e.name, rel: r, abs: full, size, kind })
      }
      if (bytes > MAX_SCAN_BYTES_HINT) return
    }
  }
  await walk(p, '')
  return { path: p, embedded: p === embeddedPackDir(), models, images, total_bytes: bytes, files: out }
}

export async function scanAll(): Promise<FolderScan[]> {
  const folders = await registeredFolders()
  const scans: FolderScan[] = []
  for (const f of folders) {
    const ok = await fs.access(f, fsConstants.F_OK).then(() => true).catch(() => false)
    if (!ok) continue
    scans.push(await scanFolder(f))
  }
  return scans
}

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'local_assets',
    description: 'Search READY-MADE local assets FIRST — the embedded free pack (tools-suite/assets-pack) plus any folders the client registered in the tools hub. Returns every available model (glb/gltf/fbx/obj/ply/stl) and image (png/jpg/webp) with absolute paths and sizes. POLICY: before ANY tripo_generate or image_generate, search here and USE an existing suitable asset — generate ONLY when the client explicitly asks for generation, or nothing suitable exists locally. Ready images double as reference images for generation workflows. Use asset_pipeline to fix/convert any local model (orientation/pivot/scale/collision) before placing it in a game.',
    parameters: {
      query: { type: 'string', description: 'Optional case-insensitive filter on file name (arabic or english)' },
      kind: { type: 'string', description: 'Optional: "model" or "image" to filter one kind' },
    },
    output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }] },
    async execute(args) {
      const scans = await scanAll()
      const q = (args.query ?? '').toLowerCase().trim()
      const kind = args.kind === 'model' || args.kind === 'image' ? args.kind : null
      const folders = scans.map(s => {
        const files = s.files.filter(f =>
          (q === '' || f.name.toLowerCase().includes(q) || f.rel.toLowerCase().includes(q)) &&
          (kind === null || f.kind === kind))
        return {
          path: s.path,
          embedded: s.embedded,
          models: s.models,
          images: s.images,
          total_bytes: s.total_bytes,
          matches: files.slice(0, 100).map(f => ({ name: f.name, abs: f.abs, kind: f.kind, size: f.size })),
          matches_shown: Math.min(files.length, 100),
          matches_total: files.length,
        }
      })
      return {
        policy: 'استخدم الجاهز المحلي أولاً — لا تولّد عبر Tripo إلا بطلب صريح من العميل أو لعدم وجود بديل مناسب. الصور الجاهزة تصلح مراجع.',
        harness_root: path.resolve(path.dirname(fileURLToPathLocal(import.meta.url)), '..', '..'),
        ui_lang: await uiLangSync(),
        content_lang_policy: 'لغة محتوى أي لعبة تبنيها (واجهة Godot أو three.js أو نصوص المشهد) = ui_lang أعلاه تلقائياً — عربي إن كانت ar، إنجليزي كامل إن كانت en، صيني إن كانت zh. استثناء: لغة رسائل العميل في الشات تتقدم — إن كان يكتب بلغة أخرى فابنِ المحتوى بها وأخبره. ركّز نصوص اللعبة في ملف واحد (مثل i18n/strings) ليسهل تبديلها.',
        harness_policy: 'مسار المحرر (الهارنس) أعلاه — يعمل أينما وُضع المجلد. عند اكتشاف خطأ أو مرجع ميت داخل المحرر: اقترح التعديل على العميل وانتظر إذنه الصريح قبل أي تغيير داخله — لا تعدّل المحرر من تلقاء نفسك.',
        folders,
      }
    },
  }))
}
