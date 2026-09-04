/**
 * Tools — agent TODO ↔ kanban sync.
 * Observes the agent's todo_write results and persists the latest list per
 * workspace, so the tools hub's kanban view mirrors live session progress.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { toolsDirFor, readJson, writeJson, nowIso } from './lib/util.ts'

export const name = 'tool-todos-sync'
export const inject = ['tools']

export interface AgentTodoSnapshot {
  updatedAt: string
  todos: Array<{ content: string; status: string }>
  counts: { pending: number; inProgress: number; completed: number }
}

export function todosFile(workspaceRoot: string): string {
  return path.join(toolsDirFor(workspaceRoot), 'agent-todos.json')
}

export async function readAgentTodos(workspaceRoot: string): Promise<AgentTodoSnapshot | null> {
  return readJson<AgentTodoSnapshot | null>(todosFile(workspaceRoot), null)
}

export function apply(ctx: Context): void {
  ctx.on('tools/result', (exec: unknown, result: unknown) => {
    void (async () => {
      try {
        const e = exec as { name?: string; agent?: { session?: { header?: { cwd?: string } } } }
        if (e?.name !== 'todo_write') return
        const cwd = e.agent?.session?.header?.cwd
        if (typeof cwd !== 'string' || cwd === '') return
        const value = (result as { value?: unknown }).value as AgentTodoSnapshot['todos'] & { counts?: AgentTodoSnapshot['counts'] } | undefined
        if (value === undefined || !Array.isArray((value as { todos?: unknown }).todos)) return
        const todos = (value as { todos: Array<{ content: string; status: string }> }).todos
        const snapshot: AgentTodoSnapshot = {
          updatedAt: nowIso(),
          todos,
          counts: {
            pending: todos.filter(t => t.status === 'pending').length,
            inProgress: todos.filter(t => t.status === 'in_progress').length,
            completed: todos.filter(t => t.status === 'completed').length,
          },
        }
        await fs.mkdir(toolsDirFor(cwd), { recursive: true })
        await writeJson(todosFile(cwd), snapshot)
      } catch {
        // Sync is best-effort; never disturb the tool pipeline.
      }
    })()
  })
}
