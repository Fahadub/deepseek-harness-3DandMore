/**
 * Tools — visual screenshot verification (ported TOOLS feature).
 * Captures a PNG of a running page using the OS's headless Edge/Chrome
 * (zero npm dependencies), hands it to the vision model as an image block
 * for analysis, and keeps a copy under .dsh-tools/screenshots/.
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { toolsDirFor } from './lib/util.ts'

export const name = 'tool-screenshot'
export const inject = ['tools']

function browserCandidates(): string[] {
  // Chrome first: current Edge builds exit 0 without capturing when spawned
  // headless outside a shell. Chrome's headless screenshot is reliable.
  const local = process.env.LOCALAPPDATA ?? ''
  return [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    local === '' ? '' : `${local}\\Google\\Chrome\\Application\\chrome.exe`,
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    local === '' ? '' : `${local}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ].filter(p => p !== '')
}

async function firstExistingBrowser(): Promise<string> {
  for (const c of browserCandidates()) {
    try {
      await fs.access(c)
      return c
    } catch { /* try next */ }
  }
  throw new Error('no headless-capable browser found (Edge/Chrome)')
}

export interface ScreenshotResult {
  png: Buffer
  file: string
  width: number
  height: number
  browser: string
}

/**
 * Capture a PNG of `url` with the OS browser in headless mode.
 * The capture is saved under the workspace so the tools hub can list it.
 */
export async function captureScreenshot(
  workspaceRoot: string,
  url: string,
  width = 1280,
  height = 800,
  timeoutMs = 30000,
): Promise<ScreenshotResult> {
  if (!/^https?:\/\//i.test(url)) throw new Error(`invalid url: ${url}`)
  const browser = await firstExistingBrowser()
  const dir = path.join(toolsDirFor(workspaceRoot), 'screenshots')
  await fs.mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(dir, `shot-${stamp}.png`)
  // Headless Edge/Chrome fails to WRITE --screenshot paths containing
  // non-ASCII characters (Arabic workspace names), so capture into an
  // ASCII-safe temp path first, then move it into the workspace.
  // A dedicated --user-data-dir is required: without it a running browser
  // instance swallows the launch and exits without capturing anything.
  const tempFile = path.join(os.tmpdir(), `tools-shot-${process.pid}-${stamp}.png`)
  const profileDir = path.join(os.tmpdir(), `tools-shot-profile-${process.pid}`)
  await new Promise<void>((resolve, reject) => {
    const child = spawn(browser, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      `--window-size=${width},${height}`,
      `--screenshot=${tempFile}`,
      '--virtual-time-budget=9000',
      url,
    ], { windowsHide: true })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('screenshot timed out'))
    }, timeoutMs)
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0 || code === null) resolve()
      else reject(new Error(`browser exited with code ${code}`))
    })
  })
  const png = await fs.readFile(tempFile)
  await fs.rm(tempFile, { force: true }).catch(() => { /* best effort */ })
  await fs.rm(profileDir, { recursive: true, force: true }).catch(() => { /* best effort */ })
  if (png.length < 100 || png.readUInt32BE(0) !== 0x89504e47) {
    throw new Error('browser did not produce a valid PNG screenshot')
  }
  await fs.writeFile(file, png)
  return { png, file, width, height, browser: path.basename(browser) }
}

function resolveWorkspace(exec: unknown): string {
  const cwd = (exec as { agent?: { session?: { header?: { cwd?: string } } } })?.agent?.session?.header?.cwd
  if (typeof cwd !== 'string' || cwd === '') throw new Error('no workspace selected for this session')
  return cwd
}

interface AttachmentRefLike {
  attachmentId: unknown
  mediaType: string
  bytes: number
  width?: number
  height?: number
}

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'screenshot_verify',
    description:
      'Capture a PNG screenshot of a running page and save it to .dsh-tools/screenshots/ for THE USER to view in the tools hub. ' +
      'Returns TEXT METADATA ONLY — the image is NEVER attached to the model context (attaching images is fatal for visionless providers like GLM-5.3: the session dies with "does not support image input"). ' +
      'You (the model) cannot see the shot: describe it to the user by its path and verified textual signals (game_playtest reports, DOM/console checks). Prefer game_playtest for any verification.',
    parameters: {
      url: { type: 'string', description: 'Page URL to capture (e.g. http://localhost:3000)' },
      width: { type: 'number', description: 'Viewport width (default 1280)' },
      height: { type: 'number', description: 'Viewport height (default 800)' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => {
        const v = value as { url: string; bytes: number; saved_to: string; browser: string }
        return [{
          type: 'text',
          text:
            `<screenshot url="${v.url}">\n<type>text-only</type>\n` +
            `saved: ${v.saved_to} (${v.bytes} bytes, ${v.browser}) — اعرضها للعميل في المركز (المعاينة ← الصور).\n` +
            `لا تُرفق أي صورة إلى النموذج — التحقق النصي فقط (game_playtest).</screenshot>`,
        }]
      },
    },
    async execute(args, exec) {
      const root = resolveWorkspace(exec)
      const url = args.url ?? 'http://localhost:3000'
      const shot = await captureScreenshot(root, url, args.width ?? 1280, args.height ?? 800)
      // لا مرفقات صور إطلاقًا — ممنوع دائم: مزود GLM بلا رؤية وصورة واحدة تقتل الجلسة.
      return {
        url,
        saved_to: path.relative(root, shot.file).replace(/\\/g, '/'),
        bytes: shot.png.length,
        browser: shot.browser,
        note: 'الصورة محفوظة على القرص لعرض العميل في المركز؛ لا تُرفق للنموذج أبدًا (نص فقط).',
      }
    },
  }))

  void os.platform() // keep import meaningful for future platform branches
}
