/** `skill` namespace dictionaries for the dedicated tool row. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'skill'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'row.running': '正在加载 skill',
  'row.failed': 'skill 加载失败',
  'row.stopped': 'skill 加载已中止',
  'row.instructions': '说明',
  'menu.userOnly': '仅用户',
} satisfies Record<string, string>

/** The skill namespace key union. */
export type SkillKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'row.running': 'Loading skill',
  'row.failed': 'Skill load failed',
  'row.stopped': 'Skill load stopped',
  'row.instructions': 'Instructions',
  'menu.userOnly': 'user-only',
} satisfies Record<SkillKey, string>

/** Arabic dictionary, checked complete against the zh key set. */
export const ar = {
  'row.running': 'جارٍ تحميل المهارة',
  'row.failed': 'فشل تحميل المهارة',
  'row.stopped': 'أُوقف تحميل المهارة',
  'row.instructions': 'التعليمات',
  'menu.userOnly': 'للمستخدم فقط',
} satisfies Record<SkillKey, string>
