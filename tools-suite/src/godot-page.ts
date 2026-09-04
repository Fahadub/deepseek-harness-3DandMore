/**
 * صفحة Godot في المركز — فتح المحرر الرسمي على أي مساحة عمل + قراءة كتاب القدرات.
 */
export function renderGodotPage(): string {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>استوديو Godot — ديب سيك هارنس 3D</title>
<style>
  :root { --bg:#0d0e12; --bg2:#16181f; --bd:#2a2d38; --tx:#e8eaf0; --dim:#9aa0ae; --ac:#4f8cff; --ok:#2ea043 }
  * { box-sizing:border-box }
  body { margin:0; background:var(--bg); color:var(--tx); font-family:'Segoe UI',Tahoma,sans-serif; min-height:100vh; display:flex; flex-direction:column; align-items:center; padding:36px 20px }
  .logo { width:64px; height:64px }
  h1 { font-size:20px; margin:12px 0 4px }
  p.sub { color:var(--dim); font-size:13px; margin:0 0 20px; text-align:center; max-width:640px; line-height:1.9 }
  .panel { background:var(--bg2); border:1px solid var(--bd); border-radius:14px; padding:18px; width:min(640px,94vw) }
  .row { display:flex; gap:10px; align-items:center; margin:10px 0; flex-wrap:wrap }
  select, button { background:var(--bg); color:var(--tx); border:1px solid var(--bd); border-radius:9px; padding:9px 14px; font-size:14px }
  button { cursor:pointer } button.primary { border-color:var(--ac); color:var(--ac) } button:hover { filter:brightness(1.15) }
  .note { color:var(--dim); font-size:12px; margin-top:8px; line-height:1.9 }
  #book { white-space:pre-wrap; direction:rtl; text-align:right; font-size:12.5px; background:var(--bg); border:1px solid var(--bd); border-radius:10px; padding:14px; max-height:420px; overflow:auto; margin-top:14px; display:none }
  a { color:var(--ac); text-decoration:none }
</style>
</head>
<body>
  <svg class="logo" viewBox="0 0 24 24" fill="none" stroke="#6fb3ff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 7.2c1.4-1.2 3.1-1.8 5-1.8s3.6.6 5 1.8"/><path d="M4.6 10.4C6.6 8.9 9.2 8 12 8s5.4.9 7.4 2.4"/>
    <path d="M3 13.8c2.5-1.6 5.6-2.6 9-2.6s6.5 1 9 2.6"/><path d="M9.2 4.6l1 1.6M14.8 4.6l-1 1.6"/>
    <circle cx="10" cy="11.6" r=".7" fill="#6fb3ff"/><circle cx="14" cy="11.6" r=".7" fill="#6fb3ff"/>
  </svg>
  <h1>استوديو Godot — بكامل مميزاته</h1>
  <p class="sub">المحرر الرسمي Godot 4.7.2 محمّل داخل الهارنس. الوكيل يقرأ كتاب قدراته في أول برومت (الهيكلية + GDScript + المقاسات) ثم يبني لك مشروع لعبة كاملًا بصيغة قابلة للفتح هنا — وأنت من يفتح المحرر ويرى ويحرر بيده.</p>
  <div class="panel">
    <div class="row">
      <select id="ws"></select>
      <button class="primary" id="openBtn">افتح محرر Godot على المشروع</button>
    </div>
    <div class="row">
      <button id="bookBtn">اعرض كتاب قدرات Godot (ما يقرؤه الوكيل)</button>
    </div>
    <p class="note">تلميح للوكيل عند طلب لعبة Godot: «اقرأ tools-suite/godot/GODOT-CAPABILITIES.md أولًا ثم ابنِ المشروع كاملًا» — وسيتبع بروتوكول الاستكشاح والتذكر.</p>
    <div id="book"></div>
  </div>
<script>
  const q = s => document.querySelector(s)
  fetch('/tools/api/workspaces').then(r => r.json()).then(j => {
    j.workspaces.forEach(w => { const o = document.createElement('option'); o.value = w.id; o.textContent = w.path; q('#ws').appendChild(o) })
  }).catch(() => {})
  q('#openBtn').onclick = () => {
    fetch('/tools/api/godot/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ws: q('#ws').value }) })
      .then(r => r.json()).then(j => alert(j.ok ? 'فُتح محرر Godot على المشروع ✓' : 'فشل: ' + (j.error || 'غير معروف')))
      .catch(e => alert('فشل الاتصال: ' + e))
  }
  q('#bookBtn').onclick = () => {
    const b = q('#book')
    if (b.style.display === 'block') { b.style.display = 'none'; return }
    fetch('/tools/api/godot/book').then(r => r.text()).then(t => { b.textContent = t; b.style.display = 'block' })
  }
</script>
</body>
</html>`
}
