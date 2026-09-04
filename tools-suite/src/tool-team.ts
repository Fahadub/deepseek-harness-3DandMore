/**
 * Tools suite — specialized parallel agent team + 24/7 auto agent.
 * Ports the original IDE's parallel-agents.js (9 specialized roles with task
 * fan-out) and autonomous-mode.js (objective-driven auto agent with
 * round/time limits), rebuilt on dsh's subagent seam.
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { blocksToText, nowIso } from './lib/util.ts'
import { nextAutoId, registerAutoAgent, type AutoAgentRun } from './lib/registry.ts'

export const name = 'tool-parallel'
export const inject = ['tools', 'subagents']

/** The 9 the original IDE specialist roles (personas ported from agent-roles.js). */
export const ROLES: Record<string, { title: string; specialty: string; persona: string }> = {
  orchestrator: {
    title: 'Orchestrator',
    specialty: 'Task planning, decomposition, coordination, and quality review',
    persona: 'You are the Orchestrator Agent — the master coordinator. Plan and decompose the task, define clean interfaces between parts, review quality, and reconcile inconsistencies. Produce precise, actionable outputs.',
  },
  frontend: {
    title: 'Frontend',
    specialty: 'UI/UX, HTML, CSS, JavaScript, React, Vue, Angular, Svelte',
    persona: 'You are the Frontend Agent — specialist in UI/UX and visual architecture. Deliver accessible, responsive, polished interfaces with clean component structure.',
  },
  backend: {
    title: 'Backend',
    specialty: 'Server-side logic, routing, middleware, PHP, Node.js, Python, Go, Java',
    persona: 'You are the Backend Agent — specialist in server-side development. Deliver correct, efficient server logic with proper error handling and clean layering.',
  },
  database: {
    title: 'Database',
    specialty: 'Schema design, SQL, migrations, ORM, queries',
    persona: 'You are the Database Agent — specialist in database design. Deliver normalized schemas, correct migrations, and efficient queries. State trade-offs explicitly.',
  },
  api: {
    title: 'API',
    specialty: 'REST, GraphQL, WebSocket, OpenAPI, validation',
    persona: 'You are the API Agent — specialist in API design. Deliver consistent, well-versioned endpoints with validation and precise contracts.',
  },
  security: {
    title: 'Security',
    specialty: 'Authentication, authorization, encryption, hardening',
    persona: 'You are the Security Agent — specialist in application security. Identify concrete vulnerabilities and deliver fixes: authn/authz, secrets handling, injection, headers.',
  },
  testing: {
    title: 'Testing',
    specialty: 'Unit, integration, E2E tests, TDD',
    persona: 'You are the Testing Agent — specialist in software testing. Deliver meaningful, fast, deterministic tests covering the happy path and edge cases.',
  },
  devops: {
    title: 'DevOps',
    specialty: 'Docker, CI/CD, deployment, monitoring',
    persona: 'You are the DevOps Agent — specialist in infrastructure. Deliver reproducible builds, containers, pipelines, and deployment steps.',
  },
  gameengine: {
    title: 'GameEngine',
    specialty: 'Canvas 2D, WebGL, Three.js 3D, Phaser, physics, particles, audio SFX',
    persona: 'You are the Game & 3D Engine Agent — world-class specialist in game programming and interactive graphics. Deliver performant, visually striking game systems with cinematic color palettes.',
  },
}

interface AgentLike {
  session?: { header?: { cwd?: string } }
}

function parentFrom(exec: unknown): AgentLike & object {
  const parent = (exec as { agent?: AgentLike }).agent
  if (parent === undefined || parent === null) throw new Error('this tool must run inside an agent session')
  return parent as AgentLike & object
}

function subagents(ctx: Context): {
  start: (provider: string, request: {
    label?: string
    prompt: Array<{ type: 'text'; text: string }>
    parent: object
    signal: AbortSignal
    persona?: string
  }) => Promise<{ result: Promise<{ output: unknown; stopReason: string }>; dispose(): Promise<void> }>
} {
  const rt = (ctx as unknown as { subagents: unknown }).subagents
  if (rt === undefined || rt === null) throw new Error('subagents service unavailable')
  return rt as never
}

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'parallel_team',
    description:
      'Parallel specialist agent team. Fan a decomposed task out to specialist subagents that run CONCURRENTLY. ' +
      `Roles: ${Object.keys(ROLES).join(', ')}. ` +
      'Decompose the objective yourself (like TOOLS\'s task-decomposer) and pass one task per role; ' +
      'include an orchestrator task when parts need coordination. Returns each role\'s output.',
    parameters: {
      objective: { type: 'string', required: true, description: 'The overall objective being decomposed' },
      tasks: {
        type: 'array',
        required: true,
        description: 'Decomposed tasks; each runs in parallel as a specialist subagent',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            role: { type: 'string', required: true, description: `One of: ${Object.keys(ROLES).join(', ')}` },
            task: { type: 'string', required: true, description: 'Concrete instruction for this specialist' },
          },
        },
      },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: renderTeam(value) }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const parent = parentFrom(exec)
      const rt = subagents(ctx)
      const results: Array<{ role: string; title: string; stopReason: string; output: string }> = []
      const runs = await Promise.all(args.tasks.map(async (t) => {
        const role = ROLES[t.role] ?? undefined
        const run = await rt.start('spawn', {
          label: `team-${t.role}`,
          prompt: [{ type: 'text', text: `${role?.persona ?? 'You are a focused specialist agent.'}\n\n# Task (role: ${t.role})\n${t.task}\n\n# Overall objective (context)\n${args.objective}\n\nDeliver your specialist output concisely.` }],
          parent,
          signal: exec.signal,
          persona: role?.persona,
        })
        return { role: t.role, title: role?.title ?? t.role, run }
      }))
      try {
        await Promise.all(runs.map(async ({ role, title, run }) => {
          const settled = await run.result
          results.push({ role, title, stopReason: settled.stopReason, output: blocksToText(settled.output).slice(0, 8000) })
        }))
      } finally {
        await Promise.allSettled(runs.map(({ run }) => run.dispose()))
      }
      results.sort((a, b) => a.role.localeCompare(b.role))
      return { objective: args.objective, completed: results.length, requested: args.tasks.length, results }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'auto_agent',
    description:
      'Auto Agent (24/7): launch a detached objective-driven agent loop that keeps working AFTER this tool ' +
      'returns — it survives browser close and runs rounds until the objective is met, [DONE] is emitted, or the ' +
      'round/time limit is hit. Monitor and stop it from the tools hub (/tools → الوكلاء) or with auto_agent_stop. ' +
      'The agent reviews its own progress each round (deep-context style).',
    parameters: {
      objective: { type: 'string', required: true, description: 'The autonomous objective' },
      max_rounds: { type: 'number', description: 'Round limit (default 10)' },
      max_minutes: { type: 'number', description: 'Time limit in minutes (default 15)' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: `🤖 auto agent started: ${JSON.stringify(value)}\nTrack progress at /tools → الوكلاء, or stop with auto_agent_stop.` }],
    },
    async execute(args, exec) {
      const parent = parentFrom(exec)
      const rt = subagents(ctx)
      const id = nextAutoId()
      const maxRounds = Math.max(1, Math.min(50, args.max_rounds ?? 10))
      const maxMinutes = Math.max(1, Math.min(240, args.max_minutes ?? 15))
      const cwd = parent.session?.header?.cwd ?? ''
      const run: AutoAgentRun = {
        id,
        workspace: cwd,
        objective: args.objective,
        status: 'running',
        rounds: 0,
        maxRounds,
        startedAt: nowIso(),
        deadline: Date.now() + maxMinutes * 60_000,
        log: [],
        stop() {
          this.status = this.status === 'running' ? 'stopped' : this.status
        },
      }
      registerAutoAgent(run)
      // Detached loop — continues after this tool call settles.
      void (async () => {
        let context = ''
        while (run.status === 'running' && run.rounds < maxRounds && Date.now() < run.deadline) {
          run.rounds += 1
          try {
            const child = await rt.start('spawn', {
              label: `${id}#${run.rounds}`,
              prompt: [{
                type: 'text',
                text:
                  'You are an autonomous agent working in a persistent loop.\n' +
                  `# Objective\n${run.objective}\n\n# Progress so far\n${context === '' ? '(first round)' : context}\n\n` +
                  'Do the next concrete chunk of work toward the objective using your tools (edit files, run commands). ' +
                  'Then summarize in 5-10 lines what changed and what remains. ' +
                  'When the objective is fully achieved, output exactly [DONE] on the last line.',
              }],
              parent,
              signal: AbortSignal.timeout(Math.max(60_000, run.deadline - Date.now())),
            })
            try {
              const settled = await child.result
              const out = blocksToText(settled.output)
              run.lastOutput = out.slice(0, 4000)
              run.log.push({ round: run.rounds, at: nowIso(), summary: out.slice(0, 600), stopReason: settled.stopReason })
              context = `${context}\n[round ${run.rounds}] ${out.slice(0, 2500)}`
              if (/\[DONE\]/.test(out)) {
                run.status = 'completed'
                break
              }
            } finally {
              await child.dispose().catch(() => { /* already gone */ })
            }
          } catch (err) {
            run.status = 'error'
            run.log.push({ round: run.rounds, at: nowIso(), summary: `error: ${String(err)}`, stopReason: 'error' })
            break
          }
        }
        run.endedAt = nowIso()
        if (run.status === 'running') run.status = run.rounds >= maxRounds ? 'limit' : 'limit'
      })()
      return { id, maxRounds, maxMinutes, hub: '/tools' }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'auto_agent_stop',
    description: 'Stop a running auto agent by id (ids from auto_agent or /tools → الوكلاء).',
    parameters: {
      id: { type: 'string', required: true, description: 'Auto agent id (e.g. tools-auto-1)' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const { getAutoAgent } = await import('./lib/registry.ts')
      const run = getAutoAgent(args.id)
      if (run === undefined) return `no auto agent with id ${args.id}`
      run.stop()
      return `stop requested for ${args.id} (round ${run.rounds})`
    },
  }))
}

function renderTeam(value: unknown): string {
  const v = value as { objective: string; completed: number; requested: number; results: Array<{ role: string; title: string; stopReason: string; output: string }> }
  const lines = [`🤝 الفريق — ${v.completed}/${v.requested} specialists finished for: ${v.objective.slice(0, 120)}`]
  for (const r of v.results) {
    lines.push(`\n## ${r.title} (${r.role}) — ${r.stopReason}\n${r.output.slice(0, 1200)}`)
  }
  return lines.join('\n')
}
