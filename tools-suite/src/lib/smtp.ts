/**
 * Minimal SMTP client with MIME attachments — no external dependencies.
 * Ports the original IDE's nodemailer-based "email project as ZIP" feature.
 * Supports: direct SSL (465), STARTTLS upgrade on plain (587/25), AUTH LOGIN.
 */
import net from 'node:net'
import tls from 'node:tls'

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  fromName: string
  fromAddress: string
}

export interface MailAttachment { filename: string; content: Buffer }

export interface MailMessage {
  to: string
  subject: string
  text: string
  attachments?: MailAttachment[]
}

interface SmtpSession {
  write(data: string): void
  destroy(): void
}

class SmtpError extends Error {
  constructor(public code: number, public line: string) {
    super(`SMTP error ${code}: ${line}`)
  }
}

function readReply(session: SmtpSession & { socket: net.Socket }, timeoutMs = 20000): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = ''
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('SMTP timeout'))
    }, timeoutMs)
    const onData = (chunk: Buffer): void => {
      buf += chunk.toString('utf8')
      // A reply is complete only when the LAST line carries ' ' (no '-' continuation).
      const lines = buf.split('\r\n').filter(l => l !== '')
      const last = lines[lines.length - 1] ?? ''
      const m = /^(\d{3})([ -])/.exec(last)
      if (m !== null && m[2] === ' ') {
        cleanup()
        const code = Number(m[1])
        if (code >= 400) reject(new SmtpError(code, buf))
        else resolve(buf)
      }
    }
    const onError = (err: Error): void => {
      cleanup()
      reject(err)
    }
    const cleanup = (): void => {
      clearTimeout(timer)
      session.socket.removeListener('data', onData)
      session.socket.removeListener('error', onError)
    }
    session.socket.on('data', onData)
    session.socket.on('error', onError)
  })
}

async function command(session: SmtpSession & { socket: net.Socket }, line: string, timeoutMs?: number): Promise<string> {
  session.write(`${line}\r\n`)
  return readReply(session, timeoutMs)
}

export async function sendMail(config: SmtpConfig, message: MailMessage): Promise<string> {
  const socket: net.Socket = config.secure
    ? tls.connect({ host: config.host, port: config.port, rejectUnauthorized: false })
    : net.connect({ host: config.host, port: config.port })
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve())
    socket.once('error', reject)
  })
  const session: SmtpSession & { socket: net.Socket } = {
    socket,
    write: (data: string) => socket.write(data),
    destroy: () => socket.destroy(),
  }
  socket.setTimeout(60000)
  try {
    await readReply(session)
    await command(session, 'EHLO dsh-tools')
    if (!config.secure) {
      try {
        await command(session, 'STARTTLS')
        const upgraded = tls.connect({ socket: socket as never, rejectUnauthorized: false }, () => { /* ready */ }) as net.Socket
        // Replace the underlying socket with the upgraded TLS stream.
        ;(session as { socket: net.Socket }).socket = upgraded
        session.write = (data: string) => upgraded.write(data)
        await new Promise<void>((resolve) => upgraded.once('secureConnect', () => resolve()))
        await command(session, 'EHLO dsh-tools')
      } catch {
        // Server does not support STARTTLS; continue in the clear.
      }
    }
    if (config.user !== '' && config.pass !== '') {
      await command(session, 'AUTH LOGIN')
      await command(session, Buffer.from(config.user, 'utf8').toString('base64'))
      await command(session, Buffer.from(config.pass, 'utf8').toString('base64'))
    }
    const from = config.fromAddress || config.user
    await command(session, `MAIL FROM:<${from}>`)
    await command(session, `RCPT TO:<${message.to}>`)
    await command(session, 'DATA')

    const boundary = `tools_${Date.now().toString(36)}`
    const headers = [
      `From: ${config.fromName || 'TOOLS DSH'} <${from}>`,
      `To: <${message.to}>`,
      `Subject: ${mimeEncode(message.subject)}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ].join('\r\n')

    const parts: string[] = [
      `--${boundary}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${chunk76(Buffer.from(message.text, 'utf8').toString('base64'))}`,
    ]
    for (const att of message.attachments ?? []) {
      parts.push(
        `--${boundary}\r\nContent-Type: application/zip; name="${mimeEncode(att.filename)}"\r\nContent-Disposition: attachment; filename="${mimeEncode(att.filename)}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${chunk76(att.content.toString('base64'))}`,
      )
    }
    const body = `${headers}\r\n\r\n${parts.join('\r\n')}\r\n--${boundary}--\r\n.`
    await command(session, body, 120000)
    const bye = await command(session, 'QUIT').catch(() => 'closed')
    session.destroy()
    return bye
  } finally {
    session.destroy()
  }
}

function chunk76(s: string): string {
  return s.replace(/(.{76})/g, '$1\r\n')
}

function mimeEncode(s: string): string {
  // Encode only when non-ASCII appears; keep plain otherwise.
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`
}
