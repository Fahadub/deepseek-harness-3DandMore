/**
 * Shared utilities for the Tools suite plugins.
 * Ported concepts from the original IDE engine's main engine (server.js).
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** Directory (per workspace) where all Tools suite state lives. */
export const TOOLS_DIR = '.dsh-tools'

export interface JsonBody { [key: string]: unknown }

export function toolsDirFor(workspaceRoot: string): string {
  return path.join(workspaceRoot, TOOLS_DIR)
}

/** Read a JSON file, returning fallback when missing/corrupt. */
export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** Atomically write a JSON file (mkdir -p + temp rename). */
export async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${Date.now()}`
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
  await fs.rename(tmp, file)
}

/** Read a JSON request body with a size cap. */
export async function readBody(req: IncomingMessage, maxBytes = 5 * 1024 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = chunk as Buffer
    size += buf.length
    if (size > maxBytes) throw new Error('request body too large')
    chunks.push(buf)
  }
  return Buffer.concat(chunks)
}

export async function readJsonBody(req: IncomingMessage): Promise<JsonBody> {
  const raw = await readBody(req)
  if (raw.length === 0) return {}
  return JSON.parse(raw.toString('utf8')) as JsonBody
}

export function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(body)
}

export function sendText(res: ServerResponse, status: number, text: string, contentType = 'text/plain; charset=utf-8'): void {
  res.writeHead(status, { 'content-type': contentType })
  res.end(text)
}

/** Resolve `p` inside `root`, rejecting traversal outside the workspace. */
export function safeJoin(root: string, p: string): string {
  const cleaned = p.replace(/\\/g, '/').replace(/^\/+/, '')
  const resolved = path.resolve(root, cleaned)
  const normRoot = path.resolve(root)
  if (resolved !== normRoot && !resolved.startsWith(normRoot + path.sep)) {
    throw new Error(`path escapes workspace: ${p}`)
  }
  return resolved
}

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.dsh-tools', 'dist', 'build', '.next', '.nuxt',
  '.cache', 'coverage', '__pycache__', '.venv', 'venv', 'target', '.idea', '.vscode',
  'vendor/bundle', '.terraform', 'bower_components',
])

export function isIgnoredDir(name: string): boolean {
  return IGNORED_DIRS.has(name)
}

export interface WalkEntry {
  rel: string
  abs: string
  size: number
  isFile: boolean
}

/** Recursive walk honoring ignore rules; caps entries to stay responsive. */
export async function walk(
  root: string,
  opts: { maxEntries?: number; maxDepth?: number } = {},
): Promise<WalkEntry[]> {
  const maxEntries = opts.maxEntries ?? 20000
  const maxDepth = opts.maxDepth ?? 24
  const out: WalkEntry[] = []
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }]
  while (queue.length > 0 && out.length < maxEntries) {
    const { dir, depth } = queue.shift()!
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (out.length >= maxEntries) break
      const abs = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (isIgnoredDir(e.name) || depth >= maxDepth) continue
        out.push({ rel: path.relative(root, abs).replace(/\\/g, '/'), abs, size: 0, isFile: false })
        queue.push({ dir: abs, depth: depth + 1 })
      } else if (e.isFile()) {
        let size = 0
        try {
          size = (await fs.stat(abs)).size
        } catch { /* raced */ }
        out.push({ rel: path.relative(root, abs).replace(/\\/g, '/'), abs, size, isFile: true })
      }
    }
  }
  return out
}

const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.txt', '.css', '.scss',
  '.less', '.html', '.htm', '.xml', '.yml', '.yaml', '.toml', '.ini', '.env', '.py',
  '.php', '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.c', '.h', '.cpp', '.hpp',
  '.cs', '.sh', '.bat', '.ps1', '.sql', '.graphql', '.vue', '.svelte', '.conf', '.cfg',
])

export function isTextFile(p: string): boolean {
  return TEXT_EXT.has(path.extname(p).toLowerCase())
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.wav': 'audio/wav', '.wasm': 'application/wasm',
}

export function mimeFor(p: string): string {
  return MIME[path.extname(p).toLowerCase()] ?? 'application/octet-stream'
}

/** Extract joined plain-text from content blocks. */
export function blocksToText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return ''
  const parts: string[] = []
  for (const b of blocks as Array<{ type?: string; text?: string }>) {
    if (typeof b === 'object' && b !== null && b.type === 'text' && typeof b.text === 'string') {
      parts.push(b.text)
    }
  }
  return parts.join('\n')
}

export function nowIso(): string {
  return new Date().toISOString()
}
