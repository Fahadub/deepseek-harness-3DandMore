// أداة تطبيع الأصول: تقرأ رأس GLB (قِطعة JSON) وتستخرج الأبعاد الحقيقية بالمتر
// لكل مجسم — تنتج _manifest.json الذي تقرأه الألعاب والوكيل قبل التركيب.
// الاستخدام: node glb-stats.mjs "<مجلد assets/3d>"
import { promises as fs } from 'node:fs'
import path from 'node:path'

const dir = process.argv[2]
if (dir === undefined) { console.error('usage: node glb-stats.mjs <assets/3d folder>'); process.exit(1) }

function glbJson(buf) {
  const magic = buf.readUInt32LE(0)
  if (magic !== 0x46546c67) throw new Error('not a GLB')
  const jsonLen = buf.readUInt32LE(12)
  return JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))
}

function meshSize(gltf) {
  // تقريب ممتاز: حدود كل accessor POSITION (min/max موجودة في GLB رأسًا)
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  const posAccessors = new Set()
  for (const m of gltf.meshes ?? []) {
    for (const prim of m.primitives ?? []) {
      const ai = prim.attributes?.POSITION
      if (ai !== undefined) posAccessors.add(ai)
    }
  }
  for (const ai of posAccessors) {
    const a = gltf.accessors?.[ai]
    if (a?.min !== undefined && a?.max !== undefined) {
      for (let i = 0; i < 3; i++) {
        mn[i] = Math.min(mn[i], a.min[i]); mx[i] = Math.max(mx[i], a.max[i])
      }
    }
  }
  if (mn[0] === Infinity) return null
  return { min: mn.map(v => +v.toFixed(3)), max: mx.map(v => +v.toFixed(3)), size: mx.map((v, i) => +(v - mn[i]).toFixed(3)) }
}

const files = (await fs.readdir(dir)).filter(f => f.toLowerCase().endsWith('.glb'))
const out = {}
for (const f of files) {
  try {
    const gltf = glbJson(await fs.readFile(path.join(dir, f)))
    const m = meshSize(gltf)
    out[f.replace(/\.glb$/i, '')] = { ...m, meshes: gltf.meshes?.length ?? 0, materials: gltf.materials?.length ?? 0, textures: gltf.images?.length ?? 0 }
  } catch (e) { out[f] = { error: String(e.message) } }
}
const dest = path.join(dir, '_manifest.json')
await fs.writeFile(dest, JSON.stringify(out, null, 2))
const names = Object.keys(out)
console.log(`مانيفست جاهز: ${dest} — ${names.length} مجسماً`)
for (const n of names.slice(0, 6)) console.log(` ${n}: ${JSON.stringify(out[n].size ?? out[n].error)}`)
