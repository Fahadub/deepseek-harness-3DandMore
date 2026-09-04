/**
 * Tools hub page — served at /tools.
 * Redesigned to be visually indistinguishable from the DeepSeek Harness Web
 * UI: same design tokens (--dsw-alias-* palette), same font stack, same
 * sidebar-driven RTL layout, same button/composer language, and the same
 * dark/light system-preference boot behavior.
 */
import type { ServerResponse } from 'node:http'

interface WorkspaceLike { id: string; path: string; title?: string }

export function renderHubPage(workspaces: WorkspaceLike[]): string {
  const wsJson = JSON.stringify(workspaces).replace(/</g, '\\u003c')
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>الأدوات — مساحة العمل</title>
<style>
/* ---- DeepSeek Harness design tokens (copied from the shipped theme) ---- */
:root {
  --ds-font-family-code: "SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, "PingFang SC", "Microsoft YaHei";
  --dsw-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --dsw-radius-s: 6px; --dsw-radius-m: 8px; --dsw-radius-l: 12px; --dsw-radius-xl: 16px;
}
html { color-scheme: dark; }
:root, [data-ds-dark-theme] {
  --dsw-alias-bg-base: rgb(21, 21, 23);
  --dsw-alias-bg-layer-1: rgb(35, 35, 36);
  --dsw-alias-bg-layer-2: rgb(44, 44, 46);
  --dsw-alias-bg-layer-3: rgb(53, 54, 56);
  --dsw-alias-bg-mask-1: rgba(0, 0, 0, .5);
  --dsw-alias-border-l1: rgba(255, 255, 255, .06);
  --dsw-alias-border-l2: rgba(255, 255, 255, .12);
  --dsw-alias-border-l3: rgba(255, 255, 255, .16);
  --dsw-alias-label-primary: rgb(249, 250, 251);
  --dsw-alias-label-secondary: rgb(207, 211, 214);
  --dsw-alias-label-tertiary: rgb(173, 178, 184);
  --dsw-alias-label-dimmed: rgb(97, 102, 107);
  --dsw-alias-interactive-bg-hover: rgba(255, 255, 255, .08);
  --dsw-alias-interactive-bg-active: rgba(255, 255, 255, .14);
  --dsw-alias-button-floating-fill: rgb(44, 44, 46);
  --dsw-alias-button-floating-hover: rgb(53, 54, 56);
  --dsw-alias-button-primary-fill: rgb(249, 250, 251);
  --dsw-alias-button-primary-hover: rgb(235, 238, 242);
  --dsw-alias-brand-primary: rgb(249, 250, 251);
  --dsw-static-deepseek-450: rgb(86, 134, 254);
  --dsw-static-deepseek-500: rgb(65, 118, 230);
  --dsw-alias-state-success-primary: rgb(78, 209, 126);
  --dsw-alias-state-warn-primary: rgb(247, 173, 49);
  --dsw-alias-state-error-primary: rgb(242, 90, 90);
  --dsw-alias-markdown-code-block: rgb(35, 35, 36);
}
html:not([data-ds-dark-theme]) { color-scheme: light; }
* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family); font-size: 14px; line-height: 22px;
  -webkit-font-smoothing: antialiased;
}
::selection { background: rgba(86, 134, 254, .35); }
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-thumb { background: var(--dsw-alias-border-l2); border-radius: 999px; }
::-webkit-scrollbar-thumb:hover { background: var(--dsw-alias-border-l3); }
::-webkit-scrollbar-track { background: transparent; }

/* ---- shell: sidebar + main, mirroring the dsh app frame ---- */
.app { display: flex; height: 100vh; overflow: hidden; }
.sb {
  flex: none; width: 248px; display: flex; flex-direction: column; gap: 12px;
  padding: 16px 12px; background: var(--dsw-alias-bg-base);
  border-inline-end: 1px solid var(--dsw-alias-border-l1); overflow-y: auto;
}
.sb-wordmark { display: flex; align-items: center; gap: 8px; padding: 2px 8px 6px; }
.sb-wordmark .logo { width: 22px; height: 22px; border-radius: var(--dsw-radius-m); background: linear-gradient(135deg, var(--dsw-static-deepseek-450), var(--dsw-static-deepseek-500)); display: grid; place-items: center; font-size: 12px; color: #fff; }
.sb-wordmark .name { font-size: 14px; font-weight: 600; letter-spacing: .02em; }
.sb-wordmark .sub { font-size: 11px; color: var(--dsw-alias-label-tertiary); margin-inline-start: auto; }
.sb-sec { font-size: 11px; color: var(--dsw-alias-label-dimmed); padding: 6px 8px 2px; }
.sb-nav { display: flex; flex-direction: column; gap: 2px; }
.sb-item {
  display: flex; align-items: center; gap: 10px; width: 100%; text-align: start;
  padding: 7px 10px; border: none; border-radius: var(--dsw-radius-m); cursor: pointer;
  background: transparent; color: var(--dsw-alias-label-secondary);
  font-family: inherit; font-size: 13px; line-height: 20px; transition: background .12s ease, color .12s ease;
}
.sb-item:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.sb-item.on { background: var(--dsw-alias-interactive-bg-active); color: var(--dsw-alias-label-primary); font-weight: 500; }
.sb-item .ic { flex: none; width: 18px; text-align: center; font-size: 14px; opacity: .9; }
.sb-foot { margin-top: auto; display: flex; flex-direction: column; gap: 2px; }

/* ---- main column ---- */
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; background: var(--dsw-alias-bg-base); }
.topbar {
  flex: none; display: flex; align-items: center; gap: 12px;
  padding: 12px 24px; border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.topbar h1 { margin: 0; font-size: 15px; font-weight: 600; }
.topbar .desc { font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.topbar .spacer { flex: 1; }
.content { flex: 1; overflow-y: auto; padding: 24px; }
.wrap { max-width: 980px; margin: 0 auto; }
section.tab { display: none; }
section.tab.on { display: block; }

/* ---- primitives ---- */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 6px 14px; border-radius: var(--dsw-radius-m); cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2); background: transparent;
  color: var(--dsw-alias-label-primary); font-family: inherit; font-size: 13px; line-height: 20px;
  transition: background .12s ease, border-color .12s ease;
}
.btn:hover { background: var(--dsw-alias-interactive-bg-hover); border-color: var(--dsw-alias-border-l3); }
.btn:disabled { opacity: .4; cursor: not-allowed; }
.btn.primary { background: var(--dsw-alias-button-primary-fill); border-color: transparent; color: rgb(15, 17, 21); font-weight: 500; }
.btn.primary:hover { background: var(--dsw-alias-button-primary-hover); }
.btn.danger { color: var(--dsw-alias-state-error-primary); border-color: rgba(242, 90, 90, .35); }
.btn.danger:hover { background: rgba(242, 90, 90, .12); }
.chip {
  display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px;
  border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-button-floating-fill); color: var(--dsw-alias-label-secondary);
  font-family: inherit; font-size: 12px; cursor: pointer; transition: all .12s ease;
}
.chip:hover { background: var(--dsw-alias-button-floating-hover); color: var(--dsw-alias-label-primary); }
.card {
  background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-l); padding: 18px 20px;
}
.card h3 { margin: 0 0 4px; font-size: 14px; font-weight: 600; }
.card .hint { font-size: 12px; color: var(--dsw-alias-label-tertiary); margin: 0 0 14px; }
.grid { display: grid; gap: 14px; }
.g-stats { grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); }
.g-2 { grid-template-columns: 320px 1fr; }
@media (max-width: 860px) { .g-2 { grid-template-columns: 1fr; } }
.stat .k { font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.stat .v { font-size: 20px; font-weight: 600; margin-top: 4px; }
label.f { display: block; font-size: 12px; color: var(--dsw-alias-label-tertiary); margin: 12px 0 5px; }
input[type=text], input[type=password], select, textarea {
  width: 100%; padding: 8px 12px; border-radius: var(--dsw-radius-m);
  border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary); font-family: inherit; font-size: 13px; line-height: 20px;
  outline: none; transition: border-color .12s ease;
}
input:focus, select:focus, textarea:focus { border-color: var(--dsw-static-deepseek-450); }
textarea { min-height: 110px; resize: vertical; }
.mono, pre.code, textarea.code { font-family: var(--ds-font-family-code); }
pre.code {
  background: var(--dsw-alias-markdown-code-block); border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-l); padding: 14px 16px; overflow: auto; max-height: 440px;
  white-space: pre-wrap; direction: ltr; text-align: left; font-size: 12.5px; line-height: 20px;
  color: var(--dsw-alias-label-secondary); margin: 0;
}
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 10px 0; }
.row.tight { margin: 4px 0; }
.note { color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.path { direction: ltr; text-align: left; font-family: var(--ds-font-family-code); font-size: 12px; color: var(--dsw-alias-label-tertiary); }

/* composer-style editor (mirrors the dsh message composer) */
.composer {
  border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-xl);
  background: var(--dsw-alias-bg-layer-2); padding: 14px; display: flex; flex-direction: column; gap: 10px;
}
.composer textarea {
  border: none; background: transparent; padding: 2px 4px; min-height: 340px;
  font-size: 12.5px; line-height: 20px;
}
.composer textarea:focus { border: none; }
.composer .bar { display: flex; gap: 8px; align-items: center; }
.composer .meta { font-size: 11px; color: var(--dsw-alias-label-dimmed); margin-inline-start: auto; direction: ltr; }

/* file tree */
.tree {
  border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-l);
  background: var(--dsw-alias-bg-layer-1); padding: 10px; max-height: 560px; overflow: auto;
  font-size: 13px;
}
.titem { padding: 3px 8px; border-radius: var(--dsw-radius-s); cursor: pointer; white-space: nowrap; color: var(--dsw-alias-label-secondary); }
.titem:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.titem.dir { color: var(--dsw-alias-label-primary); }
.titem.sel { background: var(--dsw-alias-interactive-bg-active); color: var(--dsw-alias-label-primary); }

/* kanban */
.kanban { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
@media (max-width: 860px) { .kanban { grid-template-columns: 1fr; } }
.kcol { border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-l); background: var(--dsw-alias-bg-layer-1); padding: 12px; min-height: 220px; transition: outline-color .1s ease; outline: 2px dashed transparent; }
.kcol.over { outline-color: var(--dsw-static-deepseek-450); }
.kcol h3 { margin: 2px 6px 10px; font-size: 12px; font-weight: 500; color: var(--dsw-alias-label-tertiary); }
.kcard { background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-m); padding: 9px 12px; margin: 6px 2px; cursor: grab; font-size: 13px; }
.kcard:hover { border-color: var(--dsw-alias-border-l2); }
.kcard .del { float: left; color: var(--dsw-alias-label-dimmed); cursor: pointer; padding: 0 4px; }
.kcard .del:hover { color: var(--dsw-alias-state-error-primary); }

/* tables */
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: start; padding: 10px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
th { color: var(--dsw-alias-label-tertiary); font-weight: 500; font-size: 12px; }
tr:hover td { background: var(--dsw-alias-interactive-bg-hover); }
.status { padding: 2px 10px; border-radius: 999px; font-size: 11px; font-family: var(--ds-font-family-code); direction: ltr; display: inline-block; }
.status.running { background: rgba(78, 209, 126, .12); color: var(--dsw-alias-state-success-primary); }
.status.completed { background: rgba(86, 134, 254, .12); color: var(--dsw-static-deepseek-450); }
.status.error, .status.stopped, .status.limit { background: rgba(242, 90, 90, .12); color: var(--dsw-alias-state-error-primary); }

/* preview iframe */
.frame { width: 100%; height: 560px; border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-l); background: #fff; display: block; }

/* modal + toast */
.modal-bg { position: fixed; inset: 0; background: var(--dsw-alias-bg-mask-1); backdrop-filter: blur(2px); display: none; align-items: center; justify-content: center; z-index: 20; }
.modal-bg.on { display: flex; }
.modal { background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-xl); width: min(860px, 92vw); max-height: 86vh; display: flex; flex-direction: column; box-shadow: 0 24px 64px rgba(0, 0, 0, .5); }
.modal .mhead { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.modal .mhead .t { font-size: 14px; font-weight: 600; flex: 1; }
.modal .mbody { padding: 16px 18px; overflow: auto; }
#toast {
  position: fixed; bottom: 20px; right: 20px; z-index: 30; display: none;
  background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary); border-radius: var(--dsw-radius-l);
  padding: 10px 16px; font-size: 13px; box-shadow: 0 8px 32px rgba(0, 0, 0, .4);
}
.note,.hint,td,th,.k,.path,select option{unicode-bidi:plaintext}
button,span,div,p{unicode-bidi:plaintext}
</style>
</head>
<body>
<div class="app">

<aside class="sb">
  <div class="sb-wordmark">
    <span class="logo"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 8h14M9 8v9m6-9v9M7 8l-2 9m14-9 2 9"/></svg></span>
    <span class="name">الأدوات</span>
    <span class="sub">v1.2.0</span>
  </div>

  <div class="sb-sec">مساحة العمل</div>
  <div style="padding: 0 4px"><select id="wsSel"></select></div>

  <div class="sb-sec">الأدوات</div>
  <nav class="sb-nav" id="tabs">
    <button class="sb-item on" data-t="overview"><span class="ic"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg></span>نظرة عامة</button>
    <button class="sb-item" data-t="files"><span class="ic"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5"/><path d="M9 13h6M9 16.5h6"/></svg></span>الملفات والمحرر</button>
    <button class="sb-item" data-t="preview"><span class="ic"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg></span>المعاينة الحية</button>
    <button class="sb-item" data-t="kanban"><span class="ic"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="16.5" y="4" width="4" height="13" rx="1.5"/></svg></span>لوحة كانبان</button>
    <button class="sb-item" data-t="tester"><span class="ic"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 8-6-16-3 8H2"/></svg></span>مختبر API</button>
    <button class="sb-item" data-t="search"><span class="ic"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"/><path d="m20.5 20.5-4.9-4.9"/></svg></span>البحث في الملفات</button>
    <button class="sb-item" data-t="versions"><span class="ic"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.3"/><path d="M3.5 3.5v4.8h4.8"/><path d="M12 7.5V12l3 3"/></svg></span>سجل الإصدارات</button>
    <button class="sb-item" data-t="agents"><span class="ic"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l1.7 4.8 4.8 1.7-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg></span>الوكلاء التلقائيون</button>
    <button class="sb-item" data-t="email"><span class="ic"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7.5l9 6 9-6"/></svg></span>إرسال بالبريد</button>
    <button class="sb-item" data-t="git"><span class="ic"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="8" r="2.4"/><path d="M6 8.4v7.2"/><path d="M18 10.4c0 4-4.5 4.8-9 4.8"/></svg></span>Git</button>
    <button class="sb-item" data-t="tripo"><span class="ic"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4z"/><path d="M12 21.2V12M12 12 4 7.4M12 12l8-4.6"/></svg></span>أصول 3D</button>
    <button class="sb-item" data-t="guardian" id="guardianBtn"><span class="ic"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.8 19.5 5.6v5.1c0 4.9-3.1 8.9-7.5 10.5-4.4-1.6-7.5-5.6-7.5-10.5V5.6z"/><path d="M12 8.2v5.4M9.4 11h5.2"/></svg></span>وكيل الصيانة</button>
    <button class="sb-item" data-t="research" id="researchBtn"><span class="ic"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.2"/><path d="M15.2 15.2 20.5 20.5"/><path d="M8 10.5a2.5 2.5 0 0 1 5 0c0 1.4-2.5 1.6-2.5 3"/><path d="M10.5 16.2v.2"/></svg></span>وكيل الباحث</button>
    <a class="sb-item" href="/tools/studio" target="_blank" title="استوديو تحرير بشري: جيزمو ثلاثي + أبعاد بالمتر يتحول فورًا لكود three.js — يعمل على نسخة تحرير معزولة"><span class="ic"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#e8d44d" stroke-width="1.8"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M9 16.5c.9 0 1.2-2 2.4-2s1.5 2 2.5 2 1.3-2 2.6-2"/></svg></span>استوديو JS</a>
    <a class="sb-item" href="/tools/godot" target="_blank" title="استوديو Godot: المحرر الرسمي 4.7.2 محمّل داخل الهارنس — افتحه على أي مشروع، والوكيل يبني ألعاب Godot كاملة بكتاب القدرات"><span class="ic"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#6fb3ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8c1.4-1 3.1-1.5 5-1.5S15.6 7 17 8"/><path d="M5 11.2c2-1.3 4.4-2 7-2s5 .7 7 2"/><path d="M3.2 14.5c2.6-1.5 5.6-2.3 8.8-2.3s6.2.8 8.8 2.3"/><path d="M9.5 5.2l.8 1.3M14.5 5.2l-.8 1.3"/><circle cx="10.2" cy="12.3" r=".6" fill="#6fb3ff" stroke="none"/><circle cx="13.8" cy="12.3" r=".6" fill="#6fb3ff" stroke="none"/></svg></span>استوديو Godot</a>
    <div id="researchHover" style="display:none;position:absolute;z-index:50;max-width:340px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:12px 14px;font-size:12.5px;line-height:1.9;box-shadow:0 8px 28px rgba(0,0,0,.35)">
      <div id="researchHoverText">وكيل باحث معزول تمامًا عن مشاريعك: يبحث في الويب (GitHub وnpm) عن حلول لهدف تكتبه، ينزّل المرشحين واحدًا تلو الآخر (حد 20 لكل انطلاقة)، يفحص كل مشروع فحصًا أمنيًا ساكنًا دون تشغيله، يقتطف الأجزاء المفيدة ثم يحذف التنزيل ويكتب علامة «تم الانتهاء منه» فلا يعيده أبدًا. المقتطفات تُختبر في نسخة تجريبية معزولة ولا تصبح أصلية إلا باعتمادك، وبعد كل اعتماد جديد يُطلب منك حذف الأصل السابق. معطّل افتراضيًا ولا يلمس مشروعك قبل تفعيلك.</div>
    </div>
    <div id="guardianHover" style="display:none;position:absolute;z-index:50;max-width:340px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:12px 14px;font-size:12.5px;line-height:1.9;box-shadow:0 8px 28px rgba(0,0,0,.35)">
      <div id="guardianHoverText">يراقب وكيل الصيانة بنية المشروع من الخارج: يكشف الأعطال المعروفة (فشل توليد المجسمات، الصور القاتلة في سجلات الجلسات، سقوط الخوادم) دون أي تدخل في الوكيل العامل أو برومته. عند اكتشاف مشكلة يظهر لك إشعار ملخص واضح: السبب الجذري + ماذا سيفعل — القبول أو الرفض بيدك، ولكل إصلاح مقبول زر تراجع. معطّل افتراضيًا وتحدد فترة إشرافه (10/15/20 دقيقة).</div>
    </div>
  </nav>

  <div class="sb-foot">
    <div class="sb-sec">اللغة</div>
    <div style="padding:0 4px"><select id="langSel" style="width:100%">
      <option value="ar">العربية</option>
      <option value="en">English</option>
      <option value="zh">中文</option>
    </select></div>
    <div class="sb-sec">إجراءات</div>
    <button class="sb-item" id="openProjBtn"><span class="ic"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2.5h8A1.5 1.5 0 0 1 20.5 9.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M12 10.5v5m0 0-2-2m2 2 2-2"/></svg></span>فتح مشروع جديد</button>
    <button class="sb-item" id="zipBtn"><span class="ic"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v11"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M4 20.5h16"/></svg></span>تحميل المشروع ZIP</button>
    <a class="sb-item" href="/" target="_blank" style="text-decoration:none"><span class="ic"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18.5 13.5V20h-13V6.5H12"/></svg></span>الواجهة الرئيسة</a>
  </div>
</aside>

<main class="main">
  <div class="topbar">
    <h1 id="pageTitle">نظرة عامة</h1>
    <span class="desc" id="pageDesc">صحة الخادم والإحصاءات</span>
    <span class="spacer"></span>
    <span class="path" id="wsPath"></span>
  </div>
  <div class="content"><div class="wrap">

  <section class="tab on" id="tab-overview">
    <div class="grid g-stats" id="healthCards"></div>
    <div class="card" style="margin-top:14px">
      <h3>متاح أيضاً للوكيل داخل الجلسات</h3>
      <p class="hint">أدوات وأوامر يفهمها الوكيل تلقائياً أثناء عمله</p>
      <div class="row">
        <span class="chip" title="ذاكرة دائمة لكل مساحة عمل — قرارات وملاحظات تبقى عبر الجلسات">memory</span><span class="chip" title="تحقق ثلاثي المراحل: استيرادات مفقودة ← البناء ← استجابة الخادم HTTP">verify_project</span><span class="chip" title="فحص تسريب الأسرار: مفاتيح API وكلمات مرور داخل الكود">security_scan</span>
        <span class="chip" title="تنظيف الملفات المؤقتة والتجريبية (فحص أو حذف)">cleanup_project</span><span class="chip" title="إحصاءات المشروع: عدد الملفات والأسطر وأكبر الملفات">project_stats</span><span class="chip" title="كشف الحزمة التقنية وأوامر التثبيت/البناء/التشغيل الصحيحة">stack_commands</span>
        <span class="chip" title="فريق من 9 وكلاء متخصصين يعملون بالتوازي على مهمة مفككة">parallel_team</span><span class="chip" title="وكيل ذاتي يعمل جولات متتالية حتى إنجاز الهدف بحدود زمنية">auto_agent</span>
      </div>
      <div class="row tight">
        <span class="chip" title="توليد README.md تلقائياً من بنية المشروع">/docs</span><span class="chip" title="مراجعة ذاتية لآخر التعديلات وإصلاح ما يُكتشف">/review</span><span class="chip" title="مخطط قاعدة البيانات ER بصيغة Mermaid">/er</span>
        <span class="chip" title="تشغيل التحقق الثلاثي وإصلاح كل فشل حتى النجاح">/verify</span><span class="chip" title="تفويض هدف لفريق الوكلاء المتوازي المتخصص">/team</span><span class="chip" title="عرض ذاكرة المشروع الدائمة">/memory</span>
      </div>
    </div>

  <div class="card" style="margin-top:14px" id="acCard">
    <div class="row" style="margin-top:0">
      <h3 style="margin:0" id="acTitle">استئناف تلقائي عند تجدد الحدود</h3>
      <label style="display:flex;align-items:center;gap:6px;margin:0;font-size:12px;color:var(--dsw-alias-label-tertiary)">
        <input type="checkbox" id="acEnabled" style="width:auto"> <span id="acOnLabel">مفعّل</span>
      </label>
    </div>
    <div class="row">
      <label class="f" style="margin:0" for="acRetries">عدد مرات الاستئناف</label>
      <input type="number" id="acRetries" min="1" max="100" value="1" style="width:72px"
        title="كم مرة يستأنف النموذج تلقائياً بعد تجدد حدوده — اكتب أي عدد من 1 إلى 100">
      <label class="f" style="margin:0" for="acMinutes">مدة التجدد (دقائق)</label>
      <input type="number" id="acMinutes" min="1" max="1440" value="60" style="width:82px"
        title="المدة الافتراضية حتى تجدد حدود النموذج — يستخدمها العداد إن لم يعرف النموذج مدته بدقة">
      <button class="btn" id="acSave">حفظ</button>
      <button class="btn danger" id="acCancel" style="display:none">إلغاء العداد</button>
    </div>
    <div class="row tight">
      <span class="note" id="acStatus"></span>
      <span class="note" id="acCountdown" style="font-family:var(--ds-font-family-code);direction:ltr"></span>
    </div>
    <p class="hint" style="margin:0" id="acHint">عندما يصطدم أي نموذج بحدود الاستخدام، يفهم الوكيل مدة التجدد ويسلّح هذا العداد — وبعد انتهائها تستأنف الجلسة تلقائياً حتى العدد المحدد أعلاه. يعمل على الخادم حتى مع إغلاق المتصفح.</p>
  </div>

  </section>

  <section class="tab" id="tab-files">
    <div class="row">
      <button class="btn" id="newFileBtn">ملف جديد</button>
      <button class="btn" id="newDirBtn">مجلد جديد</button>
      <button class="btn" id="renameBtn">إعادة تسمية</button>
      <button class="btn danger" id="deleteBtn">حذف</button>
      <span class="note" id="fileInfo"></span>
    </div>
    <div class="grid g-2">
      <div class="tree" id="tree"></div>
      <div class="composer">
        <textarea id="editor" class="code" spellcheck="false" placeholder="اختر ملفاً من الشجرة لعرضه وتحريره"></textarea>
        <div class="bar">
          <button class="btn primary" id="saveBtn" disabled>حفظ</button>
          <button class="btn" id="reloadBtn" disabled>إعادة تحميل</button>
          <button class="btn" id="dlFileBtn" disabled>تنزيل</button>
          <span class="meta" id="editPath"></span>
        </div>
      </div>
    </div>
  </section>

  <section class="tab" id="tab-guardian">
    <div class="card" style="margin-bottom:14px">
      <div class="row" style="margin-top:0">
        <h3 style="margin:0">وكيل الصيانة الذاتية</h3>
        <label style="display:flex;align-items:center;gap:6px;margin:0;font-size:12px;color:var(--dsw-alias-label-tertiary)">
          <input type="checkbox" id="gdEnabled" style="width:auto"> <span id="gdOnLabel">مفعّل</span>
        </label>
      </div>
      <div class="row">
        <label class="f" style="margin:0" for="gdInterval">فترة الإشراف</label>
        <select id="gdInterval" style="width:auto">
          <option>10</option><option selected>15</option><option>20</option>
        </select>
        <span id="gdUnit" style="font-size:12px;color:var(--dsw-alias-label-tertiary)">دقيقة</span>
        <button class="btn" id="gdSave">حفظ الإعدادات</button>
        <button class="btn" id="gdScan">فحص فوري الآن</button>
        <span class="note" id="gdStatus"></span>
      </div>
      <p class="hint" style="margin:0">يعمل خارج جلسات الوكلاء تمامًا: لا يعدل برومتًا ولا يوقف وكيلًا ولا ينفق كردت. يكتشف الأعطال المعروفة ثم يعرض عليك اقتراحًا — لا ينفذ شيئًا إلا بقبولك، ولكل تنفيذ تراجع.</p>
      <div class="row" style="margin-top:10px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:10px">
        <h3 style="margin:0">عقل الوصي — نموذج التشخيص الذكي</h3>
        <span class="note" id="gdmStatus"></span>
      </div>
      <div class="row">
        <label class="f" style="margin:0" for="gdmSel">النموذج المفعّل</label>
        <select id="gdmSel" style="width:auto;min-width:170px"></select>
        <button class="btn" id="gdmTestBtn" title="يتصل بالنموذج ويتأكد أنه يعمل — النتيجة تظهر في التنبيه">اختبار الاتصال</button>
        <button class="btn" id="gdmDelBtn">حذف المحدد</button>
      </div>
      <div class="row">
        <input type="text" id="gdmName" placeholder="الاسم المعروض: GLM-5.3" style="width:130px">
        <input type="text" id="gdmProvider" placeholder="المزوّد: Zhipu" style="width:110px">
        <input type="text" id="gdmModel" placeholder="معرّف النموذج: glm-5.3" style="width:130px;direction:ltr">
      </div>
      <div class="row">
        <input type="text" id="gdmUrl" placeholder="Base URL: https://api.example.com/v1" style="direction:ltr;min-width:250px">
        <input type="password" id="gdmKey" placeholder="مفتاح API — يُحفظ مشفراً ولا يُعرض بعد الحفظ" autocomplete="off" style="direction:ltr;min-width:200px">
        <button class="btn" id="gdmAddBtn" title="يحفظ النموذج ويختبر اتصاله فوراً ويظهر اسمه فقط في القائمة">إضافة وتفعيل</button>
      </div>
      <p class="hint" style="margin:0">حكمة: لا تستخدم نموذجاً ضعيف الأداء — الوصي يعالج بيئة حساسة · Do not use a weak model: the guardian handles a sensitive environment · 请勿使用低性能模型——守护者处理敏感环境. بعد الحفظ يظهر الاسم فقط والمفتاح يبقى عندك محفوظاً تلقائياً. التشخيص الذكي: عند اكتشاف خطأ أحمر يُرسل سياقه للنموذج المفعّل فيعيد سبباً جذرياً وتوجيهاً تصحيحياً — ويظهر اسم النموذج ومزوّده داخل كل تنبيه مع نتيجة الاتصال.</p>
    </div>
    <div id="gdProposals"></div>
    <div class="card" id="gdLogCard" style="display:none">
      <h3>سجل الوكيل</h3>
      <div id="gdLog" style="font-size:12px;font-family:var(--ds-font-family-code);max-height:200px;overflow:auto;direction:ltr"></div>
    </div>
  </section>

  <section class="tab" id="tab-research">
    <div class="card" style="margin-bottom:14px;border-color:var(--dsw-alias-border-l2)">
      <div class="row" style="margin-top:0">
        <h3 style="margin:0">وكيل الباحث — معزول عن هارنس</h3>
        <span class="note" id="rsStatus">معطّل</span>
      </div>
      <div class="row">
        <input type="text" id="rsGoal" placeholder="اكتب هدف البحث: مثال — مكتبة توليد أصوات إجرائية لـ three.js"
          style="min-width:300px" title="ماذا يبحث الوكيل؟ كلمات مفتاحية واضحة تعطي أفضل النتائج">
        <button class="btn primary" id="rsStart" title="ينطلق فورًا: بحث ← تنزيلات تسلسلية (حد 20) ← فحص أمان ← اقتطاف ← حذف + علامة «تم الانتهاء»">تفعيل وانطلاق</button>
        <button class="btn danger" id="rsStop" style="display:none">إيقاف</button>
        <button class="btn" id="rsTrial" title="يفحص المقتطفات في نسخة تجريبية معزولة (تركيب الكود + تقرير) دون لمس أي مشروع">اختبار النسخة التجريبية</button>
        <button class="btn" id="rsApprove" style="display:none">اعتماد كنسخة أصلية</button>
      </div>
      <div class="row tight">
        <span class="note" id="rsProgress"></span>
      </div>
      <p class="hint" style="margin:0">لا يُشغَّل أي كود من المشاريع المنزّلة — فحص أمني ساكن فقط. كل تنزيل يُحذف بعد اقتطاف الفوائد وتُكتب له علامة MD دائمة. النسخ التجريبية تُعتمد بك وبعد كل اعتماد يُطلب منك حذف الأصل السابق — الجذر لا يُمس أبدًا.</p>
    </div>
    <div class="card" id="rsDownloadsCard" style="display:none;margin-bottom:14px">
      <h3>سجل التنزيلات هذه الجولة <span class="note" id="rsCounts"></span></h3>
      <table id="rsTable"><thead><tr><th>المصدر</th><th>النتيجة</th><th>ملاحظات</th></tr></thead><tbody></tbody></table>
    </div>
    <div class="card" id="rsVersionsCard" style="display:none;margin-bottom:14px">
      <h3>النسخ المعتمدة ودورة الاعتماد</h3>
      <div id="rsVersions" style="font-size:13px"></div>
      <div id="rsApprovals" style="margin-top:8px"></div>
    </div>
    <div class="card" id="rsLogCard" style="display:none">
      <h3>سجل الباحث</h3>
      <div id="rsLog" style="font-size:12px;font-family:var(--ds-font-family-code);max-height:200px;overflow:auto;direction:ltr"></div>
    </div>
  </section>

  <section class="tab" id="tab-preview">
    <div class="row">
      <input type="text" id="previewPath" placeholder="index.html" style="direction:ltr;flex:1;min-width:220px">
      <button class="btn primary" id="previewBtn">تحديث المعاينة</button>
      <button class="btn" id="shotBtn" title="التقاط لقطة للصفحة المعروضة وتحليلها بصرياً">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.4-2h5.2L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.2"/></svg>
        التقاط لقطة
      </button>
    </div>
    <iframe id="previewFrame" class="frame"></iframe>
    <div class="card" id="shotCard" style="margin-top:14px;display:none">
      <h3>آخر لقطة</h3>
      <p class="hint" id="shotMeta"></p>
      <img id="shotImg" style="max-width:100%;border-radius:8px;border:1px solid var(--dsw-alias-border-l1)">
    </div>
  </section>

  <section class="tab" id="tab-kanban">
    <div class="card" style="margin-bottom:14px">
      <div class="row" style="margin-top:0">
        <h3 style="margin:0">مهام الوكيل</h3>
        <span class="note" id="atMeta"></span>
        <span class="spacer" style="flex:1"></span>
        <button class="btn" id="atRefresh">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.3"/><path d="M3.5 3.5v4.8h4.8"/></svg>
          مزامنة
        </button>
      </div>
      <div class="row tight" id="atBoard"></div>
    </div>
    <div class="row">
      <input type="text" id="kNew" placeholder="مهمة جديدة…" style="flex:1;min-width:200px">
      <select id="kCol" style="width:auto"><option value="todo">قادم</option><option value="doing">جاري</option><option value="done">منجز</option></select>
      <button class="btn primary" id="kAdd">إضافة</button>
    </div>
    <div class="kanban">
      <div class="kcol" data-col="todo"><h3>قادم</h3><div class="kdrop"></div></div>
      <div class="kcol" data-col="doing"><h3>جاري</h3><div class="kdrop"></div></div>
      <div class="kcol" data-col="done"><h3>منجز</h3><div class="kdrop"></div></div>
    </div>
  </section>

  <section class="tab" id="tab-search">
    <div class="row">
      <input type="text" id="sq" placeholder="ابحث في محتوى ملفات مساحة العمل…" style="flex:1;min-width:240px">
      <button class="btn primary" id="sGo">بحث</button>
    </div>
    <div class="row tight"><span class="note" id="sMeta"></span></div>
    <div class="card" style="padding:6px 12px">
      <table id="sTable"><thead><tr><th>الملف</th><th>السطر</th><th>المقتطف</th></tr></thead><tbody></tbody></table>
    </div>
  </section>

  <section class="tab" id="tab-tester">
    <div class="card">
      <div class="row" style="margin-top:0">
        <select id="tMethod" style="width:auto"><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select>
        <input type="text" id="tUrl" placeholder="http://localhost:3000/api/…" style="direction:ltr;flex:1;min-width:260px">
        <button class="btn primary" id="tSend">إرسال</button>
      </div>
      <label class="f">الترويسات (JSON)</label>
      <textarea id="tHeaders" class="code mono" style="min-height:64px">{ "Content-Type": "application/json" }</textarea>
      <label class="f">الجسم (للـ POST/PUT/PATCH)</label>
      <textarea id="tBody" class="code mono" style="min-height:84px"></textarea>
      <div class="row"><span class="note mono" id="tMeta"></span></div>
      <pre class="code" id="tOut"></pre>
    </div>
  </section>

  <section class="tab" id="tab-versions">
    <div class="row">
      <input type="text" id="vFilter" placeholder="تصفية بالمسار (اختياري)" style="direction:ltr;flex:1;min-width:200px">
      <button class="btn primary" id="vRefresh">تحديث</button>
    </div>
    <div class="card" style="padding:6px 12px">
      <table id="vTable"><thead><tr><th>الملف</th><th>الوقت</th><th>السبب</th><th>الحجم</th><th></th></tr></thead><tbody></tbody></table>
    </div>
  </section>

  <section class="tab" id="tab-agents">
    <div class="row">
      <button class="btn primary" id="aRefresh">تحديث</button>
      <span class="note">الوكلاء التلقائيون يعملون على الخادم ويستمرون حتى مع إغلاق المتصفح — يُطلَقون من جلسة عبر أداة auto_agent</span>
    </div>
    <div class="card" style="padding:6px 12px">
      <table id="aTable"><thead><tr><th>المعرف</th><th>الهدف</th><th>الحالة</th><th>الجولات</th><th></th><th></th></tr></thead><tbody></tbody></table>
    </div>
  </section>

  <section class="tab" id="tab-email">
    <div class="grid g-2">
      <div class="card">
        <h3>إعدادات SMTP</h3>
        <p class="hint">تُحفظ محلياً في مساحة العمل</p>
        <label class="f">الخادم</label><input type="text" id="mHost" placeholder="smtp.gmail.com" style="direction:ltr">
        <label class="f">المنفذ</label><input type="text" id="mPort" value="465" style="direction:ltr">
        <label class="f" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="mSecure" checked style="width:auto"> SSL مباشر (465) — أزلها لـ STARTTLS (587)</label>
        <label class="f">المستخدم</label><input type="text" id="mUser" style="direction:ltr">
        <label class="f">كلمة المرور / App Password</label><input type="password" id="mPass" style="direction:ltr">
        <label class="f">اسم المرسل</label><input type="text" id="mFromName" value="الأدوات">
        <label class="f">بريد المرسل</label><input type="text" id="mFromAddr" style="direction:ltr">
        <div class="row"><button class="btn primary" id="mSave">حفظ الإعدادات</button></div>
      </div>
      <div class="card">
        <h3>إرسال المشروع</h3>
        <p class="hint">يُضغط المشروع (بدون node_modules) ويُرسل مرفقاً</p>
        <label class="f">بريد المستلم</label><input type="text" id="mTo" placeholder="someone@example.com" style="direction:ltr">
        <div class="row"><button class="btn primary" id="mSend">إرسال ZIP المشروع</button></div>
        <pre class="code" id="mOut" style="min-height:80px"></pre>
      </div>
    </div>
  </section>

  <section class="tab" id="tab-tripo">
    <div class="card" style="margin-bottom:14px" id="imggenCard">
      <div class="row" style="margin-top:0">
        <h3 style="margin:0">توليد الصور المرجعية</h3>
        <span class="note" id="igStatus"></span>
      </div>
      <div class="row">
        <label class="f" style="margin:0" for="igUrl">المزود (Base URL)</label>
        <input type="text" id="igUrl" placeholder="https://api.openai.com/v1" style="direction:ltr;min-width:220px" title="أي مزود متوافق مع OpenAI Images — اكتب رابط الأساس فقط">
        <label class="f" style="margin:0" for="igModel">النموذج</label>
        <input type="text" id="igModel" placeholder="gpt-image-1" style="direction:ltr;width:130px">
      </div>
      <div class="row">
        <input type="password" id="igKey" placeholder="مفتاح المزود sk-…" autocomplete="off" style="direction:ltr;min-width:240px;font-family:var(--ds-font-family-code)">
        <button class="btn" id="igSave">حفظ الإعدادات</button>
        <button class="btn" id="igTest">اختبار المفتاح</button>
        <span class="note" id="igResult" style="direction:rtl"></span>
      </div>
      <p class="hint" style="margin:0">قبل توليد أي مجسم سيسألك الوكيل: أرفق صورك أم نولّد صورًا مرجعية بهذا المزود؟ الصور تظهر هنا في «الصور المولّدة» لتوافق عليها أو ترفضها — والوكيل لن يولّد المجسم قبل قرارك. بلا مفتاح؟ سيذكّرك نصًا أنه غير متوفر ويمضي بخياري الإرفاق أو التوليد المباشر.</p>
    </div>
    <div class="card" style="margin-bottom:14px" id="assetsCard">
      <div class="row" style="margin-top:0">
        <h3 style="margin:0">مجلدات الأصول الجاهزة</h3>
        <span class="note" id="assetsMeta"></span>
      </div>
      <div class="row">
        <input type="text" id="assetsPathInput" placeholder="C:\\Users\\me\\Desktop\\my-models" style="direction:ltr;min-width:300px" title="أي مجلد على الجهاز — يُفحص تلقائياً عن مجسمات GLB/FBX/OBJ وصور PNG/JPG">
        <button class="btn" id="assetsAddBtn">إضافة مجلد</button>
      </div>
      <div id="assetsList" style="margin-top:8px"></div>
      <p class="hint" style="margin:0">الوكيل يبحث هنا أولاً ويستخدم الجاهز — ولا يولّد عبر Tripo إلا بطلبك الصريح. الحزمة المدمجة المجانية تعمل فوراً، وأي مجلد تضيفه يبقى محفوظاً على جهازك.</p>
    </div>
    <div class="card" style="margin-bottom:14px" id="enginesCard">
      <div class="row" style="margin-top:0">
        <h3 style="margin:0">محركات المعالجة — Blender وGodot</h3>
        <span class="note" id="enginesJob"></span>
      </div>
      <div class="row">
        <span class="f" style="margin:0;min-width:70px">Blender</span>
        <span class="note" id="blenderState">جارٍ الفحص…</span>
        <button class="btn" id="blenderDl" title="ينزّل Blender 4.5 LTS الرسمي (نسخة محمولة ~350MB) إلى tools-suite/blender — لمرة واحدة">تنزيل الآن</button>
      </div>
      <div class="row">
        <span class="f" style="margin:0;min-width:70px">Godot</span>
        <span class="note" id="godotState">جارٍ الفحص…</span>
        <button class="btn" id="godotDl" title="ينزّل Godot 4.7.2 الرسمي (~180MB) إلى tools-suite/godot — لمرة واحدة">تنزيل الآن</button>
      </div>
      <p class="hint" style="margin:0">محركان اختياريان يعملان رأسياً بدون أي إضافات: Blender يعالج المجسمات (اتجاهات، مقاسات، تصادم) بأداة asset_pipeline، وGodot يستورد الناتج ويشغّل اللعبة. التنزيل يحدث مرة واحدة فقط ويبقى بعد التحديثات.</p>
    </div>
    <div class="card" style="margin-bottom:14px" id="tripoKeyCard">
      <div class="row" style="margin-top:0">
        <h3 style="margin:0">مفتاح Tripo API</h3>
        <span class="note" id="tripoKeyStatus"></span>
      </div>
      <div class="row">
        <input type="password" id="tripoKeyInput" placeholder="tsk_…" autocomplete="off" spellcheck="false"
          style="direction:ltr;min-width:280px;font-family:var(--ds-font-family-code)"
          title="مفتاح Tripo من لوحة التحكم — يبدأ عادة بـ tsk_">
        <button class="btn" id="tripoKeySave" title="يخزّن المفتاح على هذا الجهاز ويفعّله فوراً في كل أدوات التوليد">حفظ المفتاح</button>
        <button class="btn" id="tripoKeyTest" title="يتصل بخدمة Tripo ويتأكد أن المفتاح مقبول — بدون استهلاك كردت">اختبار المفتاح</button>
        <button class="btn" id="tripoKeyShow">إظهار</button>
      </div>
      <div class="row tight">
        <span class="note" id="tripoKeyResult" style="direction:ltr"></span>
      </div>
      <p class="hint" style="margin:0">احفظ مفتاحك هنا مرة واحدة: يُفعَّل فوراً في كل أدوات توليد المجسمات ويبقى بعد إعادة تشغيل الخادم. لا يُعرض كاملاً أبداً — مموّهاً فقط.</p>
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="row" style="margin-top:0">
        <h3 style="margin:0">خطة الأصول ثلاثية الأبعاد</h3>
        <span class="note" id="tripoMeta"></span>
      </div>
      <div class="row">
        <label class="f" style="margin:0">سقف الأصول</label>
        <select id="tripoCount" style="width:auto">
          <option>10</option><option>20</option><option>30</option><option>50</option><option>100</option><option>200</option>
        </select>
        <button class="btn" id="tripoPlanBtn">إنشاء خطة اختبار</button>
        <button class="btn" id="tripoRefresh">تحديث</button>
      <label class="f" style="margin:0" for="capHard">سقف إجباري من المستخدم</label>
      <input type="number" id="capHard" min="1" max="200" placeholder="بلا سقف" style="width:82px"
        title="الحد الأقصى للمجسمات الذي يُمنع الذكاء الاصطناعي من تجاوزه نهائياً — اتركه فارغاً لتعطيله. عند الحاجة لمزيد يبني الأساسيات فقط ويخبرك كم متبقياً لإكمال المشروع">
      <button class="btn" id="capSave">تثبيت السقف</button>
      </div>
      <p class="hint" style="margin:0">الخطة الحقيقية يبنيها الوكيل من وصف لعبتك، ثم يولّد كل أصل بأداة tripo_generate ويراقبه بصرياً قبل الاعتماد.</p>
    </div>
    <div id="tripoPlanWrap" style="display:none">
      <div class="card" style="margin-bottom:14px">
        <h3>دليل الأسلوب الموحد</h3>
        <p class="hint" id="tripoBible" style="white-space:pre-wrap"></p>
      </div>
      <div class="card" style="padding:6px 12px;margin-bottom:14px">
        <table id="tripoTable"><thead><tr><th>الأصل</th><th>الحالة</th><th>الملف</th><th></th></tr></thead><tbody></tbody></table>
      </div>
    </div>
    <div class="card">
      <h3>العارض ثلاثي الأبعاد</h3>
      <p class="hint">اسحب للتدوير، وعجلة الفأرة للتقريب — يعرض أي نموذج GLB في مجلد assets/3d</p>
      <div class="row"><select id="glbSel" style="width:auto;min-width:220px"></select><button class="btn" id="glbLoadBtn">عرض</button></div>
      <canvas id="glbCanvas" style="width:100%;height:420px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:#0d0e12;display:block"></canvas>
    </div>
    <div class="card" style="margin-top:14px" id="genImagesCard">
      <h3>الصور المولدة</h3>
      <p class="hint">كل صورة ولّدها الوكيل أو لقطات التحقق — انقر للعرض الكامل (تُقدَّم بنفس طريقة العارض)</p>
      <div class="row tight" id="genImages" style="display:flex;flex-wrap:wrap;gap:8px"></div>
    </div>
    <div class="card" style="margin-top:14px" id="guideCard">
      <div class="row" style="margin-top:0">
        <h3 style="margin:0"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="margin-inline-end:8px;vertical-align:-3px"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>كتيب تعليمات 3D</h3>
        <button class="btn primary" id="guideOpen">فتح الكتيب</button>
      </div>
      <p class="hint" style="margin:0">برومتات تخيلية لعملاء افتراضيين — تعلّم كتابة برومبت لعبة ناجح قبل أن تطلب من الوكيل</p>
    </div>
  </section>

  <section class="tab" id="tab-git">
    <div class="row">
      <button class="btn" id="gStatus">الحالة</button>
      <button class="btn" id="gDiff">الفرق</button>
      <input type="text" id="gMsg" placeholder="رسالة الالتزام" style="flex:1;min-width:200px">
      <button class="btn primary" id="gCommit">Commit</button>
    </div>
    <pre class="code" id="gOut"></pre>
  </section>

  </div></div>
</main>
</div>

<div class="modal-bg" id="modalBg"><div class="modal">
  <div class="mhead"><span class="t" id="modalTitle"></span><button class="btn" id="modalClose">إغلاق</button></div>
  <div class="mbody" id="modalBody"></div>
</div></div>
<div id="toast"></div>

<script type="importmap">
{ "imports": { "three": "/tools/assets/three/three.module.js" } }
</script>
<script>
(function () {
  function applyTheme() {
    var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.toggleAttribute('data-ds-dark-theme', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  }
  applyTheme();
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
})();
</script>

<script>
var WS = ${wsJson};
var ws = localStorage.getItem('toolsWs') || (WS.length ? WS[0].path : '');

/* ---- i18n engine (ar / en / zh) ---- */
var DICT = {
  en: {
    'محركات المعالجة — Blender وGodot': 'Processing engines — Blender & Godot', 'تنزيل الآن': 'Download now',
    'جارٍ الفحص…': 'checking…', 'مثبت': 'installed', 'غير مثبت': 'not installed',
    'مجلدات الأصول الجاهزة': 'Ready-made asset folders', 'إضافة مجلد': 'Add folder', 'إزالة': 'Remove',
    'مساحة العمل': 'Workspace', 'الأدوات': 'Tools', 'إجراءات': 'Actions', 'اللغة': 'Language',
    'نظرة عامة': 'Overview', 'الملفات والمحرر': 'Files & Editor', 'المعاينة الحية': 'Live Preview',
    'لوحة كانبان': 'Kanban Board', 'مختبر API': 'API Tester', 'البحث في الملفات': 'Search Files',
    'سجل الإصدارات': 'Version History', 'الوكلاء التلقائيون': 'Auto Agents', 'إرسال بالبريد': 'Send by Email',
    'الواجهة الرئيسة': 'Main UI', 'فتح مشروع جديد': 'Open New Project', 'تحميل المشروع ZIP': 'Download Project ZIP',
    'صحة الخادم والإحصاءات': 'Server health & stats',
    'استعرض، حرّر، وأنشئ ملفات مساحة العمل': 'Browse, edit, and create workspace files',
    'معاينة ملفات HTML مع التقاط لقطة وتحليلها': 'Preview HTML files with capture & analysis',
    'مهامك اليدوية ومهام الوكيل المتزامنة': 'Your manual tasks and synced agent tasks',
    'أرسل طلبات HTTP وافحص الاستجابات': 'Send HTTP requests and inspect responses',
    'ابحث في محتوى كل ملفات مساحة العمل': 'Search the content of every workspace file',
    'لقطة تلقائية قبل أول كتابة — استرجع الأصل دوماً': 'Auto snapshot before the first write — restore the original anytime',
    'راقب وأوقف وكلاء auto_agent': 'Monitor and stop auto_agent runs',
    'أرسل المشروع مضغوطاً عبر SMTP': 'Email the project as a ZIP via SMTP',
    'الحالة والفرق والالتزامات': 'Status, diffs, and commits',
    'متاح أيضاً للوكيل داخل الجلسات': 'Also available to the agent inside sessions',
    'أدوات وأوامر يفهمها الوكيل تلقائياً أثناء عمله': 'Tools and commands the agent understands natively',
    'مهام الوكيل': 'Agent Tasks', 'مزامنة': 'Sync', 'قادم': 'To Do', 'جاري': 'In Progress', 'منجز': 'Done',
    'مهمة جديدة…': 'New task…', 'إضافة': 'Add', 'ملف جديد': 'New File', 'مجلد جديد': 'New Folder',
    'إعادة تسمية': 'Rename', 'حذف': 'Delete', 'حفظ': 'Save', 'إعادة تحميل': 'Reload', 'تنزيل': 'Download',
    'تحديث المعاينة': 'Refresh Preview', 'التقاط لقطة': 'Take Screenshot', 'آخر لقطة': 'Last Screenshot',
    'الترويسات (JSON)': 'Headers (JSON)', 'الجسم (للـ POST/PUT/PATCH)': 'Body (for POST/PUT/PATCH)', 'إرسال': 'Send',
    'بحث': 'Search', 'الملف': 'File', 'السطر': 'Line', 'المقتطف': 'Snippet', 'الوقت': 'Time', 'السبب': 'Cause',
    'الحجم': 'Size', 'عرض': 'View', 'استرجاع': 'Restore', 'تحديث': 'Refresh', 'المعرف': 'ID', 'الهدف': 'Objective',
    'الحالة': 'Status', 'الجولات': 'Rounds', 'السجل': 'Log', 'إيقاف': 'Stop',
    'إعدادات SMTP': 'SMTP Settings', 'الخادم': 'Host', 'المنفذ': 'Port', 'المستخدم': 'Username',
    'كلمة المرور / App Password': 'Password / App Password', 'اسم المرسل': 'Sender Name', 'بريد المرسل': 'Sender Email',
    'حفظ الإعدادات': 'Save Settings', 'إرسال المشروع': 'Send Project', 'بريد المستلم': 'Recipient Email',
    'إرسال ZIP المشروع': 'Send Project ZIP', 'الفرق': 'Diff', 'رسالة الالتزام': 'Commit message', 'إغلاق': 'Close',
    'وقت التشغيل': 'Uptime', 'الذاكرة (RSS)': 'Memory (RSS)', 'الكومة': 'Heap', 'ذاكرة النظام الحرة': 'Free System Memory',
    'الأنوية': 'Cores', 'مساحات العمل': 'Workspaces', 'وكلاء يعملون': 'Agents Running',
    'اختر ملفاً من الشجرة لعرضه وتحريره': 'Select a file in the tree to view and edit it',
    'ابحث في محتوى ملفات مساحة العمل…': 'Search workspace file contents…', 'تصفية بالمسار (اختياري)': 'Filter by path (optional)',
    'مهمة جديدة': 'New task', 'الحالة': 'Status', 'الرسالة': 'Message',
    'تم الحفظ (أُخذت لقطة للإصدار السابق)': 'Saved (previous version snapshotted)', 'تم الحفظ': 'Saved',
    'فشل الحفظ': 'Save failed', 'تم فتح المشروع': 'Project opened', 'اختر مساحة عمل': 'Choose a workspace',
    'اختر ملفاً أولاً': 'Select a file first', 'لا نتائج': 'No results', 'فشل البحث': 'Search failed',
    'لا وكلاء — اطلب من الوكيل في الجلسة تشغيل auto_agent': 'No agents — ask the agent in a session to run auto_agent',
    'أصول 3D': '3D Assets',
    'كتيب تعليمات 3D': '3D Prompt Guide',
    'فتح الكتيب': 'Open the guide',
    'برومتات تخيلية لعملاء افتراضيين — تعلّم كتابة برومبت لعبة ناجح قبل أن تطلب من الوكيل': 'Imaginary client prompts — learn to write a winning game brief before asking the agent',
    'سقف إجباري من المستخدم': 'User-enforced hard cap',
    'تثبيت السقف': 'Set cap',
    'فشل تثبيت السقف': 'Failed to set the cap',
    'ثُبّت السقف الإجباري': 'Hard cap set',
    'بلا سقف': 'no cap',
    'الحد الأقصى للمجسمات الذي يُمنع الذكاء الاصطناعي من تجاوزه نهائياً — اتركه فارغاً لتعطيله. عند الحاجة لمزيد يبني الأساسيات فقط ويخبرك كم متبقياً لإكمال المشروع': 'Maximum models the AI is strictly forbidden to exceed — leave empty to disable. When more are needed it builds only the essentials and tells you how many remain to complete the project',
    'استئناف تلقائي عند تجدد الحدود': 'Auto-continue when limits reset',
    'مفعّل': 'Enabled',
    'عدد مرات الاستئناف': 'Auto-resume count',
    'مدة التجدد (دقائق)': 'Reset window (minutes)',
    'حفظ': 'Save',
    'إلغاء العداد': 'Cancel timer',
    'الصور المولدة': 'Generated Images',
    'كم مرة يستأنف النموذج تلقائياً بعد تجدد حدوده — اكتب أي عدد من 1 إلى 100': 'How many times the model auto-resumes after its limits reset — any number 1..100',
    'المدة الافتراضية حتى تجدد حدود النموذج — يستخدمها العداد إن لم يعرف النموذج مدته بدقة': 'Default window until the model limits reset — used when the model does not know its exact window',
    'عندما يصطدم أي نموذج بحدود الاستخدام، يفهم الوكيل مدة التجدد ويسلّح هذا العداد — وبعد انتهائها تستأنف الجلسة تلقائياً حتى العدد المحدد أعلاه. يعمل على الخادم حتى مع إغلاق المتصفح.': 'When any model hits its usage limit, the agent reads the reset window and arms this timer — the session then auto-resumes up to the count above. Server-side, survives a closed browser.',
    'كل صورة ولّدها الوكيل أو لقطات التحقق — انقر للعرض الكامل (تُقدَّم بنفس طريقة العارض)': 'Every agent-generated image and verification shot — click to view full size', 'الخطة الحقيقية يبنيها الوكيل من وصف لعبتك، ثم يولّد كل أصل بأداة tripo_generate ويراقبه بصرياً قبل الاعتماد.': 'The real plan is built by the agent from your game description, which then generates each asset with tripo_generate and reviews it visually.', 'اسحب للتدوير، وعجلة الفأرة للتقريب — يعرض أي نموذج GLB في مجلد assets/3d': 'Drag to rotate, mouse wheel to zoom — renders any GLB model under assets/3d', 'خطة الأصول ثلاثية الأبعاد': '3D Asset Plan', 'سقف الأصول': 'Asset Budget', 'إنشاء خطة اختبار': 'Create Test Plan', 'دليل الأسلوب الموحد': 'Unified Style Bible', 'العارض ثلاثي الأبعاد': '3D Viewer', 'عرض': 'View', 'توليد': 'Generate', 'الأصل': 'Asset', '…جارٍ البحث': 'Searching…', 'نتيجة في': 'results in', 'ملف': 'files', 'مقتطع': 'truncated', 'مفتاح Tripo API': 'Tripo API Key', 'توليد الصور المرجعية': 'Reference Image Generation', 'المزود (Base URL)': 'Provider (Base URL)', 'النموذج': 'Model', 'استوديو JS': 'JS Studio', 'استوديو Godot': 'Godot Studio', 'وكيل الصيانة': 'Maintenance Agent', 'وكيل الباحث': 'Research Agent', 'وكيل الباحث — معزول عن هارنس': 'Research Agent — isolated from the harness', 'تفعيل وانطلاق': 'Activate & launch', 'إيقاف': 'Stop', 'اختبار النسخة التجريبية': 'Test the trial copy', 'اعتماد كنسخة أصلية': 'Approve as official version', 'سجل التنزيلات هذه الجولة': 'Downloads this run', 'النسخ المعتمدة ودورة الاعتماد': 'Approved versions & promotion cycle', 'سجل الباحث': 'Research agent log', 'اقتُطف': 'Harvested', 'مرفوض أمنيًا': 'Rejected (security)', 'منتهٍ سابقًا': 'Already done', 'فشل التنزيل': 'Download failed', 'بلا فائدة': 'No use', 'حذف بأمري': 'Delete (my order)', 'قرار مطلوب:': 'Decision required:', 'اوكيل الباحث يعمل': 'running', 'يعمل الآن…': 'Running…', 'اكتب هدف البحث أولًا': 'Write the research goal first', 'المصدر': 'Source', 'النتيجة': 'Result', 'ملاحظات': 'Notes', 'المقتطفات في النسخة التجريبية جاهزة للاختبار والاعتماد': 'Harvested parts are in the trial copy, ready for testing and approval', 'لا يُشغَّل أي كود من المشاريع المنزّلة — فحص أمني ساكن فقط. كل تنزيل يُحذف بعد اقتطاف الفوائد وتُكتب له علامة MD دائمة. النسخ التجريبية تُعتمد بك وبعد كل اعتماد يُطلب منك حذف الأصل السابق — الجذر لا يُمس أبدًا.': 'No downloaded project code is ever executed — static security scanning only. Every download is deleted after harvesting and gets a permanent MD done-marker. Trial copies are approved by you; after each new approval you are asked to delete the previous official — the root is never touched.', 'وكيل باحث معزول تمامًا عن مشاريعك: يبحث في الويب (GitHub وnpm) عن حلول لهدف تكتبه، ينزّل المرشحين واحدًا تلو الآخر (حد 20 لكل انطلاقة)، يفحص كل مشروع فحصًا أمنيًا ساكنًا دون تشغيله، يقتطف الأجزاء المفيدة ثم يحذف التنزيل ويكتب علامة «تم الانتهاء منه» فلا يعيده أبدًا. المقتطفات تُختبر في نسخة تجريبية معزولة ولا تصبح أصلية إلا باعتمادك، وبعد كل اعتماد جديد يُطلب منك حذف الأصل السابق. معطّل افتراضيًا ولا يلمس مشروعك قبل تفعيلك.': 'A research agent fully isolated from your projects: it searches the web (GitHub & npm) for solutions to a goal you write, downloads candidates one at a time (max 20 per launch), statically security-scans each project without ever running it, harvests the useful parts, then deletes the download and writes a permanent "done" marker so it never re-downloads it. Harvested parts are tested in an isolated trial copy and become official only by your approval; after each new approval you are asked to delete the previous official. Disabled by default and never touches your project until you activate it.', 'وكيل الصيانة الذاتية': 'Self-Maintenance Agent', 'مفعّل': 'Enabled', 'فترة الإشراف': 'Supervision interval', 'دقيقة': 'minutes', 'حفظ الإعدادات': 'Save settings', 'فحص فوري الآن': 'Scan now', 'قبول وتنفيذ': 'Accept & apply', 'رفض': 'Reject', 'تراجع': 'Undo', 'مُنفَّذ': 'Applied', 'مرفوض': 'Rejected', 'مُتراجَع عنه': 'Undone', 'بانتظار قرارك': 'Awaiting your decision', 'السبب': 'Root cause', 'سينفذ': 'Will do', 'السبب الجذري': 'Root cause', 'سجل الوكيل': 'Agent log', 'يعمل خارج جلسات الوكلاء تمامًا: لا يعدل برومتًا ولا يوقف وكيلًا ولا ينفق كردت. يكتشف الأعطال المعروفة ثم يعرض عليك اقتراحًا — لا ينفذ شيئًا إلا بقبولك، ولكل تنفيذ تراجع.': 'Operates entirely outside agent sessions: never touches prompts, never stops an agent, never spends credits. It detects known failures and shows you a proposal — nothing runs without your acceptance, and every applied fix can be undone.', 'يراقب وكيل الصيانة بنية المشروع من الخارج: يكشف الأعطال المعروفة (فشل توليد المجسمات، الصور القاتلة في سجلات الجلسات، سقوط الخوادم) دون أي تدخل في الوكيل العامل أو برومته. عند اكتشاف مشكلة يظهر لك إشعار ملخص واضح: السبب الجذري + ماذا سيفعل — القبول أو الرفض بيدك، ولكل إصلاح مقبول زر تراجع. معطّل افتراضيًا وتحدد فترة إشرافه (10/15/20 دقيقة).': 'The maintenance agent watches your project infrastructure from the outside: it detects known failures (asset-generation failures, fatal images in session logs, server crashes) without touching the working agent or its prompt. On detection you get a clear summary notification: root cause + planned action — accept or reject is your call, and every accepted fix has an undo button. Disabled by default; you choose its interval (10/15/20 min).', 'حفظ المفتاح': 'Save Key', 'اختبار المفتاح': 'Test Key', 'إظهار': 'Show', 'إخفاء': 'Hide', 'احفظ مفتاحك هنا مرة واحدة: يُفعَّل فوراً في كل أدوات توليد المجسمات ويبقى بعد إعادة تشغيل الخادم. لا يُعرض كاملاً أبداً — مموّهاً فقط.': 'Save your key once here: it activates immediately for every generation tool and survives server restarts. It is never shown in full — masked only.',
    'الوكلاء التلقائيون يعملون على الخادم ويستمرون حتى مع إغلاق المتصفح — يُطلَقون من جلسة عبر أداة auto_agent': 'Auto agents run server-side and keep going even if you close the browser — launched from a session via the auto_agent tool',
    'ذاكرة دائمة لكل مساحة عمل — قرارات وملاحظات تبقى عبر الجلسات': 'Permanent per-workspace memory — decisions and notes that survive across sessions',
    'تحقق ثلاثي المراحل: استيرادات مفقودة ← البناء ← استجابة الخادم HTTP': '3-stage verification: missing imports → build → server HTTP response',
    'فحص تسريب الأسرار: مفاتيح API وكلمات مرور داخل الكود': 'Secret leak scan: API keys and passwords inside the code',
    'تنظيف الملفات المؤقتة والتجريبية (فحص أو حذف)': 'Clean temp and test artifacts (scan or delete)',
    'إحصاءات المشروع: عدد الملفات والأسطر وأكبر الملفات': 'Project stats: file/line counts and largest files',
    'كشف الحزمة التقنية وأوامر التثبيت/البناء/التشغيل الصحيحة': 'Detect the stack and the correct install/build/run commands',
    'فريق من 9 وكلاء متخصصين يعملون بالتوازي على مهمة مفككة': 'A team of 9 specialist agents working in parallel on a decomposed task',
    'وكيل ذاتي يعمل جولات متتالية حتى إنجاز الهدف بحدود زمنية': 'An autonomous agent iterating in rounds until the goal is done, with limits',
    'توليد README.md تلقائياً من بنية المشروع': 'Auto-generate README.md from the project structure',
    'مراجعة ذاتية لآخر التعديلات وإصلاح ما يُكتشف': 'Self-review of recent changes and fix whatever it finds',
    'مخطط قاعدة البيانات ER بصيغة Mermaid': 'ER database diagram in Mermaid format',
    'تشغيل التحقق الثلاثي وإصلاح كل فشل حتى النجاح': 'Run the 3-stage verification and fix every failure until green',
    'تفويض هدف لفريق الوكلاء المتوازي المتخصص': 'Delegate an objective to the parallel specialist agent team',
    'عرض ذاكرة المشروع الدائمة': 'Show the permanent project memory',
    'التقاط لقطة للصفحة المعروضة وتحليلها بصرياً': 'Capture and visually analyze the previewed page',
    'تُحفظ محلياً في مساحة العمل': 'Stored locally in the workspace',
    'SSL مباشر (465) — أزلها لـ STARTTLS (587)': 'Direct SSL (465) — uncheck for STARTTLS (587)',
    'يُضغط المشروع (بدون node_modules) ويُرسل مرفقاً': 'The project is zipped (without node_modules) and sent as an attachment',
  },
  zh: {
    'محركات المعالجة — Blender وGodot': '处理引擎 — Blender 与 Godot', 'تنزيل الآن': '立即下载',
    'جارٍ الفحص…': '检查中…', 'مثبت': '已安装', 'غير مثبت': '未安装',
    'مجلدات الأصول الجاهزة': '现成素材文件夹', 'إضافة مجلد': '添加文件夹', 'إزالة': '移除',
    'مساحة العمل': '工作区', 'الأدوات': '工具', 'إجراءات': '操作', 'اللغة': '语言',
    'نظرة عامة': '总览', 'الملفات والمحرر': '文件与编辑器', 'المعاينة الحية': '实时预览',
    'لوحة كانبان': '看板', 'مختبر API': 'API 测试', 'البحث في الملفات': '文件搜索',
    'سجل الإصدارات': '版本历史', 'الوكلاء التلقائيون': '自动代理', 'إرسال بالبريد': '邮件发送',
    'الواجهة الرئيسة': '主界面', 'فتح مشروع جديد': '打开新项目', 'تحميل المشروع ZIP': '下载项目 ZIP',
    'صحة الخادم والإحصاءات': '服务器健康与统计',
    'استعرض، حرّر، وأنشئ ملفات مساحة العمل': '浏览、编辑并创建工作区文件',
    'معاينة ملفات HTML مع التقاط لقطة وتحليلها': '预览 HTML 并截图分析',
    'مهامك اليدوية ومهام الوكيل المتزامنة': '手动任务与同步的代理任务',
    'أرسل طلبات HTTP وافحص الاستجابات': '发送 HTTP 请求并检查响应',
    'ابحث في محتوى كل ملفات مساحة العمل': '搜索所有工作区文件内容',
    'لقطة تلقائية قبل أول كتابة — استرجع الأصل دوماً': '首次写入前自动快照 — 随时恢复原版',
    'راقب وأوقف وكلاء auto_agent': '监视并停止 auto_agent',
    'أرسل المشروع مضغوطاً عبر SMTP': '通过 SMTP 邮件发送项目压缩包',
    'الحالة والفرق والالتزامات': '状态、差异与提交',
    'متاح أيضاً للوكيل داخل الجلسات': '会话中的代理同样可用',
    'أدوات وأوامر يفهمها الوكيل تلقائياً أثناء عمله': '代理自动理解的原生工具与命令',
    'مهام الوكيل': '代理任务', 'مزامنة': '同步', 'قادم': '待办', 'جاري': '进行中', 'منجز': '已完成',
    'مهمة جديدة…': '新任务…', 'إضافة': '添加', 'ملف جديد': '新建文件', 'مجلد جديد': '新建文件夹',
    'إعادة تسمية': '重命名', 'حذف': '删除', 'حفظ': '保存', 'إعادة تحميل': '重新加载', 'تنزيل': '下载',
    'تحديث المعاينة': '刷新预览', 'التقاط لقطة': '截图', 'آخر لقطة': '最近截图',
    'الترويسات (JSON)': '请求头 (JSON)', 'الجسم (للـ POST/PUT/PATCH)': '请求体 (POST/PUT/PATCH)', 'إرسال': '发送',
    'بحث': '搜索', 'الملف': '文件', 'السطر': '行', 'المقتطف': '摘录', 'الوقت': '时间', 'السبب': '原因',
    'الحجم': '大小', 'عرض': '查看', 'استرجاع': '恢复', 'تحديث': '刷新', 'المعرف': '标识', 'الهدف': '目标',
    'الحالة': '状态', 'الجولات': '轮次', 'السجل': '日志', 'إيقاف': '停止',
    'إعدادات SMTP': 'SMTP 设置', 'الخادم': '主机', 'المنفذ': '端口', 'المستخدم': '用户名',
    'كلمة المرور / App Password': '密码 / 应用密码', 'اسم المرسل': '发件人名称', 'بريد المرسل': '发件人邮箱',
    'حفظ الإعدادات': '保存设置', 'إرسال المشروع': '发送项目', 'بريد المستلم': '收件人邮箱',
    'إرسال ZIP المشروع': '发送项目 ZIP', 'الفرق': '差异', 'رسالة الالتزام': '提交信息', 'إغلاق': '关闭',
    'وقت التشغيل': '运行时长', 'الذاكرة (RSS)': '内存 (RSS)', 'الكومة': '堆内存', 'ذاكرة النظام الحرة': '系统可用内存',
    'الأنوية': '核心数', 'مساحات العمل': '工作区数', 'وكلاء يعملون': '运行中代理',
    'اختر ملفاً من الشجرة لعرضه وتحريره': '在树中选择文件以查看和编辑',
    'ابحث في محتوى ملفات مساحة العمل…': '搜索工作区文件内容…', 'تصفية بالمسار (اختياري)': '按路径过滤（可选）',
    'مهمة جديدة': '新任务', 'تم الحفظ (أُخذت لقطة للإصدار السابق)': '已保存（已快照上一版本）', 'تم الحفظ': '已保存',
    'فشل الحفظ': '保存失败', 'تم فتح المشروع': '项目已打开', 'اختر مساحة عمل': '请选择工作区',
    'اختر ملفاً أولاً': '请先选择文件', 'لا نتائج': '无结果', 'فشل البحث': '搜索失败',
    'لا وكلاء — اطلب من الوكيل في الجلسة تشغيل auto_agent': '暂无代理 — 在会话中让代理运行 auto_agent',
    'أصول 3D': '3D 资产',
    'كتيب تعليمات 3D': '3D 提示词指南',
    'فتح الكتيب': '打开指南',
    'برومتات تخيلية لعملاء افتراضيين — تعلّم كتابة برومبت لعبة ناجح قبل أن تطلب من الوكيل': '虚拟客户提示词 — 在向代理提出需求前，先学会撰写出色的游戏简报',
    'سقف إجباري من المستخدم': '用户强制上限',
    'تثبيت السقف': '设置上限',
    'فشل تثبيت السقف': '设置上限失败',
    'ثُبّت السقف الإجباري': '已设置强制上限',
    'بلا سقف': '无上限',
    'الحد الأقصى للمجسمات الذي يُمنع الذكاء الاصطناعي من تجاوزه نهائياً — اتركه فارغاً لتعطيله. عند الحاجة لمزيد يبني الأساسيات فقط ويخبرك كم متبقياً لإكمال المشروع': '禁止 AI 超过的模型数量上限 — 留空禁用。需要更多时它只构建最核心的部分，并告诉你完成项目还差多少',
    'استئناف تلقائي عند تجدد الحدود': '限额重置后自动继续',
    'مفعّل': '已启用',
    'عدد مرات الاستئناف': '自动继续次数',
    'مدة التجدد (دقائق)': '重置窗口（分钟）',
    'حفظ': '保存',
    'إلغاء العداد': '取消计时',
    'الصور المولدة': '生成的图像',
    'كم مرة يستأنف النموذج تلقائياً بعد تجدد حدوده — اكتب أي عدد من 1 إلى 100': '模型限额重置后自动继续的次数 — 可填 1..100 任意数字',
    'المدة الافتراضية حتى تجدد حدود النموذج — يستخدمها العداد إن لم يعرف النموذج مدته بدقة': '模型限额重置的默认等待时长 — 当模型不知道精确窗口时使用',
    'عندما يصطدم أي نموذج بحدود الاستخدام، يفهم الوكيل مدة التجدد ويسلّح هذا العداد — وبعد انتهائها تستأنف الجلسة تلقائياً حتى العدد المحدد أعلاه. يعمل على الخادم حتى مع إغلاق المتصفح.': '任何模型达到用量限额时，代理会读取重置窗口并启动此计时器 — 到时自动继续会话，最多执行上方设定的次数。服务端运行，关闭浏览器也继续。',
    'كل صورة ولّدها الوكيل أو لقطات التحقق — انقر للعرض الكامل (تُقدَّم بنفس طريقة العارض)': '代理生成的所有图像与验证截图 — 点击查看大图', 'الخطة الحقيقية يبنيها الوكيل من وصف لعبتك، ثم يولّد كل أصل بأداة tripo_generate ويراقبه بصرياً قبل الاعتماد.': '真正的计划由代理根据你的游戏描述生成，然后用 tripo_generate 逐个资产生成并进行视觉审查。', 'اسحب للتدوير، وعجلة الفأرة للتقريب — يعرض أي نموذج GLB في مجلد assets/3d': '拖动旋转，滚轮缩放 — 显示 assets/3d 中的任意 GLB 模型', 'خطة الأصول ثلاثية الأبعاد': '3D 资产计划', 'سقف الأصول': '资产上限', 'إنشاء خطة اختبار': '创建测试计划', 'دليل الأسلوب الموحد': '统一风格指南', 'العارض ثلاثي الأبعاد': '3D 查看器', 'توليد': '生成', 'الأصل': '资产', '…جارٍ البحث': '搜索中…', 'نتيجة في': '条结果，共', 'ملف': '个文件', 'مقتطع': '已截断', 'مفتاح Tripo API': 'Tripo API 密钥', 'توليد الصور المرجعية': '参考图生成', 'المزود (Base URL)': '服务商 (Base URL)', 'النموذج': '模型', 'استوديو JS': 'JS 工作室', 'استوديو Godot': 'Godot 工作室', 'وكيل الصيانة': '维护代理', 'وكيل الباحث': '研究代理', 'وكيل الباحث — معزول عن هارنس': '研究代理 — 与框架隔离', 'تفعيل وانطلاق': '激活并启动', 'إيقاف': '停止', 'اختبار النسخة التجريبية': '测试试用副本', 'اعتماد كنسخة أصلية': '批准为正式版本', 'سجل التنزيلات هذه الجولة': '本轮下载记录', 'النسخ المعتمدة ودورة الاعتماد': '已批准版本与晋升周期', 'سجل الباحث': '研究代理日志', 'اقتُطف': '已提取', 'مرفوض أمنيًا': '安全拒绝', 'منتهٍ سابقًا': '此前已完成', 'فشل التنزيل': '下载失败', 'بلا فائدة': '无用', 'حذف بأمري': '按我的指令删除', 'قرار مطلوب:': '需要决定：', 'يعمل الآن…': '运行中…', 'اكتب هدف البحث أولًا': '请先写出研究目标', 'المصدر': '来源', 'النتيجة': '结果', 'ملاحظات': '备注', 'لا يُشغَّل أي كود من المشاريع المنزّلة — فحص أمني ساكن فقط. كل تنزيل يُحذف بعد اقتطاف الفوائد وتُكتب له علامة MD دائمة. النسخ التجريبية تُعتمد بك وبعد كل اعتماد يُطلب منك حذف الأصل السابق — الجذر لا يُمس أبدًا.': '绝不执行任何已下载项目的代码 — 仅静态安全扫描。每次下载在提取有用部分后被删除，并写入永久 MD 完成标记。试用副本由您批准；每次新批准后都会请您删除上一正式版本 — 永不触碰根目录。', 'وكيل باحث معزول تمامًا عن مشاريعك: يبحث في الويب (GitHub وnpm) عن حلول لهدف تكتبه، ينزّل المرشحين واحدًا تلو الآخر (حد 20 لكل انطلاقة)، يفحص كل مشروع فحصًا أمنيًا ساكنًا دون تشغيله، يقتطف الأجزاء المفيدة ثم يحذف التنزيل ويكتب علامة «تم الانتهاء منه» فلا يعيده أبدًا. المقتطفات تُختبر في نسخة تجريبية معزولة ولا تصبح أصلية إلا باعتمادك، وبعد كل اعتماد جديد يُطلب منك حذف الأصل السابق. معطّل افتراضيًا ولا يلمس مشروعك قبل تفعيلك.': '与您的项目完全隔离的研究代理：在网络（GitHub 与 npm）中搜索您指定目标的解决方案，逐个下载候选项目（每次启动最多 20 个），对每个项目进行静态安全扫描而绝不运行，提取有用部分后删除下载并写入永久「已完成」标记，绝不重复下载。提取内容在隔离的试用副本中测试，只有经您批准才成为正式版本；每次新批准后都会请您删除上一正式版本。默认禁用，激活前绝不触碰您的项目。', 'وكيل الصيانة الذاتية': '自维护代理', 'مفعّل': '已启用', 'فترة الإشراف': '监督间隔', 'دقيقة': '分钟', 'حفظ الإعدادات': '保存设置', 'فحص فوري الآن': '立即扫描', 'قبول وتنفيذ': '接受并执行', 'رفض': '拒绝', 'تراجع': '撤销', 'مُنفَّذ': '已执行', 'مرفوض': '已拒绝', 'مُتراجَع عنه': '已撤销', 'بانتظار قرارك': '等待您的决定', 'السبب': '原因', 'سينفذ': '将执行', 'سجل الوكيل': '代理日志', 'يعمل خارج جلسات الوكلاء تمامًا: لا يعدل برومتًا ولا يوقف وكيلًا ولا ينفق كردت. يكتشف الأعطال المعروفة ثم يعرض عليك اقتراحًا — لا ينفذ شيئًا إلا بقبولك، ولكل تنفيذ تراجع.': '完全在代理会话之外运行：不修改提示词、不停止任何代理、不消耗积分。它检测已知故障并向您展示建议 — 未经您接受绝不执行，且每次执行均可撤销。', 'يراقب وكيل الصيانة بنية المشروع من الخارج: يكشف الأعطال المعروفة (فشل توليد المجسمات، الصور القاتلة في سجلات الجلسات، سقوط الخوادم) دون أي تدخل في الوكيل العامل أو برومته. عند اكتشاف مشكلة يظهر لك إشعار ملخص واضح: السبب الجذري + ماذا سيفعل — القبول أو الرفض بيدك، ولكل إصلاح مقبول زر تراجع. معطّل افتراضيًا وتحدد فترة إشرافه (10/15/20 دقيقة).': '维护代理从外部监视项目基础设施：检测已知故障（资产生成失败、会话日志中的致命图片、服务器崩溃），绝不干预正在工作的代理或其提示词。发现问题时您会收到清晰的摘要通知：根本原因 + 计划操作 — 接受或拒绝由您决定，每个已接受的修复都有撤销按钮。默认禁用；监督间隔（10/15/20 分钟）由您选择。', 'حفظ المفتاح': '保存密钥', 'اختبار المفتاح': '测试密钥', 'إظهار': '显示', 'إخفاء': '隐藏', 'احفظ مفتاحك هنا مرة واحدة: يُفعَّل فوراً في كل أدوات توليد المجسمات ويبقى بعد إعادة تشغيل الخادم. لا يُعرض كاملاً أبداً — مموّهاً فقط.': '在此保存一次密钥：立即对所有生成工具生效，并在服务器重启后保留。密钥永不完整显示 — 仅掩码显示。',
    'الوكلاء التلقائيون يعملون على الخادم ويستمرون حتى مع إغلاق المتصفح — يُطلَقون من جلسة عبر أداة auto_agent': '自动代理在服务器端运行，关闭浏览器也会继续 — 通过会话中的 auto_agent 工具启动',
    'ذاكرة دائمة لكل مساحة عمل — قرارات وملاحظات تبقى عبر الجلسات': '每个工作区的永久记忆 — 跨会话保留的决策与笔记',
    'تحقق ثلاثي المراحل: استيرادات مفقودة ← البناء ← استجابة الخادم HTTP': '三阶段验证：缺失导入 → 构建 → 服务器 HTTP 响应',
    'فحص تسريب الأسرار: مفاتيح API وكلمات مرور داخل الكود': '机密泄露扫描：代码中的 API 密钥与密码',
    'تنظيف الملفات المؤقتة والتجريبية (فحص أو حذف)': '清理临时与测试文件（扫描或删除）',
    'إحصاءات المشروع: عدد الملفات والأسطر وأكبر الملفات': '项目统计：文件数、行数与最大文件',
    'كشف الحزمة التقنية وأوامر التثبيت/البناء/التشغيل الصحيحة': '检测技术栈并给出正确的安装/构建/运行命令',
    'فريق من 9 وكلاء متخصصين يعملون بالتوازي على مهمة مفككة': '9 名专家代理并行处理分解后的任务',
    'وكيل ذاتي يعمل جولات متتالية حتى إنجاز الهدف بحدود زمنية': '自主代理循环工作直至完成目标（带限额）',
    'توليد README.md تلقائياً من بنية المشروع': '根据项目结构自动生成 README.md',
    'مراجعة ذاتية لآخر التعديلات وإصلاح ما يُكتشف': '对最近修改进行自审并修复发现的问题',
    'مخطط قاعدة البيانات ER بصيغة Mermaid': 'Mermaid 格式的数据库 ER 图',
    'تشغيل التحقق الثلاثي وإصلاح كل فشل حتى النجاح': '运行三阶段验证并修复所有失败直至通过',
    'تفويض هدف لفريق الوكلاء المتوازي المتخصص': '将目标委派给并行的专家代理团队',
    'عرض ذاكرة المشروع الدائمة': '查看项目的永久记忆',
    'التقاط لقطة للصفحة المعروضة وتحليلها بصرياً': '截图并视觉分析当前预览页面',
    'تُحفظ محلياً في مساحة العمل': '保存在工作区本地',
    'SSL مباشر (465) — أزلها لـ STARTTLS (587)': '直接 SSL (465) — 取消勾选则使用 STARTTLS (587)',
    'يُضغط المشروع (بدون node_modules) ويُرسل مرفقاً': '项目将打包为 ZIP（不含 node_modules）并作为附件发送',
  },
};
var PLACEHOLDER_EN = {
  'ابحث في محتوى ملفات مساحة العمل…': 'Search workspace file contents…',
  'مهمة جديدة…': 'New task…', 'index.html': 'index.html',
  'http://localhost:3000/api/…': 'http://localhost:3000/api/…',
  'رسالة الالتزام': 'Commit message', 'بريد المستلم': 'Recipient email',
  'اختر ملفاً من الشجرة لعرضه وتحريره': 'Select a file in the tree to view and edit it',
};
var lang = localStorage.getItem('toolsLang') || 'ar';
function tr(s) {
  if (lang === 'ar') return s;
  var d = DICT[lang] || {};
  return d[s] !== undefined ? d[s] : s;
}
var origText = new WeakMap();
var origTitle = new WeakMap();
function trNode(el) {
  if (el.children.length === 0) {
    var t = (el.textContent || '').trim();
    if (t) {
      if (!origText.has(el)) origText.set(el, t);
      var src = origText.get(el);
      var nt = lang === 'ar' ? src : ((DICT[lang] || {})[src] || src);
      if (nt !== t) el.textContent = el.textContent.replace(t, nt);
    }
    var ti = el.getAttribute && el.getAttribute('title');
    if (ti) {
      if (!origTitle.has(el)) origTitle.set(el, ti);
      var srcT = origTitle.get(el);
      var ntT = lang === 'ar' ? srcT : ((DICT[lang] || {})[srcT] || srcT);
      if (ntT !== ti) el.setAttribute('title', ntT);
    }
  } else {
    el.childNodes.forEach(function (n) {
      if (n.nodeType === 3) {
        var t2 = (n.textContent || '').trim();
        if (t2) {
          if (!origText.has(n)) origText.set(n, t2);
          var src2 = origText.get(n);
          var nt2 = lang === 'ar' ? src2 : ((DICT[lang] || {})[src2] || src2);
          if (nt2 !== t2) n.textContent = n.textContent.replace(t2, nt2);
        }
      }
    });
  }
}
function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  var sel = q('#langSel'); if (sel) sel.value = lang;
  document.querySelectorAll('body *').forEach(function (el) {
    trNode(el);
    if (el.children.length === 0) {
      var ph = el.getAttribute && el.getAttribute('placeholder');
      if (ph && lang !== 'ar') { var pe = (PLACEHOLDER_EN[ph] !== undefined ? PLACEHOLDER_EN[ph] : DICT[lang] && DICT[lang][ph]); if (pe) el.setAttribute('placeholder', pe); }
    }
  });
  // translate table headers and section labels that contain only text
  document.querySelectorAll('th, .sb-sec, label.f, .kcol h3').forEach(function (el) { trNode(el); });
  var titles = {
    overview: lang === 'ar' ? ['نظرة عامة', 'صحة الخادم والإحصاءات'] : lang === 'en' ? ['Overview', 'Server health & stats'] : ['总览', '服务器健康与统计'],
    files: lang === 'ar' ? ['الملفات والمحرر', 'استعرض، حرّر، وأنشئ ملفات مساحة العمل'] : lang === 'en' ? ['Files & Editor', 'Browse, edit, and create workspace files'] : ['文件与编辑器', '浏览、编辑并创建工作区文件'],
    preview: lang === 'ar' ? ['المعاينة الحية', 'معاينة ملفات HTML مع التقاط لقطة وتحليلها'] : lang === 'en' ? ['Live Preview', 'Preview HTML files with capture & analysis'] : ['实时预览', '预览 HTML 并截图分析'],
    kanban: lang === 'ar' ? ['لوحة كانبان', 'مهامك اليدوية ومهام الوكيل المتزامنة'] : lang === 'en' ? ['Kanban Board', 'Your tasks and synced agent tasks'] : ['看板', '手动任务与同步的代理任务'],
    tester: lang === 'ar' ? ['مختبر API', 'أرسل طلبات HTTP وافحص الاستجابات'] : lang === 'en' ? ['API Tester', 'Send HTTP requests and inspect responses'] : ['API 测试', '发送 HTTP 请求并检查响应'],
    search: lang === 'ar' ? ['البحث في الملفات', 'ابحث في محتوى كل ملفات مساحة العمل'] : lang === 'en' ? ['Search Files', 'Search the content of every workspace file'] : ['文件搜索', '搜索所有工作区文件内容'],
    versions: lang === 'ar' ? ['سجل الإصدارات', 'لقطة تلقائية قبل أول كتابة — استرجع الأصل دوماً'] : lang === 'en' ? ['Version History', 'Auto snapshot before the first write — restore anytime'] : ['版本历史', '首次写入前自动快照 — 随时恢复原版'],
    agents: lang === 'ar' ? ['الوكلاء التلقائيون', 'راقب وأوقف وكلاء auto_agent'] : lang === 'en' ? ['Auto Agents', 'Monitor and stop auto_agent runs'] : ['自动代理', '监视并停止 auto_agent'],
    email: lang === 'ar' ? ['إرسال بالبريد', 'أرسل المشروع مضغوطاً عبر SMTP'] : lang === 'en' ? ['Send by Email', 'Email the project as a ZIP via SMTP'] : ['邮件发送', '通过 SMTP 邮件发送项目压缩包'],
    git: lang === 'ar' ? ['Git', 'الحالة والفرق والالتزامات'] : lang === 'en' ? ['Git', 'Status, diffs, and commits'] : ['Git', '状态、差异与提交'],
  };
  var active = document.querySelector('#tabs .sb-item.on');
  if (active && titles[active.dataset.t]) {
    if (q('#pageTitle').textContent !== titles[active.dataset.t][0]) q('#pageTitle').textContent = titles[active.dataset.t][0];
    if (q('#pageDesc').textContent !== titles[active.dataset.t][1]) q('#pageDesc').textContent = titles[active.dataset.t][1];
  }
  if (guideOpenFlag && q('#modalBg').classList.contains('on')) guideRender();
}
q('#langSel').addEventListener('change', function () {
  lang = this.value; localStorage.setItem('toolsLang', lang); _applyLangSafe ? _applyLangSafe() : applyLang();
  try { fetch('/tools/api/ui-lang', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lang: lang }) }) } catch (e) { /* offline ok */ }
});
function api(path, opts, cb) {
  opts = opts || {};
  opts.headers = opts.headers || {};
  if (opts.body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.body); }
  fetch(path, opts).then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
    .then(function (x) { if (cb) cb(null, x); }, function (e) { if (cb) cb(e); });
}
function toast(msg, isErr) {
  var t = document.getElementById('toast');
  t.textContent = msg; t.style.display = 'block';
  t.style.borderColor = isErr ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-border-l2)';
  setTimeout(function () { t.style.display = 'none'; }, 3200);
}
function q(sel) { return document.querySelector(sel); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmtBytes(n) { if (n > 1048576) return (n / 1048576).toFixed(1) + ' MB'; if (n > 1024) return (n / 1024).toFixed(1) + ' KB'; return n + ' B'; }

var PAGE_META = {
  overview: ['نظرة عامة', 'صحة الخادم والإحصاءات'],
  files: ['الملفات والمحرر', 'استعرض، حرّر، وأنشئ ملفات مساحة العمل'],
  preview: ['المعاينة الحية', 'معاينة ملفات HTML مع التقاط لقطة وتحليلها'],
  kanban: ['لوحة كانبان', 'مهامك اليدوية ومهام الوكيل المتزامنة'],
  tester: ['مختبر API', 'أرسل طلبات HTTP وافحص الاستجابات'],
  search: ['البحث في الملفات', 'ابحث في محتوى كل ملفات مساحة العمل'],
  versions: ['سجل الإصدارات', 'لقطة تلقائية قبل أول كتابة — استرجع الأصل دوماً'],
  agents: ['الوكلاء التلقائيون', 'راقب وأوقف وكلاء auto_agent'],
  email: ['إرسال بالبريد', 'أرسل المشروع مضغوطاً عبر SMTP'],
  git: ['Git', 'الحالة والفرق والالتزامات'],
  tripo: ['أصول 3D', 'خطة موحدة بأسلوب واحد وتوليد عبر Tripo وعارض ثلاثي الأبعاد']
};

function fillWs() {
  var sel = q('#wsSel'); sel.innerHTML = '';
  WS.forEach(function (w) {
    var o = document.createElement('option'); o.value = w.path;
    o.textContent = w.title || w.path; if (w.path === ws) o.selected = true; sel.appendChild(o);
  });
  q('#wsPath').textContent = ws || '';
}
q('#wsSel').addEventListener('change', function () { ws = this.value; localStorage.setItem('toolsWs', ws); q('#wsPath').textContent = ws; refreshAll(); });
document.querySelectorAll('#tabs .sb-item').forEach(function (b) {
  b.addEventListener('click', function () {
    document.querySelectorAll('#tabs .sb-item').forEach(function (x) { x.classList.remove('on'); });
    document.querySelectorAll('section.tab').forEach(function (x) { x.classList.remove('on'); });
    b.classList.add('on'); q('#tab-' + b.dataset.t).classList.add('on');
    var m = PAGE_META[b.dataset.t] || ['', ''];
    q('#pageTitle').textContent = m[0]; q('#pageDesc').textContent = m[1];
    if (b.dataset.t === 'overview') loadHealth();
    if (b.dataset.t === 'files') loadTree();
    if (b.dataset.t === 'kanban') { loadKanban(); loadAgentTodos(); }
    if (b.dataset.t === 'versions') loadVersions();
    if (b.dataset.t === 'agents') loadAgents();
    if (b.dataset.t === 'email') loadMail();
    if (b.dataset.t === 'tripo') { loadTripo(); loadGenImages(); loadTripoKey(); loadImgGen(); }
    if (b.dataset.t === 'guardian') { loadGuardian(); }
    if (b.dataset.t === 'research') { rsLoad(); }
  });
});

function loadHealth() {
  api('/tools/api/health', null, function (e, x) {
    if (e || x.s !== 200) { toast('فشل جلب الصحة', true); return; }
    var h = x.j; var items = [
      ['وقت التشغيل', Math.floor(h.uptime_sec / 3600) + 'س ' + Math.floor((h.uptime_sec % 3600) / 60) + 'د'],
      ['الذاكرة (RSS)', h.rss_mb + ' MB'],
      ['الكومة', h.heap_used_mb + ' MB'],
      ['ذاكرة النظام الحرة', h.free_mem_mb + ' GB'.replace(' GB', '') + ' / ' + Math.round(h.total_mem_mb / 1024) + ' GB'],
      ['الأنوية', h.cpus], ['مساحات العمل', h.workspaces],
      ['وكلاء يعملون', h.auto_agents_running], ['Node', h.node]
    ];
    q('#healthCards').innerHTML = items.map(function (it) {
      return '<div class="card stat"><div class="k">' + it[0] + '</div><div class="v">' + esc(it[1]) + '</div></div>';
    }).join('');
  });
}

var selPath = null;
function loadTree() {
  api('/tools/api/files/tree?ws=' + encodeURIComponent(ws), null, function (e, x) {
    if (e || x.s !== 200) { q('#tree').textContent = 'تعذر تحميل الشجرة'; return; }
    var el = q('#tree'); el.innerHTML = '';
    function render(node, depth, parentEl) {
      var kids = (node.children || []).slice().sort(function (a, b) {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1; return a.name.localeCompare(b.name);
      });
      kids.forEach(function (c) {
        var d = document.createElement('div');
        d.className = 'titem ' + c.type + (c.path === selPath ? ' sel' : '');
        d.style.paddingRight = (10 + depth * 14) + 'px';
        d.textContent = (c.type === 'dir' ? '▸ ' : '') + c.name;
        if (c.type === 'file') d.addEventListener('click', function () { selPath = c.path; openFile(c.path, c.size); loadTree(); });
        else {
          var wrap = document.createElement('div'); parentEl.appendChild(d); parentEl.appendChild(wrap);
          render(c, depth + 1, wrap);
          d.addEventListener('click', function () {
            var open = wrap.style.display !== 'none'; wrap.style.display = open ? 'none' : '';
            d.textContent = (open ? '▾ ' : '▸ ') + c.name;
          });
          return;
        }
        parentEl.appendChild(d);
      });
    }
    render(x.j.tree, 0, el);
  });
}
function openFile(p, size) {
  api('/tools/api/files/read?ws=' + encodeURIComponent(ws) + '&p=' + encodeURIComponent(p), null, function (e, x) {
    if (e || x.s !== 200) { toast('تعذر قراءة الملف', true); return; }
    var ed = q('#editor');
    q('#editPath').textContent = p;
    q('#fileInfo').textContent = fmtBytes(x.j.size);
    if (x.j.text === null) { ed.value = ''; ed.placeholder = 'ملف ثنائي — لا يمكن تحريره نصياً'; q('#saveBtn').disabled = true; }
    else { ed.value = x.j.text; q('#saveBtn').disabled = false; }
    q('#reloadBtn').disabled = false; q('#dlFileBtn').disabled = false;
  });
}
q('#saveBtn').addEventListener('click', function () {
  if (!selPath) return;
  api('/tools/api/files/write?ws=' + encodeURIComponent(ws), { method: 'POST', body: { p: selPath, content: q('#editor').value } }, function (e, x) {
    toast(e || x.s !== 200 ? 'فشل الحفظ' : 'تم الحفظ (أُخذت لقطة للإصدار السابق)', !!e || x.s !== 200);
  });
});
q('#newFileBtn').addEventListener('click', function () {
  var p = prompt('مسار الملف الجديد (نسبي لمساحة العمل):'); if (!p) return;
  api('/tools/api/files/write?ws=' + encodeURIComponent(ws), { method: 'POST', body: { p: p, content: '' } }, function () { selPath = p; loadTree(); openFile(p, 0); });
});
q('#newDirBtn').addEventListener('click', function () {
  var p = prompt('مسار المجلد الجديد:'); if (!p) return;
  api('/tools/api/files/mkdir?ws=' + encodeURIComponent(ws), { method: 'POST', body: { p: p } }, function () { loadTree(); });
});
q('#renameBtn').addEventListener('click', function () {
  if (!selPath) { toast('اختر ملفاً أولاً', true); return; }
  var to = prompt('المسار الجديد:', selPath); if (!to || to === selPath) return;
  api('/tools/api/files/move?ws=' + encodeURIComponent(ws), { method: 'POST', body: { from: selPath, to: to } }, function () { selPath = to; loadTree(); });
});
q('#deleteBtn').addEventListener('click', function () {
  if (!selPath) { toast('اختر ملفاً أولاً', true); return; }
  if (!confirm('حذف ' + selPath + '؟ (يمكن استرجاعه من سجل الإصدارات)')) return;
  api('/tools/api/files/delete?ws=' + encodeURIComponent(ws), { method: 'POST', body: { p: selPath } }, function () { selPath = null; q('#editor').value = ''; q('#editPath').textContent = ''; q('#saveBtn').disabled = true; loadTree(); });
});
q('#dlFileBtn').addEventListener('click', function () {
  if (!selPath) return;
  window.open('/tools/preview?ws=' + encodeURIComponent(ws) + '&p=' + encodeURIComponent(selPath), '_blank');
});
q('#reloadBtn').addEventListener('click', function () { if (selPath) openFile(selPath, 0); });

q('#previewBtn').addEventListener('click', function () {
  var p = q('#previewPath').value.trim() || 'index.html';
  q('#previewFrame').src = '/tools/preview?ws=' + encodeURIComponent(ws) + '&p=' + encodeURIComponent(p) + '&t=' + Date.now();
});

q('#shotBtn').addEventListener('click', function () {
  var p = q('#previewPath').value.trim() || 'index.html';
  var origin = window.location.origin;
  var full = origin + '/tools/preview?ws=' + encodeURIComponent(ws) + '&p=' + encodeURIComponent(p);
  q('#shotCard').style.display = 'block';
  q('#shotMeta').textContent = '…جارٍ التقاط اللقطة (حتى 30 ثانية)';
  q('#shotImg').removeAttribute('src');
  q('#shotImg').src = '/tools/api/screenshot?ws=' + encodeURIComponent(ws) + '&url=' + encodeURIComponent(full) + '&t=' + Date.now();
  q('#shotImg').onload = function () {
    q('#shotMeta').textContent = 'التُقطت اللقطة. اطلب من الوكيل في الجلسة تحليلها بصرياً بأداة screenshot_verify، أو استخدم «استمع».';
  };
  q('#shotImg').onerror = function () {
    q('#shotMeta').textContent = 'فشل الالتقاط — تأكد من تشغيل صفحة المعاينة أولاً ووجود Edge/Chrome على الجهاز.';
  };
});

function loadAgentTodos() {
  api('/tools/api/agent-todos?ws=' + encodeURIComponent(ws), null, function (e, x) {
    var board = q('#atBoard'); var meta = q('#atMeta');
    if (e || x.s !== 200) { board.innerHTML = '<span class="note">تعذّرت المزامنة</span>'; return; }
    var j = x.j;
    var groups = [
      ['pending', 'قادم'],
      ['in_progress', 'جاري'],
      ['completed', 'منجز']
    ];
    if (!j.todos || !j.todos.length) {
      board.innerHTML = '<span class="note">لا مهام وكيل بعد — عندما يستخدم الوكيل قائمة المهام في جلسة هذه المساحة ستظهر هنا تلقائياً</span>';
      meta.textContent = '';
      return;
    }
    meta.textContent = j.updatedAt ? 'آخر تحديث: ' + j.updatedAt.replace('T', ' ').slice(0, 19) : '';
    var html = '';
    groups.forEach(function (g) {
      var items = j.todos.filter(function (t) { return t.status === g[0]; });
      if (!items.length) return;
      html += '<div style="flex:1;min-width:200px"><div class="note" style="margin-bottom:4px">' + g[1] + ' (' + items.length + ')</div>';
      items.forEach(function (t) {
        var done = t.status === 'completed';
        html += '<div class="kcard" style="cursor:default;' + (done ? 'opacity:.55' : '') + '">' + (done ? '✓ ' : '') + esc(t.content) + '</div>';
      });
      html += '</div>';
    });
    board.innerHTML = html;
  });
}
q('#atRefresh').addEventListener('click', loadAgentTodos);

q('#sGo').addEventListener('click', runSearch);
q('#sq').addEventListener('keydown', function (e) { if (e.key === 'Enter') runSearch(); });
function runSearch() {
  var query = q('#sq').value.trim();
  if (!query) return;
  q('#sMeta').textContent = '…جارٍ البحث';
  api('/tools/api/search?ws=' + encodeURIComponent(ws) + '&q=' + encodeURIComponent(query), null, function (e, x) {
    if (e || x.s !== 200) { q('#sMeta').textContent = 'فشل البحث'; return; }
    var tb = q('#sTable tbody'); tb.innerHTML = '';
    (x.j.results || []).forEach(function (r) {
      var tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.innerHTML = '<td class="path">' + esc(r.file) + '</td><td class="note">' + r.line + '</td><td class="note" style="direction:ltr;text-align:left;max-width:520px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(r.text) + '</td>';
      tr.addEventListener('click', function () {
        selPath = r.file;
        document.querySelectorAll('#tabs .sb-item').forEach(function (b) { b.classList.remove('on'); });
        document.querySelector('#tabs .sb-item[data-t=files]').classList.add('on');
        document.querySelectorAll('section.tab').forEach(function (s) { s.classList.remove('on'); });
        q('#tab-files').classList.add('on');
        q('#pageTitle').textContent = PAGE_META.files[0]; q('#pageDesc').textContent = PAGE_META.files[1];
        loadTree(); openFile(r.file, 0);
      });
      tb.appendChild(tr);
    });
    if (!(x.j.results || []).length) tb.innerHTML = '<tr><td colspan="3" class="note" style="padding:20px">لا نتائج</td></tr>';
    q('#sMeta').textContent = x.j.results.length + ' نتيجة في ' + x.j.scanned + ' ملف' + (x.j.truncated ? ' (مقتطع — نقّط البحث)' : '');
  });
}

var board = { todo: [], doing: [], done: [] };
function loadKanban() {
  api('/tools/api/kanban?ws=' + encodeURIComponent(ws), null, function (e, x) {
    if (!e && x.s === 200 && x.j.columns) board = x.j.columns;
    renderKanban();
  });
}
function renderKanban() {
  ['todo', 'doing', 'done'].forEach(function (col) {
    var drop = document.querySelector('.kcol[data-col="' + col + '"] .kdrop'); drop.innerHTML = '';
    (board[col] || []).forEach(function (card) {
      var el = document.createElement('div'); el.className = 'kcard'; el.draggable = true; el.dataset.id = card.id;
      el.innerHTML = '<span class="del" title="حذف">✕</span>' + esc(card.text);
      el.querySelector('.del').addEventListener('click', function (ev) { ev.stopPropagation(); removeKanban(card.id); });
      el.addEventListener('dragstart', function (ev) { ev.dataTransfer.setData('text/plain', card.id + '|' + col); });
      drop.appendChild(el);
    });
  });
}
function removeKanban(id) {
  ['todo', 'doing', 'done'].forEach(function (c) { board[c] = board[c].filter(function (k) { return k.id !== id; }); });
  renderKanban(); saveKanban();
}
function saveKanban() {
  api('/tools/api/kanban?ws=' + encodeURIComponent(ws), { method: 'POST', body: { columns: board } }, function () { });
}
document.querySelectorAll('.kcol').forEach(function (colEl) {
  colEl.addEventListener('dragover', function (e) { e.preventDefault(); colEl.classList.add('over'); });
  colEl.addEventListener('dragleave', function () { colEl.classList.remove('over'); });
  colEl.addEventListener('drop', function (e) {
    e.preventDefault(); colEl.classList.remove('over');
    var data = e.dataTransfer.getData('text/plain').split('|'); var id = data[0], from = data[1], to = colEl.dataset.col;
    if (from === to) return;
    var card = null; board[from] = (board[from] || []).filter(function (k) { if (k.id === id) { card = k; return false; } return true; });
    if (card) { board[to] = board[to] || []; board[to].push(card); }
    renderKanban(); saveKanban();
  });
});
q('#kAdd').addEventListener('click', function () {
  var text = q('#kNew').value.trim(); if (!text) return;
  var col = q('#kCol').value; board[col] = board[col] || [];
  board[col].push({ id: 'k' + Date.now(), text: text }); q('#kNew').value = '';
  renderKanban(); saveKanban();
});

q('#tSend').addEventListener('click', function () {
  var method = q('#tMethod').value, url2 = q('#tUrl').value.trim();
  if (!url2) return;
  var headers = {}; try { headers = JSON.parse(q('#tHeaders').value || '{}'); } catch (e2) { toast('ترويسات JSON غير صالحة', true); return; }
  var opts = { method: method, headers: headers };
  if (method !== 'GET' && method !== 'DELETE') opts.body = q('#tBody').value;
  var t0 = Date.now();
  fetch(url2, opts).then(function (r) {
    return r.text().then(function (txt) {
      q('#tMeta').textContent = 'HTTP ' + r.status + ' · ' + (Date.now() - t0) + 'ms · ' + (r.headers.get('content-type') || '');
      var out = txt; try { out = JSON.stringify(JSON.parse(txt), null, 2); } catch (e3) { }
      q('#tOut').textContent = out;
    });
  }).catch(function (e4) { q('#tMeta').textContent = 'خطأ'; q('#tOut').textContent = String(e4); });
});

function loadVersions() {
  api('/tools/api/versions?ws=' + encodeURIComponent(ws) + '&p=' + encodeURIComponent(q('#vFilter').value.trim()), null, function (e, x) {
    if (e || x.s !== 200) return;
    var tb = q('#vTable tbody'); tb.innerHTML = '';
    (x.j.snapshots || []).forEach(function (s) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td class="path">' + esc(s.rel) + '</td><td class="note">' + esc(s.ts.replace('T', ' ').slice(0, 19)) + '</td><td class="note">' + esc(s.cause) + '</td><td class="note">' + fmtBytes(s.size) +
        '</td><td style="white-space:nowrap"><button class="btn">عرض</button> <button class="btn primary">استرجاع</button></td>';
      var btns = tr.querySelectorAll('button');
      btns[0].addEventListener('click', function () { showSnapshot(s); });
      btns[1].addEventListener('click', function () {
        if (!confirm('استرجاع ' + s.rel + ' كما كانت عند ' + s.ts + '؟')) return;
        api('/tools/api/versions/restore?ws=' + encodeURIComponent(ws), { method: 'POST', body: { id: s.id } }, function (e2, x2) {
          toast(e2 || x2.s !== 200 ? 'فشل الاسترجاع' : 'تم الاسترجاع', !!e2 || x2.s !== 200);
        });
      });
      tb.appendChild(tr);
    });
    if (!(x.j.snapshots || []).length) tb.innerHTML = '<tr><td colspan="5" class="note" style="padding:24px">لا لقطات بعد — تُلتقط تلقائياً قبل كل كتابة</td></tr>';
  });
}
function showSnapshot(s) {
  api('/tools/api/versions/get?ws=' + encodeURIComponent(ws) + '&id=' + encodeURIComponent(s.id), null, function (e, x) {
    if (e || x.s !== 200) { toast('تعذر جلب اللقطة', true); return; }
    openModal('لقطة: ' + s.rel + ' — ' + s.ts,
      '<div class="note" style="margin-bottom:6px">المحتوى وقت اللقطة:</div><pre class="code">' + esc(x.j.content).slice(0, 60000) + '</pre>' +
      (x.j.current !== null ? '<div class="note" style="margin:12px 0 6px">الحالي على القرص:</div><pre class="code">' + esc(x.j.current).slice(0, 60000) + '</pre>' : '<div class="note" style="margin-top:12px">الملف غير موجود حالياً على القرص</div>'));
  });
}
q('#vRefresh').addEventListener('click', loadVersions);
q('#vFilter').addEventListener('keydown', function (e) { if (e.key === 'Enter') loadVersions(); });

function loadAgents() {
  api('/tools/api/agents', null, function (e, x) {
    if (e || x.s !== 200) return;
    var tb = q('#aTable tbody'); tb.innerHTML = '';
    (x.j.agents || []).forEach(function (a) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td class="path">' + esc(a.id) + '</td><td>' + esc(a.objective.slice(0, 80)) +
        '</td><td><span class="status ' + a.status + '">' + a.status + '</span></td><td class="note">' + a.rounds + '/' + a.maxRounds + '</td>' +
        '<td><button class="btn">السجل</button></td><td>' + (a.status === 'running' ? '<button class="btn danger">إيقاف</button>' : '') + '</td>';
      var btns = tr.querySelectorAll('button');
      btns[0].addEventListener('click', function () {
        var log = (a.log || []).map(function (l) { return '[round ' + l.round + ' · ' + l.ts.slice(0, 19) + ' · ' + l.stopReason + ']\\n' + l.summary; }).join('\\n\\n');
        openModal('سجل ' + a.id, '<pre class="code" style="white-space:pre-wrap">' + esc(log || '(لا سجل بعد)') + '</pre>');
      });
      if (btns[1]) btns[1].addEventListener('click', function () {
        api('/tools/api/agents/stop', { method: 'POST', body: { id: a.id } }, function () { toast('أُرسل طلب الإيقاف'); setTimeout(loadAgents, 800); });
      });
      tb.appendChild(tr);
    });
    if (!(x.j.agents || []).length) tb.innerHTML = '<tr><td colspan="6" class="note" style="padding:24px">لا وكلاء — اطلب من الوكيل في الجلسة تشغيل auto_agent</td></tr>';
  });
}
q('#aRefresh').addEventListener('click', loadAgents);

function loadMail() {
  api('/tools/api/email/config?ws=' + encodeURIComponent(ws), null, function (e, x) {
    if (e || x.s !== 200 || !x.j.config) return;
    var c = x.j.config;
    q('#mHost').value = c.host || ''; q('#mPort').value = c.port || 465; q('#mSecure').checked = c.secure !== false;
    q('#mUser').value = c.user || ''; q('#mPass').value = c.pass ? '••••' : '';
    q('#mFromName').value = c.fromName || 'الأدوات'; q('#mFromAddr').value = c.fromAddress || '';
  });
}
q('#mSave').addEventListener('click', function () {
  api('/tools/api/email/config?ws=' + encodeURIComponent(ws), {
    method: 'POST', body: {
      host: q('#mHost').value.trim(), port: Number(q('#mPort').value) || 465, secure: q('#mSecure').checked,
      user: q('#mUser').value, pass: q('#mPass').value, fromName: q('#mFromName').value, fromAddress: q('#mFromAddr').value.trim()
    }
  }, function (e, x) { toast(e || x.s !== 200 ? 'فشل الحفظ' : 'حُفظت إعدادات SMTP', !!e || x.s !== 200); });
});
q('#mSend').addEventListener('click', function () {
  q('#mOut').textContent = '…يُضغط المشروع ويُرسل';
  api('/tools/api/email/send?ws=' + encodeURIComponent(ws), { method: 'POST', body: { to: q('#mTo').value.trim() } }, function (e, x) {
    if (e || x.s !== 200) { q('#mOut').textContent = 'فشل: ' + JSON.stringify(x && x.j); toast('فشل الإرسال', true); return; }
    q('#mOut').textContent = 'أُرسل — ' + x.j.files + ' ملف، ' + fmtBytes(x.j.sent_bytes);
    toast('أُرسل البريد');
  });
});

var gdLastPending = -1
function gdRender(s) {
  q('#gdEnabled').checked = s.enabled
  q('#gdInterval').value = String(s.intervalMin)
  q('#gdStatus').textContent = s.enabled ? 'يعمل كل ' + s.intervalMin + ' دقيقة' : 'معطّل'
  var wrap = q('#gdProposals'); wrap.innerHTML = ''
  var pend = s.proposals.filter(function (p) { return p.state === 'pending' })
  if (pend.length > 0 && gdLastPending !== -1 && pend.length > gdLastPending) {
    toast('وكيل الصيانة وجد مشكلة — ' + pend.length + ' اقتراحًا بانتظار قرارك', true)
  }
  gdLastPending = pend.length
  s.proposals.forEach(function (p) {
    var c = document.createElement('div')
    c.className = 'card'
    c.style.marginBottom = '12px'
    c.style.borderColor = p.state === 'pending'
      ? (p.severity === 'critical' ? 'var(--dsw-alias-state-error-primary)' : p.severity === 'warning' ? 'var(--dsw-alias-state-warning-primary, #d29922)' : 'var(--dsw-alias-border-l2)')
      : 'var(--dsw-alias-border-l1)'
    var stateChip = p.state === 'pending' ? 'بانتظار قرارك' : p.state === 'accepted' ? 'مُنفَّذ' : p.state === 'rejected' ? 'مرفوض' : 'مُتراجَع عنه'
    c.innerHTML = '<div class="row" style="margin-top:0"><h3 style="margin:0;font-size:13px">' + esc(p.summary) + '</h3><span class="note">' + esc(stateChip) + '</span></div>' +
      '<p class="hint" style="margin:4px 0"><b>السبب:</b> ' + esc(p.rootCause) + '</p>' +
      '<p class="hint" style="margin:4px 0"><b>سينفذ:</b> ' + esc(p.action) + '</p>' +
      (p.requiresRestart ? '<p class="hint" style="margin:4px 0;color:var(--dsw-alias-state-warning-primary, #d29922)">تنبيه: يتطلب إعادة تشغيل هذا الخادم ليكتمل الأثر</p>' : '') +
      '<div class="row tight"></div>'
    var row = c.querySelector('.row.tight')
    if (p.state === 'pending') {
      var acc = document.createElement('button'); acc.className = 'btn primary'; acc.textContent = 'قبول وتنفيذ'
      var rej = document.createElement('button'); rej.className = 'btn danger'; rej.textContent = 'رفض'
      acc.addEventListener('click', function () { gdDecide(p.id, true) })
      rej.addEventListener('click', function () { gdDecide(p.id, false) })
      row.appendChild(acc); row.appendChild(rej)
    } else if (p.state === 'accepted' && p.undoable) {
      var un = document.createElement('button'); un.className = 'btn'; un.textContent = 'تراجع'
      un.addEventListener('click', function () { gdUndo(p.id) })
      row.appendChild(un)
    }
    wrap.appendChild(c)
  })
  q('#gdLogCard').style.display = s.log.length > 0 ? 'block' : 'none'
  q('#gdLog').textContent = s.log.map(function (l) { return l.ts + ' — ' + l.event }).join('\\n')
}
var rsTrialOk = false
function rsRender(s) {
  q('#rsStatus').textContent = s.running ? 'يعمل الآن…' : 'معطّل'
  q('#rsStatus').style.color = s.running ? 'var(--dsw-alias-state-success-primary, #2ea043)' : 'var(--dsw-alias-label-tertiary)'
  q('#rsStart').style.display = s.running ? 'none' : ''
  q('#rsStop').style.display = s.running ? '' : 'none'
  q('#rsApprove').style.display = rsTrialOk && !s.running ? '' : 'none'
  q('#rsProgress').textContent = s.goal !== ''
    ? 'الهدف: ' + s.goal + ' | تنزيلات هذه الجولة: ' + s.downloadsThisRun + '/' + s.maxDownloads
    : ''
  var tb = q('#rsTable tbody'); tb.innerHTML = ''
  q('#rsDownloadsCard').style.display = s.downloads.length > 0 ? 'block' : 'none'
  var kinds = { harvested: 0, 'skipped-risk': 0, 'skipped-done': 0, failed: 0, empty: 0 }
  s.downloads.forEach(function (d) {
    if (kinds[d.result] !== undefined) kinds[d.result]++
    var tr = document.createElement('tr')
    tr.innerHTML = '<td class="path">' + esc(d.provider + '/' + d.id) + '</td>' +
      '<td><span class="status ' + (d.result === 'harvested' ? 'completed' : d.result === 'failed' || d.result === 'skipped-risk' ? 'error' : '') + '">' +
      (d.result === 'harvested' ? 'اقتُطف' : d.result === 'skipped-risk' ? 'مرفوض أمنيًا' : d.result === 'skipped-done' ? 'منتهٍ سابقًا' : d.result === 'failed' ? 'فشل التنزيل' : 'بلا فائدة') + '</span></td>' +
      '<td class="path">' + esc(d.note || '—') + '</td>'
    tb.appendChild(tr)
  })
  q('#rsCounts').textContent = 'اقتُطف: ' + kinds.harvested + ' | مرفوض أمنيًا: ' + kinds['skipped-risk'] + ' | منتهٍ سابقًا: ' + kinds['skipped-done'] + ' | فشل: ' + kinds.failed + ' | بلا فائدة: ' + kinds.empty
  q('#rsVersionsCard').style.display = s.versions.length > 0 || s.approvals.length > 0 ? 'block' : 'none'
  var v = q('#rsVersions'); v.innerHTML = ''
  s.versions.forEach(function (ver) {
    var d = document.createElement('div')
    d.innerHTML = '<b>' + esc(ver.name) + '</b> — أصلية ✓ | ' + ver.files + ' ملفًا | ' + esc(ver.createdAt.slice(0, 16).replace('T', ' ')) +
      ' <button class="btn danger" style="padding:1px 8px;font-size:11px">حذف بأمري</button>'
    d.querySelector('button').addEventListener('click', function () { rsAction({ action: 'delete-version', name: ver.name }) })
    v.appendChild(d)
  })
  var ap = q('#rsApprovals'); ap.innerHTML = ''
  s.approvals.filter(function (a) { return a.state === 'pending' }).forEach(function (a) {
    var d = document.createElement('div')
    d.style.margin = '4px 0'
    d.innerHTML = '<b>قرار مطلوب:</b> ' + esc(a.question) + ' <button class="btn" style="padding:1px 8px;font-size:11px">نفّذ الحذف</button>'
    d.querySelector('button').addEventListener('click', function () { rsAction({ action: 'delete-version', name: a.question.match(/v\\d+/)?.[0] || '' }) })
    ap.appendChild(d)
  })
  q('#rsLogCard').style.display = s.log.length > 0 ? 'block' : 'none'
  q('#rsLog').textContent = s.log.map(function (l) { return l.ts + ' — ' + l.event }).join('\\n')
}
function rsLoad() {
  api('/tools/api/research', null, function (e, x) {
    if (e || x.s !== 200) return
    rsRender(x.j)
  })
}
function rsAction(body) {
  api('/tools/api/research', { method: 'POST', body: body }, function (e, x) {
    if (e || x.s !== 200) { toast('فشل: ' + ((x && x.j && x.j.error) || e), true); return }
    if (x.j.message !== undefined) toast(x.j.message, !x.j.ok)
    if (x.j.checks !== undefined) { toast((x.j.ok ? 'النسخة التجريبية سليمة ✓ — ' : 'النسخة التجريبية فيها إخفاقات — ') + x.j.checks.join(' · ').slice(0, 180), !x.j.ok); rsTrialOk = x.j.ok }
    if (x.j.state !== undefined) rsRender(x.j.state)
  })
}
q('#rsStart').addEventListener('click', function () {
  var g = q('#rsGoal').value.trim()
  if (g === '') { toast('اكتب هدف البحث أولًا', true); return }
  rsTrialOk = false
  rsAction({ action: 'start', goal: g })
})
q('#rsStop').addEventListener('click', function () { rsAction({ action: 'stop' }) })
q('#rsTrial').addEventListener('click', function () { rsAction({ action: 'trial' }) })
q('#rsApprove').addEventListener('click', function () { rsAction({ action: 'approve' }) })
q('#researchBtn').addEventListener('mouseenter', function () {
  var h = q('#researchHover'), b = q('#researchBtn')
  var r = b.getBoundingClientRect()
  h.style.display = 'block'
  h.style.left = (r.right + 10) + 'px'
  h.style.top = Math.max(8, r.top - 60) + 'px'
})
q('#researchBtn').addEventListener('mouseleave', function (e) {
  var h = q('#researchHover')
  if (e.relatedTarget === null || (e.relatedTarget && e.relatedTarget.id !== 'researchHover' && !h.contains(e.relatedTarget))) h.style.display = 'none'
})
q('#researchHover').addEventListener('mouseleave', function () { q('#researchHover').style.display = 'none' })
setInterval(function () { if (q('#rsStatus').textContent === 'يعمل الآن…') rsLoad() }, 10000)
var gdToastSeen = {};
function gdNotifyNew(state) {
  if (!state || !state.proposals) return;
  state.proposals.forEach(function (p) {
    if (p.state === 'pending' && !gdToastSeen[p.id]) {
      gdToastSeen[p.id] = true;
      toast('إشعار الوصي: ' + (p.summary || '').slice(0, 90) + ' — القرار بيدك في لوحة وكيل الصيانة', p.severity === 'critical');
    }
  });
}
function loadGuardian() {
  api('/tools/api/guardian', null, function (e, x) {
    if (e || x.s !== 200) return
    gdRender(x.j)
  })
}
function gdDecide(id, accept) {
  api('/tools/api/guardian', { method: 'POST', body: { action: 'decide', id: id, accept: accept } }, function (e, x) {
    if (e || x.s !== 200) { toast('فشل تنفيذ القرار', true); return }
    if (x.j.message !== undefined) toast(x.j.message, !x.j.ok)
    if (x.j.state !== undefined) gdRender(x.j.state)
  })
}
function gdUndo(id) {
  api('/tools/api/guardian', { method: 'POST', body: { action: 'undo', id: id } }, function (e, x) {
    if (e || x.s !== 200) { toast('فشل التراجع', true); return }
    toast(x.j.message || 'تم', !x.j.ok)
    if (x.j.state !== undefined) gdRender(x.j.state)
  })
}
/* ---- عقل الوصي: سجل نماذج التشخيص (مفاتيح مقنعة، حفظ تلقائي) ---- */
function gdmMasked(k) { return k && k.length > 6 ? '••••' + k.slice(-4) : '••••' }
function gdmLoad() {
  api('/tools/api/guardian/models', {}, function (e, x) {
    if (e || !x.j) return;
    var sel = q('#gdmSel'); if (!sel) return;
    var ms = x.j.models || [];
    sel.innerHTML = '<option value="">— بلا نموذج (تشخيص بالأنماط فقط) —</option>';
    ms.forEach(function (m) {
      var o = document.createElement('option');
      o.value = m.id; o.textContent = m.name + ' · ' + m.provider + (x.j.activeId === m.id ? ' ✓' : '');
      sel.appendChild(o);
    });
    sel.value = x.j.activeId || '';
    q('#gdmStatus').textContent = ms.length ? (ms.length + ' نموذج محفوظ — المفاتيح مقنعة') : 'لا نماذج بعد';
  });
}
function gdmNotice(msg) {
  var s = q('#gdmStatus'); if (s) { s.textContent = msg; s.style.color = ''; }
  var gs = q('#gdStatus'); if (gs) gs.textContent = msg;
}
q('#gdmAddBtn').addEventListener('click', function () {
  var name = q('#gdmName').value.trim(), provider = q('#gdmProvider').value.trim();
  var model = q('#gdmModel').value.trim(), url = q('#gdmUrl').value.trim(), key = q('#gdmKey').value.trim();
  if (!name || !provider || !model || !url || !key) { gdmNotice('أكمل كل الحقول (الاسم/المزوّد/المعرّف/الرابط/المفتاح)'); return; }
  gdmNotice('جارٍ الحفظ واختبار الاتصال بـ' + name + ' …');
  api('/tools/api/guardian/models', { method: 'POST', body: { action: 'add', name: name, provider: provider, model: model, baseUrl: url, apiKey: key } }, function (e, x) {
    if (e || x.s !== 200) { gdmNotice('تعذّر الحفظ' + (x.j && x.j.error ? ' — ' + x.j.error : '')); return; }
    var t = x.j.test || {};
    gdmNotice(t.ok ? ('سيتم تفعيل النموذج «' + name + '» @ ' + provider + ' — الاتصال سليم ✓ (' + t.ms + 'ms)') : ('حُفظ «' + name + '» لكن اختبار الاتصال فشل: ' + (t.detail || '').slice(0, 90)));
    q('#gdmKey').value = '';
    gdmLoad();
  });
});
q('#gdmTestBtn').addEventListener('click', function () {
  var id = q('#gdmSel').value;
  if (!id) { gdmNotice('اختر نموذجاً أولاً'); return; }
  gdmNotice('جارٍ اختبار الاتصال…');
  api('/tools/api/guardian/models', { method: 'POST', body: { action: 'test', id: id } }, function (e, x) {
    if (e || x.s !== 200) { gdmNotice('تعذر الاختبار'); return; }
    var t = x.j.test || {};
    var name = (x.j.name || '') + ' @ ' + (x.j.provider || '');
    gdmNotice(t.ok ? (name + ' يعمل ✓ (' + t.ms + 'ms) — الوصي سيعلن اسمه في كل تنبيه') : (name + ' فشل الاتصال: ' + (t.detail || '').slice(0, 90)));
  });
});
q('#gdmDelBtn').addEventListener('click', function () {
  var id = q('#gdmSel').value;
  if (!id) { gdmNotice('اختر نموذجاً للحذف'); return; }
  api('/tools/api/guardian/models', { method: 'POST', body: { action: 'delete', id: id } }, function () { gdmNotice('حُذف النموذج'); gdmLoad(); });
});
q('#gdmSel').addEventListener('change', function () {
  var id = this.value;
  if (!id) return;
  api('/tools/api/guardian/models', { method: 'POST', body: { action: 'select', id: id } }, function (e, x) {
    if (e || x.s !== 200) return;
    var t = x.j.test || {};
    gdmNotice(t.ok ? ('تم تفعيل «' + (x.j.name || '') + '» ✓ متصل (' + t.ms + 'ms) — سيظهر اسمه داخل كل تنبيه') : ('فُعّل «' + (x.j.name || '') + '» لكن الاتصال فشل: ' + (t.detail || '').slice(0, 80)));
    gdmLoad();
  });
});
gdmLoad();

q('#gdSave').addEventListener('click', function () {
  api('/tools/api/guardian', { method: 'POST', body: { enabled: q('#gdEnabled').checked, intervalMin: Number(q('#gdInterval').value) } }, function (e, x) {
    if (e || x.s !== 200) { toast('فشل الحفظ', true); return }
    toast('حُفظت إعدادات وكيل الصيانة ✓')
    gdRender(x.j.state)
  })
})
q('#gdScan').addEventListener('click', function () {
  api('/tools/api/guardian', { method: 'POST', body: { action: 'scan-now' } }, function (e, x) {
    if (e || x.s !== 200) { toast('فشل الفحص', true); return }
    gdRender(x.j.state)
    toast('اكتمل الفحص الفوري')
  })
})
q('#guardianBtn').addEventListener('mouseenter', function () {
  var h = q('#guardianHover'), b = q('#guardianBtn')
  var r = b.getBoundingClientRect()
  h.style.display = 'block'
  h.style.left = (r.right + 10) + 'px'
  h.style.top = Math.max(8, r.top - 40) + 'px'
})
q('#guardianBtn').addEventListener('mouseleave', function (e) {
  var h = q('#guardianHover')
  if (e.relatedTarget === null || (e.relatedTarget && e.relatedTarget.id !== 'guardianHover' && !h.contains(e.relatedTarget))) h.style.display = 'none'
})
q('#guardianHover').addEventListener('mouseleave', function () { q('#guardianHover').style.display = 'none' })
setInterval(loadGuardian, 30000)
function loadImgGen() {
  api('/tools/api/imggen/settings', null, function (e, x) {
    if (e || x.s !== 200) return
    q('#igUrl').value = x.j.baseUrl; q('#igModel').value = x.j.model
    q('#igStatus').textContent = x.j.keyPresent ? 'مهيأ — ' + x.j.keyMasked : 'بلا مفتاح (سيعمل الوكيل بخيارَي الإرفاق/المباشر ويذكّرك)'
    q('#igStatus').style.color = x.j.keyPresent ? 'var(--dsw-alias-state-success-primary, #2ea043)' : 'var(--dsw-alias-state-warning-primary, #d29922)'
  })
}
q('#igSave').addEventListener('click', function () {
  api('/tools/api/imggen/settings', { method: 'POST', body: { baseUrl: q('#igUrl').value.trim() || undefined, model: q('#igModel').value.trim() || undefined, key: q('#igKey').value.trim() } }, function (e, x) {
    if (e || x.s !== 200) { toast('فشل الحفظ: ' + ((x && x.j && x.j.error) || e), true); return }
    q('#igKey').value = ''
    toast('حُفظت إعدادات توليد الصور ✓')
    loadImgGen()
  })
})
q('#igTest').addEventListener('click', function () {
  var r = q('#igResult'); r.textContent = '…يجري الاختبار'
  api('/tools/api/imggen/key/test', { method: 'POST', body: {} }, function (e, x) {
    if (e || x.s !== 200) { r.textContent = 'فشل: ' + ((x && x.j && x.j.error) || e); return }
    r.textContent = x.j.message
    r.style.color = x.j.valid ? 'var(--dsw-alias-state-success-primary, #2ea043)' : 'var(--dsw-alias-state-error-primary)'
  })
})
function loadTripoKey() {
  api('/tools/api/tripo/key', null, function (e, x) {
    if (e || x.s !== 200) { q('#tripoKeyStatus').textContent = '؟'; return }
    var st = x.j;
    q('#tripoKeyStatus').textContent = st.present
      ? (st.source === 'env' ? 'موجود ومفعّل — ' + st.masked + ' (بيئة التشغيل)' : 'محفوظ على الجهاز — ' + st.masked)
      : 'لا يوجد مفتاح — الصقه أدناه واحفظه';
    q('#tripoKeyStatus').style.color = st.present ? 'var(--dsw-alias-state-success-primary, #2ea043)' : 'var(--dsw-alias-state-error-primary)';
  });
}
q('#tripoKeySave').addEventListener('click', function () {
  var v = q('#tripoKeyInput').value.trim();
  if (v === '') { toast('الصق المفتاح أولاً', true); return }
  api('/tools/api/tripo/key', { method: 'POST', body: { key: v } }, function (e, x) {
    if (e || x.s !== 200) { toast('فشل الحفظ: ' + ((x && x.j && x.j.error) || e), true); return }
    q('#tripoKeyInput').value = '';
    toast('حُفظ المفتاح وتفعّل فوراً ✓');
    loadTripoKey();
  });
});
q('#tripoKeyTest').addEventListener('click', function () {
  var r = q('#tripoKeyResult');
  r.textContent = '…يجري الاختبار';
  var body = q('#tripoKeyInput').value.trim() !== '' ? { key: q('#tripoKeyInput').value.trim() } : {};
  api('/tools/api/tripo/key/test', { method: 'POST', body: body }, function (e, x) {
    if (e || x.s !== 200) { r.textContent = 'فشل: ' + ((x && x.j && (x.j.error || x.j.message)) || e); r.style.color = 'var(--dsw-alias-state-error-primary)'; return }
    r.textContent = x.j.message + (x.j.balance !== undefined ? ' | الرصيد: ' + JSON.stringify(x.j.balance) : '');
    r.style.color = x.j.valid ? 'var(--dsw-alias-state-success-primary, #2ea043)' : 'var(--dsw-alias-state-error-primary)';
    loadTripoKey();
  });
});
q('#tripoKeyShow').addEventListener('click', function () {
  var inp = q('#tripoKeyInput');
  var show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  q('#tripoKeyShow').textContent = show ? 'إخفاء' : 'إظهار';
});
function loadTripo() {
  api('/tools/api/tripo/plan?ws=' + encodeURIComponent(ws), null, function (e, x) {
    if (e || x.s !== 200) return;
    var plan = x.j.plan;
    var wrap = q('#tripoPlanWrap');
    if (!plan) { wrap.style.display = 'none'; q('#tripoMeta').textContent = 'لا خطة بعد'; return; }
    wrap.style.display = 'block';
    q('#tripoMeta').textContent = plan.game + ' — ' + plan.assets.filter(function (a) { return a.status === 'done'; }).length + '/' + plan.assets.length + ' (السقف ' + plan.count + ')';
    q('#tripoBible').textContent = plan.styleBible;
    var tb = q('#tripoTable tbody'); tb.innerHTML = '';
    plan.assets.forEach(function (a) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + esc(a.name) + '</td><td><span class="status ' + (a.status === 'done' ? 'completed' : a.status === 'failed' ? 'error' : a.status === 'generating' ? 'running' : '') + '">' + a.status + '</span></td><td class="path">' + esc(a.file || '—') + '</td>' +
        '<td>' + (a.status !== 'done' && a.file === undefined ? '<button class="btn">توليد</button>' : (a.file ? '<button class="btn">عرض</button>' : '')) + '</td>';
      var btn = tr.querySelector('button');
      if (btn) btn.addEventListener('click', function () {
        if (a.file) { viewGlb(a.file); return; }
        toast('…يجري التوليد عبر الخادم (يتطلب TRIPO_API_KEY)');
        api('/tools/api/tripo/generate?ws=' + encodeURIComponent(ws), { method: 'POST', body: { name: a.name } }, function (e2, x2) {
          toast(e2 || x2.s !== 200 ? 'فشل: ' + ((x2 && x2.j && (x2.j.error || x2.j.message)) || e2) : 'تم توليد ' + a.name, !!e2 || x2.s !== 200);
          loadTripo(); refreshGlbList();
        });
      });
      tb.appendChild(tr);
    });
  });
  refreshGlbList();
}
function loadCap() {
  api('/tools/api/tripo/settings?ws=' + encodeURIComponent(ws), null, function (e, x) {
    if (e || x.s !== 200) return;
    q('#capHard').value = x.j.hardCap === null ? '' : x.j.hardCap;
  });
}
q('#capSave').addEventListener('click', function () {
  api('/tools/api/tripo/settings?ws=' + encodeURIComponent(ws), { method: 'POST', body: { hardCap: q('#capHard').value === '' ? null : Number(q('#capHard').value) } }, function (e, x) {
    toast(e || x.s !== 200 ? 'فشل تثبيت السقف' : 'ثُبّت السقف الإجباري ✓', !!e || x.s !== 200);
  });
});
q('#tripoRefresh').addEventListener('click', loadTripo);
loadCap();
q('#tripoPlanBtn').addEventListener('click', function () {
  var count = q('#tripoCount').value;
  var assets = [];
  for (var i = 0; i < Math.min(3, Number(count)); i++) assets.push({ name: 'asset-' + (i + 1), prompt: 'عنصر نموذجي ' + (i + 1) + ' بأسلوب اللعبة' });
  api('/tools/api/tripo/plan?ws=' + encodeURIComponent(ws), { method: 'POST', body: {
    game: 'لعبة اختبار', styleBible: 'أسلوب موحد للاختبار: ألوان دافئة، طابع كرتوني بسيط.',
    count: Number(count), assets: assets,
  } }, function (e, x) {
    toast(e || x.s !== 200 ? 'فشل: ' + ((x && x.j && x.j.error) || e) : 'خزّنت خطة اختبار بـ ' + count + ' سقفاً', !!e || x.s !== 200);
    loadTripo();
  });
});

function refreshGlbList() {
  api('/tools/api/files/tree?ws=' + encodeURIComponent(ws), null, function (e, x) {
    if (e || x.s !== 200) return;
    var sel = q('#glbSel'); sel.innerHTML = '';
    var files = [];
    (function walk(n) { (n.children || []).forEach(function (c) { if (c.type === 'file' && /\\.glb$/.test(c.name)) files.push(c.path); else if (c.type === 'dir') walk(c); }); })(x.j.tree);
    if (!files.length) { var o = document.createElement('option'); o.textContent = 'لا نماذج بعد — أولّد أصولاً أولاً'; o.value = ''; sel.appendChild(o); return; }
    files.forEach(function (f) { var o = document.createElement('option'); o.value = f; o.textContent = f; sel.appendChild(o); });
  });
}

function glbDispose(root) {
  root.traverse(function (o) {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      var ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach(function (m) {
        for (var k in m) { if (m[k] && m[k].isTexture) m[k].dispose(); }
        m.dispose();
      });
    }
  });
}
function glbClear() {
  if (glbViewer && glbViewer.state && glbViewer.state.model) {
    glbViewer.scene.remove(glbViewer.state.model);
    glbDispose(glbViewer.state.model);
    glbViewer.state.model = null;
  }
}
var glbViewer = null;
async function viewGlb(relPath) {
  var canvas = q('#glbCanvas');
  try {
    if (glbViewer === null) {
      var THREE = await import('/tools/assets/three/three.module.js');
      var GLTF = await import('/tools/assets/three/examples/jsm/loaders/GLTFLoader.js');
      var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
      renderer.setClearColor(0x0d0e12, 1);
      var scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.4));
      var dir = new THREE.DirectionalLight(0xffffff, 1.6); dir.position.set(3, 5, 2); scene.add(dir);
      var camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 200);
      camera.position.set(0, 1.2, 4);
      var state = { rotY: 0.6, rotX: 0.2, dist: 4, model: null, THREE: THREE };
      function frame() {
        if (state.model) {
          var r = 1.2;
          camera.position.set(Math.sin(state.rotY) * Math.cos(state.rotX) * state.dist, Math.sin(state.rotX) * state.dist + 0.8, Math.cos(state.rotY) * Math.cos(state.rotX) * state.dist);
          camera.lookAt(0, 0.5, 0);
          void r;
        }
        renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
        renderer.render(scene, camera);
        requestAnimationFrame(frame);
      }
      frame();
      var drag = null;
      canvas.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY }; });
      window.addEventListener('pointermove', function (e) {
        if (!drag) return;
        state.rotY += (e.clientX - drag.x) * 0.01;
        state.rotX = Math.max(-1.2, Math.min(1.2, state.rotX + (e.clientY - drag.y) * 0.01));
        drag = { x: e.clientX, y: e.clientY };
      });
      window.addEventListener('pointerup', function () { drag = null; });
      canvas.addEventListener('wheel', function (e) { e.preventDefault(); state.dist = Math.max(1, Math.min(15, state.dist + e.deltaY * 0.01)); }, { passive: false });
      glbViewer = { state: state, scene: scene, loader: new GLTF.GLTFLoader() };
    }
    glbViewer.state.loadSeq = (glbViewer.state.loadSeq || 0) + 1;
    var mySeq = glbViewer.state.loadSeq;
    glbClear();
    var url = '/tools/preview?ws=' + encodeURIComponent(ws) + '&p=' + encodeURIComponent(relPath);
    glbViewer.loader.load(url, function (gltf) {
      if (mySeq !== glbViewer.state.loadSeq) { glbDispose(gltf.scene); return; }
      glbClear();
      glbViewer.state.model = gltf.scene;
      glbViewer.scene.add(gltf.scene);
      toast('عُرض النموذج: ' + relPath);
    }, undefined, function () { if (mySeq === glbViewer.state.loadSeq) toast('تعذر تحميل النموذج', true); });
  } catch (err) {
    toast('تعذر تحميل مكتبة العرض — أعد المحاولة', true);
  }
}
q('#glbLoadBtn').addEventListener('click', function () {
  var v = q('#glbSel').value;
  if (v) viewGlb(v);
});


/* ---- auto-continue ---- */
function acRender() {
  api('/tools/api/auto-continue?ws=' + encodeURIComponent(ws), null, function (e, x) {
    if (e || x.s !== 200) return;
    var s = x.j;
    q('#acEnabled').checked = !!s.enabled;
    q('#acRetries').value = s.retries;
    q('#acMinutes').value = s.minutes;
    var st = { idle: 'خامل', waiting: 'بانتظار تجدد الحدود', fired: 'استؤنف تلقائياً', exhausted: 'انتهت المحاولات', disabled: 'معطّل' };
    q('#acStatus').textContent = (st[s.status] || s.status) + (s.model ? ' — ' + s.model : '') + (s.lastMessage ? ' | ' + s.lastMessage : '') + ' | ' + s.used + '/' + s.retries;
    if (s.remainingMs !== null && s.remainingMs !== undefined && s.status === 'waiting') {
      var m2 = Math.floor(s.remainingMs / 60000), sec = Math.floor((s.remainingMs % 60000) / 1000);
      q('#acCountdown').textContent = String(m2).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
      q('#acCancel').style.display = '';
    } else {
      q('#acCountdown').textContent = '';
      q('#acCancel').style.display = 'none';
    }
  });
}
q('#acSave').addEventListener('click', function () {
  api('/tools/api/auto-continue?ws=' + encodeURIComponent(ws), { method: 'POST', body: {
    enabled: q('#acEnabled').checked,
    retries: Number(q('#acRetries').value) || 1,
    minutes: Number(q('#acMinutes').value) || 60,
  } }, function (e, x) { toast(e || x.s !== 200 ? 'فشل الحفظ' : 'حُفظ إعداد الاستئناف', !!e || x.s !== 200); acRender(); });
});
q('#acCancel').addEventListener('click', function () {
  api('/tools/api/auto-continue?ws=' + encodeURIComponent(ws), { method: 'POST', body: { action: 'cancel' } }, function () { acRender(); });
});
setInterval(acRender, 5000);

/* ---- generated images gallery ---- */
function loadGenImages() {
  api('/tools/api/generated-images?ws=' + encodeURIComponent(ws), null, function (e, x) {
    if (e || x.s !== 200) return;
    var wrap = q('#genImages'); wrap.innerHTML = '';
    (x.j.images || []).forEach(function (img) {
      var a = document.createElement('a');
      a.href = '/tools/preview?ws=' + encodeURIComponent(ws) + '&p=' + encodeURIComponent(img);
      a.target = '_blank'; a.title = img;
      a.style.cssText = 'display:block;width:86px;height:86px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden';
      var im = document.createElement('img');
      im.src = a.href; im.style.cssText = 'width:100%;height:100%;object-fit:cover';
      a.appendChild(im); wrap.appendChild(a);
    });
    if (!(x.j.images || []).length) wrap.innerHTML = '<span class="note">لا صور بعد — ستظهر هنا تلقائياً</span>';
  });
}

q('#gStatus').addEventListener('click', function () {
  api('/tools/api/git/status?ws=' + encodeURIComponent(ws), null, function (e, x) { q('#gOut').textContent = (x && x.j && x.j.result) || String(e); });
});
q('#gDiff').addEventListener('click', function () {
  api('/tools/api/git/diff?ws=' + encodeURIComponent(ws), null, function (e, x) { q('#gOut').textContent = (x && x.j && x.j.result) || String(e); });
});
q('#gCommit').addEventListener('click', function () {
  var msg = q('#gMsg').value.trim(); if (!msg) { toast('اكتب رسالة الالتزام', true); return; }
  api('/tools/api/git/commit?ws=' + encodeURIComponent(ws), { method: 'POST', body: { message: msg } }, function (e, x) {
    q('#gOut').textContent = (x && x.j && x.j.result) || String(e); q('#gMsg').value = '';
  });
});

/* ---- مجلدات الأصول الجاهزة ---- */
function fmtMB(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1024).toFixed(0) + ' KB' }
function loadAssets() {
  api('/tools/api/assets/paths', {}, function (e, x) {
    if (e || !x.j) return;
    var scans = x.j.scans || [];
    var wrap = q('#assetsList'); if (!wrap) return;
    var html = '';
    scans.forEach(function (s) {
      html += '<div class="row tight" style="border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:6px 10px">'
        + '<span style="direction:ltr;font-family:var(--ds-font-family-code);font-size:12px">' + esc(s.path) + (s.embedded ? ' ⭐' : '') + '</span>'
        + '<span class="note">مجسمات: ' + s.models + ' · صور: ' + s.images + ' · ' + fmtMB(s.total_bytes) + '</span>';
      var shown = (s.files || []).slice(0, 12);
      if (shown.length) {
        html += '<details style="width:100%"><summary class="note" style="cursor:pointer">أول ' + shown.length + ' ملفاً (انقر للعرض)</summary><div style="max-height:180px;overflow:auto">';
        shown.forEach(function (f) {
          html += '<div class="row tight"><span class="note" style="direction:ltr">' + esc(f.rel) + ' (' + fmtMB(f.size) + ')</span>'
            + '<button class="btn" style="padding:1px 8px;font-size:11px" data-copy="' + encodeURIComponent(f.abs) + '">نسخ</button></div>';
        });
        html += '</div></details>';
      }
      if (!s.embedded) html += '<button class="btn" style="padding:1px 8px;font-size:11px" data-rm="' + encodeURIComponent(s.path) + '">إزالة</button>';
      html += '</div>';
    });
    wrap.innerHTML = html || '<span class="note">لا مجلدات بعد</span>';
    q('#assetsMeta').textContent = scans.length ? (scans.length + ' مجلد/ات') : '';
  });
}
document.addEventListener('click', function (ev) {
  var t = ev.target;
  if (!(t instanceof Element)) return;
  var cp = t.closest('[data-copy]');
  if (cp) { navigator.clipboard.writeText(decodeURIComponent(cp.getAttribute('data-copy'))); toast('نُسخ المسار'); return; }
  var rm = t.closest('[data-rm]');
  if (rm) {
    api('/tools/api/assets/paths', { method: 'POST', body: { remove: true, path: decodeURIComponent(rm.getAttribute('data-rm')) } }, function () { loadAssets(); });
  }
});
q('#assetsAddBtn').addEventListener('click', function () {
  var v = q('#assetsPathInput').value.trim();
  if (!v) { toast('أدخل مسار مجلد أولاً', true); return; }
  api('/tools/api/assets/paths', { method: 'POST', body: { path: v } }, function (e, x) {
    if (e || x.s !== 200) { toast('تعذّر: ' + (x.j && x.j.error ? x.j.error : v), true); return; }
    toast('أُضيف المجلد ✓'); q('#assetsPathInput').value = ''; loadAssets();
  });
});

/* ---- محركات المعالجة: حالة Blender/Godot + تنزيل خلفي ---- */
function loadEngines() {
  api('/tools/api/engines/status', {}, function (e, x) {
    if (e || !x.j) return;
    var b = x.j.blender || {}, g = x.j.godot || {}, job = x.j.job;
    var bs = q('#blenderState'), gs = q('#godotState');
    if (bs) {
      bs.textContent = b.installed ? ('مثبت — ' + (b.version || 'إصدار غير معروف')) : 'غير مثبت';
      bs.style.color = b.installed ? 'var(--dsw-alias-state-success-primary, #2ea043)' : '';
      q('#blenderDl').style.display = b.installed ? 'none' : '';
    }
    if (gs) {
      gs.textContent = g.installed ? 'مثبت' : 'غير مثبت';
      gs.style.color = g.installed ? 'var(--dsw-alias-state-success-primary, #2ea043)' : '';
      q('#godotDl').style.display = g.installed ? 'none' : '';
    }
    var jobEl = q('#enginesJob');
    if (job && jobEl) {
      if (job.phase === 'downloading') jobEl.textContent = 'قيد التنزيل بالخلفية: ' + job.engine + ' …';
      else if (job.phase === 'error') jobEl.textContent = 'فشل التنزيل — ' + (job.error || 'سبب غير معروف');
      else if (job.phase === 'done') jobEl.textContent = 'اكتمل تنزيل ' + job.engine + ' ✓';
    }
  });
}
function engineDownload(engine) {
  api('/tools/api/engines/download', { method: 'POST', body: { engine: engine } }, function (e, x) {
    if (e || !x.j || x.s !== 200) { toast('تعذر بدء التنزيل' + (x.j && x.j.error ? ' — ' + x.j.error : ''), true); return; }
    if (x.j.alreadyInstalled) { toast(engine + ' مثبت مسبقاً'); loadEngines(); return; }
    toast('بدأ تنزيل ' + engine + ' — يعمل بالخلفية وسنخبرك عند الاكتمال');
    var iv = setInterval(function () {
      api('/tools/api/engines/status', {}, function (e2, s) {
        if (e2 || !s.j || !s.j.job || s.j.job.phase !== 'downloading') { clearInterval(iv); loadEngines(); }
      });
    }, 4000);
  });
}
q('#blenderDl').addEventListener('click', function () { engineDownload('blender') });
q('#godotDl').addEventListener('click', function () { engineDownload('godot') });
setInterval(loadEngines, 30000);

q('#openProjBtn').addEventListener('click', function () {
  var p = prompt('مسار مجلد المشروع (كامل):', '');
  if (!p) return;
  api('/tools/api/workspaces/add', { method: 'POST', body: { path: p.trim() } }, function (e, x) {
    if (e || x.s !== 200) { toast('فشل: ' + ((x && x.j && x.j.error) || e), true); return; }
    WS = (x.j && x.j.workspaces) || WS;
    ws = p.trim(); localStorage.setItem('toolsWs', ws);
    fillWs(); q('#wsPath').textContent = ws; refreshAll();
    toast('تم فتح المشروع');
  });
});

q('#zipBtn').addEventListener('click', function () {
  if (!ws) { toast('اختر مساحة عمل', true); return; }
  window.open('/tools/zip?ws=' + encodeURIComponent(ws), '_blank');
});

function openModal(title, html) { q('#modalTitle').textContent = title; q('#modalBody').innerHTML = html; q('#modalBg').classList.add('on'); }
q('#modalClose').addEventListener('click', function () { q('#modalBg').classList.remove('on'); });
q('#modalBg').addEventListener('click', function (e) { if (e.target === this) this.classList.remove('on'); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') q('#modalBg').classList.remove('on'); });

function refreshAll() { loadHealth(); }
/* ===== كتيب تعليمات 3D: برومتات تخيلية لعملاء افتراضيين ===== */
var GUIDE_DATA = {
  ar: {
    title: 'كتيب تعليمات 3D', sub: 'خمسة عملاء افتراضيين — انظر كيف يتحول طلب عام إلى برومبت احترافي كامل قبل أن تطلبه من الوكيل',
    req: 'طلب العميل', why: 'لماذا ينجح هذا البرومبت', copy: 'نسخ البرومبت', copied: 'نُسخ البرومبت ✓',
    f_game: 'اللعبة', f_bible: 'الأسلوب الموحد', f_count: 'العدد المقترح', f_assets: 'أمثلة أصول', f_note: 'قاعدة التكرار والواقعية', sep: '، ',
    examples: [
      { t: 'عميل 1: لعبة سيارات — سباق شوارع', c: '«أبغى لعبة سيارات درفت ليلية بأضواء نيون ومطارات، سيارات يابانية معدلة»',
        game: 'سباق شوارع ليلي بأسلوب الدريفت في حارات يابانية مضاءة',
        bible: 'واقعية ليلية: أسفلت مبلل عاكس، نيون بنفسجي وسماوي، سيارات يابانية معدلة من التسعينات، دخان إطارات',
        count: '20', assets: ['سيارة_رياضية_يابانية', 'سيارة_كلاسيك_معدلة', 'حاجز_إسمنتي', 'إشارة_مرور', 'عمود_نيون', 'إطار_متهالك', 'منصة_بداية', 'لوحة_محل_مضيئة'],
        note: 'السيارات تتكرر بألوان مختلفة للمباريات والحواجز تتكرر طبيعياً — منصة البداية فريدة لا تتكرر',
        w: ['الأسلوب الموحد يُلزم كل مجسم بنفس العالم البصري قبل أي توليد', 'أسماء محددة ووصف ملموس لكل أصل بدل كلمة عامة مثل «سيارات»', 'بيان ما يتكرر وما لا يتكرر يمنع تناسخ العناصر الفريدة'] },
      { t: 'عميل 2: لعبة مزرعة — حصاد ودواجن', c: '«لعبة مزرعة هادئة أزرع وأحلب وأبيع في سوق صغير»',
        game: 'مزرعة ريفية نهارية دافئة: زراعة وتربية دواجن وبيع في سوق قريب',
        bible: 'كرتوني low-poly دافئ بألوان مشبعة ناعمة، طابع ودود مريح، إضاءة نهارية ناعمة',
        count: '15', assets: ['بيت_مزرعة', 'حقل_قمح', 'دجاجة', 'بقرة', 'خروف', 'بئر_ماء', 'عربة_قش', 'شجرة_تفاح', 'كشك_سوق_خشبي'],
        note: 'الدواجن تتكرر عند الشراء والبيت والسوق عنصران فريدان — التكرار بمنطق اللعب لا عشوائياً',
        w: ['العدد 15 مناسب لنطاق لعبة صغيرة — لا تطلب 50 مجسماً للعبة بسيطة', 'كل أصل له دور في اللعب (بيض/حليب/قمح) لا مجرد ديكور', 'الطابع الودود المتسق يجعل النتيجة النهائية عالماً واحداً لا خليطاً'] },
      { t: 'عميل 3: لعبة طائرة حربية — اشتباك جوي', c: '«لعبة طائرات حربية قتال جوي فوق البحر بصواريخ ورادارات»',
        game: 'اشتباك جوي فوق جزر وأسطول بحري: مراوغة وصواريخ وإنذار رادار',
        bible: 'شبه واقعي عسكري: معدن عاكس مصقول، سماء غروب برتقالية تتحول رمادية، شارات تنكتيكية',
        count: '20', assets: ['مقاتلة_نفاثة', 'حاملة_طائرات', 'مدمرة_عسكرية', 'رادار_دوار', 'صاروخ_جوي', 'برج_مراقبة_بحري', 'جزيرة_صخرية', 'سحابة_دخان'],
        note: 'نموذجان للمقاتلة (صديقة/معادية) والسفن تتكرر كأسطول — الحاملة فريدة كمشهد مركزي',
        w: ['وصف المادة والإضاءة في الأسلوب يجعل المعدن يبدو معدناً فعلاً', 'تحديد البطل والمشهد المركزي (الحاملة) يوجه توزيع الميزانية', 'فصل نموذج العدو عن الصديق يمنع تكراراً مربكاً بصرياً'] },
      { t: 'عميل 4: لعبة رعب صعبة — نجاة بقرية مهجورة', c: '«لعبة رعب صعبة مثل رزدنت إيفل: قرية قديمة ليلاً وزومبي وأسلحة نادرة»',
        game: 'نجاة ورعب بقرية أوروبية قديمة مهجورة ليلاً: ذخيرة شحيحة وأعداء قرويون متحولون',
        bible: 'رعب واقعي: حجر قديم متآكل، ضباب كثيف يحد الرؤية، قمر أزرق باهت، فوانيس برتقالية متقادمة، خامات PBR داكنة',
        count: '25', assets: ['كنيسة_متداعية', 'منزل_حجري_مهجور', 'زومبي_قروي_ضخم', 'زومبي_نحيل_سريع', 'ماغنوم', 'قناصة', 'فانوس_معلق', 'بوابة_حديدية_صدئة', 'شاهد_قبر'],
        note: 'أنواع الزومبي الثلاثة تتكرر كأعداء بمبرر واضح — الكنيسة والبوابة فريدان كمعالم',
        w: ['لعبة الرعب تحتاج عدداً أكبر (25) لتنويع البيئة والأعداء والأسلحة معاً', 'الإضاءة جزء من الأسلوب هنا: الضباب والقمر يصنعان الرعب قبل المجسمات', 'شح الذخيرة قرارات لعب تُذكر في البرومبت لا تُترك لاحقاً'] },
      { t: 'عميل 5: لعبة صعبة — حصار قلعة', c: '«لعبة صعبة أدافع فيها عن قلعتي ضد موجات الغزاة بمنجنيق وسلالم»',
        game: 'دفاع استراتيجي صعب عن قلعة ضد موجات محاصِرين: منجنيق وسلالم وأبراج رماية',
        bible: 'قرون وسطى واقعية: حجر رمادي بداكن، أخضر حقول باهت، رايات حمراء بالية، طقس مغبر',
        count: '20', assets: ['قلعة_حجرية_كبيرة', 'برج_رماية', 'منجنيق', 'محاصر_بدرع_كامل', 'حصان_مدرع', 'سلم_حصار_خشبي', 'راية_حمراء_بالية', 'عربة_حطب_مشتعل'],
        note: 'المحاصرون يتكررون كموجات (أساس اللعب) — القلعة فريدة والمنجنيق اثنان كحد أقصى',
        w: ['«موجات أعداء» تحدد مسبقاً أي العناصر ستتكرر برمجياً وبأي مبرر', 'الطقس والغبار في الأسلوب يخدم صعوبة اللعبة ورؤيتها المحدودة', 'تحديد سقف التكرار (منجنيق اثنان) يمنع ازدحاماً غير واقعي'] }
    ]
  },
  en: {
    title: '3D Prompt Guide', sub: 'Five imaginary clients — watch a vague request become a full professional prompt before you ask the agent',
    req: 'Client request', why: 'Why this prompt works', copy: 'Copy prompt', copied: 'Prompt copied ✓',
    f_game: 'Game', f_bible: 'Unified style bible', f_count: 'Suggested count', f_assets: 'Sample assets', f_note: 'Repetition & realism rule', sep: ', ',
    examples: [
      { t: 'Client 1: Car game — street racing', c: '"I want a night drift racing game with neon lights and tuned Japanese cars"',
        game: 'Nighttime street-drift racing through neon-lit Japanese alleys',
        bible: 'Night realism: reflective wet asphalt, violet/cyan neon, 90s tuned Japanese cars, tire smoke',
        count: '20', assets: ['japanese_sports_car', 'tuned_classic_car', 'concrete_barrier', 'traffic_light', 'neon_pole', 'worn_tire', 'start_podium', 'lit_shop_sign'],
        note: 'Cars repeat with different colors for races and barriers repeat naturally — the start podium is unique',
        w: ['One style bible locks every asset into the same visual world before generation', 'Concrete named assets beat a generic word like "cars"', 'Stating what repeats and what is unique prevents cloned landmarks'] },
      { t: 'Client 2: Farm game — harvest & fowl', c: '"A calm farm game where I plant, milk, and sell at a small market"',
        game: 'Warm daytime rural farm: cropping, raising fowl, and selling at a nearby market',
        bible: 'Friendly low-poly cartoon with soft saturated colors, cozy mood, gentle daylight',
        count: '15', assets: ['farmhouse', 'wheat_field', 'chicken', 'cow', 'sheep', 'water_well', 'hay_cart', 'apple_tree', 'wooden_market_stall'],
        note: 'Fowl repeat when purchased; the house and market are unique — repetition follows gameplay logic',
        w: ['15 fits a small game — do not request 50 assets for a simple scope', 'Every asset has a gameplay role (eggs/milk/wheat), not mere decoration', 'A consistent cozy mood yields one coherent world, not a mix'] },
      { t: 'Client 3: Warplane game — dogfight', c: '"A warplane combat game over the sea with missiles and radars"',
        game: 'Aerial dogfight over islands and a naval fleet: evasion, missiles, radar warnings',
        bible: 'Semi-realistic military: polished reflective metal, sunset sky turning grey, tactical markings',
        count: '20', assets: ['jet_fighter', 'aircraft_carrier', 'navy_destroyer', 'rotating_radar', 'air_missile', 'naval_watchtower', 'rocky_island', 'smoke_cloud'],
        note: 'Two fighter variants (friendly/hostile) and ships repeat as a fleet — the carrier is the unique centerpiece',
        w: ['Material and lighting wording makes metal actually look like metal', 'Naming the centerpiece (carrier) directs the budget split', 'Separating enemy from friendly models avoids visual confusion'] },
      { t: 'Client 4: Hard horror — abandoned village', c: '"A hard horror game like Resident Evil: old village at night, zombies, rare weapons"',
        game: 'Survival horror in an abandoned old European village at night: scarce ammo and transformed villagers',
        bible: 'Realistic horror: weathered old stone, thick view-limiting fog, pale blue moonlight, aged orange lanterns, dark PBR materials',
        count: '25', assets: ['crumbling_church', 'abandoned_stone_house', 'bulky_villager_zombie', 'thin_fast_zombie', 'magnum', 'sniper_rifle', 'hanging_lantern', 'rusted_iron_gate', 'tombstone'],
        note: 'The three zombie types repeat as enemies with clear justification — the church and gate are unique landmarks',
        w: ['Horror needs a bigger count (25) to vary environment, enemies, and weapons together', 'Lighting is part of the style: fog and moonlight create dread before models do', 'Scarcity decisions belong in the prompt, not later'] },
      { t: 'Client 5: Hard game — castle siege', c: '"A hard game defending my castle against waves of invaders with catapults and ladders"',
        game: 'Hard strategic castle defense against waves of besiegers: catapults, ladders, and archer towers',
        bible: 'Realistic medieval: dark grey stone, muted field greens, tattered red banners, dusty weather',
        count: '20', assets: ['large_stone_castle', 'archer_tower', 'catapult', 'armored_besieger', 'armored_horse', 'wooden_siege_ladder', 'tattered_red_banner', 'burning_hay_cart'],
        note: 'Besiegers repeat in waves (core gameplay) — the castle is unique; catapults capped at two',
        w: ['"Enemy waves" pre-declares which elements repeat programmatically and why', 'Dust and weather serve difficulty and limited visibility', 'Capping repetition (max two catapults) prevents unrealistic clutter'] }
    ]
  },
  zh: {
    title: '3D 提示词指南', sub: '五位虚拟客户 — 看模糊需求如何变成完整的专业提示词，再去向代理提出',
    req: '客户需求', why: '这条提示词为何出色', copy: '复制提示词', copied: '已复制 ✓',
    f_game: '游戏', f_bible: '统一风格基准', f_count: '建议数量', f_assets: '示例资产', f_note: '重复与写实规则', sep: '、',
    examples: [
      { t: '客户 1：汽车游戏 — 街头竞速', c: '“我想要夜 Neon 漂移赛车游戏，改装日系车”',
        game: '霓虹日式小巷中的夜间漂移竞速',
        bible: '夜间写实：反光湿沥青路面、紫/青霓虹、90 年代改装日系车、轮胎烟雾',
        count: '20', assets: ['日系跑车', '改装老爷车', '水泥护栏', '红绿灯', '霓虹灯柱', '磨损轮胎', '发车台', '发光店招'],
        note: '赛车按颜色重复、护栏自然重复 — 发车台唯一不重复',
        w: ['统一风格基准让每个资产生成前就锁定同一视觉世界', '具体命名的资产胜过「汽车」这类泛词', '写明什么重复、什么唯一，避免地标被克隆'] },
      { t: '客户 2：农场游戏 — 种植与家禽', c: '“想要安静的农场游戏，种植挤奶去小集市卖”',
        game: '白日暖色乡村农场：种植、养禽、在附近集市出售',
        bible: '友好低多边形卡通、柔和饱和色、温馨氛围、柔和日光',
        count: '15', assets: ['农舍', '麦田', '母鸡', '奶牛', '绵羊', '水井', '干草车', '苹果树', '木集市摊'],
        note: '家禽购买时重复；农舍与集市唯一 — 重复遵循玩法逻辑',
        w: ['15 适合小型游戏 — 简单规模别要 50 个资产', '每个资产都有玩法作用（蛋/奶/麦）而非纯装饰', '一致的氛围让成品是一个世界而非混搭'] },
      { t: '客户 3：战机游戏 — 空战', c: '“海上的战机格斗游戏，有导弹和雷达”',
        game: '群岛与舰队上空的空战：规避、导弹、雷达告警',
        bible: '半写实军事：抛光反光金属、转为灰暗的落日天空、战术标识',
        count: '20', assets: ['喷气战机', '航空母舰', '驱逐舰', '旋转雷达', '空空导弹', '海军瞭望塔', '岩石岛', '烟云'],
        note: '战机两版（敌/我），舰船编队重复 — 航母为唯一核心',
        w: ['材质与光照措辞让金属真正像金属', '点明核心（航母）指导预算分配', '敌我模型分离避免视觉混淆'] },
      { t: '客户 4：高难度恐怖 — 废弃村庄', c: '“像生化危机的高难恐怖游戏：夜晚老村庄、僵尸、稀有武器”',
        game: '夜间废弃欧洲老村庄的生存恐怖：弹药稀缺、变异村民',
        bible: '写实恐怖：风化石材、限制视野的浓雾、苍白蓝月光、老旧橙灯笼、暗色 PBR',
        count: '25', assets: ['破败教堂', '废弃石屋', '壮硕村民僵尸', '瘦弱疾速僵尸', '马格南', '狙击枪', '吊灯笼', '锈铁门', '墓碑'],
        note: '三类僵尸作为敌人合理重复 — 教堂与大门为唯一地标',
        w: ['恐怖需要更大数量（25）同时丰富环境、敌人与武器', '光照属于风格：雾与月光先于模型制造恐惧', '稀缺性决策写进提示词而非事后'] },
      { t: '客户 5：高难度 — 攻城战', c: '“守护城堡对抗一波波攻城者的高难游戏，有投石机和云梯”',
        game: '艰难的守城战略：抵御投石机、云梯与箭塔下的一波波围攻',
        bible: '写实中世纪：深灰石材、暗淡田绿、破旧红旗、扬尘天气',
        count: '20', assets: ['大型石堡', '箭塔', '投石机', '重甲攻城兵', '披甲战马', '木制云梯', '破旧红旗', '燃烧干草车'],
        note: '攻城者按波次重复（核心玩法）— 城堡唯一；投石机至多两台',
        w: ['“波次敌人”预先声明哪些元素以程序化方式重复及理由', '尘土与天气服务难度与受限视野', '给重复设上限（投石机两台）防止不真实堆砌'] }
    ]
  }
};
var guideOpenFlag = false;
function guideText(ex, L) {
  return [L.f_game + ': ' + ex.game, L.f_bible + ': ' + ex.bible, L.f_count + ': ' + ex.count,
    L.f_assets + ': ' + ex.assets.join(L.sep), L.f_note + ': ' + ex.note].join('\\n');
}
function guideRender() {
  var L = GUIDE_DATA[lang] || GUIDE_DATA.ar;
  var h = '<p class="hint" style="margin-top:0">' + esc(L.sub) + '</p>';
  L.examples.forEach(function (ex, i) {
    h += '<div class="card" style="margin:0 0 14px">' +
      '<div class="row" style="margin-top:0"><h3 style="margin:0">' + esc(ex.t) + '</h3>' +
      '<button class="btn" data-gcopy="' + i + '">' + esc(L.copy) + '</button></div>' +
      '<p class="hint" style="margin:8px 0"><b>' + esc(L.req) + ':</b> ' + esc(ex.c) + '</p>' +
      '<pre class="code" style="white-space:pre-wrap;min-height:0">' + esc(guideText(ex, L)) + '</pre>' +
      '<p class="hint" style="margin:8px 0 0"><b>' + esc(L.why) + ':</b></p>' +
      '<ul style="margin:4px 0 0;padding-inline-start:22px">' +
      ex.w.map(function (w) { return '<li class="hint" style="margin:3px 0">' + esc(w) + '</li>'; }).join('') + '</ul></div>';
  });
  openModal(L.title, h);
  q('#modalBody').querySelectorAll('[data-gcopy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var txt = guideText(L.examples[Number(this.dataset.gcopy)], L);
      var done = function () { toast(L.copied); };
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt).then(done, done); }
      else {
        var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (e) { /* ignore */ }
        document.body.removeChild(ta); done();
      }
    });
  });
}
q('#guideOpen').addEventListener('click', function () { guideOpenFlag = true; guideRender(); });

fillWs(); refreshAll(); applyLang(); acRender(); loadGenImages(); loadCap(); loadEngines(); loadAssets();
var _langBusy = false;
var _langTimer = null;
var _applyLangSafe = function () {
  if (_langBusy) return;
  _langBusy = true;
  try { applyLang(); } finally { _langBusy = false; }
};
new MutationObserver(function () {
  if (lang === 'ar' || _langBusy) return;
  clearTimeout(_langTimer);
  _langTimer = setTimeout(function () { if (lang !== 'ar' && !_langBusy) _applyLangSafe(); }, 250);
}).observe(document.body, { childList: true, subtree: true });
setInterval(loadHealth, 15000);
</script>
</body>
</html>`
}
