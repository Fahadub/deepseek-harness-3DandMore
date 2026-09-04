/**
 * Tools UI injection into the main Web UI index.
 * Uses the webserver's tapIndex seam to add dsh-native controls:
 *  - Composer-style chips (same design tokens already on the page):
 *    «الأدوات» opens the tools hub as an IN-APP overlay (not a new tab),
 *    «استمع» opens a polished reader for the latest assistant reply with
 *    play/pause/stop and speed controls (speechSynthesis).
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'

export const name = 'tool-ui-inject'
export const inject = ['webServer']

const INJECTED_SNIPPET = `
<style id="tools-ui-style">
/* Uses the page's own --dsw-alias-* design tokens so the controls are native-looking. */
#tools-dock{position:fixed;bottom:18px;left:18px;z-index:9990;display:flex;gap:8px;direction:rtl;
  font-family:var(--dsw-font-family,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif)}
.tools-chip{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:999px;cursor:pointer;
  border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12));
  background:var(--dsw-alias-button-floating-fill,rgb(44,44,46));color:var(--dsw-alias-label-secondary,rgb(207,211,214));
  font-size:13px;line-height:18px;backdrop-filter:blur(8px);
  box-shadow:0 4px 24px rgba(0,0,0,.32);transition:all .14s ease;user-select:none}
.tools-chip:hover{background:var(--dsw-alias-button-floating-hover,rgb(53,54,56));
  color:var(--dsw-alias-label-primary,rgb(249,250,251));border-color:var(--dsw-alias-border-l3,rgba(255,255,255,.16))}
.tools-chip:active{transform:scale(.97)}
.tools-chip.icon{padding:9px;border-radius:10px}
.tools-chip.icon svg{display:block}
.tools-chip.on{border-color:var(--dsw-alias-state-success-primary,#2ea043);
  color:var(--dsw-alias-state-success-primary,#2ea043)}
.tools-chip.on .dot{display:inline-block}
.tools-chip .dot{display:none;width:7px;height:7px;border-radius:50%;
  background:var(--dsw-alias-state-success-primary,#2ea043);margin-inline-start:2px}
#tools-assets-note{position:fixed;bottom:64px;left:18px;z-index:9991;direction:rtl;display:none;
  padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.7;max-width:320px;
  border:1px solid var(--dsw-alias-state-success-primary,#2ea043);
  background:var(--dsw-alias-bg-layer-1,rgb(35,35,36));color:var(--dsw-alias-label-secondary,rgb(207,211,214));
  box-shadow:0 12px 40px rgba(0,0,0,.45)}
#tools-assets-note.on{display:block;animation:tools-fade .18s ease}
#tools-build{position:fixed;inset:0;z-index:9997;display:none;align-items:center;justify-content:center;direction:rtl;
  background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.5));backdrop-filter:blur(2px);
  font-family:var(--dsw-font-family,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif)}
#tools-build.on{display:flex;animation:tools-fade .18s ease}
#tools-build .panel{background:var(--dsw-alias-bg-layer-1,rgb(35,35,36));
  border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12));border-radius:16px;
  width:min(560px,92vw);max-height:80vh;overflow:auto;display:flex;flex-direction:column;
  box-shadow:0 24px 64px rgba(0,0,0,.5);animation:tools-rise .22s cubic-bezier(.2,.9,.3,1)}
#tools-build .bhead{display:flex;align-items:center;gap:10px;padding:14px 18px;
  border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.06))}
#tools-build .bhead .t{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary,rgb(249,250,251));flex:1}
#tools-build .bopt{display:flex;flex-direction:column;gap:4px;margin:10px 16px;padding:14px 16px;border-radius:12px;cursor:pointer;
  border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12));background:transparent;text-align:right;
  color:var(--dsw-alias-label-primary,rgb(249,250,251));font-family:inherit;transition:all .12s ease}
#tools-build .bopt:hover{border-color:var(--dsw-alias-state-success-primary,#2ea043);background:rgba(255,255,255,.05)}
#tools-build .bopt .n{font-size:15px;font-weight:600}
#tools-build .bopt .d{font-size:12.5px;line-height:1.7;color:var(--dsw-alias-label-tertiary,rgb(173,178,184))}
#tools-build .bcancel{margin:4px 16px 14px;align-self:center}
#tools-overlay{position:fixed;inset:0;z-index:9995;display:none;direction:rtl;
  background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.5));backdrop-filter:blur(3px)}
#tools-overlay.on{display:block;animation:tools-fade .18s ease}
#tools-overlay .frame{position:absolute;inset:18px;border-radius:16px;overflow:hidden;
  border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12));
  box-shadow:0 32px 90px rgba(0,0,0,.55);background:var(--dsw-alias-bg-base,rgb(21,21,23));
  animation:tools-rise .22s cubic-bezier(.2,.9,.3,1)}
#tools-overlay iframe{width:100%;height:100%;border:none;display:block}
#tools-overlay .close{position:absolute;top:30px;left:30px;z-index:2}
@keyframes tools-fade{from{opacity:0}to{opacity:1}}
@keyframes tools-rise{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}

/* Reader panel */
#tools-reader{position:fixed;inset:0;z-index:9998;display:none;align-items:center;justify-content:center;direction:rtl;
  background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.5));backdrop-filter:blur(2px);
  font-family:var(--dsw-font-family,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif)}
#tools-reader.on{display:flex;animation:tools-fade .18s ease}
#tools-reader .panel{background:var(--dsw-alias-bg-layer-1,rgb(35,35,36));
  border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12));border-radius:16px;
  width:min(680px,92vw);max-height:76vh;display:flex;flex-direction:column;
  box-shadow:0 24px 64px rgba(0,0,0,.5);animation:tools-rise .22s cubic-bezier(.2,.9,.3,1)}
#tools-reader .rhead{display:flex;align-items:center;gap:10px;padding:14px 18px;
  border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.06))}
#tools-reader .rhead .t{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary,rgb(249,250,251));flex:1}
#tools-reader .rtext{padding:18px 20px;overflow:auto;font-size:14px;line-height:2;
  color:var(--dsw-alias-label-secondary,rgb(207,211,214));white-space:pre-wrap}
#tools-reader .rfoot{display:flex;align-items:center;gap:8px;padding:12px 18px;flex-wrap:wrap;
  border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.06))}
#tools-reader .rbtn{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;cursor:pointer;
  border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12));background:transparent;
  color:var(--dsw-alias-label-primary,rgb(249,250,251));font-size:13px;font-family:inherit;transition:all .12s ease}
#tools-reader .rbtn:hover{background:rgba(255,255,255,.08)}
#tools-reader .rbtn.primary{background:var(--dsw-alias-button-primary-fill,rgb(249,250,251));
  color:rgb(15,17,21);border-color:transparent;font-weight:500}
#tools-reader .rbtn.primary:hover{background:var(--dsw-alias-button-primary-hover,rgb(235,238,242))}
#tools-reader .rate{margin-inline-start:auto;display:flex;gap:4px}
#tools-reader .rate button{padding:4px 10px;border-radius:999px;border:1px solid transparent;cursor:pointer;
  background:transparent;color:var(--dsw-alias-label-tertiary,rgb(173,178,184));font-size:12px;font-family:inherit}
#tools-reader .rate button:hover{color:var(--dsw-alias-label-primary,rgb(249,250,251))}
#tools-reader .rate button.on{border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.12));
  color:var(--dsw-alias-label-primary,rgb(249,250,251));background:rgba(255,255,255,.08)}
[class*="ommand"]{unicode-bidi:plaintext}
[class*="ommand"] *{unicode-bidi:plaintext}
</style>
<div id="tools-dock">
  <span class="tools-chip icon" id="tools-tts" role="button" title="استمع للرد — قراءة صوتية لآخر رد"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6.5 8.5H3.5v7h3L11 19z"/><path d="M15.5 8.8a4.5 4.5 0 0 1 0 6.4M18.2 6.2a8 8 0 0 1 0 11.6"/></svg></span>
  <span class="tools-chip icon" id="tools-assets" role="button" title="أصول 3D — نقرة واحدة تفعّل وصول الوكيل لكل الصور والمجسمات المحلية الجاهزة"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.7 20.5 7v10L12 21.3 3.5 17V7z"/><path d="M3.5 7 12 11.6 20.5 7M12 11.6v9.7"/></svg><span class="dot"></span></span>
  <span class="tools-chip icon" id="tools-settings-chip" role="button" title="Settings / الإعدادات / 设置 — opens the app settings (any language)"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.09a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/></svg></span>
  <span class="tools-chip icon" id="tools-build-chip" role="button" title="وضع البناء — اختر المحرك: three.js أو Godot أو مزجهما"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4.5 4.5 0 0 0-6.4 0L3 11.6l3.2 3.2 5.3-5.3a4.5 4.5 0 0 0 3.2-3.2z"/><path d="m10 14-3.5 3.5a2.1 2.1 0 0 1-3-3L7 11"/><path d="M21 3l-4 1-6.5 6.5 3 3L20 7z"/></svg><span class="dot"></span></span>
  <span class="tools-chip icon" id="tools-hub" role="button" title="الأدوات — مركز مساحة العمل"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg></span>
</div>
<div id="tools-assets-note"><span id="tools-assets-note-txt"></span></div>
<div id="tools-build">
  <div class="panel">
    <div class="bhead">
      <span class="t">وضع البناء — اختر المحرك</span>
      <span class="rbtn" id="tools-build-x" role="button" style="cursor:pointer;padding:6px 14px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12))">إغلاق</span>
    </div>
    <button class="bopt" data-mode="three">
      <span class="n">🎮 بناء بـ three.js</span>
      <span class="d">لعبة ويب كاملة بالمكتبة المحلية — تعمل بالمتصفح فوراً، معاينة حية، فيزياء Rapier ومسارات أعداء مدمجة، واتباع كتاب CAPABILITIES.md بكل سياساته</span>
    </button>
    <button class="bopt" data-mode="godot">
      <span class="n">🏗️ بناء بـ Godot 4.7</span>
      <span class="d">مشروع لعبة كامل يفتح بالمحرر بلا أخطاء — وفق كتاب GODOT-CAPABILITIES ودفاتر PLAYBOOK، مع الجسر الحي داخل المحرر</span>
    </button>
    <button class="bopt" data-mode="mixed">
      <span class="n">🔀 مزج المحركين معاً</span>
      <span class="d">القرار لكل مكوّن: معاينة/واجهة/عارض ويب بـthree.js، واللعبة الفعلية مشروع Godot — بنفس الأصول الموحدة المعالجة ببلندر</span>
    </button>
    <button class="bopt" data-mode="off">
      <span class="n">↩️ إلغاء وضع البناء</span>
      <span class="d">يعود الوكيل لاختيار المحرك المناسب تلقائياً حسب طلبك</span>
    </button>
  </div>
</div>
<div id="tools-overlay">
  <div class="frame"><iframe id="tools-frame" title="الأدوات"></iframe></div>
  <span class="tools-chip close" id="tools-close" role="button">إغلاق</span>
</div>
<div id="tools-reader">
  <div class="panel">
    <div class="rhead">
      <span class="t">القارئ الصوتي</span>
      <span class="rbtn" id="tools-rx" role="button">إغلاق</span>
    </div>
    <div class="rtext" id="tools-rtxt"></div>
    <div class="rfoot">
      <span class="rbtn primary" id="tools-rplay" role="button">تشغيل</span>
      <span class="rbtn" id="tools-rpause" role="button">إيقاف مؤقت</span>
      <span class="rbtn" id="tools-rstop" role="button">إيقاف</span>
      <span class="rate" id="tools-rrate">
        <button data-r="0.75">0.75×</button>
        <button data-r="1" class="on">1×</button>
        <button data-r="1.25">1.25×</button>
        <button data-r="1.5">1.5×</button>
      </span>
    </div>
  </div>
</div>
<script>
(function () {
  var readerRate = 1;
  var readerUtter = null;

  function openOverlay() {
    var f = document.getElementById('tools-frame');
    if (f && !f.getAttribute('src')) f.setAttribute('src', '/tools');
    document.getElementById('tools-overlay').classList.add('on');
    document.documentElement.style.overflow = 'hidden';
  }
  function closeOverlay() {
    document.getElementById('tools-overlay').classList.remove('on');
    document.documentElement.style.overflow = '';
  }
  function latestReplyText() {
    var blocks = [].slice.call(document.querySelectorAll('[class*=message],[class*=assistant] *,article'))
      .filter(function (el) { return el.children.length === 0 && (el.textContent || '').trim().length > 120; });
    var text = blocks.length ? blocks[blocks.length - 1].textContent.trim() : '';
    if (text === '') text = (document.getSelection && document.getSelection().toString()) || '';
    if (text === '') text = String(document.body.innerText || document.body.textContent || '').trim().slice(-4000);
    return text;
  }
  function speakReader() {
    var panel = document.getElementById('tools-reader');
    if (!panel) return;
    panel.classList.add('on');
    var text = latestReplyText().slice(0, 12000);
    var txt = document.getElementById('tools-rtxt');
    if (txt) txt.textContent = text === '' ? 'لا يوجد رد لقراءته بعد — أرسل رسالة ثم أعد المحاولة.' : text;
    if (text === '') return;
    if (!('speechSynthesis' in window)) { if (txt) txt.textContent += ' (متصفحك لا يدعم النطق الصوتي)'; return; }
    stopReader();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'ar-SA'; u.rate = readerRate;
    var vs = speechSynthesis.getVoices().filter(function (v) { return /ar/i.test(v.lang); });
    if (vs.length) u.voice = vs[0];
    u.onend = function () { readerUtter = null; setPlayLabel('تشغيل'); };
    u.onerror = function () { readerUtter = null; setPlayLabel('تشغيل'); };
    readerUtter = u;
    speechSynthesis.speak(u);
    setPlayLabel('إعادة التشغيل');
  }
  function setPlayLabel(s) {
    var b = document.getElementById('tools-rplay'); if (b) b.textContent = s;
  }
  function stopReader() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    readerUtter = null; setPlayLabel('تشغيل');
  }
  function closeReader() { stopReader(); document.getElementById('tools-reader').classList.remove('on'); }

  /* ---- زر أصول 3D: نقرة واحدة = وصول الوكيل الكامل للأصول المحلية ---- */
  function assetsNote(msg, ms) {
    var n = document.getElementById('tools-assets-note');
    var t = document.getElementById('tools-assets-note-txt');
    if (!n || !t) return;
    t.textContent = msg;
    n.classList.add('on');
    setTimeout(function () { n.classList.remove('on'); }, ms || 4200);
  }
  function composerTextarea() {
    var tas = document.querySelectorAll('textarea');
    for (var i = 0; i < tas.length; i++) { if (tas[i].offsetParent !== null) return tas[i]; }
    return tas.length ? tas[0] : null;
  }
  function sendToComposer(text) {
    var ta = composerTextarea();
    if (!ta) { assetsNote('لم أجد مربع الكتابة — افتح محادثة ثم أعد المحاولة'); return false; }
    var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, text);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    try {
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true, cancelable: true }));
    } catch (err) { /* المتصفح سيرسل عند Enter يدوياً */ }
    return true;
  }
  function toggleAssets() {
    var chip = document.getElementById('tools-assets');
    if (!chip) return;
    var on = !chip.classList.contains('on');
    chip.classList.toggle('on', on);
    try { localStorage.setItem('dsh-assets-mode', on ? 'on' : 'off'); } catch (err) { /* لا تخزين */ }
    if (on) {
      fetch('/tools/api/assets/paths').then(function (r) { return r.json(); }).then(function (j) {
        var models = 0, images = 0;
        (j.scans || []).forEach(function (s) { models += s.models; images += s.images; });
        var line = 'وضع الأصول المحلية مفعّل: من الآن ابحث بأداة local_assets عن كل الصور والمجسمات الجاهزة (' +
          models + ' مجسم + ' + images + ' صورة متاحة الآن) واستخدم المناسب منها مباشرة في أعمالي — لا تسألني عن المسارات ولا تولّد عبر Tripo إلا إن طلبت صراحة.';
        sendToComposer(line);
        assetsNote('وضع الأصول مفعّل — الوكيل الآن يرى ' + models + ' مجسماً و' + images + ' صورة جاهزة');
      }).catch(function () {
        sendToComposer('وضع الأصول المحلية مفعّل: ابحث بأداة local_assets عن الصور والمجسمات الجاهزة واستخدمها مباشرة — لا تسألني عن المسارات ولا تولّد عبر Tripo إلا إن طلبت صراحة.');
        assetsNote('وضع الأصول مفعّل (تعذر عدّ الملفات)');
      });
    } else {
      sendToComposer('أوقف وضع الأصول المحلية — عد للوضع العادي.');
      assetsNote('أُوقف وضع الأصول');
    }
  }

  /* ---- زر وضع البناء: three.js / Godot / مزيج ---- */
  var BUILD_TEXTS = {
    three: 'وضع البناء: three.js — ابنِ اللعبة كتطبيق ويب كامل بمكتبة three.js المحلية (انسخ الإضافات المطلوبة فقط من tools-suite/three واتبع كتاب CAPABILITIES.md بكل سياساته: مقياس بشري واقعي، لا أيقونات جاهزة، بوابة أداء 45+ FPS، معيار scene.json). ابحث في local_assets أولاً واستخدم الجاهز، وأي مجسم يحتاج تحسيناً (اتجاه، محور، مقاس، تصادم، تخفيف مضلعات، تجهيز حركة) مرّره عبر asset_pipeline ببلندر قبل وضعه — بلندر يُستخدم متى حسّن أي شيء في التصميم أو اللعبة أو الحركة.',
    godot: 'وضع البناء: Godot — ابنِ مشروع Godot 4.7 كاملاً يفتح بالمحرر بلا أخطاء وفق كتاب GODOT-CAPABILITIES ودفاتر PLAYBOOK (هيكل project.godot/scenes/scripts/assets، GDScript بأنماط بشرية، مقاسات مترية واقعية، واجهة عربية RTL). ابحث في local_assets أولاً، وجهّز كل مجسم عبر asset_pipeline ببلندر (اتجاه/محور/مقاس/تصادم) قبل استيراده في Godot — بلندر يُستخدم متى حسّن أي شيء في التصميم أو اللعبة أو الحركة. سلّم بفتح Godot من زر المركز على مجلد المشروع.',
    mixed: 'وضع البناء: مزيج three.js + Godot — قرّر لكل مكوّن الأنسب: المعاينة والواجهات والعارض الفوري بـthree.js (كتاب CAPABILITIES)، واللعبة الفعلية مشروع Godot كامل (كتاب GODOT-CAPABILITIES)، مع مشاركة نفس الأصول الموحدة: كل مجسم من local_assets يُعالج مرة واحدة عبر asset_pipeline ببلندر (اتجاه/محور/مقاس/تصادم/تجهيز حركة) ثم يُستخدم في المحركين — بلندر يُستخدم متى حسّن أي شيء في التصميم أو اللعبة أو الحركة.',
    off: 'أُلغي وضع البناء المحدد — عد لاختيار المحرك الأنسب تلقائياً حسب طلبي في كل مرة.'
  };
  var BUILD_NAMES = { three: 'three.js', godot: 'Godot', mixed: 'مزيج المحركين', off: '' };
  function buildPanel(open) {
    var p = document.getElementById('tools-build');
    if (p) p.classList.toggle('on', open);
  }
  function selectBuild(mode) {
    var chip = document.getElementById('tools-build-chip');
    var text = BUILD_TEXTS[mode];
    if (!text || !chip) return;
    var active = mode !== 'off';
    chip.classList.toggle('on', active);
    try { localStorage.setItem('dsh-build-mode', mode); } catch (err) { /* لا تخزين */ }
    chip.title = active ? ('وضع البناء الحالي: ' + BUILD_NAMES[mode] + ' — انقر للتغيير') : 'وضع البناء — اختر المحرك';
    sendToComposer(text);
    assetsNote(active ? ('وضع البناء: ' + BUILD_NAMES[mode] + ' — أُرسل التوجيه للوكيل') : 'أُلغي وضع البناء');
    buildPanel(false);
  }
  function bootBuildChip() {
    var chip = document.getElementById('tools-build-chip');
    if (!chip || chip.dataset.b) return;
    chip.dataset.b = '1';
    chip.addEventListener('click', function () { buildPanel(true); });
    var saved = null;
    try { saved = localStorage.getItem('dsh-build-mode'); } catch (err) { /* لا تخزين */ }
    if (saved === 'three' || saved === 'godot' || saved === 'mixed') {
      chip.classList.add('on');
      chip.title = 'وضع البناء الحالي: ' + BUILD_NAMES[saved] + ' — انقر للتغيير';
    }
    var panel = document.getElementById('tools-build');
    if (panel && !panel.dataset.b) {
      panel.dataset.b = '1';
      panel.addEventListener('click', function (e) {
        if (e.target === panel) { buildPanel(false); return; }
        var opt = e.target.closest('.bopt');
        if (opt) selectBuild(opt.getAttribute('data-mode'));
      });
      var x = document.getElementById('tools-build-x');
      if (x) x.addEventListener('click', function () { buildPanel(false); });
    }
  }


  function openSettingsAnywhere() {
    // 1) زر إعدادات حقيقي: BUTTON نصه يحوي settings/إعدادات/设置
    var btns = [].slice.call(document.querySelectorAll('button, [role="button"]')).filter(function (el) {
      if (el.offsetParent === null) return false;
      var txt = (el.textContent || '').trim().toLowerCase();
      var aria = (el.getAttribute('aria-label') || '').toLowerCase();
      var title = (el.getAttribute('title') || '').toLowerCase();
      return txt === 'settings' || aria.includes('settings') || title.includes('settings') ||
             txt.includes('إعدادات') || txt.includes('设置');
    });
    if (btns.length > 0) { btns[0].click(); return; }
    // 2) أي عنتر نصه settings داخل class settings
    var areas = [].slice.call(document.querySelectorAll('[class*="settings"]')).filter(function (el) {
      return el.offsetParent !== null && el.tagName === 'BUTTON';
    });
    if (areas.length > 0) { areas[0].click(); return; }
    // 3) لم يجد: رسالة إرشادية
    var note = document.getElementById('tools-settings-note');
    if (!note) {
      note = document.createElement('span');
      note.id = 'tools-settings-note';
      note.style.cssText = 'position:fixed;bottom:64px;left:18px;direction:rtl;padding:10px 14px;border-radius:12px;font-size:13px;background:rgb(35,35,36);color:rgb(207,211,214);border:1px solid rgba(255,255,255,.12);z-index:9992;max-width:320px';
      document.body.appendChild(note);
    }
    note.textContent = 'إعدادات التطبيق في الشريط الجانبي في اسفل القائمة';
    note.style.display = 'block';
    setTimeout(function () { note.style.display = 'none'; }, 3500);
  }

  function boot() {
    function bind(id, fn) {
      var el = document.getElementById(id);
      if (el && !el.dataset.b) { el.dataset.b = '1'; el.addEventListener('click', fn); }
    }
    bind('tools-hub', openOverlay);
    bind('tools-close', closeOverlay);
    bind('tools-tts', speakReader);
    bind('tools-assets', toggleAssets);
    bootBuildChip();
    bind('tools-settings-chip', openSettingsAnywhere);
    var assetsChip = document.getElementById('tools-assets');
    if (assetsChip && !assetsChip.dataset.restored) {
      assetsChip.dataset.restored = '1';
      var saved = null;
      try { saved = localStorage.getItem('dsh-assets-mode'); } catch (err) { /* لا تخزين */ }
      if (saved === 'on') assetsChip.classList.add('on');
    }
    bind('tools-rx', closeReader);
    bind('tools-rplay', speakReader);
    bind('tools-rpause', function () { if ('speechSynthesis' in window) speechSynthesis.pause(); });
    bind('tools-rstop', stopReader);
    var rates = document.getElementById('tools-rrate');
    if (rates && !rates.dataset.b) {
      rates.dataset.b = '1';
      rates.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-r]');
        if (!b) return;
        readerRate = parseFloat(b.dataset.r) || 1;
        rates.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        if (readerUtter) speakReader();
      });
    }
    var ov = document.getElementById('tools-overlay');
    if (ov && !ov.dataset.b) {
      ov.dataset.b = '1';
      ov.addEventListener('click', function (e) { if (e.target === ov) closeOverlay(); });
    }
    var rd = document.getElementById('tools-reader');
    if (rd && !rd.dataset.b) {
      rd.dataset.b = '1';
      rd.addEventListener('click', function (e) { if (e.target === rd) closeReader(); });
    }
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeOverlay(); closeReader(); buildPanel(false); }
  });
  new MutationObserver(boot).observe(document.documentElement, { childList: true, subtree: true });
  boot();

  // Live UI translator: localize stray English labels wherever they render.
  // Lazy by design: no polling interval, no work while streaming unless a
  // candidate string actually appears; scans are debounced and leaf-only
  // with a hard element cap so large DOMs never pay a CPU tax.
  var TOOLS_TR = {
    'Read Only': 'قراءة فقط', 'Read only': 'قراءة فقط', 'read only': 'قراءة فقط',
    'Compact older conversation history': 'ضغط السياق — يلخّص الرسائل القديمة لتتحرر مساحة الذاكرة وتستمر المحادثة لأطول',
    'Download this Session log as a ZIP archive': 'تنزيل سجل الجلسة — يحفظ كل ما جرى في هذه المحادثة كملف مضغوط ZIP',
    'record feedback about this session': 'تقييم الجلسة — سجّل رأيك في جودة الردود لتتحسن الإجابات',
    'set or view the goal for a long-running task': 'هدف طويل المدى — تحدد هدفاً فيعمل الوكيل جولات متتابعة تلقائياً حتى إنجازه أو إيقافه',
    'Switch the permission preset (sandbox mode + approval policy)': 'نمط الأذونات — يضبط عزل الأوامر (الصندوق الرملي) ومتى يطلب الوكيل موافقتك قبل التنفيذ',
    'Enter or leave plan mode': 'وضع التخطيط — يعدّ الوكيل خطة ويعرضها عليك للموافقة قبل تنفيذ أي تغيير',
    'اختر النموذج لهذه المحادثة': 'اختيار النموذج — بدّل الذكاء الاصطناعي الذي يرد في هذه المحادثة',
  };
  var trDirty = false;
  var trTimer = null;
  function trScan() {
    if (trTimer !== null) return;
    trTimer = setTimeout(function () {
      trTimer = null;
      if (!trDirty) return;
      trDirty = false;
      // Only localize when the dsh UI itself is Arabic (dir=rtl); never touch EN/ZH UIs.
      if (document.documentElement.dir !== 'rtl') return;
      var els = document.querySelectorAll('body *');
      var checked = 0;
      for (var i = 0; i < els.length && checked < 1500; i++) {
        var el = els[i];
        if (el.children.length !== 0 || el.dataset.trt === '1') continue;
        checked += 1;
        var t = (el.textContent || '').trim();
        if (t.length > 130) { el.dataset.trt = '1'; continue; }
        if (TOOLS_TR[t]) { el.dataset.trt = '1'; el.textContent = TOOLS_TR[t]; continue; }
        var title = el.getAttribute && el.getAttribute('title');
        if (title && TOOLS_TR[title]) { el.dataset.trt = '1'; el.setAttribute('title', TOOLS_TR[title]); }
      }
    }, 1200);
  }
  new MutationObserver(function () { trDirty = true; trScan(); }).observe(document.body, { childList: true, subtree: true });
  trDirty = true; trScan();
})();
</script>`

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.webServer.tapIndex((html: string) => {
    if (html.includes('id="tools-dock"')) return html
    return html.replace('</body>', `${INJECTED_SNIPPET}\n</body>`)
  }), 'tools-ui-inject: tapIndex')
}
