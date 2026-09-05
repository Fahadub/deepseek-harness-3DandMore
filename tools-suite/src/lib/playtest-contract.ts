export const DEVICE_PROFILES = {
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
  mobile: { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
  tablet: { width: 820, height: 1180, deviceScaleFactor: 1, mobile: true },
} as const
export type DeviceProfile = keyof typeof DEVICE_PROFILES
export interface PlayAction { type: 'key' | 'wait' | 'click' | 'move' | 'touch'; key?: string; ms?: number; x?: number; y?: number; phase?: 'start' | 'move' | 'end'; points?: Array<{ x: number; y: number; id?: number }> }
export function keyEvent(code: string) {
  const special: Record<string, [string, number]> = { Space: [' ', 32], Enter: ['Enter', 13], Escape: ['Escape', 27], Tab: ['Tab', 9], Backspace: ['Backspace', 8], ArrowLeft: ['ArrowLeft', 37], ArrowUp: ['ArrowUp', 38], ArrowRight: ['ArrowRight', 39], ArrowDown: ['ArrowDown', 40], ShiftLeft: ['Shift', 16], ShiftRight: ['Shift', 16], ControlLeft: ['Control', 17], ControlRight: ['Control', 17], AltLeft: ['Alt', 18], AltRight: ['Alt', 18] }
  let entry = special[code]
  if (code.length === 4 && code.startsWith('Key') && code[3] >= 'A' && code[3] <= 'Z') entry = [code[3].toLowerCase(), code.charCodeAt(3)]
  if (code.length === 6 && code.startsWith('Digit') && code[5] >= '0' && code[5] <= '9') entry = [code[5], code.charCodeAt(5)]
  if (!entry) throw new Error('Unsupported keyboard code: ' + code + '. Use KeyA..KeyZ, Digit0..Digit9, arrows, Space, Enter, Escape or modifier keys.')
  return { code, key: entry[0], windowsVirtualKeyCode: entry[1], nativeVirtualKeyCode: entry[1] }
}
export function validatePlayActions(actions: PlayAction[]): void {
  if (!Array.isArray(actions) || actions.length > 64) throw new Error('actions must be an array with at most 64 entries')
  let duration = 0
  for (const a of actions) {
    if (!a || !['key','wait','click','move','touch'].includes(a.type)) throw new Error('Unknown play action')
    const ms = a.ms ?? 1200
    if (!Number.isFinite(ms) || ms < 0 || ms > 30000) throw new Error('action ms must be within 0..30000')
    duration += ms
    if (a.type === 'key') keyEvent(a.key ?? '')
    if ([a.x, a.y].some(v => v !== undefined && (!Number.isFinite(v) || v < 0))) throw new Error('Action coordinates must be finite and nonnegative')
    if (a.type === 'touch') {
      if (!['start','move','end'].includes(a.phase ?? '')) throw new Error('touch phase must be start, move or end')
      const pts = a.points ?? []
      if (!Array.isArray(pts) || pts.length > 5 || (a.phase !== 'end' && pts.length === 0) || (a.phase === 'end' && pts.length !== 0)) throw new Error('Touch start/move needs 1..5 points; end needs no points')
      if (new Set(pts.map((p,i) => p.id ?? i)).size !== pts.length) throw new Error('Touch IDs must be unique')
      if (pts.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || (p.id !== undefined && (!Number.isInteger(p.id) || p.id < 0)))) throw new Error('Invalid touch point')
    }
  }
  if (duration > 120000) throw new Error('Total action duration exceeds two minutes; split the test')
}

export function deliveryGate(report: { loaderHidden: boolean; consoleErrors: string[]; networkFails: string[]; avgFps: number | null; hudChecks: { ok: boolean }[]; chaos: { verified?: boolean }[] }, minFps = 15) {
  const checks = {
    ready: report.loaderHidden, noScriptErrors: report.consoleErrors.length === 0, noUnexpectedNetworkFailures: report.networkFails.length === 0,
    sampledFps: report.avgFps !== null && report.avgFps >= minFps,
    behavior: report.hudChecks.length > 0 && report.hudChecks.every(c => c.ok),
    requestedFailureModes: report.chaos.every(c => c.verified === true),
  }
  return { ok: Object.values(checks).every(Boolean), checks, score: (checks.ready ? 20 : 0) + (checks.noScriptErrors ? 20 : 0) + (checks.noUnexpectedNetworkFailures ? 10 : 0) + (checks.sampledFps ? 20 : 0) + (checks.behavior ? 30 : 0) }
}
