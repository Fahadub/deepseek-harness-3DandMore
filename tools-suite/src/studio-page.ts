/**
 * استوديو التحرير البشري — صفحة مستقلة تُقدَّم من المركز على /tools/studio.
 * يعمل على «نسخة تحرير» من اللعبة فقط (الأصل محرم)، وكل تعديل يتحول فورًا
 * لكود three.js بالمقاسات + يُحفظ scene.json داخل النسخة عبر API الإصدارات.
 */
export function renderStudioPage(): string {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>استوديو التحرير البشري — three.js</title>
<style>
  :root { --bg:#0d0e12; --bg2:#16181f; --bd:#2a2d38; --tx:#e8eaf0; --dim:#9aa0ae; --ac:#4f8cff; --ok:#2ea043; --warn:#d29922 }
  * { box-sizing:border-box }
  body { margin:0; background:var(--bg); color:var(--tx); font-family:'Segoe UI',Tahoma,sans-serif; display:flex; flex-direction:column; height:100vh; overflow:hidden }
  header { display:flex; align-items:center; gap:10px; padding:8px 14px; background:var(--bg2); border-bottom:1px solid var(--bd) }
  header h1 { font-size:15px; margin:0 } header .logo { width:26px; height:26px }
  select, button, input { background:var(--bg2); color:var(--tx); border:1px solid var(--bd); border-radius:8px; padding:6px 10px; font-size:13px }
  button { cursor:pointer } button:hover { border-color:var(--ac) } button.mode.on { border-color:var(--ac); color:var(--ac) }
  #wrap { display:flex; flex:1; min-height:0 }
  #left { width:230px; border-left:1px solid var(--bd); overflow:auto; padding:10px }
  #left h3, #right h3 { font-size:12px; color:var(--dim); margin:8px 0 6px }
  .asset { padding:6px 8px; border:1px solid var(--bd); border-radius:8px; margin:4px 0; cursor:pointer; font-size:12.5px; direction:ltr; text-align:left }
  .asset:hover { border-color:var(--ac) }
  .obj { padding:5px 8px; border-radius:6px; margin:3px 0; cursor:pointer; font-size:12.5px; background:var(--bg2) }
  .obj.sel { outline:1.5px solid var(--ac) }
  #view { flex:1; position:relative; min-width:0 }
  canvas { display:block; width:100%; height:100% }
  #right { width:280px; border-right:1px solid var(--bd); overflow:auto; padding:10px }
  .row { display:flex; gap:6px; align-items:center; margin:4px 0 }
  .row label { font-size:11.5px; color:var(--dim); width:56px }
  .row input { width:70px; direction:ltr; text-align:center; padding:4px 6px; font-size:12.5px }
  #codebar { background:var(--bg2); border-top:1px solid var(--bd); padding:6px 14px; display:flex; gap:10px; align-items:center }
  #code { flex:1; direction:ltr; text-align:left; font-family:Consolas,monospace; font-size:12px; color:#9ecbff; background:var(--bg); border:1px solid var(--bd); border-radius:8px; padding:8px 10px; max-height:150px; overflow:auto; white-space:pre }
  #hint { position:absolute; top:8px; right:10px; font-size:11px; color:var(--dim); direction:rtl }
  .warn { color:var(--warn); font-size:11.5px }
  #toast { position:fixed; bottom:70px; right:50%; transform:translateX(50%); background:var(--bg2); border:1px solid var(--ac); border-radius:10px; padding:8px 16px; display:none; font-size:13px; z-index:9 }
</style>
</head>
<body>
<header>
  <svg class="logo" viewBox="0 0 24 24" fill="none" stroke="#e8d44d" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 15c2.2 0 2.6-4 5.2-4s3 4 5.4 4 3-4 5.4-4"/></svg>
  <h1>استوديو التحرير البشري — three.js</h1>
  <select id="wsSel"></select>
  <button id="cloneBtn" title="ينسخ اللعبة الحالية إلى مجلد «-تحرير» جديد ويقفل الاستوديو عليه — الأصل لا يُلمس أبدًا">أنشئ نسخة تحرير</button>
  <button class="mode on" id="mT">تحريك (W)</button>
  <button class="mode" id="mR">دوران (E)</button>
  <button class="mode" id="mS">تحجيم (R)</button>
  <button id="dupBtn">تكرار</button>
  <button id="delBtn">حذف</button>
  <button id="saveBtn" style="border-color:var(--ok)">حفظ scene.json بالنسخة</button>
</header>
<div id="wrap">
  <div id="left">
    <h3>مجسمات اللعبة (GLB)</h3>
    <div id="assets"></div>
    <h3>مثيلات المشهد</h3>
    <div id="objs"></div>
    <p class="warn" id="copyWarn"></p>
  </div>
  <div id="view"><canvas id="c"></canvas><div id="hint">اسحب للدوران، عجلة للتقريب، انقر مجسمًا لتحديده ثم جيزمو</div></div>
  <div id="right">
    <h3>الخصائص (متر / درجة)</h3>
    <div class="row"><label>الاسم</label><input id="pName" style="width:180px;direction:rtl;text-align:right"></div>
    <div class="row"><label>الموضع X</label><input id="px" type="number" step="0.1"><label>Y</label><input id="py" type="number" step="0.1"><label>Z</label><input id="pz" type="number" step="0.1"></div>
    <div class="row"><label>الدوران Y°</label><input id="ry" type="number" step="5"></div>
    <h3>الأبعاد الحقيقية (متر)</h3>
    <div class="row"><label>طول Z</label><input id="dz" type="number" step="0.1"><label>عرض X</label><input id="dx" type="number" step="0.1"><label>ارتفاع Y</label><input id="dy" type="number" step="0.1"></div>
    <p class="warn" style="margin:6px 0">عدّل الأبعاد بالأرقام — يحسب الاستوديو scale تلقائيًا من أبعاد GLB الحقيقية.</p>
    <h3>الكود المُولَّد (للنسخ أو التصدير)</h3>
    <button id="copyCode">نسخ الكود</button>
    <button id="dlCode">تنزيل patch.js</button>
  </div>
</div>
<div id="codebar"><div id="code"></div></div>
<div id="toast"></div>
<script type="importmap">
{ "imports": {
  "three": "/tools/assets-three/three.module.js",
  "three/addons/controls/OrbitControls.js": "/tools/assets-three/OrbitControls.js",
  "three/addons/controls/TransformControls.js": "/tools/assets-three/TransformControls.js",
  "three/addons/loaders/GLTFLoader.js": "/tools/assets-three/GLTFLoader.js"
} }
</script>
<script type="module">
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const q = s => document.querySelector(s)
let ws = new URLSearchParams(location.search).get('ws') || ''
let isCopy = false
const api = (p, opts, cb) => { opts = opts || {}; opts.headers = opts.headers || {}
  if (opts.body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.body) }
  fetch(p, opts).then(r => r.json().then(j => ({ s: r.status, j }))).then(x => cb && cb(null, x), e => cb && cb(e)) }

const renderer = new THREE.WebGLRenderer({ canvas: q('#c'), antialias: true })
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x11131a)
scene.fog = new THREE.Fog(0x11131a, 60, 160)
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500)
camera.position.set(12, 9, 14)
const orbit = new OrbitControls(camera, renderer.domElement)
const grid = new THREE.GridHelper(60, 60, 0x333746, 0x232733)
scene.add(grid)
scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x30281e, 1.15))
const sun = new THREE.DirectionalLight(0xffffff, 1.6)
sun.position.set(14, 20, 8)
scene.add(sun)
const tc = new TransformControls(camera, renderer.domElement)
tc.addEventListener('dragging-changed', e => { orbit.enabled = !e.value })
tc.addEventListener('objectChange', () => { select(selected, true); genCode() })
scene.add(tc)

function resize() {
  const v = q('#view'), w = v.clientWidth, h = v.clientHeight
  renderer.setSize(w, h, false); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); camera.aspect = w / h; camera.updateProjectionMatrix()
}
addEventListener('resize', resize)

const loader = new GLTFLoader()
const objects = []
let selected = null
let idc = 1

function baseDims(obj) {
  const box = new THREE.Box3().setFromObject(obj)
  const s = box.getSize(new THREE.Vector3())
  obj.userData.baseW = Math.max(s.x, 1e-6); obj.userData.baseH = Math.max(s.y, 1e-6); obj.userData.baseD = Math.max(s.z, 1e-6)
}

function addInstance(file, label, pos) {
  const clean = 'glb/' + encodeURIComponent(file.split('/').pop())
  loader.load('/tools/api/studio/asset?ws=' + encodeURIComponent(ws) + '&f=' + encodeURIComponent(file), g => {
    const o = g.scene
    o.position.copy(pos || new THREE.Vector3(0, 0, 0))
    baseDims(o)
    o.userData.label = (label || file.split('/').pop().replace('.glb', '')) + '-' + (idc++)
    o.userData.file = file
    scene.add(o); objects.push(o); select(o); renderObjs(); genCode()
  }, undefined, () => toast('فشل تحميل ' + file, true))
}

function select(o, keepScroll) {
  selected = o
  if (o === null) { tc.detach(); q('#pName').value = ''; return }
  tc.attach(o)
  q('#pName').value = o.userData.label
  q('#px').value = o.position.x.toFixed(2); q('#py').value = o.position.y.toFixed(2); q('#pz').value = o.position.z.toFixed(2)
  q('#ry').value = Math.round(THREE.MathUtils.radToDeg(o.rotation.y))
  const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3())
  q('#dx').value = s.x.toFixed(2); q('#dy').value = s.y.toFixed(2); q('#dz').value = s.z.toFixed(2)
  if (!keepScroll) renderObjs()
}

function renderObjs() {
  const el = q('#objs'); el.innerHTML = ''
  objects.forEach(o => {
    const d = document.createElement('div')
    d.className = 'obj' + (o === selected ? ' sel' : '')
    d.textContent = o.userData.label
    d.onclick = () => select(o)
    el.appendChild(d)
  })
}

function genCode() {
  const lines = ['// بذرة التطبيق البشري — أبعاد ومواضع مقيسة من الاستوديو', 'const placed = [']
  objects.forEach(o => {
    const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3())
    lines.push('  {')
    lines.push("    file: '" + o.userData.file + "',            // " + o.userData.label)
    lines.push('    position: [' + o.position.x.toFixed(2) + ', ' + o.position.y.toFixed(2) + ', ' + o.position.z.toFixed(2) + '],')
    lines.push('    rotationY: ' + Math.round(THREE.MathUtils.radToDeg(o.rotation.y)) + ',')
    lines.push('    scale: [' + o.scale.x.toFixed(3) + ', ' + o.scale.y.toFixed(3) + ', ' + o.scale.z.toFixed(3) + '],')
    lines.push('    dims: { w: ' + s.x.toFixed(2) + ', h: ' + s.y.toFixed(2) + ', d: ' + s.z.toFixed(2) + ' },  // بالمتر')
    lines.push('  },')
  })
  lines.push(']')
  q('#code').textContent = lines.join('\\n')
}

function applyDims() {
  if (selected === null) return
  const o = selected
  o.scale.x = Number(q('#dx').value) / o.userData.baseW
  o.scale.y = Number(q('#dy').value) / o.userData.baseH
  o.scale.z = Number(q('#dz').value) / o.userData.baseD
  select(o, true); genCode()
}

const ray = new THREE.Raycaster(), ptr = new THREE.Vector2()
renderer.domElement.addEventListener('pointerdown', e => {
  ptr.x = (e.offsetX / renderer.domElement.clientWidth) * 2 - 1
  ptr.y = -(e.offsetY / renderer.domElement.clientHeight) * 2 + 1
  ray.setFromCamera(ptr, camera)
  const hit = ray.intersectObjects(objects, true)[0]
  if (hit !== undefined) { let o = hit.object; while (o.parent !== null && !objects.includes(o)) o = o.parent; select(o) }
})
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return
  if (e.key === 'w') setMode('translate'); if (e.key === 'e') setMode('rotate'); if (e.key === 'r') setMode('scale')
  if (e.key === 'Delete' && selected !== null) { scene.remove(selected); objects.splice(objects.indexOf(selected), 1); select(null); renderObjs(); genCode() }
})
function setMode(m) { tc.setMode(m); ['T', 'R', 'S'].forEach(x => q('#m' + x).classList.toggle('on', m[0].toUpperCase() === x)) }
q('#mT').onclick = () => setMode('translate'); q('#mR').onclick = () => setMode('rotate'); q('#mS').onclick = () => setMode('scale')
q('#dupBtn').onclick = () => { if (selected === null) return
  loader.load('/tools/api/studio/asset?ws=' + encodeURIComponent(ws) + '&f=' + encodeURIComponent(selected.userData.file), g => {
    const o = g.scene
    o.position.copy(selected.position).add(new THREE.Vector3(2, 0, 0)); o.rotation.copy(selected.rotation); o.scale.copy(selected.scale)
    baseDims(o); o.userData.label = selected.userData.label + '-نسخة'; o.userData.file = selected.userData.file
    scene.add(o); objects.push(o); select(o); renderObjs(); genCode()
  }) }
q('#delBtn').onclick = () => { if (selected !== null) { scene.remove(selected); objects.splice(objects.indexOf(selected), 1); select(null); renderObjs(); genCode() } }
;['px', 'py', 'pz'].forEach(id => q('#' + id).onchange = () => { if (selected === null) return
  selected.position.set(Number(q('#px').value), Number(q('#py').value), Number(q('#pz').value)); genCode() })
q('#ry').onchange = () => { if (selected === null) return; selected.rotation.y = THREE.MathUtils.degToRad(Number(q('#ry').value)); genCode() }
;['dx', 'dy', 'dz'].forEach(id => q('#' + id).onchange = applyDims)
q('#pName').onchange = () => { if (selected !== null) { selected.userData.label = q('#pName').value; renderObjs(); genCode() } }
q('#copyCode').onclick = () => { navigator.clipboard.writeText(q('#code').textContent); toast('نُسخ الكود ✓') }
q('#dlCode').onclick = () => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([q('#code').textContent], { type: 'text/javascript' }))
  a.download = 'human-patch.js'; a.click()
}
q('#saveBtn').onclick = () => {
  genCode()
  const data = { studio: 'three-human', savedAt: new Date().toISOString(), objects: objects.map(o => ({ label: o.userData.label, file: o.userData.file, position: [o.position.x, o.position.y, o.position.z].map(v => +v.toFixed(3)), rotationY: Math.round(THREE.MathUtils.radToDeg(o.rotation.y)), scale: [o.scale.x, o.scale.y, o.scale.z].map(v => +v.toFixed(3)) })) }
  api('/tools/api/files/write?ws=' + encodeURIComponent(ws) + '&p=' + encodeURIComponent('.dsh-tools/studio/scene.json'), { method: 'POST', body: { content: JSON.stringify(data, null, 2) } }, (e, x) => {
    toast(e || x.s !== 200 ? 'فشل الحفظ: ' + ((x && x.j && x.j.error) || e || x.s) : 'حُفظ scene.json داخل نسخة التحرير (مع لقطة إصدار للتراجع) ✓', !!(e || x.s !== 200))
  })
}
q('#cloneBtn').onclick = () => {
  api('/tools/api/studio/clone', { method: 'POST', body: { ws } }, (e, x) => {
    if (e || x.s !== 200 || !x.j.ok) { toast('فشل إنشاء النسخة: ' + ((x && x.j && x.j.error) || e), true); return }
    ws = x.j.ws
    isCopy = true
    toast('أُنشئت نسخة التحرير: ' + x.j.path + ' — الاستوديو مقفل عليها')
    loadWsInfo(); loadAssets()
  })
}

function loadAssets() {
  api('/tools/api/studio/assets?ws=' + encodeURIComponent(ws), null, (e, x) => {
    if (e || x.s !== 200) return
    const el = q('#assets'); el.innerHTML = ''
    x.j.glbs.forEach(g => {
      const d = document.createElement('div')
      d.className = 'asset'; d.textContent = g.file.split('/').pop() + '  (' + (g.bytes / 1048576).toFixed(1) + 'MB)'
      d.title = 'انقر لإضافة مثيل للمشهد'
      d.onclick = () => addInstance(g.file)
      el.appendChild(d)
    })
  })
}
function loadWsInfo() {
  api('/tools/api/workspaces', null, (e, x) => {
    if (e || x.s !== 200) return
    const sel = q('#wsSel'); sel.innerHTML = ''
    x.j.workspaces.forEach(w => {
      const o = document.createElement('option')
      o.value = w.id; o.textContent = w.path
      if (w.id === ws || w.path === ws) o.selected = true
      sel.appendChild(o)
    })
    isCopy = (x.j.workspaces.find(w => w.id === ws || w.path === ws)?.path || '').includes('-تحرير')
    q('#copyWarn').textContent = isCopy ? '' : '⚠ أنت على الأصل — أنشئ نسخة تحرير قبل التحرير لضمان عدم مس المشروع'
  })
}
q('#wsSel').onchange = () => { ws = q('#wsSel').value; loadAssets(); loadWsInfo(); objects.length = 0; scene.clear(); scene.add(grid); scene.add(tc); select(null); renderObjs(); genCode(); addLightsBack() }
function addLightsBack() { scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x30281e, 1.15)); sun.position.set(14, 20, 8); scene.add(sun) }
function toast(m, err) { const t = q('#toast'); t.textContent = m; t.style.display = 'block'; t.style.borderColor = err ? '#e5534b' : 'var(--ac)'; setTimeout(() => t.style.display = 'none', 3200) }

function frame() { requestAnimationFrame(frame); orbit.update(); renderer.render(scene, camera) }
resize(); frame(); loadWsInfo(); loadAssets()
</script>
</body>
</html>`
}
