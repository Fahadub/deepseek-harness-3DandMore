/** Engine-neutral validation: never infer a game's genre, camera, or world scale. */
export type AssetOp = { op: string; args: Record<string, unknown> }
export function validateAssetOps(value: unknown): AssetOp[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 32) throw new Error('ops must be an array of at most 32 operations')
  const known = new Set(['apply_transforms', 'origin_to_floor', 'rotate', 'normalize_size', 'decimate', 'collision'])
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || !known.has(item.op)) throw new Error('Unknown asset operation at index ' + index)
    const args = item.args ?? {}
    if (typeof args !== 'object' || args === null || Array.isArray(args)) throw new Error('Operation args must be an object')
    const finite = (name: string, fallback: number, lo: number, hi: number) => {
      const v = args[name] ?? fallback
      if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new Error(item.op + ': invalid ' + name)
    }
    if (item.op === 'rotate') {
      if (!['X', 'Y', 'Z'].includes(String(args.axis ?? 'X').toUpperCase())) throw new Error('rotate: axis must be X, Y or Z')
      finite('degrees', 90, -36000, 36000)
    }
    if (item.op === 'normalize_size') finite('fit_m', 2, 0.0001, 1000000)
    if (item.op === 'decimate' || item.op === 'collision') finite('ratio', item.op === 'collision' ? 0.25 : 0.5, 0.01, 1)
    if (item.op === 'collision') {
      if (index !== value.length - 1) throw new Error('collision must be last so its geometry matches the final visual mesh')
      if (args.suffix !== undefined && !['-col', '-convcol'].includes(args.suffix)) throw new Error('collision suffix must be -col (static concave) or -convcol (convex)')
    }
    return { op: item.op, args }
  })
}

export function engineLogErrors(log: string): string[] {
  return log.split(String.fromCharCode(10)).filter(line =>
    ['SCRIPT ERROR:', 'Parse Error:', 'ERROR:', 'Traceback (most recent call last)', 'Failed to load script'].some(marker => line.includes(marker))
  ).slice(0, 30)
}

export function engineRunPassed(result: { code: number | null; timedOut: boolean; out: string }): boolean {
  return result.code === 0 && !result.timedOut && engineLogErrors(result.out).length === 0
}
