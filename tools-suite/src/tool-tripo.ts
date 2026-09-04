/**
 * Tripo3D asset pipeline — plan-then-generate with a unified style bible
 * and a hard asset budget.
 *
 * Flow: the agent first stores a PLAN (game description, style bible, and
 * N planned assets — N chosen by the user in steps of 10, 10..200), then
 * generates assets one by one. Every generation merges the style bible so
 * all assets share one visual taste. Models land in assets/3d/<name>.glb.
 *
 * Requires TRIPO_API_KEY for real generation (TRIPO_API_BASE overrides the
 * endpoint, which also enables offline end-to-end testing against a mock).
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { toolsDirFor, readJson, writeJson, nowIso } from './lib/util.ts'

export const name = 'tool-tripo'
export const inject = ['tools']

export interface TripoAsset {
  name: string
  prompt: string
  status: 'planned' | 'generating' | 'done' | 'failed'
  file?: string
  error?: string
  updatedAt?: string
}

export interface TripoPlan {
  game: string
  styleBible: string
  count: number
  assets: TripoAsset[]
  createdAt: string
}

export interface TripoSettings { hardCap: number | null }
export function settingsFile(workspaceRoot: string): string {
  return path.join(toolsDirFor(workspaceRoot), 'tripo', 'settings.json')
}
export async function loadSettings(workspaceRoot: string): Promise<TripoSettings> {
  return { hardCap: null, ...(await readJson<Partial<TripoSettings>>(settingsFile(workspaceRoot), {})) }
}
export async function saveSettings(workspaceRoot: string, s: TripoSettings): Promise<void> {
  await writeJson(settingsFile(workspaceRoot), s)
}
export function planFile(workspaceRoot: string): string {
  return path.join(toolsDirFor(workspaceRoot), 'tripo', 'plan.json')
}

export function countIsValid(n: number): boolean {
  return Number.isInteger(n) && n >= 10 && n <= 200 && n % 10 === 0
}

/**
 * Realism awareness merged into every asset prompt. Deliberately FLEXIBLE:
 * these are judgment principles, not rigid blocks — the model reasons about
 * context (a car in a parking lot repeats; a town hall does not) exactly the
 * way a human set-dresser would.
 */
export const REALISM_RULES = [
  '【قواعد الإدراك الواقعي — طبّقها بعقل مرن لا بقوائم صارمة / Realism awareness, flexible by design】',
  '1) تخيّل المشهد كصورة حقيقية قبل التركيب: هل يبدو طبيعياً؟ إن لا — أعد الترتيب قبل التنفيذ.',
  '2) التكرار يقرّه السياق لا القاعدة: عناصر تتكرر في الواقع (سيارات بموقف، صخور، أشجار، دواجن/منتجات تُشترى، أعشاش) يجوز تكرارها مع تنويع طفيف؛ أما المباني الفريدة والشخصيات المحورية والمعالم فلا تتكرر إلا لمبرر لعبي أو سردي صريح (اشتراء دجاجة إضافية مثلاً).',
  '3) الفيزياء والمكان: لا شجر أو مبانٍ فوق ماء/طرق أساسية، لا تداخل بين المجسمات، لا أشياء تطفو أو تطير بلا سبب؛ اترك أزقة يمشي فيها اللاعب وأبواباً تُفتح.',
  '4) التباعد الإنساني: المسافات كما في الواقع (طاولة بحجم طاولة، بيت لا يلاصق بيتاً) والمنظور يخدم الكاميرا.',
  '5) الحركة: كل كائن حي له سلوك يناسبه (خمول/تجوّل/مشي) وحجمُه يحكم سرعته.',
  '6) التنبؤ: استبق حاجات المشهد القادمة (مسارات، مواقف، مناطق بيع) واتفراغ واقعياً لها بدل ازدحام أعمى.',
  '7) عند الشك طبّق اختبار الصورة: لو صُوِّر المشهد، هل يسأل أحد «لماذا هذا هنا؟» — إن نعم فأعد التفكير.',
].join('\n')

/**
 * Tripo rejects prompts over ~1k chars with code 1004 (enforced 2026-08-20;
 * longer merges worked before). The fixed Arabic realism rules alone exceed
 * that, so they guide scene assembly locally instead of riding every API
 * prompt. Priority when trimming: asset prompt > style bible.
 */
const TRIPO_PROMPT_LIMIT = 900

export function mergedPrompt(plan: TripoPlan, asset: TripoAsset): string {
  const core = `Asset "${asset.name}": ${asset.prompt}`
  const bible = plan.styleBible.trim()
  let out = bible === '' ? core : `${bible}\n\n${core}`
  if (out.length > TRIPO_PROMPT_LIMIT) out = core
  if (out.length > TRIPO_PROMPT_LIMIT) out = core.slice(0, TRIPO_PROMPT_LIMIT - 1) + '…'
  return out
}

/* ------------------------------------------------------------------ */
/* فاحص المشهد: تحقق آلي من إدراك واقعي بعد التركيب                    */
/* ------------------------------------------------------------------ */

export interface AuditItem {
  name: string
  kind: string
  x: number
  z: number
  r: number
  duplicateOf?: string
  reason?: string
}

export interface AuditZone {
  kind: 'water' | 'building' | 'path'
  x1: number
  z1: number
  x2: number
  z2: number
  label?: string
}

export interface AuditFinding { severity: 'error' | 'warning'; rule: string; message: string }

const UNIQUE_KIND_HINTS = ['building', 'house', 'home', 'structure', 'landmark', 'hero', 'player', 'npc', 'character', 'monument', 'shop', 'store']

function isUniqueKind(kind: string): boolean {
  const k = kind.toLowerCase()
  return UNIQUE_KIND_HINTS.some(h => k.includes(h))
}

/** Pure validator: zone violations, overlaps, unjustified duplicates. */
export function auditScene(
  items: AuditItem[],
  zones: AuditZone[],
  opts: { minGap?: number } = {},
): { ok: boolean; errors: AuditFinding[]; warnings: AuditFinding[] } {
  const minGap = typeof opts.minGap === 'number' && opts.minGap >= 0 ? opts.minGap : 0.3
  const errors: AuditFinding[] = []
  const warnings: AuditFinding[] = []

  const inside = (x: number, z: number, zn: AuditZone): boolean =>
    x >= Math.min(zn.x1, zn.x2) && x <= Math.max(zn.x1, zn.x2) && z >= Math.min(zn.z1, zn.z2) && z <= Math.max(zn.z1, zn.z2)

  for (const it of items) {
    for (const zn of zones) {
      if (!inside(it.x, it.z, zn)) continue
      const where = zn.label ?? `${zn.kind}(${zn.x1},${zn.z1})..(${zn.x2},${zn.z2})`
      if (zn.kind === 'water') {
        errors.push({ severity: 'error', rule: 'لا شيء فوق الماء', message: `«${it.name}» موضوع داخل منطقة ماء ${where} — انقله لليابسة أو اجعله جسراً/قارباً مقصوداً` })
      } else if (zn.kind === 'building') {
        errors.push({ severity: 'error', rule: 'لا تداخل مع المباني', message: `«${it.name}» داخل مبنى ${where} — حرّكه خارج الجدران أو اجعله أثاثاً داخلياً مقصوداً` })
      } else {
        warnings.push({ severity: 'warning', rule: 'الطرق للمسير', message: `«${it.name}» يعترض طريقاً ${where} — مقبول فقط إن كان حاجزاً مقصوداً` })
      }
    }
  }

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!, b = items[j]!
      const d = Math.hypot(a.x - b.x, a.z - b.z)
      if (d < a.r + b.r + minGap) {
        errors.push({ severity: 'error', rule: 'لا تداخل فيزيائي', message: `«${a.name}» و«${b.name}» متداخلان (مسافة ${d.toFixed(2)} < ${a.r + b.r + minGap}) — افصل بينهما بمسافة واقعية` })
      }
    }
  }

  const byKind = new Map<string, AuditItem[]>()
  for (const it of items) {
    const list = byKind.get(it.kind) ?? []
    list.push(it)
    byKind.set(it.kind, list)
  }
  for (const [kind, list] of byKind) {
    if (!isUniqueKind(kind)) {
      if (list.length >= 12) warnings.push({ severity: 'warning', rule: 'تكرار كثيف', message: `${list.length} عنصر من نوع «${kind}» بلا مبرر مسجل — إن كانت بيئة طبيعية/سوق فمقبول، وإلا نوّع` })
      continue
    }
    // أنواع فريدة: جمّع النسخ (duplicateOf أو نفس الاسم الأساسي) — يكفي مبرر واحد للمجموعة
    const groups = new Map<string, AuditItem[]>()
    for (const it of list) {
      const key = it.duplicateOf ?? it.name.split('#')[0] ?? it.name
      const g = groups.get(key) ?? []
      g.push(it)
      groups.set(key, g)
    }
    for (const [key, g] of groups) {
      if (g.length <= 1) continue
      const justified = g.some(it => (it.reason ?? '').trim() !== '')
      if (!justified) {
        errors.push({ severity: 'error', rule: 'التكرار يحتاج مبرراً', message: `مجموعة «${key}» من نوع فريد (${kind}) مكررة ×${g.length} بلا reason — برّرها لعبياً (شراء/حدث) أو أزل التكرار` })
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings }
}

function tripoBase(): string {
  return process.env.TRIPO_API_BASE ?? 'https://api.tripo3d.ai'
}

function requireKey(): string {
  const key = process.env.TRIPO_API_KEY
  if (typeof key !== 'string' || key === '') {
    throw new Error('Tripo generation requires the TRIPO_API_KEY environment variable')
  }
  return key
}

export async function loadPlan(workspaceRoot: string): Promise<TripoPlan | null> {
  return readJson<TripoPlan | null>(planFile(workspaceRoot), null)
}

export async function savePlan(workspaceRoot: string, plan: TripoPlan): Promise<void> {
  await writeJson(planFile(workspaceRoot), plan)
}

/** Create or replace the plan after validating the budget contract. */
export async function createPlan(
  workspaceRoot: string,
  input: { game: string; styleBible?: string; style_bible?: string; count: number; assets: Array<{ name: string; prompt: string }> },
): Promise<TripoPlan> {
  if (typeof input.game !== 'string' || input.game.trim() === '') throw new Error('game description is required')
  // Accept BOTH key styles: the tool schema exposes style_bible, the HTTP hub sends styleBible.
  const bible = input.styleBible ?? input.style_bible
  if (typeof bible !== 'string' || bible.trim() === '') throw new Error('style_bible is required (one unified visual taste for every asset)')
  const settings = await loadSettings(workspaceRoot)
  if (settings.hardCap !== null) {
    // A user hard cap overrides the default 10-step budget convention.
    const c2 = Number(input.count)
    if (!Number.isInteger(c2) || c2 < 1 || c2 > settings.hardCap) {
      throw new Error(`user hard cap is ${settings.hardCap}: set count between 1 and ${settings.hardCap}. If the project truly needs more, prioritize the most essential ${settings.hardCap} assets, build them correctly and complete the request, then TELL the user how many additional assets remain to complete the project.`)
    }
  } else if (!countIsValid(Number(input.count))) {
    throw new Error(`count must be 10..200 in steps of 10 (got ${input.count})`)
  }
  if (!Array.isArray(input.assets) || input.assets.length === 0) throw new Error('assets list is required')
  if (input.assets.length > input.count) throw new Error(`planned ${input.assets.length} assets exceeds the budget of ${input.count}`)
  const names = new Set<string>()
  const assets: TripoAsset[] = input.assets.map(a => {
    const name = String(a.name ?? '').trim()
    if (name === '' || String(a.prompt ?? '').trim() === '') throw new Error('every asset needs a name and a prompt')
    if (names.has(name)) throw new Error(`duplicate asset name: ${name}`)
    names.add(name)
    return { name, prompt: String(a.prompt).trim(), status: 'planned' as const }
  })
  const plan: TripoPlan = {
    game: input.game.trim(),
    styleBible: bible.trim(),
    count: input.count,
    assets,
    createdAt: nowIso(),
  }
  await savePlan(workspaceRoot, plan)
  return plan
}

async function downloadToFile(url: string, file: string): Promise<number> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`model download failed (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, buf)
  return buf.length
}

/** رفع صورة مرجعية إلى Tripo (مجاني) وإرجاع التوكن — يغذي image_to_model. */
async function uploadImageToken(key: string, absPath: string, signal: AbortSignal | undefined): Promise<string> {
  const buf = await import('node:fs').then(m => m.promises.readFile(absPath))
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(buf)]), absPath.split(/[\\/]/).pop() ?? 'ref.png')
  const res = await fetch('https://openapi.tripo3d.ai/v3/files', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}` },
    body: form,
    signal,
  })
  const j = await res.json().catch(() => null) as { code?: number, data?: { image_token?: string, file_token?: string } } | null
  const token = j?.data?.image_token ?? j?.data?.file_token
  if (!res.ok || token === undefined || token === '') {
    throw new Error(`image upload failed (${res.status}${j?.code !== undefined ? ' / ' + j.code : ''})`)
  }
  return token
}

/**
 * Generate one planned asset through Tripo: text→GLB by default, or
 * image→GLB when an approved reference image path is given (uploaded free
 * to v3/files, then image_to_model). Direct text generation stays intact.
 */
export async function generateAsset(
  workspaceRoot: string,
  assetName: string,
  signal: AbortSignal | undefined,
  image?: string,
): Promise<TripoAsset> {
  const key = requireKey()
  const plan = await loadPlan(workspaceRoot)
  if (plan === null) throw new Error('no plan stored yet — create one first')
  const asset = plan.assets.find(a => a.name === assetName)
  if (asset === undefined) throw new Error(`asset "${assetName}" is not in the plan`)
  if (asset.status === 'done' && typeof asset.file === 'string') return asset

  const base = tripoBase()
  asset.status = 'generating'
  asset.updatedAt = nowIso()
  await savePlan(workspaceRoot, plan)

  const headers = { 'content-type': 'application/json', authorization: `Bearer ${key}` }
  const body: Record<string, unknown> = {
    type: 'text_to_model',
    prompt: mergedPrompt(plan, asset),
    output_format: 'glb',
  }
  if (typeof image === 'string' && image.trim() !== '') {
    const abs = require('node:path').resolve(workspaceRoot, image.trim())
    body.type = 'image_to_model'
    body.file = await uploadImageToken(key, abs, signal)
    // البرومت يبقى مرجعًا أسلوبيًا مكملًا للصورة عند المزود
  }
  const createRes = await fetch(`${base}/v2/openapi/task`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })
  const createJson = await createRes.json().catch(() => null) as { data?: { task_id?: string } } | null
  const taskId = createJson?.data?.task_id
  if (!createRes.ok || taskId === undefined) {
    asset.status = 'failed'
    asset.error = `task create failed (${createRes.status})`
    asset.updatedAt = nowIso()
    await savePlan(workspaceRoot, plan)
    throw new Error(asset.error)
  }

  // Poll until the model is ready (bounded to ~8 minutes).
  let modelUrl: string | undefined
  for (let i = 0; i < 96; i++) {
    await new Promise(r => setTimeout(r, 5000))
    if (signal?.aborted === true) throw new Error('aborted')
    const poll = await fetch(`${base}/v2/openapi/task/${taskId}`, { headers, signal })
    const pj = await poll.json().catch(() => null) as { data?: { status?: string; output?: { pbr_model?: string; model?: string } } } | null
    const status = pj?.data?.status
    if (status === 'success' || status === 'finished' || status === 'SUCCESS') {
      modelUrl = pj?.data?.output?.pbr_model ?? pj?.data?.output?.model
      break
    }
    if (status === 'failed' || status === 'FAILED' || status === 'cancelled') {
      asset.status = 'failed'
      asset.error = `remote task ${status}`
      asset.updatedAt = nowIso()
      await savePlan(workspaceRoot, plan)
      throw new Error(asset.error)
    }
  }
  if (modelUrl === undefined) {
    asset.status = 'failed'
    asset.error = 'generation timed out'
    asset.updatedAt = nowIso()
    await savePlan(workspaceRoot, plan)
    throw new Error(asset.error)
  }

  const safe = asset.name.replace(/[^\w\u0600-\u06ff-]+/g, '_')
  const file = path.join(workspaceRoot, 'assets', '3d', `${safe}.glb`)
  const bytes = await downloadToFile(modelUrl, file)
  asset.status = 'done'
  asset.file = path.relative(workspaceRoot, file).replace(/\\/g, '/')
  asset.updatedAt = nowIso()
  delete asset.error
  await savePlan(workspaceRoot, plan)
  void bytes
  return asset
}

function resolveWorkspace(exec: unknown): string {
  const cwd = (exec as { agent?: { session?: { header?: { cwd?: string } } } })?.agent?.session?.header?.cwd
  if (typeof cwd !== 'string' || cwd === '') throw new Error('no workspace selected for this session')
  return cwd
}

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'tripo_plan',
    description:
      'Store the 3D asset PLAN before any generation: the game description, ONE unified style bible paragraph ' +
      '(art style, era, palette, mood — merged into every asset prompt so all assets share one taste), the user-approved ' +
      'budget count (10..200 in steps of 10), and the named assets (name + specific prompt each). ' +
      'MANDATORY PROTOCOL before the FIRST tripo_generate of any project: ask the user first — (أ) do you have reference images to attach? (ب) or generate reference images with image_generate (configured provider)? (ج) or direct generation with no references? If the image-generation key is not configured, say explicitly «مفتاح توليد الصور غير متوفر» and offer the other two options. After any image_generate: the model CANNOT see images — show file paths to the user to review in the hub (المركز ← أصول 3D ← الصور المولّدة) and wait for approve/reject/retry/prompt-edit before any tripo_generate. ' +
      'The USER may set a hard cap (hardCap) in the tools hub: never exceed it — if the project needs more assets than allowed, pick the most essential ones, build them correctly and complete the request, then tell the user exactly how many additional assets remain to complete the project. Plan first, then generate with tripo_generate. ' +
      'Before building the game itself, read the local capability playbook tools-suite/three/CAPABILITIES.md (offline three.js addons: Sky, PointerLockControls, CSS2DRenderer, bloom postprocessing, Stats, RoomEnvironment + code recipes) and pick ONLY what fits THIS project genre — never inject everything. STANDING POLICY in the playbook is binding: add a capability only on client request or clear necessity; CLIENT FEATURE-REMOVAL REQUESTS ARE ABSOLUTE AND PERMANENT for that project; never delete client assets to fix performance — optimize by measurement.',
    parameters: {
      game: { type: 'string', required: true, description: 'Short game description (type, setting)' },
      style_bible: { type: 'string', required: true, description: 'Unified visual style paragraph merged into every prompt' },
      count: { type: 'number', required: true, description: 'Budget ceiling: 10-200, multiples of 10' },
      assets: {
        type: 'array',
        required: true,
        description: 'Planned assets (each: unique name + concrete prompt)',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', required: true },
            prompt: { type: 'string', required: true },
          },
        },
      },
    },
    output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }] },
    async execute(args, exec) {
      const root = resolveWorkspace(exec)
      const plan = await createPlan(root, args)
      const settings = await loadSettings(root)
      return { planned: plan.assets.length, budget: plan.count, hardCap: settings.hardCap, game: plan.game, assets: plan.assets.map(a => a.name) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'tripo_generate',
    description:
      'LOCAL-FIRST POLICY: before ANY generation, search the local_assets tool for a suitable ready asset and use it unless the client explicitly asked for generation. Generate ONE planned 3D asset via Tripo and save it to assets/3d/<name>.glb. Two modes: direct text→GLB (default, style bible merged), ' +
      'or image→GLB by passing `image` = an APPROVED reference image path (user-attached or image_generate output the user approved — upload is free, generation follows the same plan). ' +
      'Never generate before the user has approved reference images when any were created/attached. Review results via the hub 3D viewer (أصول 3D) — NEVER screenshot_verify. Requires TRIPO_API_KEY.',
    parameters: {
      name: { type: 'string', required: true, description: 'Asset name exactly as planned' },
      image: { type: 'string', description: 'مسار صورة مرجعية معتمدة داخل مساحة العمل (مثال: assets/generated/img-1.png) — يحوّل الطلب إلى image_to_model' },
    },
    output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }] },
    async execute(args, exec) {
      const root = resolveWorkspace(exec)
      const asset = await generateAsset(root, args.name, (exec as { signal?: AbortSignal }).signal, args.image)
      return { name: asset.name, status: asset.status, file: asset.file ?? null, mode: args.image !== undefined ? 'image_to_model' : 'text_to_model' }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'tripo_status',
    description: 'Show the stored Tripo plan: budget, style bible, and every asset status.',
    parameters: {},
    output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }] },
    async execute(_args, exec) {
      const root = resolveWorkspace(exec)
      const plan = await loadPlan(root)
      if (plan === null) return { plan: null, hint: 'create a plan with tripo_plan first' }
      return {
        game: plan.game,
        budget: plan.count,
        done: plan.assets.filter(a => a.status === 'done').length,
        assets: plan.assets.map(a => ({ name: a.name, status: a.status, file: a.file ?? null })),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'scene_audit',
    description:
      'Realism audit of a composed 3D scene: call it AFTER placing assets with a manifest of every placed item ' +
      '(name, kind, x, z, radius, duplicateOf?, reason?) and the scene zones (water/building/path rectangles). ' +
      'It flags: anything placed over water or inside buildings, physical overlaps, and repetitions of UNIQUE kinds ' +
      '(buildings/landmarks/heroes) that lack a gameplay reason. Natural repeats (cars in a lot, rocks, purchasable ' +
      'animals, products) are fine — attach a short reason when duplicating on purpose. ITERATE: fix placements and ' +
      're-audit until ok=true before telling the user the scene is done.',
    parameters: {
      items: {
        type: 'array',
        required: true,
        description: 'كل مجسم موضوع: name/kind/x/z/r (+duplicateOf وreason عند التكرار المقصود)',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', required: true },
            kind: { type: 'string', required: true, description: 'building|tree|rock|vehicle|animal|prop|character|...' },
            x: { type: 'number', required: true },
            z: { type: 'number', required: true },
            r: { type: 'number', required: true, description: 'نصف قطر التقريب للمساحة المشغولة' },
            duplicateOf: { type: 'string' },
            reason: { type: 'string', description: 'مبرر التكرار إن وجد (شراء/حدث/بيئة طبيعية)' },
          },
        },
      },
      zones: {
        type: 'array',
        required: true,
        description: 'مستطالات المناطق: water/building/path مع x1,z1,x2,z2',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { type: 'string', required: true, description: 'water|building|path' },
            x1: { type: 'number', required: true },
            z1: { type: 'number', required: true },
            x2: { type: 'number', required: true },
            z2: { type: 'number', required: true },
            label: { type: 'string' },
          },
        },
      },
      min_gap: { type: 'number', description: 'أدنى تباعد إضافي بين المجسمات (افتراضي 0.3)' },
    },
    output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }] },
    async execute(args) {
      const result = auditScene(args.items as AuditItem[], args.zones as AuditZone[], { minGap: args.min_gap })
      return {
        ok: result.ok,
        errors: result.errors.length,
        warnings: result.warnings.length,
        findings: [...result.errors, ...result.warnings],
        hint: result.ok ? 'المشهد سليم واقعياً — أكمل' : 'أصلح المواضع ثم أعد الاستدعاء حتى ok=true',
      }
    },
  }))
}
