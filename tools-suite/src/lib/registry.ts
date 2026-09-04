/**
 * Process-wide registries shared between TOOLS plugins
 * (the parallel-agents tool writes; the HTTP hub reads).
 */

export interface AutoAgentRun {
  id: string
  workspace: string
  objective: string
  status: 'running' | 'completed' | 'stopped' | 'error' | 'limit'
  rounds: number
  maxRounds: number
  startedAt: string
  endedAt?: string
  deadline: number
  log: Array<{ round: number; at: string; summary: string; stopReason: string }>
  lastOutput?: string
  stop(): void
}

const autoAgents = new Map<string, AutoAgentRun>()
let autoSeq = 0

export function nextAutoId(): string {
  autoSeq += 1
  return `tools-auto-${autoSeq}`
}

export function registerAutoAgent(run: AutoAgentRun): void {
  autoAgents.set(run.id, run)
  // Keep the registry bounded.
  if (autoAgents.size > 50) {
    const firstKey = autoAgents.keys().next().value
    if (firstKey !== undefined && autoAgents.get(firstKey)?.status !== 'running') autoAgents.delete(firstKey)
  }
}

export function listAutoAgents(): Array<Omit<AutoAgentRun, 'stop'>> {
  return [...autoAgents.values()].map(({ stop: _stop, ...rest }) => rest)
}

export function getAutoAgent(id: string): AutoAgentRun | undefined {
  return autoAgents.get(id)
}
