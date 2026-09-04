/**
 * Tools slash commands that steer the session agent
 * (auto-documentation, self-review, ER diagrams, verification, team).
 * Commands queue a proper plugin-sourced user message via agent.followup()
 * so the agent WAKES and executes the instruction immediately.
 */
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { CommandResult } from '@deepseek-ai/dsh-commands'

export const name = 'tool-commands'
export const inject = ['commands']

interface AgentHandle {
  followup?: (message: unknown) => void
}

function steer(invocation: { agent?: unknown }, instruction: string): CommandResult {
  const agent = invocation.agent as AgentHandle | undefined
  if (typeof agent?.followup === 'function') {
    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: instruction }],
        source: { kind: 'plugin', plugin: name },
      }))
      return { kind: 'success', text: '✅ تم إرسال المهمة إلى الوكيل — سيبدأ تنفيذها الآن.' }
    } catch (err) {
      return { kind: 'error', text: `فشل الإرسال: ${String(err instanceof Error ? err.message : err)}` }
    }
  }
  return {
    kind: 'success',
    text: `⚠️ تعذّر الإرسال التلقائي. انسخ التعليمات وأرسلها كرسالة:\n\n${instruction}`,
  }
}

export function apply(ctx: Context): void {
  // Execution governance modes (scaled confirmations)
  const MODES = {
    delegated: 'وضع التفويض: اعمل باستقلالية كاملة ونفّذ الأدوات دون طلب تأكيد، ولخّص في النهاية فقط.',
    cocreation: 'وضع المشاركة: اعرض خطتك قبل كل خطوة كبيرة، ونفّذ الخطوات الصغيرة مباشرة، واسأل قبل الكتابة فوق ملفات موجودة.',
    finetuning: 'وضع الضبط الدقيق: لا تنفّذ أي كتابة أو أمر دون موافقة صريحة أولاً — اقترح فقط.',
  }
  ctx.commands.register({
    name: 'mode',
    description: 'تغيير نمط التنفيذ (delegated | cocreation | finetuning)',
    input: { hint: '<delegated|cocreation|finetuning>' },
    handler: invocation => {
      const m = invocation.rawInput.trim().toLowerCase()
      if (MODES[m] === undefined) {
        return { kind: 'error', text: 'الأنماط: delegated (تفويض كامل) أو cocreation (مشاركة) أو finetuning (ضبط دقيق)' }
      }
      return steer(invocation, '[الأدوات /mode] ' + MODES[m])
    },
  })

  ctx.commands.register({
    name: 'docs',
    description: 'توليد/تحديث README.md للمشروع تلقائياً',
    handler: invocation => steer(invocation,
      '[الأدوات /docs] أنشئ أو حدّث README.md في جذر مساحة العمل: حلّل البنية (package.json وغيرها)، ' +
      'واكتب توثيقاً احترافياً يتضمن: وصف المشروع، المتطلبات، التثبيت، التشغيل، البناء، الاختبار، والبنية الأساسية للمجلدات. اجعله بالإنجليزية مع إيجاز.'),
  })

  ctx.commands.register({
    name: 'review',
    description: 'مراجعة ذاتية لآخر التعديلات',
    handler: invocation => steer(invocation,
      '[الأدوات /review] راجع عملك في آخر لفتين: 1) افحص التعديلات الأخيرة بحثاً عن أخطاء وكود نسيته (console.log، ملفات تجريبية) ' +
      '2) تحقق من جودة الكود والمعالجة الأخطائية 3) شغّل security_scan و verify_project إن أمكن ' +
      '4) أصلح أي مشاكل تجدها ثم لخّص النتيجة في نقاط.'),
  })

  ctx.commands.register({
    name: 'er',
    description: 'توليد مخطط ER لقاعدة البيانات (Mermaid)',
    handler: invocation => steer(invocation,
      '[الأدوات /er] حلّل قاعدة البيانات في مساحة العمل (ملفات SQL، نماذج ORM، migrations) وأنشئ docs/er-diagram.md ' +
      'يحتوي مخطط erDiagram بصيغة Mermaid للكيانات والعلاقات والمفاتيح، مع فقرة شرح موجزة.'),
  })

  ctx.commands.register({
    name: 'verify',
    description: 'تشغيل التحقق ثلاثي المراحل وإصلاح ما يفشل',
    handler: invocation => steer(invocation,
      '[الأدوات /verify] شغّل أداة verify_project. إن فشل أي مرحلة (استيرادات مفقودة / بناء / استجابة HTTP) ' +
      'أصلح المشكلة وأعد الفحص حتى تمر جميع المراحل، ثم قدّم ملخصاً نهائياً.'),
  })

  ctx.commands.register({
    name: 'team',
    description: 'تفويض مهمة لفريق الوكلاء المتخصصين المتوازي',
    input: { hint: '<الهدف>' },
    handler: invocation => {
      const objective = invocation.rawInput.trim()
      if (objective === '') {
        return { kind: 'error', text: 'اكتب الهدف بعد الأمر، مثال: /team ابنِ تطبيق مهام بواجهة React وخلفية Express' }
      }
      return steer(invocation,
        `[الأدوات /team] فكّك الهدف التالي إلى مهام واضحة ثم شغّل أداة parallel_team (مهمة واحدة لكل دور اختصاصي):\n${objective}\n` +
        'أضف مهمة orchestrator للتنسيق عند الحاجة، ثم جمّع النتائج في رد واحد منظم.')
    },
  })
}
