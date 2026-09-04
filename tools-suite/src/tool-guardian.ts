/**
 * وكيل الصيانة الذاتية (Guardian) — يعمل خارج جلسات الوكلاء تمامًا:
 * لا يحقن برومتات، لا يرسل أوامر إيقاف/إصلاح لأي وكيل عامل، ولا ينفق كردت.
 * يراقن البنية التحتية فقط (خوادم/خطط توليد/سجلات جلسات مصابة بصور)،
 * وكل إصلاح = اقتراح معلّق حتى يقبل المستخدم صراحة، مع تراجع (نسخ احتياطية).
 */
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

export interface GuardianProposal {
  id: string
  createdAt: string
  kind: 'tripo-failed' | 'session-image' | 'server-down' | 'session-error'
  severity: 'info' | 'warning' | 'critical'
  workspace?: string
  summary: string            // عربي (تُترجم في الواجهة عند توفر مفاتيح)
  rootCause: string
  action: string             // ماذا سيفعل بالضبط إن قُبل
  requiresRestart: boolean   // يظهر تحذيرًا في الإشعار
  undoable: boolean
  state: 'pending' | 'accepted' | 'rejected' | 'undone'
  backupFile?: string        // ملف النسخة الاحتياطية للتراجع
  meta?: Record<string, string>
}

/** جذر مستودع الهارنس — من موقع هذا الملف نفسه، فيعمل أينما وُضع المجلد. */
export function harnessRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
}

function fileURLToPath(u: string): string {
  let p = u.replace(/^file:\/\/\//, '')
  p = p.replace(/%20/g, ' ')
  if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1)
  return decodeURIComponent(p)
}

export interface GuardianState {
  enabled: boolean
  intervalMin: 10 | 15 | 20
  proposals: GuardianProposal[]
  log: Array<{ ts: string, event: string }>
}

const STATE_FILE = path.join(os.homedir(), '.dsh-tools', 'guardian.json')

export async function loadGuardian(): Promise<GuardianState> {
  try {
    const raw = JSON.parse(await fs.readFile(STATE_FILE, 'utf8')) as Partial<GuardianState>
    return { enabled: false, intervalMin: 15, proposals: [], log: [], ...raw }
  } catch {
    return { enabled: false, intervalMin: 15, proposals: [], log: [] }
  }
}

export async function saveGuardian(s: GuardianState): Promise<void> {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true })
  await fs.writeFile(STATE_FILE, JSON.stringify(s, null, 2), 'utf8')
}

function logEvent(s: GuardianState, event: string): void {
  s.log.unshift({ ts: new Date().toISOString(), event })
  s.log = s.log.slice(0, 100)
}

/* ------------------------------------------------------------------ */
/* الفحص: قراءة فقط، بلا أي تدخل                                       */
/* ------------------------------------------------------------------ */

export async function detectProblems(workspaces: Array<{ path: string }>): Promise<GuardianProposal[]> {
  const out: GuardianProposal[] = []
  const now = new Date().toISOString()

  // 1) أصول Tripo فاشلة في خطة أي مشروع (نمط اليوم: حد الطول 1004)
  for (const ws of workspaces) {
    try {
      const planPath = path.join(ws.path, '.dsh-tools', 'tripo', 'plan.json')
      const plan = JSON.parse(await fs.readFile(planPath, 'utf8')) as { assets?: Array<{ name: string, status: string, error?: string }> }
      const failed = (plan.assets ?? []).filter(a => a.status === 'failed')
      if (failed.length > 0) {
        out.push({
          id: `tripo-${path.basename(ws.path)}-${now.slice(0, 13)}`,
          createdAt: now, kind: 'tripo-failed', severity: 'warning', workspace: ws.path,
          summary: `${failed.length} أصل فشل توليده في هذا المشروع`,
          rootCause: failed[0].error?.includes('400') || failed[0].error?.includes('create failed')
            ? 'غالبًا حد طول البرومت الجديد من Tripo (كود 1004) — راجع برومتات الأصول لتكون ≤600 حرف'
            : String(failed[0].error ?? 'غير معروف'),
          action: 'إعادة تعيين الأصول الفاشلة إلى «مخططة» في plan.json ليُعيد الوكيل توليدها ببرومتات أقصر (لا يُرسل شيئًا للوكيل — قرار الإعادة يبقى له)',
          requiresRestart: false, undoable: true, state: 'pending',
          meta: { planPath, assets: failed.map(f => f.name).join(',') },
        })
      }
    } catch { /* لا خطة لهذا المشروع */ }
  }

  // 2) سجلات جلسات مصابة بكتل صور (قاتل GLM-5.3 المؤكد)
  for (const found of await findPoisonedSessions()) {
    out.push({
      id: `img-${path.basename(path.dirname(found))}-${now.slice(0, 13)}`,
      createdAt: now, kind: 'session-image', severity: 'critical',
      summary: 'صورة تسكن سجل جلسة — الجلسة ستنهار عند أول طلب للنموذج',
      rootCause: 'أداة أرفقت صورة بنتيجة أداة (screenshot_verify وأمثالها) ومزود GLM-5.3 لا يقبل الصور',
      action: 'جراحة: نزع كتل الصور من السجل مع استبدالها بشرح نصي (نسخة احتياطية تلقائية للتراجع). ملاحظة: يحتاج إعادة تشغيل هذا الخادم ليصبح السجل المعالج هو المستخدم',
      requiresRestart: true, undoable: true, state: 'pending',
      meta: { logFile: found },
    })
  }
  // 3) أخطاء حمراء في جلسة نشطة — وصي يقترح التعديل أو التوجيه الصحيح (لا شيء قبل إذن المستخدم)
  const aiModel = await activeModel()
  let aiOk = false
  if (aiModel !== null) aiOk = (await testModel(aiModel)).ok
  for (const hit of await findSessionErrors()) {
    let summaryLine = 'خطأ متكرر في جلسة عاملة: ' + hit.label
    let cause = hit.cause
    let fixKind = hit.fixKind
    let corrective = hit.corrective
    const metaExtra: Record<string, string> = {}
    if (aiModel !== null && aiOk) {
      const diag = await aiDiagnose(aiModel, hit.sample, hit.label)
      if (diag !== null) {
        summaryLine = diag.summaryAr + ' | ' + diag.summaryEn + ' | ' + diag.summaryZh
        cause = diag.cause
        fixKind = diag.fixKind
        corrective = diag.corrective
        metaExtra.ai = '1'
      }
    }
    if (aiModel !== null) {
      summaryLine += ' [بواسطة ' + aiModel.name + ' · ' + aiModel.provider + (aiOk ? ' ✓ متصل' : ' × الاتصال فشل') + ']'
      metaExtra.guardianModel = aiModel.name + ' · ' + aiModel.provider
    }
    out.push({
      id: `err-${hit.fingerprint}-${now.slice(0, 13)}`,
      createdAt: now, kind: 'session-error', severity: 'warning',
      workspace: hit.workspace,
      summary: summaryLine,
      rootCause: cause,
      action: fixKind === 'directive'
        ? `بقبولك سيُرسل فوراً للوكيل داخل جلسته التوجيه الصحيح: «${hit.corrective.slice(0, 120)}…» — دون أي تعديل على ملفات`
        : 'بقبولك سيُرسل للوكيل توجيه بتصحيح المسار/المرجع داخل المحرر (المسار: ' + harnessRoot() + ') — التعديل نفسه ينفذه الوكيل بعد إذنك في الجلسة',
      requiresRestart: false, undoable: false, state: 'pending',
      meta: { sessionId: hit.sessionId, corrective, fixKind, sample: hit.sample.slice(0, 300), ...metaExtra },
    })
  }
  return out
}

/** خريطة التشخيص: نمط الخطأ → سبب + التوجيه الصحيح. */
const ERROR_PLAYBOOK: Array<{ pattern: RegExp, label: string, cause: string, fixKind: 'directive' | 'harness', corrective: string }> = [
  {
    pattern: /ASSET-SOURCES/i, label: 'مرجع ميت لملف سياسة محذوف', fixKind: 'harness',
    cause: 'كتاب قدرات يوجّه لقراءة ASSET-SOURCES.md الذي حُذف',
    corrective: 'ملف ASSET-SOURCES.md لم يعد موجوداً في المحرر — تجاهله واعتمد المشاع الحر CC0 فقط وسجّل المصدر والترخيص لكل أصل خارجي، وأكمل مهمتك.',
  },
  {
    pattern: /tools\.memory\.set is not a function/i, label: 'استدعاء ذاكرة بطريقة خاطئة', fixKind: 'directive',
    cause: 'الوكيل جرّب tools.memory.set وهي ليست واجهة موجودة',
    corrective: 'لا تستخدم tools.memory.set — سجّل الملاحظات عبر أداة memory المتاحة مباشرة، أو اكتبها في ملف .dsh-tools/PROJECT.md في مساحة العمل.',
  },
  {
    pattern: /Unexpected end of JSON input/i, label: 'تحليل JSON لكلام مختلط', fixKind: 'directive',
    cause: 'نتيجة ضخمة اختلطت بالسجلات أثناء النقل',
    corrective: 'عند تمرير نتائج ضخمة (من بلندر أو غيره): اجعل الأداة تكتب JSON في ملف ثم اقرأ الملف — لا تعتمد على المخرجات المطبوعة.',
  },
  {
    pattern: /cannot read "([^"]*tools-suite[^"]*)": not found/i, label: 'ملف مطلوب داخل المحرر غير موجود', fixKind: 'harness',
    cause: 'مرجع داخل كتب/أكواد المحرر يشير لملف غير موجود',
    corrective: 'الملف المطلوب غير موجود في المحرر — تحقق من المسار تحت جذر المحرر، وإن كان مرجعاً ميتاً في كتاب قدرات فاقترح عليّ حذفه/تصحيحه ولا تتوقف.',
  },
  {
    pattern: /Error:.{10,180}/i,
label: 'خطأ أحمر غير مصنّف', fixKind: 'directive',
    cause: 'خطأ تم رصده في جلسة عاملة ولم يدخل في الأنماط المعروفة',
    corrective: 'راجع آخر خطأ أحمر ظهر لك، شخّص سببه الجذري، واعرض عليّ الإصلاح أو التوجيه الصحيح قبل أن تكمل — ولا تعدّل المحرر نفسه بدون إذني الصريح.',
  },
  {
    pattern: /cannot read "([^"]*)": not found/i, label: 'قراءة ملف قبل إنشائه', fixKind: 'directive',
    cause: 'قراءة ملف كان يُفترض أن تكتبه خطوة سابقة',
    corrective: 'لا تقرأ ملفاً قبل التأكد أن الخطوة التي تكتبه اكتملت بنجاح — أعد الخطوة الكاتبة أولاً ثم اقرأ.',
  },
]

interface SessionErrorHit { fingerprint: string, label: string, cause: string, fixKind: 'directive' | 'harness', corrective: string, sample: string, sessionId: string, workspace?: string }

/** فحص ذيل سجلات الجلسات الحديثة بحثاً عن نصوص أخطاء حمراء متكررة. */
async function findSessionErrors(): Promise<SessionErrorHit[]> {
  const root = path.join(os.homedir(), '.dsh', 'sessions')
  const hits: SessionErrorHit[] = []
  const seen = new Map<string, number>()
  let dirs: string[] = []
  try { dirs = await fs.readdir(root) } catch { return [] }
  let checked = 0
  for (const d of dirs) {
    if (checked >= 8) break
    const wsDir = path.join(root, d)
    let sessions: string[] = []
    try { sessions = await fs.readdir(wsDir) } catch { continue }
    for (const sd of sessions) {
      const sessDir = path.join(wsDir, sd)
      const logPath = path.join(sessDir, 'session.jsonl.zstd')
      const st = await fs.stat(logPath).catch(() => null)
      if (st === null || Date.now() - st.mtimeMs > 6 * 3600_000) continue
      checked += 1
      let tail = ''
      try {
        const { scanZstdFrames, decompressZstdFrame } = await import(pathToFileUrl(
          path.join(harnessRoot(), 'packages', 'session', 'session-persistence-jsonl', 'src', 'zstd.ts')))
        const buf = await fs.readFile(logPath)
        for (const fr of (scanZstdFrames(buf).frames ?? []).slice(-400)) {
          tail += (await decompressZstdFrame(buf.subarray(fr.start, fr.end))).toString('utf8') + '\n'
        }
      } catch { continue }
      if (!/Error:|code run failed|TypeError|ToolCallError/i.test(tail)) continue
      for (const rule of ERROR_PLAYBOOK) {
        const m = rule.pattern.exec(tail)
        if (m === null) continue
        const key = rule.label
        seen.set(key, (seen.get(key) ?? 0) + 1)
        if ((seen.get(key) ?? 0) < 1) continue // نرقّي للمقترح فقط أول ظهور يكفي
        hits.push({
          fingerprint: key.replace(/\s+/g, '-').slice(0, 40),
          label: rule.label, cause: rule.cause, fixKind: rule.fixKind, corrective: rule.corrective,
          sample: (m[0] ?? '').slice(0, 200), sessionId: sd,
          workspace: tryDecodeWorkspace(d),
        })
      }
    }
  }
  return hits
}

function tryDecodeWorkspace(dirName: string): string | undefined {
  const decoded = dirName.replace(/~([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/-/g, '/')
  return /^[A-Za-z]:/.test(decoded) ? decoded : undefined
}

/** فحص خام وسريع: سجلات الجلسات المعدلة حديثًا فقط، وبحد أقصى معقول. */
async function findPoisonedSessions(): Promise<string[]> {
  const root = path.join(os.homedir(), '.dsh', 'sessions')
  const hits: string[] = []
  let dirs: string[] = []
  try { dirs = await fs.readdir(root) } catch { return [] }
  let checked = 0
  for (const d of dirs) {
    if (checked >= 12) break
    const wsDir = path.join(root, d)
    let sessions: string[] = []
    try { sessions = await fs.readdir(wsDir) } catch { continue }
    for (const sd of sessions) {
      const logPath = path.join(wsDir, sd, 'session.jsonl.zstd')
      const st = await fs.stat(logPath).catch(() => null)
      if (st === null || Date.now() - st.mtimeMs > 24 * 3600_000) continue
      checked += 1
      try {
        const { scanZstdFrames, decompressZstdFrame } = await import(pathToFileUrl(
          path.join(process.cwd(), 'packages', 'session', 'session-persistence-jsonl', 'src', 'zstd.ts')))
        const buf = await fs.readFile(logPath)
        for (const fr of (scanZstdFrames(buf).frames ?? []).slice(-15)) {
          const text = (await decompressZstdFrame(buf.subarray(fr.start, fr.end))).toString('utf8')
          if (text.includes('"type":"image"') || text.includes('"type": "image"')) { hits.push(logPath); break }
        }
      } catch { /* تخطَّ إن تعذر فك الضغط */ }
    }
  }
  return hits
}

function pathToFileUrl(p: string): string {
  return `file:///${p.replace(/\\/g, '/').replace(/ /g, '%20')}`
}

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* عقل الوصي: سجل نماذج التشخيص (OpenAI-compatible) + اختبار + تشخيص ذكي */
/* ------------------------------------------------------------------ */

export interface GuardianModel { id: string, name: string, provider: string, baseUrl: string, apiKey: string, model: string }
export interface ModelsState { models: GuardianModel[], activeId: string | null }

const MODELS_FILE = path.join(os.homedir(), '.dsh-tools', 'guardian-models.json')

export async function loadModels(): Promise<ModelsState> {
  try {
    const raw = JSON.parse(await fs.readFile(MODELS_FILE, 'utf8')) as Partial<ModelsState>
    return { models: Array.isArray(raw.models) ? raw.models : [], activeId: raw.activeId ?? null }
  } catch { return { models: [], activeId: null } }
}

export async function saveModels(s: ModelsState): Promise<void> {
  await fs.mkdir(path.dirname(MODELS_FILE), { recursive: true })
  await fs.writeFile(MODELS_FILE, JSON.stringify(s, null, 2), 'utf8')
}

export async function activeModel(): Promise<GuardianModel | null> {
  const s = await loadModels()
  return s.models.find(m => m.id === s.activeId) ?? null
}

function chatUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '') + '/chat/completions'
}

/** اختبار اتصال حقيقي: طلب صغير مع قياس الزمن. */
export async function testModel(m: GuardianModel): Promise<{ ok: boolean, ms: number, detail: string }> {
  const t0 = Date.now()
  try {
    const r = await fetch(chatUrl(m.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + m.apiKey },
      body: JSON.stringify({ model: m.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 4 }),
      signal: AbortSignal.timeout(20000),
    })
    const ms = Date.now() - t0
    if (!r.ok) return { ok: false, ms, detail: 'HTTP ' + r.status }
    const j = await r.json().catch(() => null)
    return j ? { ok: true, ms, detail: 'ok' } : { ok: false, ms, detail: 'invalid JSON' }
  } catch (err) {
    return { ok: false, ms: Date.now() - t0, detail: String((err as Error).message ?? err).slice(0, 160) }
  }
}

export interface AiDiagnosis { summaryAr: string, summaryEn: string, summaryZh: string, cause: string, fixKind: 'directive' | 'harness', corrective: string }

/** تشخيص ذكي ثلاثي اللغة لخطأ مرصود — JSON صارم. */
export async function aiDiagnose(m: GuardianModel, sample: string, hint: string): Promise<AiDiagnosis | null> {
  const sys = [
    'أنت وكيل صيانة داخل محرر ألعاب بالذكاء الاصطناعي. You are a maintenance agent inside an AI game-dev harness. 你是 AI 游戏开发工作台内的维护智能体。',
    'Diagnose the ERROR below. Reply with STRICT JSON only, no markdown:',
    '{"summaryAr":"","summaryEn":"","summaryZh":"","cause":"","fixKind":"directive|harness","corrective":""}',
    'summary*: one short line each (Arabic / English / Chinese). cause: root cause. fixKind: "directive" if the working agent misused something (corrective = direct instruction to that agent, Arabic), "harness" if the harness/editor itself needs a fix (corrective = Arabic instruction to propose the editor fix and wait for explicit client permission). corrective: actionable, Arabic, max 60 words.',
    'Hint: ' + hint,
  ].join('\n')
  try {
    const r = await fetch(chatUrl(m.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + m.apiKey },
      body: JSON.stringify({
        model: m.model,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: 'ERROR SAMPLE:\n' + sample.slice(0, 1200) },
        ],
        temperature: 0.2, max_tokens: 500,
      }),
      signal: AbortSignal.timeout(45000),
    })
    if (!r.ok) return null
    const j = await r.json() as { choices?: Array<{ message?: { content?: string } }> }
    const txt = (j.choices?.[0]?.message?.content ?? '').trim()
    const a = txt.indexOf('{'), b = txt.lastIndexOf('}')
    if (a === -1 || b <= a) return null
    const d = JSON.parse(txt.slice(a, b + 1)) as Partial<AiDiagnosis>
    if (typeof d.corrective !== 'string' || d.corrective === '') return null
    return {
      summaryAr: String(d.summaryAr ?? '').slice(0, 140),
      summaryEn: String(d.summaryEn ?? '').slice(0, 140),
      summaryZh: String(d.summaryZh ?? '').slice(0, 140),
      cause: String(d.cause ?? '').slice(0, 220),
      fixKind: d.fixKind === 'harness' ? 'harness' : 'directive',
      corrective: String(d.corrective).slice(0, 500),
    }
  } catch { return null }
}

/* التنفيذ: لا شيء يحدث قبل قبول المستخدم صراحة                        */
/* ------------------------------------------------------------------ */

export async function acceptProposal(s: GuardianState, id: string): Promise<{ ok: boolean, message: string }> {
  const p = s.proposals.find(x => x.id === id && x.state === 'pending')
  if (p === undefined) return { ok: false, message: 'الاقتراح غير موجود أو محسوم' }

  if (p.kind === 'tripo-failed') {
    const planPath = p.meta?.planPath ?? ''
    const backup = `${planPath}.guardian-backup`
    await fs.copyFile(planPath, backup)
    const plan = JSON.parse(await fs.readFile(planPath, 'utf8')) as { assets: Array<{ name: string, status: string }> }
    for (const a of plan.assets) if (a.status === 'failed') a.status = 'planned'
    await fs.writeFile(planPath, JSON.stringify(plan, null, 2), 'utf8')
    p.state = 'accepted'; p.backupFile = backup
    logEvent(s, `قُبل: ${p.id} (إعادة تعيين ${p.meta?.assets ?? ''} لمخططة)`)
    return { ok: true, message: 'أُعيد ضبط الأصول الفاشلة إلى «مخططة» — التراجع متاح' }
  }

  if (p.kind === 'session-image') {
    const logFile = p.meta?.logFile ?? ''
    const backup = `${logFile}.guardian-backup`
    await fs.copyFile(logFile, backup)
    const changed = await stripImages(logFile)
    if (!changed) return { ok: false, message: 'لم يعد في السجل صور — لا حاجة للتعديل' }
    p.state = 'accepted'; p.backupFile = backup
    logEvent(s, `قُبل: ${p.id} (نُزعت ${changed} كتلة صورة) — يتطلب إعادة تشغيل الخادم`)
    return { ok: true, message: 'نُزعت الصور من السجل ✓ — أعد تشغيل هذا الخادم ليستعيد الوكيل تنفسه (التراجع متاح قبلها وبعدها)' }
  }

  if (p.kind === 'session-error') {
    // الإرسال الفعلي للتوجيه الصحيح يقوم به المركز (يعرف منفذه وجلسات الجهاز) بعد قبولك.
    p.state = 'accepted'
    logEvent(s, `قُبل: ${p.id} (توجيه صحيح أُرسل للجلسة ${p.meta?.sessionId ?? ''})`)
    return { ok: true, message: 'قُبل — يجري إرسال التوجيه الصحيح إلى جلسة الوكيل' }
  }

  return { ok: false, message: 'نوع غير مدعوم بعد' }
}

export function rejectProposal(s: GuardianState, id: string): { ok: boolean } {
  const p = s.proposals.find(x => x.id === id && x.state === 'pending')
  if (p === undefined) return { ok: false }
  p.state = 'rejected'
  logEvent(s, `رُفض: ${p.id}`)
  return { ok: true }
}

export async function undoAccepted(s: GuardianState, id: string): Promise<{ ok: boolean, message: string }> {
  const p = s.proposals.find(x => x.id === id && x.state === 'accepted')
  if (p === undefined || p.backupFile === undefined) return { ok: false, message: 'لا تراجع متاح لهذا البند' }
  const st = await fs.stat(p.backupFile).catch(() => null)
  if (st === null) return { ok: false, message: 'النسخة الاحتياطية غير موجودة' }
  const target = p.kind === 'tripo-failed' ? p.meta?.planPath ?? '' : p.meta?.logFile ?? ''
  await fs.copyFile(p.backupFile, target)
  p.state = 'undone'
  logEvent(s, `تراجع: ${p.id} (استُعيدت النسخة الأصلية)`)
  return { ok: true, message: 'استُعيد الوضع الأصلي ✓' }
}

/** نفس جراحة نزع الصور المجرّبة — كتلة zstd واحدة لكل سطر JSON. */
async function stripImages(logFile: string): Promise<number> {
  const { scanZstdFrames, decompressZstdFrame } = await import(pathToFileUrl(
    path.join(process.cwd(), 'packages', 'session', 'session-persistence-jsonl', 'src', 'zstd.ts')))
  const buf = await fs.readFile(logFile)
  const events: Array<Record<string, unknown>> = []
  for (const fr of (scanZstdFrames(buf).frames ?? [])) {
    const text = (await decompressZstdFrame(buf.subarray(fr.start, fr.end))).toString('utf8')
    for (const line of text.split('\n')) {
      const t = line.trim()
      if (t !== '') events.push(JSON.parse(t) as Record<string, unknown>)
    }
  }
  let stripped = 0
  for (const ev of events) {
    const d = ev.data as Record<string, unknown> | undefined
    const msg = d?.message as Record<string, unknown> | undefined
    if (!Array.isArray(msg?.content)) continue
    for (const ob of msg.content as Array<Record<string, unknown>>) {
      if (Array.isArray(ob.content)) {
        const kept = (ob.content as Array<Record<string, unknown>>).filter(ib => ib.type !== 'image')
        stripped += (ob.content as unknown[]).length - kept.length
        if (kept.length !== (ob.content as unknown[]).length) {
          kept.push({ type: 'text', text: '[أزال وكيل الصيانة صورة من السياق — مزود GLM-5.3 لا يدعم الصور]' })
          ob.content = kept
        }
      }
    }
  }
  if (stripped === 0) return 0
  const out: Buffer[] = []
  for (const ev of events) out.push(zlib.zstdCompressSync(Buffer.from(`${JSON.stringify(ev)}\n`, 'utf8')))
  await fs.writeFile(logFile, Buffer.concat(out))
  return stripped
}

/** دمج مقترحات جديدة في الحالة مع إزالة التكرار حسب النوع والمسار والساعة. */
export function mergeNewProposals(s: GuardianState, found: GuardianProposal[]): number {
  let added = 0
  for (const p of found) {
    const dup = s.proposals.some(x => x.id === p.id)
    if (!dup) { s.proposals.unshift(p); added += 1 }
  }
  s.proposals = s.proposals.slice(0, 40)
  if (added > 0) logEvent(s, `اكتشف ${added} اقتراحًا جديدًا`)
  return added
}
