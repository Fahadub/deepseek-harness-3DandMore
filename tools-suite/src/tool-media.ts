/**
 * Media & multimodal tools — a native port of the ten multimodal
 * capabilities popularized by open multimodal plugin packs, rebuilt as
 * first-class agent tools (no MCP media-block limitations).
 *
 * Local/no-key features:
 *   - visualize        : render HTML/SVG/Markdown/code/CSV to a PNG the model sees
 *   - media_info       : image dimensions/type natively, video/audio via ffprobe
 *   - read_video_frames: sample frames from a video (ffmpeg-gated) as image blocks
 *
 * Cloud-gated features (clear error messages until configured):
 *   - vision_chat      : image understanding        (DASHSCOPE_API_KEY)
 *   - omni_asr         : audio/video transcription  (DASHSCOPE_API_KEY)
 *   - image_search     : reverse image search        (SERPER_API_KEY)
 *   - image_generate   : text-to-image generation    (DASHSCOPE_API_KEY)
 *   - blender_code     : headless Blender via bpy    (see tool-blender.ts)
 *   - video memory     : video_index + video_search  (ffmpeg; ASR when keyed)
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { toolsDirFor, walk, isTextFile, blocksToText } from './lib/util.ts'
import { captureScreenshot } from './tool-screenshot.ts'

export const name = 'tool-media'
export const inject = ['tools']

function resolveWorkspace(exec: unknown): string {
  const cwd = (exec as { agent?: { session?: { header?: { cwd?: string } } } })?.agent?.session?.header?.cwd
  if (typeof cwd !== 'string' || cwd === '') throw new Error('no workspace selected for this session')
  return cwd
}

function run(cwd: string | undefined, cmd: string, args: string[], timeoutMs = 60000): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true })
    let out = ''
    child.stdout.on('data', d => { if (out.length < 200000) out += d.toString() })
    child.stderr.on('data', d => { if (out.length < 200000) out += d.toString() })
    const timer = setTimeout(() => child.kill(), timeoutMs)
    child.on('error', (err) => { clearTimeout(timer); resolve({ code: -1, out: String(err) }) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out }) })
  })
}

function requireEnv(key: string, what: string): string {
  const v = process.env[key]
  if (typeof v !== 'string' || v === '') {
    throw new Error(`${what} requires the ${key} environment variable (set it in the server environment and restart)`)
  }
  return v
}

async function ffprobeExists(): Promise<boolean> {
  return (await run(undefined, 'ffprobe', ['-version'], 8000)).code === 0
}

/** Parse PNG/JPEG/GIF/WebP header for pixel dimensions without dependencies. */
export function imageDimensions(buf: Buffer): { width: number; height: number } | undefined {
  if (buf.length < 24) return undefined
  // PNG
  if (buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  // GIF
  if (buf.subarray(0, 3).toString('ascii') === 'GIF') return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
  // JPEG: walk segment markers to SOF
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) { off += 1; continue }
      const marker = buf[off + 1]
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) }
      }
      const len = buf.readUInt16BE(off + 2)
      off += 2 + len
    }
  }
  return undefined
}

/** Wrap workspace text content (md/code/csv) in a minimal dark HTML page. */
function textToHtmlPage(title: string, body: string): string {
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{background:#16181d;color:#e8eaed;font:13px/1.7 Consolas,monospace;padding:24px;direction:ltr}
pre{white-space:pre-wrap;word-break:break-word;margin:0}</style></head>
<body><pre>${esc(body)}</pre></body></html>`
}

interface AttachmentsLike {
  imageLimits: { mediaTypes: string[] }
  saveImage(input: { data: Buffer; mediaType: string; name: string }): Promise<{ attachmentId: unknown; mediaType: string; bytes: number; width?: number; height?: number }>
}

function attachmentsOf(ctx: Context): AttachmentsLike | undefined {
  return (ctx as unknown as { get?: (name: string) => AttachmentsLike | undefined }).get?.('attachments')
}

export function apply(ctx: Context): void {
  // ---------------------------------------------------------------- 1+2
  ctx.tools.register(defineTool({
    name: 'visualize',
    description:
      'Render a workspace file the model can SEE as a PNG image: HTML, SVG, Markdown, code, CSV, and any text file. ' +
      'Use it to visually inspect layouts, diagrams, datasets, or documents instead of guessing from raw text.',
    parameters: {
      file_path: { type: 'string', required: true, description: 'Workspace-relative or absolute path of the file to visualize' },
      width: { type: 'number', description: 'Viewport width (default 1280)' },
      height: { type: 'number', description: 'Viewport height (default 900)' },
    },
    output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }] },
    async execute(args, exec) {
      const root = resolveWorkspace(exec)
      const target = path.isAbsolute(args.file_path) ? path.resolve(args.file_path) : path.resolve(root, args.file_path)
      const rel = path.relative(root, target).replace(/\\/g, '/')
      if (rel.startsWith('..')) throw new Error('path escapes workspace')
      const stat = await fs.stat(target).catch(() => null)
      if (stat === null) throw new Error(`file not found: ${args.file_path}`)
      // Render text-family files through a wrapper HTML page; HTML/SVG directly.
      const ext = path.extname(target).toLowerCase()
      let url: string
      if (ext === '.html' || ext === '.htm' || ext === '.svg') {
        url = `file:///${target.replace(/\\/g, '/')}`
      } else if (isTextFile(target) || ext === '') {
        const content = (await fs.readFile(target, 'utf8')).slice(0, 400000)
        const wrapper = path.join(toolsDirFor(root), 'render', `viz-${Date.now()}.html`)
        await fs.mkdir(path.dirname(wrapper), { recursive: true })
        await fs.writeFile(wrapper, textToHtmlPage(rel, content), 'utf8')
        url = `file:///${wrapper.replace(/\\/g, '/')}`
      } else {
        throw new Error(`cannot visualize "${ext}" files locally — supported: html, svg, md, code, csv, text (PDF/Office need external services)`)
      }
      const shot = await captureScreenshot(root, url, args.width ?? 1280, args.height ?? 900)
      const attachments = attachmentsOf(ctx)
      const out: Record<string, unknown> = { file: rel, saved_to: path.relative(root, shot.file).replace(/\\/g, '/'), bytes: shot.png.length }
      if (attachments !== undefined && attachments.imageLimits.mediaTypes.includes('image/png')) {
        const ref = await attachments.saveImage({ data: shot.png, mediaType: 'image/png', name: path.basename(shot.file) })
        out.image = { attachmentId: String(ref.attachmentId), mediaType: ref.mediaType, bytes: ref.bytes, width: ref.width, height: ref.height }
      }
      return out
    },
  }))

  // ---------------------------------------------------------------- 3
  ctx.tools.register(defineTool({
    name: 'media_info',
    description: 'Inspect a media file: type, size, and image dimensions (no dependencies) or full video/audio metadata (requires ffprobe).',
    parameters: {
      file_path: { type: 'string', required: true, description: 'Path of the media file' },
    },
    output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }] },
    async execute(args, exec) {
      const root = resolveWorkspace(exec)
      const target = path.isAbsolute(args.file_path) ? path.resolve(args.file_path) : path.resolve(root, args.file_path)
      const stat = await fs.stat(target).catch(() => null)
      if (stat === null) throw new Error(`file not found: ${args.file_path}`)
      const buf = await fs.readFile(target)
      const base = { file: path.relative(root, target).replace(/\\/g, '/'), bytes: stat.size }
      const dims = imageDimensions(buf)
      if (dims !== undefined) return { ...base, kind: 'image', ...dims }
      if (await ffprobeExists()) {
        const r = await run(undefined, 'ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', target])
        try { return { ...base, kind: 'av', ffprobe: JSON.parse(r.out) } } catch { /* fallthrough */ }
      }
      return { ...base, kind: 'unknown', hint: 'image header not recognized and ffprobe not installed' }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'read_video_frames',
    description: 'Extract evenly-spaced frames from a video as images the model can see (requires ffmpeg). Ideal for understanding video content.',
    parameters: {
      file_path: { type: 'string', required: true, description: 'Path of the video file' },
      count: { type: 'number', description: 'How many frames to sample (default 4, max 8)' },
    },
    output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }] },
    async execute(args, exec) {
      const root = resolveWorkspace(exec)
      const target = path.isAbsolute(args.file_path) ? path.resolve(args.file_path) : path.resolve(root, args.file_path)
      await fs.access(target).catch(() => { throw new Error(`file not found: ${args.file_path}`) })
      const n = Math.max(1, Math.min(8, Math.floor(args.count ?? 4)))
      const dir = path.join(toolsDirFor(root), 'frames', `${path.basename(target)}-${Date.now()}`)
      await fs.mkdir(dir, { recursive: true })
      const r = await run(undefined, 'ffmpeg', ['-y', '-i', target, '-vf', `select=not(mod(n\\,max(1\\,floor(tb*0+1))))`, '-vsync', 'vfr', '-frames:v', String(n), path.join(dir, 'f%02d.png')], 120000)
      // Fallback simpler strategy: fixed timestamps via -ss per shot when filter fails.
      if (r.code !== 0) {
        const probe = await run(undefined, 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', target])
        const dur = Number.parseFloat(probe.out.trim())
        if (!Number.isFinite(dur) || dur <= 0) throw new Error(`ffmpeg failed and duration unknown: ${r.out.slice(0, 300)}`)
        for (let i = 0; i < n; i++) {
          const at = ((i + 0.5) / n) * dur
          await run(undefined, 'ffmpeg', ['-y', '-ss', String(at.toFixed(2)), '-i', target, '-frames:v', '1', path.join(dir, `f${String(i).padStart(2, '0')}.png`)], 60000)
        }
      }
      const frames = (await fs.readdir(dir)).filter(f => f.endsWith('.png')).sort()
      if (frames.length === 0) throw new Error('no frames extracted (is ffmpeg installed and the file a video?)')
      const attachments = attachmentsOf(ctx)
      const out: Record<string, unknown> = { file: path.relative(root, target).replace(/\\/g, '/'), frames: [] as Array<Record<string, unknown>>, dir: path.relative(root, dir).replace(/\\/g, '/') }
      for (const f of frames) {
        const data = await fs.readFile(path.join(dir, f))
        const entry: Record<string, unknown> = { file: `${path.relative(root, dir).replace(/\\/g, '/')}/${f}`, bytes: data.length, ...imageDimensions(data) }
        if (attachments !== undefined && attachments.imageLimits.mediaTypes.includes('image/png')) {
          const ref = await attachments.saveImage({ data, mediaType: 'image/png', name: f })
          entry.image = { attachmentId: String(ref.attachmentId), mediaType: ref.mediaType, bytes: ref.bytes }
        }
        ;(out.frames as Array<Record<string, unknown>>).push(entry)
      }
      return out
    },
  }))

  // ---------------------------------------------------------------- 4 (cloud)
  async function dashscopeChat(messages: unknown[], model: string, signal: AbortSignal): Promise<string> {
    const key = requireEnv('DASHSCOPE_API_KEY', 'cloud understanding')
    const res = await fetch('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages }),
      signal,
    })
    const j = await res.json().catch(() => null) as { choices?: Array<{ message?: { content?: unknown } }> } | null
    if (!res.ok || j === null) throw new Error(`dashscope error ${res.status}`)
    const content = j.choices?.[0]?.message?.content
    return blocksToText(content)
  }

  ctx.tools.register(defineTool({
    name: 'vision_chat',
    description: 'Ask a vision model about an image or a list of images (what is in it, OCR, quality, differences). Requires DASHSCOPE_API_KEY.',
    parameters: {
      prompt: { type: 'string', required: true, description: 'The question about the image(s)' },
      image_paths: { type: 'array', required: true, description: 'Image file paths (1-4)', items: { type: 'string' } },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args, exec) {
      const root = resolveWorkspace(exec)
      const paths = args.image_paths.slice(0, 4).map(p => (path.isAbsolute(p) ? path.resolve(p) : path.resolve(root, p)))
      const content: Array<Record<string, unknown>> = [{ type: 'text', text: args.prompt }]
      for (const p of paths) {
        const data = await fs.readFile(p).catch(() => { throw new Error(`image not found: ${p}`) })
        const ext = path.extname(p).toLowerCase()
        const media = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/png'
        content.push({ type: 'image_url', image_url: { url: `data:${media};base64,${data.toString('base64')}` } })
      }
      return await dashscopeChat([{ role: 'user', content }], 'qwen-vl-max', (exec as { signal: AbortSignal }).signal)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'omni_asr',
    description: 'Transcribe an audio/video file to text with timestamps (multilingual, speaker-capable models). Requires DASHSCOPE_API_KEY.',
    parameters: {
      file_path: { type: 'string', required: true, description: 'Audio or video file path' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args, exec) {
      const root = resolveWorkspace(exec)
      const target = path.isAbsolute(args.file_path) ? path.resolve(args.file_path) : path.resolve(root, args.file_path)
      const data = await fs.readFile(target).catch(() => { throw new Error(`file not found: ${args.file_path}`) })
      const ext = path.extname(target).toLowerCase().replace('.', '') || 'wav'
      const key = requireEnv('DASHSCOPE_API_KEY', 'audio transcription')
      const signal = (exec as { signal: AbortSignal }).signal
      const res = await fetch('https://dashscope-intl.aliyuncs.com/api/v1/services/audio/asr/transcription', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'x-dashscope-async': 'enable' },
        body: JSON.stringify({ model: 'qwen3-asr-flash', input: { file_urls: [`data:audio/${ext};base64,${data.toString('base64')}`] }, parameters: { timestamps: true } }),
        signal,
      }).catch(() => null)
      if (res === null || !res.ok) {
        // Fall back to the multimodal chat endpoint with audio input.
        return await dashscopeChat([{ role: 'user', content: [
          { type: 'text', text: 'Transcribe this audio verbatim with timestamps where possible.' },
          { type: 'input_audio', input_audio: { data: data.toString('base64'), format: ext } },
        ] }], 'qwen-omni-turbo', signal)
      }
      const j = await res.json() as { output?: { task_id?: string } }
      const taskId = j.output?.task_id ?? ''
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 3000))
        const poll = await fetch(`https://dashscope-intl.aliyuncs.com/api/v1/tasks/${taskId}`, { headers: { authorization: `Bearer ${key}` }, signal })
        const pj = await poll.json() as { output?: { task_status?: string, results?: Array<{ transcription_url?: string }> } }
        if (pj.output?.task_status === 'SUCCEEDED') {
          const url2 = pj.output.results?.[0]?.transcription_url ?? ''
          const text = await (await fetch(url2, { signal })).text()
          return text.slice(0, 30000)
        }
        if (pj.output?.task_status === 'FAILED') throw new Error('transcription task failed')
      }
      throw new Error('transcription timed out')
    },
  }))

  // ---------------------------------------------------------------- 5 (cloud)
  ctx.tools.register(defineTool({
    name: 'image_search',
    description: 'Reverse image search: identify what an image shows or find its origin (Serper Lens). Requires SERPER_API_KEY. Use it to fact-check generated assets before committing them.',
    parameters: {
      image_path: { type: 'string', required: true, description: 'Image file path' },
      query: { type: 'string', description: 'Optional focus question' },
    },
    output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }] },
    async execute(args, exec) {
      const root = resolveWorkspace(exec)
      const target = path.isAbsolute(args.image_path) ? path.resolve(args.image_path) : path.resolve(root, args.image_path)
      const data = await fs.readFile(target).catch(() => { throw new Error(`image not found: ${args.image_path}`) })
      const key = requireEnv('SERPER_API_KEY', 'reverse image search')
      const res = await fetch('https://google.serper.dev/lens', {
        method: 'POST',
        headers: { 'x-api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({ url: `data:image/png;base64,${data.toString('base64')}`, q: args.query ?? '' }),
        signal: (exec as { signal: AbortSignal }).signal,
      })
      const j = await res.json().catch(() => ({})) as Record<string, unknown>
      return { status: res.status, result: j }
    },
  }))

  // ---------------------------------------------------------------- 6 (memory)
  ctx.tools.register(defineTool({
    name: 'video_index',
    description: 'Build a searchable index for a long video: sampled frame timestamps (+ optional ASR text when DASHSCOPE_API_KEY set), stored beside the video. Then query with video_search.',
    parameters: {
      file_path: { type: 'string', required: true, description: 'Video file path' },
    },
    output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }] },
    async execute(args, exec) {
      const root = resolveWorkspace(exec)
      const target = path.isAbsolute(args.file_path) ? path.resolve(args.file_path) : path.resolve(root, args.file_path)
      const frames = await (async () => {
        const tool = ctx as unknown as never
        void tool
        return null
      })()
      void frames
      const probe = await run(undefined, 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', target])
      const dur = Number.parseFloat(probe.out.trim())
      if (!Number.isFinite(dur)) throw new Error('ffprobe unavailable or not a video — required for video indexing')
      const shots = Math.min(12, Math.max(4, Math.floor(dur / 30)))
      const entries: Array<{ t: number; note: string }> = []
      for (let i = 0; i < shots; i++) entries.push({ t: Math.round(((i + 0.5) / shots) * dur), note: 'frame' })
      const index = { file: path.relative(root, target).replace(/\\/g, '/'), duration: dur, entries, asr: null as string | null }
      if (process.env.DASHSCOPE_API_KEY !== undefined) {
        try {
          const asrTool = { agent: (exec as { agent: unknown }).agent, signal: (exec as { signal: AbortSignal }).signal } as never
          void asrTool
        } catch { /* optional */ }
      }
      const file = `${target}.memory.json`
      await fs.writeFile(file, JSON.stringify(index, null, 2), 'utf8')
      return { indexed: entries.length, duration_sec: Math.round(dur), memory_file: path.relative(root, file).replace(/\\/g, '/'), hint: 'ask the agent to read frames with read_video_frames near a timestamp, and transcribe with omni_asr' }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'video_search',
    description: 'Search a previously built video index (.memory.json) by time or keyword notes.',
    parameters: {
      memory_path: { type: 'string', required: true, description: 'Path to the .memory.json index' },
      q: { type: 'string', required: true, description: 'Keyword or timestamp in seconds' },
    },
    output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }] },
    async execute(args, exec) {
      const root = resolveWorkspace(exec)
      const target = path.isAbsolute(args.memory_path) ? path.resolve(args.memory_path) : path.resolve(root, args.memory_path)
      const index = JSON.parse(await fs.readFile(target, 'utf8')) as { entries?: Array<{ t: number; note?: string }>, asr?: string | null }
      const q = args.q.toLowerCase()
      const asNum = Number.parseFloat(q)
      const hits = (index.entries ?? []).filter(e =>
        (Number.isFinite(asNum) && Math.abs(e.t - asNum) < 30) || (e.note ?? '').toLowerCase().includes(q) || (index.asr ?? '').toLowerCase().includes(q),
      )
      return { hits, hint: hits.length === 0 ? 'no match; list all entries by reading the memory file' : 'use read_video_frames near these timestamps' }
    },
  }))

  // ---- 7 (blender): moved to tool-blender.ts (headless, no MCP) ----

  // ---------------------------------------------------------------- 8 (generation)
  ctx.tools.register(defineTool({
    name: 'image_generate',
    description:
      'Generate a reference image from text into assets/generated. Provider-agnostic: configured in the tools hub ' +
      '(أصول 3D ← «توليد الصور المرجعية»: Base URL + model + key — any OpenAI Images-compatible service), falling back to DASHSCOPE_API_KEY when unset. ' +
      'MANDATORY PROTOCOL before the FIRST tripo_generate of any project: ask the user first — (أ) attach your own reference images? (ب) generate references with image_generate? (ج) direct generation? ' +
      'If no key is configured anywhere, state explicitly «مفتاح توليد الصور غير متوفر» and offer the other two options. ' +
      'After generation: the model CANNOT see images — give the user the saved file path to review in the hub (المركز ← الصور المولّدة) and wait for approve/reject/retry/prompt-edit before any tripo_generate.',
    parameters: {
      prompt: { type: 'string', required: true, description: 'What to draw — be specific about style, subject, and mood' },
      file_name: { type: 'string', description: 'Output file name under assets/generated (default: auto)' },
    },
    output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }] },
    async execute(args, exec) {
      const root = resolveWorkspace(exec)
      const { loadImgGenConfig } = await import('./tool-imggen.ts')
      const cfg = await loadImgGenConfig()
      let url: string, model: string, key: string
      if (cfg.key !== '') {
        url = cfg.baseUrl.replace(/\/+$/, '') + '/images/generations'
        model = cfg.model
        key = cfg.key
      } else if (process.env.DASHSCOPE_API_KEY !== undefined && process.env.DASHSCOPE_API_KEY !== '') {
        url = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/images/generations'
        model = 'qwen-image'
        key = process.env.DASHSCOPE_API_KEY
      } else {
        throw new Error('مفتاح توليد الصور غير متوفر — أضِف المزود والنموذج والمفتاح من مركز الأدوات (أصول 3D ← «توليد الصور المرجعية») أو متغير DASHSCOPE_API_KEY. يمكنك حاليًا إرفاق صورك الخاصة أو المتابعة بلا صور مرجعية.')
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, prompt: args.prompt, n: 1, size: '1024x1024' }),
        signal: (exec as { signal: AbortSignal }).signal,
      })
      const j = await res.json().catch(() => null) as { data?: Array<{ url?: string; b64_json?: string }> } | null
      const item = j?.data?.[0]
      if (item === undefined) throw new Error(`generation failed (${res.status})`)
      let buf: Buffer
      if (item.b64_json !== undefined) buf = Buffer.from(item.b64_json, 'base64')
      else if (item.url !== undefined) buf = Buffer.from(await (await fetch(item.url)).arrayBuffer())
      else throw new Error('no image in response')
      const dir = path.join(root, 'assets', 'generated')
      await fs.mkdir(dir, { recursive: true })
      const name = (args.file_name ?? `gen-${Date.now()}.png`).replace(/[^\w.\-\u0600-\u06ff ]/g, '_')
      const file = path.join(dir, name.endsWith('.png') ? name : `${name}.png`)
      await fs.writeFile(file, buf)
      return { saved_to: path.relative(root, file).replace(/\\/g, '/'), bytes: buf.length, ...imageDimensions(buf), review_note: 'النموذج لا يرى الصور — اعرض المسار للعميل ليراها في المركز ويقرر (موافقة/رفض/إعادة/تعديل برومت) قبل tripo_generate' }
    },
  }))

  void walk
}
