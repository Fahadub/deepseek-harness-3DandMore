/**
 * Minimal ZIP (store method) writer — no external dependencies.
 * Produces a spec-compliant ZIP with CRC-32, local headers, central
 * directory, and EOCD. Enough for "download project as ZIP" and for
 * attaching to email (ported from the original IDE's archiver-based feature).
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

export function crc32(buf: Buffer, seed = 0): number {
  let c = (seed ^ 0) >>> 0
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0) >>> 0
}

interface ZipEntry {
  name: string
  data: Buffer
  crc: number
  offset: number
}

export class ZipWriter {
  private entries: ZipEntry[] = []
  private parts: Buffer[] = []
  private offset = 0

  add(name: string, data: Buffer): void {
    const nameBuf = Buffer.from(name, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0x0800, 6) // flags: UTF-8 names
    local.writeUInt16LE(0, 8) // method: store
    local.writeUInt16LE(0, 10) // mod time
    local.writeUInt16LE(0x21, 12) // mod date (1980-01-01)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    this.parts.push(local, nameBuf, data)
    this.entries.push({ name, data, crc, offset: this.offset })
    this.offset += local.length + nameBuf.length + data.length
  }

  /** Assemble the final ZIP archive. */
  finish(): Buffer {
    const central: Buffer[] = []
    let centralSize = 0
    for (const e of this.entries) {
      const nameBuf = Buffer.from(e.name, 'utf8')
      const cd = Buffer.alloc(46)
      cd.writeUInt32LE(0x02014b50, 0)
      cd.writeUInt16LE(20, 4) // version made by
      cd.writeUInt16LE(20, 6) // version needed
      cd.writeUInt16LE(0x0800, 8) // flags: UTF-8
      cd.writeUInt16LE(0, 10) // method: store
      cd.writeUInt16LE(0, 12) // time
      cd.writeUInt16LE(0x21, 14) // date
      cd.writeUInt32LE(e.crc, 16)
      cd.writeUInt32LE(e.data.length, 20)
      cd.writeUInt32LE(e.data.length, 24)
      cd.writeUInt16LE(nameBuf.length, 28)
      cd.writeUInt16LE(0, 30) // extra
      cd.writeUInt16LE(0, 32) // comment
      cd.writeUInt16LE(0, 34) // disk
      cd.writeUInt16LE(0, 36) // internal attrs
      cd.writeUInt32LE(0, 38) // external attrs
      cd.writeUInt32LE(e.offset, 42)
      central.push(cd, nameBuf)
      centralSize += cd.length + nameBuf.length
    }
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    eocd.writeUInt16LE(0, 4)
    eocd.writeUInt16LE(0, 6)
    eocd.writeUInt16LE(this.entries.length, 8)
    eocd.writeUInt16LE(this.entries.length, 10)
    eocd.writeUInt32LE(centralSize, 12)
    eocd.writeUInt32LE(this.offset, 16)
    eocd.writeUInt16LE(0, 20)
    return Buffer.concat([...this.parts, ...central, eocd])
  }
}

export interface ZipFile { path: string; data: Buffer }

export function buildZip(files: ZipFile[]): Buffer {
  const w = new ZipWriter()
  for (const f of files) w.add(f.path.replace(/\\/g, '/'), f.data)
  return w.finish()
}
