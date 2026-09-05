/**
 * Tools suite — permanent project memory.
 * Ports TOOLS IDE's [MEMORY] key=value feature: cross-session key/value
 * storage scoped to each workspace, exposed as a model-facing tool and a
 * /memory slash command. Stored under <workspace>/.dsh-tools/memory.json.
 */
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import { toolsDirFor, readJson, writeJson } from './lib/util.ts'

export const name = 'tool-memory'
export const inject = ['tools', 'commands']

type MemoryMap = Record<string, string>

function memoryFile(workspaceRoot: string): string {
  return path.join(toolsDirFor(workspaceRoot), 'memory.json')
}

async function loadMemory(workspaceRoot: string): Promise<MemoryMap> {
  return readJson<MemoryMap>(memoryFile(workspaceRoot), {})
}

function resolveWorkspace(exec: { agent?: { session: { header: { cwd?: string } } } }): string {
  const cwd = exec.agent?.session?.header?.cwd
  if (typeof cwd !== 'string' || cwd === '') throw new Error('no workspace selected for this session')
  return cwd
}

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'memory',
    description:
      'Permanent project memory for this workspace. Survives across sessions. ' +
      'Use it to record durable facts: decisions, conventions, credentials locations, ' +
      'user preferences, architecture notes. Ops: set (key+value), get (key), list, delete (key).',
    parameters: {
      op: { type: 'string', required: true, description: 'One of: set | get | list | delete' },
      key: { type: 'string', description: 'Memory key (required for set/get/delete)' },
      value: { type: 'string', description: 'Value to store (required for set)' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      const root = resolveWorkspace(exec as never)
      const file = memoryFile(root)
      const memory = await loadMemory(root)
      const key = (args.key ?? '').trim()
      switch (args.op) {
        case 'set': {
          if (key === '') throw new Error('memory set requires key')
          memory[key] = args.value ?? ''
          await writeJson(file, memory)
          return `memory set: ${key}`
        }
        case 'get': {
          if (key === '') throw new Error('memory get requires key')
          const value = memory[key]
          return value === undefined ? `no memory for key: ${key}` : `${key} = ${value}`
        }
        case 'delete': {
          if (key === '') throw new Error('memory delete requires key')
          if (!(key in memory)) return `no memory for key: ${key}`
          delete memory[key]
          await writeJson(file, memory)
          return `memory deleted: ${key}`
        }
        case 'list': {
          const keys = Object.keys(memory)
          if (keys.length === 0) return 'project memory is empty'
          return keys.map(k => `${k} = ${memory[k]}`).join('\n')
        }
        default:
          throw new Error(`unknown memory op: ${args.op}`)
      }
    },
  }))

  ctx.commands.register({
    name: 'memory',
    description: 'Show this workspace\'s permanent project memory (Tools suite)',
    input: { hint: '[key]' },
    handler: async (invocation): Promise<CommandResult> => {
      try {
        const root = resolveWorkspace({ agent: invocation.agent })
        const memory = await loadMemory(root)
        const key = invocation.rawInput.trim()
        if (key !== '') {
          const value = memory[key]
          return { kind: 'success', text: value === undefined ? `لا توجد ذاكرة للمفتاح: ${key}` : `${key} = ${value}` }
        }
        const keys = Object.keys(memory)
        if (keys.length === 0) {
          return { kind: 'success', text: 'ذاكرة المشروع فارغة. استخدم أداة memory (op=set) لتخزين معلومات دائمة.' }
        }
        return { kind: 'success', text: keys.map(k => `${k} = ${memory[k]}`).join('\n') }
      } catch (err) {
        return { kind: 'error', text: `memory command failed: ${String(err)}` }
      }
    },
  })

  // Best-effort: surface existing memory whenever a session starts in a known workspace.
  ctx.on('agent/session-start', async (agent: unknown) => {
    try {
      const a = agent as { session?: { header?: { cwd?: string } }; inject?: (x: unknown) => void }
      const cwd = a.session?.header?.cwd
      if (typeof cwd !== 'string' || cwd === '' || typeof a.inject !== 'function') return
      const memory = await loadMemory(cwd)
      const keys = Object.keys(memory)
      if (keys.length === 0) return
      const dump = keys.map(k => `- ${k} = ${memory[k]}`).join('\n')
      a.inject(createUserMessage({
        content: [{ type: 'text', text: `Permanent project memory for this workspace:\n${dump}` }],
        source: { kind: 'plugin', plugin: name },
      }))
    } catch {
      // Session-start hints are best-effort only.
    }
  })
}
