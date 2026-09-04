/**
 * وكيل الباحث (Research Agent) — معزول تمامًا عن مشاريع الوكلاء:
 * • لا يعمل إطلاقًا حتى يفعّله المستخدم بزر.
 * • كل نشاطه داخل ~/.dsh-tools/research/ (لا يلمس أي مساحة مشروع).
 * • يبحث في الويب (GitHub/npm)، ينزّل مشروعًا واحدًا في كل مرة (سقف 20 لكل انطلاقة)،
 *   يفحصه فحصًا ساكنًا فقط — ممنوع تشغيل كود المشروع المنزّل —
 *   يقتطف الأجزاء المفيدة لهدفك، يحذف التنزيل، ويكتب علامة «تم الانتهاء منه» MD
 *   فلا ينزّل المصدر نفسه مرة ثانية أبدًا.
 * • ما يقتطفه يُختبر في نسخة تجريبية معزولة، ولا يُعتمد إلا بقرار المستخدم؛
 *   ودورة الاعتماد (أصلي ← تجريبي ← اعتماد ← طلب حذف الأصلي السابق) لا تمس الجذر.
 */
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

export interface DownloadRecord {
  provider: 'github' | 'npm' | 'other'
  id: string                 // owner/repo أو اسم الحزمة
  url: string
  startedAt: string
  result: 'harvested' | 'skipped-done' | 'skipped-risk' | 'failed' | 'empty'
  note?: string
}

export interface ResearchState {
  enabled: boolean
  running: boolean
  goal: string
  maxDownloads: number            // سقف الانطلاقة (20 افتراضيًا وفق الطلب)
  downloadsThisRun: number
  downloads: DownloadRecord[]     // سجل الجلسة الحالية
  approvals: Array<{ id: string, question: string, detail: string, state: 'pending' | 'approved' | 'rejected' }>
  versions: Array<{ name: string, official: boolean, files: number, createdAt: string }>
  log: Array<{ ts: string, event: string }>
}

const ROOT = () => path.join(os.homedir(), '.dsh-tools', 'research')
const STATE_FILE = () => path.join(ROOT(), 'state.json')
const DONE_DIR = () => path.join(ROOT(), 'done')
const DL_DIR = () => path.join(ROOT(), 'downloads')
const HARVEST_DIR = () => path.join(ROOT(), 'harvest')

export async function loadResearch(): Promise<ResearchState> {
  try {
    return { ...defaultState(), ...(JSON.parse(await fs.readFile(STATE_FILE(), 'utf8')) as ResearchState) }
  } catch { return defaultState() }
}
function defaultState(): ResearchState {
  return { enabled: false, running: false, goal: '', maxDownloads: 20, downloadsThisRun: 0, downloads: [], approvals: [], versions: [], log: [] }
}
export async function saveResearch(s: ResearchState): Promise<void> {
  await fs.mkdir(ROOT(), { recursive: true })
  await fs.writeFile(STATE_FILE(), JSON.stringify(s, null, 2), 'utf8')
}
function logEvent(s: ResearchState, event: string): void {
  s.log.unshift({ ts: new Date().toISOString(), event })
  s.log = s.log.slice(0, 120)
}

/* ------------------------------------------------------------------ */
/* علامات «تم الانتهاء منه» — ملف MD واحد لكل مصدر                     */
/* ------------------------------------------------------------------ */

function doneMarkerPath(provider: string, id: string): string {
  return path.join(DONE_DIR(), `${provider}__${id.replace(/[\\/:*?"<>|]/g, '_')}.md`)
}

export async function isDone(provider: string, id: string): Promise<boolean> {
  try { await fs.access(doneMarkerPath(provider, id)); return true } catch { return false }
}

export async function markDone(provider: string, id: string, url: string, result: string, harvested: string[]): Promise<void> {
  await fs.mkdir(DONE_DIR(), { recursive: true })
  const body = [
    '# تم الانتهاء من هذا المصدر — لا تنزّله مجددًا',
    '',
    `- المصدر: ${provider} / ${id}`,
    `- الرابط: ${url}`,
    `- النتيجة: ${result}`,
    `- تاريخ المعالجة: ${new Date().toISOString()}`,
    `- الملفات المقتطفة: ${harvested.length > 0 ? harvested.join('، ') : 'لا شيء'}`,
    '',
    '> هذا الملف علامة دائمة يقرؤها وكيل الباحث قبل أي تنزيل — وجوده يمنع التكرار نهائيًا.',
  ].join('\n')
  await fs.writeFile(doneMarkerPath(provider, id), body, 'utf8')
}

/* ------------------------------------------------------------------ */
/* البحث: GitHub + npm (واجهات عامة بلا مفاتيح)                        */
/* ------------------------------------------------------------------ */

export interface Candidate { provider: 'github' | 'npm', id: string, url: string, desc: string }

export async function searchCandidates(goal: string, limit = 30): Promise<Candidate[]> {
  const q = encodeURIComponent(goal)
  const out: Candidate[] = []
  try {
    const r = await fetch(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${Math.min(limit, 20)}`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-research-agent' },
      signal: AbortSignal.timeout(20000),
    })
    const j = await r.json() as { items?: Array<{ full_name: string, clone_url?: string, html_url: string, description?: string, default_branch: string, size?: number }> }
    for (const it of j.items ?? []) {
      if ((it.size ?? 0) > 60_000) continue // > ~60MB تقريبًا: كبير جدًا
      out.push({ provider: 'github', id: it.full_name, url: it.html_url, desc: it.description ?? '' })
    }
  } catch { /* لا نتائج من GitHub */ }
  try {
    const r2 = await fetch(`https://registry.npmjs.org/-/v1/search?text=${q}&size=${Math.min(limit, 20)}`, { signal: AbortSignal.timeout(20000) })
    const j2 = await r2.json() as { objects?: Array<{ package: { name: string, description?: string, links?: { repository?: string } } }> }
    for (const o of j2.objects ?? []) {
      out.push({ provider: 'npm', id: o.package.name, url: o.package.links?.repository ?? `https://www.npmjs.com/package/${o.package.name}`, desc: o.package.description ?? '' })
    }
  } catch { /* لا نتائج من npm */ }
  return out
}

/** رابط أرشيف قابل للتنزيل مباشرة. */
export function archiveUrl(c: Candidate): string {
  if (c.provider === 'github') {
    const [owner, repo] = c.id.split('/')
    return `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/main`
  }
  return `https://registry.npmjs.org/${encodeURIComponent(c.id).replace('%40', '@')}/-/latest.tgz` // حزمة npm الأحدث
}

/* ------------------------------------------------------------------ */
/* الفحص الأمني الساكن — لا تشغيل لكود المنزّل أبدًا                    */
/* ------------------------------------------------------------------ */

const RISK_PATTERNS: Array<[string, string]> = [
  ['eval(', 'تنفيذ ديناميكي للنص'],
  ['child_process', 'تشغيل عمليات نظام'],
  ['execSync', 'تنفيذ متزامن لأوامر'],
  ['curl ', 'نداء شبكة خارجي'],
  ['wget ', 'تنزيل خارجي'],
  ['powershell', 'أوامر ويندوز'],
  ['rm -rf', 'حذف قسري'],
  ['base64,', 'حِزَم base64 كبيرة (تلغيم محتمل)'],
  ['crypto.createCipher', 'تشفير مريب'],
  ['.onion', 'شبكة مظلمة'],
]

export interface ScanReport { risk: 'low' | 'medium' | 'high', findings: string[], postInstall: boolean }

export async function scanProject(dir: string): Promise<ScanReport> {
  const findings: string[] = []
  let postInstall = false
  let files = 0
  const walkStatic = async (d: string): Promise<void> => {
    if (files > 3000) return
    let entries: Array<{ name: string, isDirectory(): boolean }>
    try { entries = (await fs.readdir(d, { withFileTypes: true })).map(e => ({ name: e.name, isDirectory: () => e.isDirectory() })) } catch { return }
    for (const e of entries) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build', '.next'].includes(e.name)) {
          if (e.name === 'node_modules') findings.push('يحتوي node_modules داخل الأرشيف')
          continue
        }
        await walkStatic(p)
      } else if (/\.(js|ts|mjs|cjs|json|sh|ps1|py)$/i.test(e.name)) {
        files += 1
        if (files > 3000) return
        if (path.basename(p) === 'package.json') {
          try {
            const pkg = JSON.parse(await fs.readFile(p, 'utf8')) as { scripts?: Record<string, string> }
            const scripts = pkg.scripts ?? {}
            if (scripts.postinstall !== undefined || scripts.preinstall !== undefined) { postInstall = true; findings.push('سكربتات postinstall/preinstall (تشتغل تلقائيًا عند التثبيت)') }
          } catch { /* manifest تالف */ }
        } else if (!/\.(json)$/i.test(e.name)) {
          const text = (await fs.readFile(p, 'utf8')).slice(0, 400_000)
          for (const [pat, why] of RISK_PATTERNS) {
            if (text.includes(pat) && !findings.includes(`«${pat}» — ${why} (${path.basename(p)})`)) {
              findings.push(`«${pat}» — ${why} (${path.basename(p)})`)
            }
          }
        }
      }
    }
  }
  await walkStatic(dir)
  const risk = postInstall || findings.length >= 4 ? 'high' : findings.length >= 1 ? 'medium' : 'low'
  return { risk, findings: findings.slice(0, 12), postInstall }
}

/* ------------------------------------------------------------------ */
/* الاقتطاف: ملفات مطابقة للهدف بالكلمات المفتاحية                     */
/* ------------------------------------------------------------------ */

export async function harvestUseful(srcDir: string, goal: string, versionDir: string, skipHighRisk: (f: string) => boolean): Promise<string[]> {
  await fs.mkdir(versionDir, { recursive: true })
  const keywords = goal.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  const picked: string[] = []
  const walkPick = async (d: string, rel: string): Promise<void> => {
    let entries
    try { entries = await fs.readdir(d, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const p = path.join(d, e.name), r = rel === '' ? e.name : `${rel}/${e.name}`
      if (e.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build', '.next', 'test', 'tests', '__tests__', 'docs', 'examples'].includes(e.name)) continue
        await walkPick(p, r)
      } else if (/\.(ts|js|mjs|md|json)$/i.test(e.name) && !/package-lock|pnpm-lock|yarn.lock/i.test(e.name)) {
        if (skipHighRisk(r)) continue
        let text = ''
        try { text = (await fs.readFile(p, 'utf8')).slice(0, 200_000) } catch { continue }
        const lower = (r + ' ' + text.slice(0, 20_000)).toLowerCase()
        const score = keywords.reduce((n, w) => n + (lower.includes(w) ? 1 : 0), 0)
        if (score >= 2 || /\.(md)$/i.test(e.name)) {
          const dest = path.join(versionDir, r.replace(/\//g, '__'))
          await fs.copyFile(p, dest)
          picked.push(r)
        }
      }
    }
  }
  await walkPick(srcDir, '')
  return picked.slice(0, 60)
}

/* ------------------------------------------------------------------ */
/* النسخة التجريبية: اختبار معزول (هنا فقط يُسمح بالتشغيل)             */
/* ------------------------------------------------------------------ */

export interface TrialResult { ok: boolean, checks: string[] }

export async function runTrialSandbox(trialDir: string): Promise<TrialResult> {
  const checks: string[] = []
  let ok = true
  let files: string[] = []
  try { files = (await fs.readdir(trialDir)).filter(f => /\.(ts|js|mjs)$/i.test(f)) } catch { return { ok: false, checks: ['مجلد التجربة غير موجود'] } }
  if (files.length === 0) { return { ok: false, checks: ['لا ملفات كود لاختبارها في النسخة التجريبية'] } }
  for (const f of files.slice(0, 10)) {
    const p = path.join(trialDir, f)
    const syntax = await new Promise<boolean>(resolve => {
      const child = spawn(process.execPath, ['--check', p], { windowsHide: true, timeout: 8000 })
      child.on('close', code => resolve(code === 0))
      child.on('error', () => resolve(false))
    })
    checks.push(`${f}: فحص التركيب ${syntax ? '✓' : '✗'}`)
    if (!syntax) ok = false
  }
  checks.push(`الحزمة ساكنة: ${files.length} ملف كود — لم يُشغَّل أي كود خارجي في هذه المرحلة`)
  return { ok, checks }
}

/* ------------------------------------------------------------------ */
/* دورة الاعتماد: تجريبي ← اعتماد ← أصلي جديد ← طلب حذف الأصلي السابق  */
/* ------------------------------------------------------------------ */

export function nextVersionName(s: ResearchState): string {
  return `v${s.versions.length + 1}`
}

export async function approveTrial(s: ResearchState, trialDir: string, filesCount: number): Promise<{ ok: boolean, message: string }> {
  const name = nextVersionName(s)
  const officialDir = path.join(HARVEST_DIR(), `${name}-official`)
  await fs.mkdir(officialDir, { recursive: true })
  try {
    for (const f of await fs.readdir(trialDir)) await fs.copyFile(path.join(trialDir, f), path.join(officialDir, f))
  } catch { return { ok: false, message: 'تعذر نسخ النسخة التجريبية' } }
  s.versions.push({ name, official: true, files: filesCount, createdAt: new Date().toISOString() })
  const previous = s.versions.filter(v => v.name !== name && v.official)
  logEvent(s, `اعتُمدت ${name} كنسخة أصلية${previous.length > 0 ? ` — الأصلية السابقة ${previous.map(v => v.name).join('، ')} تنتظر قرار الحذف من العميل` : ''}`)
  if (previous.length > 0) {
    s.approvals.unshift({
      id: `del-${name}-${Date.now()}`,
      question: `حذف النسخة الأصلية السابقة (${previous.map(v => v.name).join('، ')})؟`,
      detail: `اعتُمدت ${name} وأصبحت الأصل. حسب سياسة الدورات: الأصل السابق يُحذف فقط بأمرك الصريح.`,
      state: 'pending',
    })
  }
  return { ok: true, message: `اعتُمدت ${name} كنسخة أصلية ✓` }
}

export async function deleteVersion(s: ResearchState, name: string): Promise<{ ok: boolean, message: string }> {
  const v = s.versions.find(x => x.name === name)
  if (v === undefined) return { ok: false, message: 'نسخة غير معروفة' }
  await fs.rm(path.join(HARVEST_DIR(), `${name}-official`), { recursive: true, force: true })
  s.versions = s.versions.filter(x => x.name !== name)
  logEvent(s, `حُذفت النسخة الأصلية ${name} بأمر العميل`)
  return { ok: true, message: `حُذفت ${name} ✓` }
}

export { ROOT, DL_DIR, HARVEST_DIR, logEvent, doneMarkerPath }
