/**
 * بوابة توليد الصور المرجعية — مكتبة إعداد/توليد لأي مزود متوافق مع OpenAI Images.
 * (التسجيل الفعلي للأداة في tool-media.ts باسم image_generate — هذا الملف يوفر
 * الإعدادات العامة + التوليد + مسارات المركز؛ لا يسجل أداة بنفسه منعًا للتعارض.)
 * المستخدم يحدد: رابط المزود + اسم النموذج + المفتاح (خانة في المركز).
 * البروتوكول الإلزامي قبل أي tripo_generate: اسأل العميل أولًا — أرفاق صوره
 * أم توليد صور مرجعية هنا؟ الصور تُعرض للعميل في المركز (هو من يراها ويوافق/يرفض)،
 * والنموذج نفسه لا يرى الصور أبدًا. بلا مفتاح؟ ذكّر العميل نصًا أن المفتاح غير متوفر.
 */
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeJson } from './lib/util.ts'

export const name = 'tool-imggen'
export const inject = ['tools']

interface ImgGenConfig { baseUrl: string, model: string, key: string }

const cfgFile = (): string => path.join(os.homedir(), '.dsh-tools', 'imggen', 'config.json')

export async function loadImgGenConfig(): Promise<ImgGenConfig> {
  try {
    const c = JSON.parse(await fs.readFile(cfgFile(), 'utf8')) as Partial<ImgGenConfig>
    return {
      baseUrl: c.baseUrl ?? 'https://api.openai.com/v1',
      model: c.model ?? 'gpt-image-1',
      key: c.key ?? process.env.IMGGEN_API_KEY ?? '',
    }
  } catch {
    return { baseUrl: 'https://api.openai.com/v1', model: 'gpt-image-1', key: process.env.IMGGEN_API_KEY ?? '' }
  }
}

export async function saveImgGenConfig(c: ImgGenConfig): Promise<void> {
  await fs.mkdir(path.dirname(cfgFile()), { recursive: true })
  await writeJson(cfgFile(), c)
}

export async function generateImages(workspaceRoot: string, prompt: string, n = 1): Promise<{ files: string[], provider: string, model: string, reviewNote: string }> {
  const cfg = await loadImgGenConfig()
  if (cfg.key === '') {
    throw new Error('مفتاح توليد الصور غير متوفر — أضِف المزود والنموذج والمفتاح من مركز الأدوات (تبويب أصول 3D ← بطاقة «توليد الصور المرجعية»). يمكنك حاليًا إرفاق صورك الخاصة أو المتابعة بلا صور مرجعية.')
  }
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/images/generations'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({ model: cfg.model, prompt: prompt.slice(0, 4000), n: Math.min(4, Math.max(1, n)) }),
    signal: AbortSignal.timeout(180_000),
  })
  const j = await res.json().catch(() => null) as { data?: Array<{ b64_json?: string, url?: string }> } | null
  if (!res.ok || j?.data === undefined || j.data.length === 0) {
    const detail = (j as unknown as { error?: { message?: string } } | null)?.error?.message ?? ''
    throw new Error(`فشل توليد الصور (${res.status})${detail !== '' ? ': ' + detail : ''}`)
  }
  const dir = path.join(workspaceRoot, 'assets', 'generated')
  await fs.mkdir(dir, { recursive: true })
  const stamp = Date.now()
  const files: string[] = []
  for (let i = 0; i < j.data.length; i++) {
    const item = j.data[i]
    const file = path.join(dir, `img-${stamp}-${i + 1}.png`)
    if (typeof item.b64_json === 'string' && item.b64_json !== '') {
      await fs.writeFile(file, Buffer.from(item.b64_json, 'base64'))
    } else if (typeof item.url === 'string' && item.url !== '') {
      const r2 = await fetch(item.url, { signal: AbortSignal.timeout(120_000) })
      if (!r2.ok) continue
      await fs.writeFile(file, Buffer.from(await r2.arrayBuffer()))
    } else continue
    files.push(path.relative(workspaceRoot, file).replaceAll('\\', '/'))
  }
  if (files.length === 0) throw new Error('لم تُرجع الخدمة أي صورة صالحة')
  return {
    files,
    provider: cfg.baseUrl,
    model: cfg.model,
    reviewNote: 'أنت (النموذج) لا ترى الصور — اعرض مساراتها على العميل ليراجعها في مركز الأدومات (تبويب أصول 3D ← الصور المولّدة) وقراره: موافقة / رفض مع تحديد المرفوضة / إعادة بنفس البرومت / تعديل البرومت ثم إعادة / طلب تعديل الصورة. لا تنفّذ tripo_generate قبل موافقته الصريحة.',
  }
}
