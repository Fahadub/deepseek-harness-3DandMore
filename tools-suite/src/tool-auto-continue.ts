/**
 * Auto-continue when limits reset — «استئناف تلقائي عند تجدد الحدود»
 *
 * Any model that hits a usage/limit cap can resume automatically: the agent
 * arms the timer (it knows its provider's reset window), the hub shows a
 * live countdown, and when the window elapses the session is woken with a
 * follow-up — up to a user-configured number of retries. Server-side, so it
 * survives a closed browser.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { toolsDirFor, readJson, writeJson, nowIso } from './lib/util.ts'

export const name = 'tool-auto-continue'
export const inject = ['tools']

export interface AutoContinueState {
  enabled: boolean
  retries: number      // user cap on auto-resumes per arming
  used: number         // resumes consumed so far in the current run
  minutes: number      // default reset window when the agent does not know it
  resetAt: number | null // epoch ms countdown target
  model: string | null  // provider/model the limit belongs to
  status: 'idle' | 'waiting' | 'fired' | 'exhausted' | 'disabled'
  lastMessage: string | null
  updatedAt: string | null
}

export function defaultState(): AutoContinueState {
  return { enabled: true, retries: 1, used: 0, minutes: 60, resetAt: null, model: null, status: 'idle', lastMessage: null, updatedAt: null }
}

export function stateFile(workspaceRoot: string): string {
  return path.join(toolsDirFor(workspaceRoot), 'auto-continue.json')
}

export async function loadState(workspaceRoot: string): Promise<AutoContinueState> {
  return { ...defaultState(), ...(await readJson<Partial<AutoContinueState>>(stateFile(workspaceRoot), {})) }
}

export async function saveState(workspaceRoot: string, s: AutoContinueState): Promise<void> {
  s.updatedAt = nowIso()
  await writeJson(stateFile(workspaceRoot), s)
}

interface AgentHandle {
  followup?: (m: unknown) => void
  id?: unknown
}

/** Arm the countdown; on elapse (while retries remain) wake `agent`. */
export function arm(
  ctx: Context,
  workspaceRoot: string,
  agent: AgentHandle | null,
  minutes: number,
  model: string | null,
  note: string,
): AutoContinueState {
  void ctx
  void workspaceRoot
  void agent
  void minutes
  void model
  void note
  // Real arming is performed by the plugin's apply() closure (needs timers);
  // this export exists for tests of pure pieces.
  return defaultState()
}

/** Shared runtime handle: set by apply(), consumed by the HTTP layer. */
export const autoContinueApi: Record<string, unknown> = {}

export function apply(ctx: Context): void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const agents = new Map<string, AgentHandle | null>()

  async function fire(workspaceRoot: string): Promise<void> {
    const s = await loadState(workspaceRoot)
    if (!s.enabled) { s.status = 'disabled'; await saveState(workspaceRoot, s); return }
    if (s.used >= s.retries) { s.status = 'exhausted'; s.resetAt = null; await saveState(workspaceRoot, s); return }
    s.used += 1
    const agent = agents.get(workspaceRoot) ?? null
    let delivered = false
    if (agent !== null && typeof agent.followup === 'function') {
      try {
        agent.followup(createUserMessage({
          content: [{ type: 'text', text: '[auto-continue] انتهت مدة تجدد حدود النموذج — استأنف المهمة من حيث توقفت وأكمل.' }],
          source: { kind: 'plugin', plugin: name },
        }))
        delivered = true
      } catch { /* session may be gone */ }
    }
    s.status = delivered ? 'fired' : 'exhausted'
    s.resetAt = null
    s.lastMessage = delivered ? 'استؤنفت الجلسة تلقائياً' : 'انتهت المحاولات أو الجلسة مغلقة'
    await saveState(workspaceRoot, s)
  }

  async function armReal(workspaceRoot: string, agent: AgentHandle | null, minutes: number, model: string | null, note: string): Promise<AutoContinueState> {
    const s = await loadState(workspaceRoot)
    s.enabled = true
    s.used = 0
    s.minutes = minutes > 0 ? minutes : s.minutes
    s.model = model ?? s.model
    s.resetAt = Date.now() + s.minutes * 60_000
    s.status = 'waiting'
    s.lastMessage = note
    await saveState(workspaceRoot, s)
    agents.set(workspaceRoot, agent)
    const prev = timers.get(workspaceRoot)
    if (prev !== undefined) clearTimeout(prev)
    timers.set(workspaceRoot, setTimeout(() => { void fire(workspaceRoot) }, Math.max(1500, s.minutes * 60_000)))
    return s
  }

  async function cancel(workspaceRoot: string): Promise<AutoContinueState> {
    const s = await loadState(workspaceRoot)
    const prev = timers.get(workspaceRoot)
    if (prev !== undefined) { clearTimeout(prev); timers.delete(workspaceRoot) }
    s.resetAt = null
    s.status = s.enabled ? 'idle' : 'disabled'
    s.used = 0
    s.lastMessage = 'أُلغي الاستئناف يدوياً'
    await saveState(workspaceRoot, s)
    return s
  }

  ctx.effect(() => () => {
    for (const t of timers.values()) clearTimeout(t)
    timers.clear()
  }, 'tool-auto-continue: timers')

  // Exposed for the HTTP layer (hub settings UI) via the module registry.
  Object.assign(autoContinueApi, { armReal, cancel, loadState, saveState, defaultState, fire })

  function resolveWorkspace(exec: unknown): string {
    const cwd = (exec as { agent?: { session?: { header?: { cwd?: string } } } })?.agent?.session?.header?.cwd
    if (typeof cwd !== 'string' || cwd === '') throw new Error('no workspace selected for this session')
    return cwd
  }

  ctx.tools.register(defineTool({
    name: 'auto_continue',
    description:
      'Auto-continue when limits reset — «استئناف تلقائي عند تجدد الحدود». Arm it when you (the model) hit a usage/rate limit: ' +
      'pass the provider reset window in minutes and the resume budget. When the window elapses the session is woken ' +
      'automatically to continue, up to the configured retries. Also reports the live countdown. ' +
      'Actions: arm | status | cancel. The user controls the default budget in the tools hub.',
    parameters: {
      action: { type: 'string', required: true, description: 'arm | status | cancel' },
      minutes: { type: 'number', description: 'Reset window in minutes (when known from the provider error)' },
      retries: { type: 'number', description: 'Override the user resume budget for this run' },
      model: { type: 'string', description: 'Provider/model that hit the limit' },
      note: { type: 'string', description: 'What to resume (short context note)' },
    },
    output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }] },
    async execute(args, exec) {
      const root = resolveWorkspace(exec)
      const agent = ((exec as { agent?: AgentHandle }).agent ?? null)
      if (args.action === 'arm') {
        let s = await loadState(root)
        if (typeof args.retries === 'number' && args.retries >= 1) {
          s.retries = Math.min(100, Math.floor(args.retries))
          await saveState(root, s)
        }
        s = await armReal(root, agent, args.minutes ?? s.minutes, args.model ?? null, args.note ?? 'استئناف بعد تجدد الحدود')
        return { armed: true, minutes: s.minutes, retries: s.retries, resetAt: s.resetAt, model: s.model }
      }
      if (args.action === 'cancel') return { cancelled: true, state: await cancel(root) }
      const s = await loadState(root)
      return {
        enabled: s.enabled, status: s.status, used: s.used, retries: s.retries,
        minutes: s.minutes, resetAt: s.resetAt,
        remainingMs: s.resetAt === null ? null : Math.max(0, s.resetAt - Date.now()),
        model: s.model, note: s.lastMessage,
      }
    },
  }))

  void fs
}
