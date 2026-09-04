// Tripo API mock with a REAL cube-mesh GLB (valid geometry the 3D viewer renders).
// Endpoints: POST /v2/openapi/task → task id; GET /task/{id} → running then
// success with pbr_model → /model.glb serves a hand-built cube GLB.
const http = require('http')

// ---- Build a cube GLB (positions + normals + indices, one mesh, one node) ----
const positions = new Float32Array([
  -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5, // front
  -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, -0.5, // back
  -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5, // top
  -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5, // bottom
  0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, // right
  -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, // left
])
const normals = new Float32Array([
  0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
  0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
  0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
  0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
  1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
  -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
])
const indices = new Uint16Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15, 16, 17, 18, 16, 18, 19, 20, 21, 22, 20, 22, 23])
const posBuf = Buffer.from(positions.buffer)
const nrmBuf = Buffer.from(normals.buffer)
const idxBuf = Buffer.from(indices.buffer)
const align = (b) => { const pad = (4 - (b.length % 4)) % 4; return pad ? Buffer.concat([b, Buffer.alloc(pad)]) : b }
const bin = Buffer.concat([align(posBuf), align(nrmBuf), align(idxBuf)])
const posByteLen = align(posBuf).length, nrmByteLen = align(nrmBuf).length
const gltf = {
  asset: { version: '2.0', generator: 'mock-tripo' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'MockCube' }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
  materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.35, 0.6, 1, 1], metallicFactor: 0.1, roughnessFactor: 0.6 }, name: 'CubeMat' }],
  buffers: [{ byteLength: bin.length }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: posBuf.length, target: 34962 },
    { buffer: 0, byteOffset: posByteLen, byteLength: nrmBuf.length, target: 34962 },
    { buffer: 0, byteOffset: posByteLen + nrmByteLen, byteLength: idxBuf.length, target: 34963 },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 24, type: 'VEC3', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
    { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' },
    { bufferView: 2, componentType: 5123, count: 36, type: 'SCALAR' },
  ],
}
const jsonBuf = (() => {
  const j = Buffer.from(JSON.stringify(gltf), 'utf8')
  const pad = (4 - (j.length % 4)) % 4
  return Buffer.concat([j, Buffer.alloc(pad, 0x20)])
})()
const BIN_HEADER = 8
const total = 12 + 8 + jsonBuf.length + 8 + bin.length
const glb = Buffer.alloc(total)
glb.writeUInt32LE(0x46546c67, 0)
glb.writeUInt32LE(2, 4)
glb.writeUInt32LE(total, 8)
glb.writeUInt32LE(jsonBuf.length, 12)
glb.writeUInt32LE(0x4e4f534a, 16)
jsonBuf.copy(glb, 20)
let off = 20 + jsonBuf.length
glb.writeUInt32LE(bin.length, off)
glb.writeUInt32LE(0x004e4942, off + 4) // 'BIN\0'
bin.copy(glb, off + 8)

let polls = {}
const server = http.createServer((req, res) => {
  const url = req.url ?? ''
  if (url === '/v2/openapi/task' && req.method === 'POST') {
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', () => {
      const j = JSON.parse(body)
      if (typeof j.prompt !== 'string' || j.prompt.length === 0) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ message: 'prompt required' }))
        return
      }
      const id = 'mock-' + Date.now().toString(36)
      polls[id] = 0
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ code: 0, data: { task_id: id } }))
    })
    return
  }
  const m = url.match(/^\/v2\/openapi\/task\/(.+)$/)
  if (m && req.method === 'GET') {
    polls[m[1]] = (polls[m[1]] ?? 0) + 1
    const done = polls[m[1]] >= 2
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ code: 0, data: done
      ? { status: 'success', output: { pbr_model: 'http://127.0.0.1:9870/model.glb' } }
      : { status: 'running' } }))
    return
  }
  if (url === '/model.glb') {
    res.writeHead(200, { 'content-type': 'model/gltf-binary' })
    res.end(glb)
    return
  }
  res.writeHead(404)
  res.end('{}')
})
server.listen(9870, '127.0.0.1', () => console.log('mock tripo up: cube glb', glb.length, 'bytes,', indices.length, 'indices'))
