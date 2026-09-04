/**
 * Tools suite — file version history & restore.
 * Ports the original IDE's file version history / undo-delete / smart-rollback:
 * every agent write/edit snapshots the prior file content first, and the
 * TOOLS hub can list, view, restore, or diff any snapshot.
 */
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import { toolsDirFor, readJson, writeJson } from './lib/util.ts'

export const name = 'tool-versions'
export const inject = ['tools']

/** One snapshot per file: the FIRST captured state is kept forever; later
 * writes never add a second entry (unless future policy changes). */
const MAX_PER_FILE = 1
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024

interface SnapshotMeta {
  id: string
  rel: string
  ts: string
  encoding: 'utf8' | 'base64'
  size: number
  cause: string
}

function versionsDir(workspaceRoot: string): string {
  return path.join(toolsDirFor(workspaceRoot), 'versions')
}

function fileKey(rel: string): string {
  return createHash('sha1').update(rel.replace(/\\/g, '/')).digest('hex').slice(0, 16)
}

async function listFileSnapshots(workspaceRoot: string, rel: string): Promise<SnapshotMeta[]> {
  const dir = path.join(versionsDir(workspaceRoot), fileKey(rel))
  const meta = await readJson<Record<string, SnapshotMeta[]>>(path.join(dir, 'index.json'), {})
  return (meta.entries ?? []).slice().sort((a, b) => (a.ts < b.ts ? 1 : -1))
}

async function saveFileSnapshots(workspaceRoot: string, rel: string, list: SnapshotMeta[]): Promise<void> {
  const dir = path.join(versionsDir(workspaceRoot), fileKey(rel))
  const meta = await readJson<{ entries?: SnapshotMeta[] }>(path.join(dir, 'index.json'), {})
  meta.entries = list.slice(0, MAX_PER_FILE)
  await writeJson(path.join(dir, 'index.json'), meta)
}

/** Capture the current on-disk content of `absPath` before it is overwritten. */
export async function captureSnapshot(workspaceRoot: string, absPath: string, cause: string): Promise<boolean> {
  const rel = path.relative(workspaceRoot, absPath).replace(/\\/g, '/')
  if (rel.startsWith('..')) return false
  if (rel.startsWith('.dsh-tools/')) return false
  let buf: Buffer
  try {
    const stat = await fs.stat(absPath)
    if (!stat.isFile() || stat.size > MAX_SNAPSHOT_BYTES) return false
    buf = await fs.readFile(absPath)
  } catch {
    return false // did not exist — nothing to snapshot (new file)
  }
  // Keep only the first snapshot per file: if one already exists, skip.
  const prior = await listFileSnapshots(workspaceRoot, rel)
  if (prior.length >= MAX_PER_FILE) return false
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const id = `${fileKey(rel)}_${ts}`
  const encoding: 'utf8' | 'base64' = buf.includes(0) ? 'base64' : 'utf8'
  const payload = encoding === 'utf8' ? buf.toString('utf8') : buf.toString('base64')
  await writeJson(path.join(versionsDir(workspaceRoot), fileKey(rel), `${id}.json`), { id, content: payload })
  const existing = await listFileSnapshots(workspaceRoot, rel)
  existing.unshift({ id, rel, ts: new Date().toISOString(), encoding, size: buf.length, cause })
  await saveFileSnapshots(workspaceRoot, rel, existing)
  // Prune orphaned snapshot payloads beyond the cap.
  for (const old of existing.slice(MAX_PER_FILE)) {
    await fs.rm(path.join(versionsDir(workspaceRoot), fileKey(rel), `${old.id}.json`), { force: true }).catch(() => { /* gone */ })
  }
  return true
}

export async function listSnapshots(workspaceRoot: string, rel?: string): Promise<SnapshotMeta[]> {
  if (typeof rel === 'string' && rel !== '') return listFileSnapshots(workspaceRoot, rel)
  const rootDir = versionsDir(workspaceRoot)
  let keys: string[]
  try {
    keys = (await fs.readdir(rootDir, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name)
  } catch {
    return []
  }
  const all: SnapshotMeta[] = []
  for (const key of keys) {
    const meta = await readJson<{ entries?: SnapshotMeta[] }>(path.join(rootDir, key, 'index.json'), {})
    all.push(...(meta.entries ?? []))
  }
  return all.sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 200)
}

export async function getSnapshotContent(workspaceRoot: string, id: string): Promise<{ meta: SnapshotMeta; content: Buffer } | undefined> {
  const all = await listSnapshots(workspaceRoot)
  const meta = all.find(s => s.id === id)
  if (meta === undefined) return undefined
  const payload = await readJson<{ content?: string }>(path.join(versionsDir(workspaceRoot), fileKey(meta.rel), `${id}.json`), {})
  if (typeof payload.content !== 'string') return undefined
  return { meta, content: Buffer.from(payload.content, meta.encoding) }
}

export async function restoreSnapshot(workspaceRoot: string, id: string): Promise<SnapshotMeta | undefined> {
  const snap = await getSnapshotContent(workspaceRoot, id)
  if (snap === undefined) return undefined
  const target = path.resolve(workspaceRoot, snap.meta.rel)
  await captureSnapshot(workspaceRoot, target, 'pre-restore')
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, snap.content)
  return snap.meta
}

function resolveWorkspace(exec: ToolExecution): string {
  const cwd = (exec as { agent?: { session?: { header?: { cwd?: string } } } })?.agent?.session?.header?.cwd
  if (typeof cwd !== 'string' || cwd === '') throw new Error('no workspace selected for this session')
  return cwd
}

export function apply(ctx: Context): void {
  ctx.on('tools/pre-execute', async (exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision> => {
    try {
      if (exec.name === 'write' || exec.name === 'edit') {
        const args = exec.arguments as { file_path?: unknown } | undefined
        const filePath = typeof args?.file_path === 'string' ? args.file_path : undefined
        const root = resolveWorkspace(exec)
        if (filePath !== undefined) {
          const abs = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(root, filePath)
          await captureSnapshot(root, abs, `pre-${exec.name}`)
        }
      }
    } catch {
      // Snapshots are best-effort; never block the write on failure.
    }
    return next()
  })
}
