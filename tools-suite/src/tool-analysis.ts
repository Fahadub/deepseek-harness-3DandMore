/**
 * Tools suite — project analysis & quality tools.
 * Ports from TOOLS IDE's main engine:
 *  - 3-stage verification (files → build → running server HTTP check)
 *  - security scan (secret leakage)
 *  - project cleanup (temp/test artifacts)
 *  - project stats
 *  - stack-aware command knowledge (essence of the 170+ command classifier)
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { walk, isTextFile } from './lib/util.ts'

export const name = 'tool-analysis'
export const inject = ['tools']

function resolveWorkspace(exec: unknown): string {
  const cwd = (exec as { agent?: { session?: { header?: { cwd?: string } } } })?.agent?.session?.header?.cwd
  if (typeof cwd !== 'string' || cwd === '') throw new Error('no workspace selected for this session')
  return cwd
}

function runCommand(cwd: string, cmd: string, timeoutMs: number): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32'
    const child = spawn(isWin ? 'cmd' : 'sh', isWin ? ['/c', cmd] : ['-c', cmd], { cwd, windowsHide: true })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)
    child.stdout.on('data', (d: Buffer) => { if (stdout.length < 60000) stdout += d.toString('utf8') })
    child.stderr.on('data', (d: Buffer) => { if (stderr.length < 60000) stderr += d.toString('utf8') })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ exitCode: -1, stdout, stderr: `${stderr}${String(err)}`, timedOut })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ exitCode: code, stdout, stderr, timedOut })
    })
  })
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<{ status: number | null; error?: string; bodyHead: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'manual' })
    const text = await res.text().catch(() => '')
    return { status: res.status, bodyHead: text.slice(0, 300) }
  } catch (err) {
    return { status: null, error: String(err), bodyHead: '' }
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Stage 1: import/reference integrity scan
// ---------------------------------------------------------------------------

const RESOLVE_EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.vue', '.svelte', '.node']

interface MissingRef { file: string; specifier: string }

async function scanMissingImports(root: string): Promise<{ scanned: number; missing: MissingRef[] }> {
  const entries = (await walk(root, { maxEntries: 4000 })).filter(e => e.isFile && isTextFile(e.rel))
  const missing: MissingRef[] = []
  let scanned = 0
  for (const e of entries) {
    if (!/\.(ts|tsx|js|jsx|mjs|cjs|php|py)$/.test(e.rel)) continue
    scanned += 1
    let content: string
    try {
      content = await fs.readFile(e.abs, 'utf8')
    } catch {
      continue
    }
    const specs = new Set<string>()
    const jsImport = /(?:import\s[\s\S]*?from\s*|import\s*|require\s*\(\s*|import\s*\(\s*)['"]([^'"]+)['"]/g
    for (const m of content.matchAll(jsImport)) specs.add(m[1])
    if (e.rel.endsWith('.php')) {
      for (const m of content.matchAll(/(?:require|include)(?:_once)?\s*\(\s*['"]([^'"]+)['"]/g)) specs.add(m[1])
    }
    if (e.rel.endsWith('.py')) {
      for (const m of content.matchAll(/^\s*from\s+([\w.]+)\s+import/gm)) specs.add(m[1])
    }
    for (const spec of specs) {
      if (!spec.startsWith('./') && !spec.startsWith('../')) continue
      const base = path.resolve(path.dirname(e.abs), spec)
      const candidates = RESOLVE_EXTS.map(ext => (ext === '' && path.extname(base) === '' ? `${base}.ts` : base + ext))
      candidates.push(path.join(base, 'index.ts'), path.join(base, 'index.js'))
      let found = false
      for (const c of candidates) {
        try {
          await fs.access(c)
          found = true
          break
        } catch { /* try next */ }
      }
      if (!found) missing.push({ file: e.rel, specifier: spec })
    }
  }
  return { scanned, missing: missing.slice(0, 50) }
}

// ---------------------------------------------------------------------------
// Stage 2: build command detection (stack-aware)
// ---------------------------------------------------------------------------

interface StackCommands {
  detected: string[]
  install: string
  build: string | null
  run: string | null
  test: string | null
}

async function detectStack(root: string): Promise<StackCommands> {
  const detected: string[] = []
  const exists = async (p: string): Promise<boolean> => {
    try {
      await fs.access(path.join(root, p))
      return true
    } catch {
      return false
    }
  }
  const pkgPath = path.join(root, 'package.json')
  let scripts: Record<string, string> = {}
  let deps: string[] = []
  if (await exists('package.json')) {
    detected.push('node')
    try {
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8')) as { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
      scripts = pkg.scripts ?? {}
      deps = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? [])]
      if (deps.includes('next')) detected.push('next.js')
      else if (deps.includes('nuxt')) detected.push('nuxt')
      else if (deps.includes('@angular/core')) detected.push('angular')
      else if (deps.includes('vue')) detected.push('vue')
      else if (deps.includes('react')) detected.push('react')
      if (deps.includes('express')) detected.push('express')
      if (deps.includes('@nestjs/core')) detected.push('nestjs')
      if (deps.includes('fastapi') || deps.includes('django') || deps.includes('flask')) detected.push('python-web')
    } catch { /* malformed package.json */ }
    if (await exists('pnpm-lock.yaml')) detected.push('pnpm')
    else if (await exists('yarn.lock')) detected.push('yarn')
    else if (await exists('bun.lockb')) detected.push('bun')
    else detected.push('npm')
  }
  if (await exists('composer.json')) detected.push('php/composer')
  if (await exists('requirements.txt') || await exists('pyproject.toml')) detected.push('python')
  if (await exists('Cargo.toml')) detected.push('rust')
  if (await exists('go.mod')) detected.push('go')
  if (await exists('pom.xml')) detected.push('java/maven')
  if (await exists('build.gradle') || await exists('build.gradle.kts')) detected.push('java/gradle')
  if (await exists('Gemfile')) detected.push('ruby')
  if (await exists('pubspec.yaml')) detected.push('dart/flutter')
  if ((await fs.readdir(root).catch(() => [])).some(f => f.endsWith('.csproj'))) detected.push('dotnet')

  const pm = detected.includes('pnpm') ? 'pnpm' : detected.includes('yarn') ? 'yarn' : detected.includes('bun') ? 'bun' : 'npm'
  const install = detected.includes('php/composer') ? 'composer install'
    : detected.includes('python') ? 'pip install -r requirements.txt'
      : detected.includes('rust') ? 'cargo build'
        : detected.includes('go') ? 'go mod download'
          : detected.includes('java/maven') ? 'mvn install'
            : detected.includes('java/gradle') ? './gradlew build'
              : detected.includes('ruby') ? 'bundle install'
                : detected.includes('dart/flutter') ? 'flutter pub get'
                  : detected.includes('dotnet') ? 'dotnet restore'
                    : detected.includes('node') ? `${pm} install` : ''
  const build = typeof scripts.build === 'string' ? `${pm} run build`
    : detected.includes('rust') ? 'cargo build'
      : detected.includes('java/maven') ? 'mvn package'
        : detected.includes('java/gradle') ? './gradlew build'
          : detected.includes('dotnet') ? 'dotnet build'
            : null
  const run = typeof scripts.start === 'string' ? `${pm} start`
    : typeof scripts.dev === 'string' ? `${pm} run dev`
      : detected.includes('python') ? 'python main.py'
        : detected.includes('php/composer') ? 'php -S localhost:8000'
          : detected.includes('rust') ? 'cargo run'
            : detected.includes('go') ? 'go run .'
              : detected.includes('dotnet') ? 'dotnet run'
                : null
  const test = typeof scripts.test === 'string' ? `${pm} test`
    : detected.includes('python') ? 'python -m pytest'
      : detected.includes('rust') ? 'cargo test'
        : detected.includes('go') ? 'go test ./...'
          : null
  return { detected, install, build, run, test }
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'verify_project',
    description:
      '3-stage project verification. Stage 1: scan source imports/requires/includes for missing files. ' +
      'Stage 2: run the detected build command. Stage 3: HTTP-check that the dev server responds (common ports or an explicit url). ' +
      'Returns a structured pass/fail report you must fix before declaring the task complete.',
    parameters: {
      url: { type: 'string', description: 'Explicit URL to check in stage 3 (e.g. http://localhost:3000)' },
      skip_build: { type: 'boolean', description: 'Skip stage 2 (build) — use for static/HTML projects' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: renderVerify(value) }],
    },
    async execute(args, exec) {
      const root = resolveWorkspace(exec)
      const stage1 = await scanMissingImports(root)
      const stack = await detectStack(root)
      let stage2: { cmd: string; exitCode: number | null; timedOut: boolean; tail: string } | null = null
      if (args.skip_build !== true && stack.build !== null) {
        const r = await runCommand(root, stack.build, 180000)
        stage2 = { cmd: stack.build, exitCode: r.exitCode, timedOut: r.timedOut, tail: (`${r.stdout}\n${r.stderr}`).trim().slice(-800) }
      }
      const urls: string[] = []
      if (typeof args.url === 'string' && args.url !== '') urls.push(args.url)
      else urls.push(...[3000, 5173, 4173, 4200, 5000, 8000, 8080, 4000].map(p => `http://localhost:${p}`))
      const checks: Array<{ url: string; status: number | null; error?: string }> = []
      for (const u of urls) {
        const r = await fetchWithTimeout(u, 4000)
        checks.push({ url: u, status: r.status, error: r.error })
        if (r.status !== null) break
      }
      const passed = stage1.missing.length === 0 && (stage2 === null || (stage2.exitCode === 0 && !stage2.timedOut))
      return {
        passed,
        stage1_files: stage1,
        stage2_build: stage2,
        stage3_http: checks,
        stack,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'security_scan',
    description:
      'Scan the workspace for leaked secrets: API keys, tokens, passwords, private keys. ' +
      'Skips node_modules/.git/build outputs. Returns file/line/pattern findings.',
    parameters: {},
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: renderSecurity(value) }],
    },
    async execute(_args, exec) {
      const root = resolveWorkspace(exec)
      const patterns: Array<{ name: string; re: RegExp }> = [
        { name: 'openai-style-key', re: /\bsk-[A-Za-z0-9_-]{20,}/g },
        { name: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/g },
        { name: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}/g },
        { name: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
        { name: 'assigned-secret', re: /\b(?:api[_-]?key|secret|token|password|passwd|pwd)\b\s*[:=]\s*["'][^"'\s]{8,}["']/gi },
        { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g },
      ]
      const findings: Array<{ file: string; line: number; pattern: string; preview: string }> = []
      const entries = (await walk(root, { maxEntries: 6000 })).filter(e => e.isFile && e.size < 2_000_000 && isTextFile(e.rel) && !e.rel.startsWith('.dsh-tools/'))
      for (const e of entries) {
        if (/(^|\/)\.env(\..+)?$/.test(e.rel)) {
          findings.push({ file: e.rel, line: 0, pattern: 'env-file', preview: '.env file present — ensure it is gitignored' })
          continue
        }
        let content: string
        try {
          content = await fs.readFile(e.abs, 'utf8')
        } catch {
          continue
        }
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          for (const p of patterns) {
            p.re.lastIndex = 0
            if (p.re.test(lines[i])) {
              findings.push({ file: e.rel, line: i + 1, pattern: p.name, preview: redact(lines[i].trim().slice(0, 120)) })
              break
            }
          }
          if (findings.length >= 100) break
        }
        if (findings.length >= 100) break
      }
      return { scanned_files: entries.length, findings }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'cleanup_project',
    description:
      'Project cleanup tool. op=scan lists temp/test artifacts (logs, *.tmp, *.bak, coverage, debug screenshots). ' +
      'op=delete removes them. Never touches source files or .dsh-tools state.',
    parameters: {
      op: { type: 'string', required: true, description: 'scan | delete' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: renderCleanup(value) }],
    },
    async execute(args, exec) {
      const root = resolveWorkspace(exec)
      const junkFile = /(^|\/)(npm-debug\.log.*|yarn-(error|debug)\.log.*|\.DS_Store|Thumbs\.db|desktop\.ini|\*.tmp|[^/]+\.tmp|[^/]+\.bak|[^/]+\.log|tsconfig\.tsbuildinfo)$/i
      const junkDir = /(^|\/)(coverage|\.nyc_output|test-output|temp|tmp|\.cache)$/i
      const targets: Array<{ rel: string; type: 'file' | 'dir' }> = []
      const all = await walk(root, { maxEntries: 10000 })
      for (const e of all) {
        if (e.isFile && junkFile.test(e.rel) && !e.rel.startsWith('.dsh-tools/')) targets.push({ rel: e.rel, type: 'file' })
        if (!e.isFile && junkDir.test(e.rel)) targets.push({ rel: e.rel, type: 'dir' })
      }
      const files = targets.filter(t => t.type === 'file').map(t => t.rel)
      const dirs = targets.filter(t => t.type === 'dir').map(t => t.rel)
      if (args.op === 'delete') {
        let deleted = 0
        for (const f of files) {
          try {
            await fs.rm(path.join(root, f), { force: true })
            deleted += 1
          } catch { /* keep going */ }
        }
        for (const d of dirs) {
          try {
            await fs.rm(path.join(root, d), { recursive: true, force: true })
            deleted += 1
          } catch { /* keep going */ }
        }
        return { deleted, files: files.length, dirs: dirs.length, remaining: [] }
      }
      return { deleted: 0, files: files.length, dirs: dirs.length, file_list: files.slice(0, 100), dir_list: dirs.slice(0, 50) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'project_stats',
    description: 'Workspace statistics: file count, total size, lines of code by language, largest files, dependency count.',
    parameters: {},
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(_args, exec) {
      const root = resolveWorkspace(exec)
      const entries = (await walk(root, { maxEntries: 20000 })).filter(e => e.isFile)
      const byExt = new Map<string, { files: number; lines: number }>()
      const largest: Array<{ file: string; size: number }> = []
      let totalSize = 0
      const LOC_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.php', '.rb', '.go', '.rs', '.java', '.kt', '.c', '.h', '.cpp', '.cs', '.vue', '.svelte', '.html', '.css', '.sql', '.sh'])
      for (const e of entries) {
        totalSize += e.size
        const ext = path.extname(e.rel).toLowerCase() || '(none)'
        const slot = byExt.get(ext) ?? { files: 0, lines: 0 }
        slot.files += 1
        if (LOC_EXTS.has(ext) && e.size < 1_500_000) {
          try {
            const content = await fs.readFile(e.abs, 'utf8')
            slot.lines += content.split('\n').length
          } catch { /* binary or unreadable */ }
        }
        byExt.set(ext, slot)
        largest.push({ file: e.rel, size: e.size })
      }
      largest.sort((a, b) => b.size - a.size)
      const stack = await detectStack(root)
      const languages = [...byExt.entries()]
        .map(([ext, v]) => ({ ext, ...v }))
        .sort((a, b) => b.lines - a.lines || b.files - a.files)
        .slice(0, 12)
      return { files: entries.length, total_bytes: totalSize, languages, largest: largest.slice(0, 10), stack: stack.detected }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'stack_commands',
    description:
      'Detect the workspace stack from manifests and return the correct install/build/run/test commands ' +
      '(essence of TOOLS IDE\'s 170+ command classifier, deterministic subset).',
    parameters: {},
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(_args, exec) {
      const root = resolveWorkspace(exec)
      return await detectStack(root)
    },
  }))
}

// ---------------------------------------------------------------------------
// Renderers (model-facing prose)
// ---------------------------------------------------------------------------

type AnyRecord = Record<string, unknown>

function renderVerify(value: unknown): string {
  const v = value as AnyRecord
  const lines: string[] = []
  lines.push(v.passed === true ? '✅ VERIFICATION PASSED (stages 1-2)' : '❌ VERIFICATION FAILED')
  const s1 = v.stage1_files as { scanned: number; missing: Array<{ file: string; specifier: string }> } | undefined
  if (s1 !== undefined) {
    lines.push(`Stage 1 (files): scanned ${s1.scanned} files, ${s1.missing.length} missing references`)
    for (const m of s1.missing.slice(0, 15)) lines.push(`  - ${m.file} → ${m.specifier}`)
  }
  const s2 = v.stage2_build as { cmd: string; exitCode: number | null; timedOut: boolean; tail: string } | null | undefined
  if (s2 === null || s2 === undefined) lines.push('Stage 2 (build): skipped')
  else {
    lines.push(`Stage 2 (build): ${s2.cmd} → exit ${s2.exitCode}${s2.timedOut ? ' (TIMED OUT)' : ''}`)
    if (s2.exitCode !== 0 && s2.tail !== '') lines.push(`  output tail: ${s2.tail.slice(-400)}`)
  }
  const s3 = v.stage3_http as Array<{ url: string; status: number | null }> | undefined
  if (Array.isArray(s3)) {
    const up = s3.find(c => c.status !== null)
    lines.push(up !== undefined ? `Stage 3 (server): ${up.url} responded HTTP ${up.status}` : 'Stage 3 (server): no dev server responded on common ports')
  }
  return lines.join('\n')
}

function redact(s: string): string {
  return s.replace(/[A-Za-z0-9_-]{12,}/g, m => `${m.slice(0, 4)}…`)
}

function renderSecurity(value: unknown): string {
  const v = value as { scanned_files: number; findings: Array<{ file: string; line: number; pattern: string; preview: string }> }
  if (v.findings.length === 0) return `✅ security scan clean (${v.scanned_files} files scanned)`
  const lines = [`⚠️ ${v.findings.length} potential secret leak(s) in ${v.scanned_files} scanned files:`]
  for (const f of v.findings.slice(0, 25)) lines.push(`  - ${f.file}:${f.line} [${f.pattern}] ${f.preview}`)
  return lines.join('\n')
}

function renderCleanup(value: unknown): string {
  const v = value as { deleted: number; files: number; dirs: number; file_list?: string[] }
  if (v.deleted > 0) return `🧹 deleted ${v.deleted} artifacts (${v.files} files, ${v.dirs} dirs matched)`
  return `🧹 scan: ${v.files} junk files, ${v.dirs} junk dirs. Run op=delete to remove:\n${(v.file_list ?? []).slice(0, 20).join('\n')}`
}
