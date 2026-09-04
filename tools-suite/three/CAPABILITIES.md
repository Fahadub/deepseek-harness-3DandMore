# كتاب القدرات — مكتبة إضافات three.js المحلية (يختار الذكاء المناسب حسب نوع المشروع)

> **قاعدة الاختيار الذهبية:** هذه ليست قائمة تُحقن كلها في كل لعبة. اقرأ نوع المشروع واختر فقط ما يخدمه.
> كل الملفات محلية 100% (بلا إنترنت) داخل مستودع الأدوات — انسخ ما تحتاجه فقط إلى مجلد اللعبة.

## ⚖️ السياسة الدائمة (تسري على كل مشروع وكل تحديث — كلمات العميل نهائية)

1. **الإضافة بضوابط:** لا تضف أي قدرة إلا إذا (أ) طلبها العميل صراحة، أو (ب) رأيتَ بحكمتك أنها ضرورة حقيقية لنوع المشروع هذا. لا شيء يضاف تلقائياً «لكل لعبة».
2. **حذف العميل مطلق ونهائي:** إذا طلب العميل حذف أي ميزة — أزلها فوراً بلا نقاش وبلا إعادة إضافة لاحقاً في تحديثات المشروع نفسه مهما رأيتها مفيدة. رغبته فوق تقديرك.
3. **معيار الجمالية العالمية:** أي إضافة يجب أن ترفع المشروع لمستوى الألعاب العالمية؛ عنصر بلا وظيفة أو جمال = يُحذف.
4. **الأداء بالقياس لا بالحذف:** قبل إضافة مؤثرات ثقيلة قُس بالعداد (Stats)؛ وعند اللاق حسّن (سقف دقة، ظلال أخف، تجميد ثوابت) — **ممنوع حذف أصول العميل أو تقليل عددها** لحل الأداء.
5. **الانتظام الهندسي البشري:** كل بناء بمقياس إنساني واقعي صارم (أبعاد أبواب/جدران/ارتفاعات)، لا شيء يطفو بلا سبب فيزيائي، الشخصيات تواجه اتجاه حركتها، والتباعد مريح للحركة.
6. **منع الأيقونات الجاهزة نهائيًا:** لا إيموجي ولا رموز جاهزة (🥚 🎮 ✨…) في واجهات الألعاب أو واجهة المحادثة/المركز — إلا بطلب صريح من العميل. البديل: أيقونات SVG مرسومة يدويًا بخطوط نظيفة أو نص عربي واضح. طلب العميل الصريح هو الاستثناء الوحيد.

## طريقة التجهيز في أي لعبة (خطوتان)

1. انسخ الملفات المطلوبة من `tools-suite/three/examples/jsm/...` (داخل مستودع الهارنس) إلى `<اللعبة>/libs/addons/...` (حافظ على البنية: objects/ controls/ postprocessing/ shaders/ renderers/ environments/ libs/).
2. أضف importmap في `<head>` قبل أي سكربت (مع نسخة three المحلية `<اللعبة>/libs/three.module.js`):

```html
<script type="importmap">
{ "imports": { "three": "./libs/three.module.js", "three/addons/": "./libs/addons/" } }
</script>
```

ثم: `import { Sky } from 'three/addons/objects/Sky.js'`

---

## القدرات المحلية الجاهزة

### 1. Sky — السماء الديناميكية `objects/Sky.js`
سماء فيزيائية بشمس/قمر حقيقيين يتغير لونها.
**متى:** مزرعة/عالم مفتوح/نهار-ليل. **لا تناسب:** ليل رعب كامل (استخدم ضبابًا ولون سماء ثابتًا).
```js
const sky = new Sky(); sky.scale.setScalar(45000); scene.add(sky);
const u = sky.material.uniforms; u.turbidity.value = 8; u.rayleigh.value = 2;
u.sunPosition.value.copy(new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(60), THREE.MathUtils.degToRad(180)));
```

### 2. PointerLockControls — تصويب FPS `controls/PointerLockControls.js`
قفل الفأرة للنظر/التصويب كألعاب الرعب والتصويب.
**متى:** رعب/تصويب/منظور أول. **لا تناسب:** مزرعة بمنظور علوي أو سباق.
```js
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
const plc = new PointerLockControls(camera, renderer.domElement);
renderer.domElement.addEventListener('click', () => plc.lock()); // بنقرة واحدة يدخل التصويب
```
واجهة عربية: اعرض «انقر للتصويب» قبل القفل، وEsc يخرج تلقائيًا.

### 3. InstancedMesh — مضاعف المجسمات (مدمج في three بلا ملف)
رسم مئات/آلاف النسخ المتشابهة برسمة واحدة.
**متى:** أشجار/زومبي متكرر/عملات/صخور/سيارات مرور — أي تكرار كثيف.
```js
const im = new THREE.InstancedMesh(protoGeo, protoMat, 500);
const m = new THREE.Matrix4();
for (let i = 0; i < 500; i++) { m.setPosition(x[i], 0, z[i]); im.setMatrixAt(i, m); }
```

### 4. CSS2DRenderer — نصوص عربية فوق المجسمات `renderers/CSS2DRenderer.js`
أرقام ضرر وأسماء وأسعار فوق أي مجسم بجودة نص مثالية (RTL كامل).
**متى:** أي لعبة فيها أرقام/أسعار/حوارات فوق الأشياء.
```js
const labelRenderer = new CSS2DRenderer(); labelRenderer.setSize(innerWidth, innerHeight);
labelRenderer.domElement.style.cssText = 'position:fixed;top:0;pointer-events:none';
document.body.appendChild(labelRenderer.domElement); // واستدعِ labelRenderer.render(scene, camera) في الحلقة
const div = Object.assign(document.createElement('div'), { textContent: ' ضرر 25 ' });
div.style.cssText = 'color:#ff5a5a;font-weight:700;direction:rtl';
const lbl = new CSS2DObject(div); mesh.add(lbl);
```

### 5. Stats.js — عداد الأداء `libs/stats.module.js`
إطارات/ثانية مرئية (للتطوير — أخفِه في النسخة النهائية).
```js
import Stats from 'three/addons/libs/stats.module.js';
const stats = new Stats(); document.body.appendChild(stats.dom); // stats.update() في الحلقة
```

### 6. RoomEnvironment — انعكاسات واقعية `environments/RoomEnvironment.js`
انعكاسات بيئية على المعادن والأسلحة بدون ملفات HDR.
**متى:** أسلحة/سيارات/معادن لامعة.
```js
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
```

### 7. المعالجة السينمائية اللاحقة `postprocessing/* + shaders/*`
ملفات: EffectComposer, RenderPass, ShaderPass, Pass, MaskPass, UnrealBloomPass, OutputPass + shaders (CopyShader, LuminosityHighPassShader, OutputShader).
**متى:** رعب/سحر/ليل/نيون. Bloom يجعل الفوانيس والنيون تتوهج حقيقةً.
```js
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.4, 0.85);
composer.addPass(bloom); composer.addPass(new OutputPass());
// في الحلقة: composer.render() بدل renderer.render()
```
Vignette (حواف داكنة): أضف div بشعاع CSS فوق الـcanvas: `box-shadow: inset 0 0 180px 60px rgba(0,0,0,.75)`.

---

## وصفات جاهزة (أنماط برمجية بلا ملفات — اكتبها حسب الحاجة)

### أ. جزيئات نار/شرر/دخان (Points + مواد مضافة)
**متى:** انفجارات RPG، نيران، شرر إصابات، غبار سحري.
نمط: BufferGeometry بعدد N نقاط + velocities مصفوفة، كل إطار حدّث المواقع وقلّب الحياة، المادة PointsMaterial بأحجام متدرجة وblending: AdditiveBlending للنار. انفجار = 150 جزيئة برتقالية تتوسع وتخفت خلال 0.7 ثانية.

### ب. وميض فوهة السلاح
Plane صغير بمادة MeshBasicMaterial مضيئة يظهر 40ms عند الفوهة + PointLight خاطف.

### ج. ارتجاف الكاميرا (Shake)
عند الانفجار/الإصابة: أضف إلى موضع الكاميرا ضجيجًا `A * e^(-6t) * sin(47t)` على محورين يخفت خلال نصف ثانية.

### د. صوت محيط مولّد (WebAudio بلا ملفات)
رياح: ضجيج بياني مرشّح LowPass بتردد يتذبذب. نبض قلب: Oscillator جيبي 55Hz نبضتان. طلقة: ضجيج قصير مع سقوط تردد سريع. تصاعد النبض كلما اقترب أقرب عدو.

### هـ. أثر مضيء (Trails) للسيارات/الطائرات
خط Line يتجدد: احفظ آخر 40 موضعًا وحدّث geometry.positions كل إطار بمادة شفافة متلاشية.

### و. عصا لمس للهواتف
نمط بسيط: دائرة SVG ثابتة أسفل يسار الشاشة + pointer events تحسب متجه الحركة (بدون مكتبات).

---

## الثقيلة — «متاحة عند الطلب» (لا تنزّلها من تلقاء نفسك)
إن احتاجها مشروعك فعلاً أخبر المستخدم ليجهزها أولاً: **GSAP** تحريك واجهات.

---

# الجزء الثاني — ترقيات المحرك المعتمدة (تسري على كل مشروع)

## 📏 أولاً: التطبيع الإجباري قبل أي تركيب (أهم بند في الكتاب)

**حقيقة مكتشفة:** مجسمات Tripo تخرج كلها بحجم موحد ≈ متر واحد كأكبر بُعد (برج مراقبة بطول بئر!). لذلك:
1. بعد كل توليد شغّل: `node <repo>/tools-suite/three/glb-stats.mjs <game>/assets/3d` → ينتج `_manifest.json` بأبعاد كل مجسم الحقيقية (بوحداته الخام).
2. اضرب في معامل تحجيم يحوّل الوحدة للمقياس البشري وفق جدول المقاسات أدناه — مثال: كنيسة حجمها الخام 1م وهدفها 12م → scale=12.
3. سجّل لكل أصل `scale` و`facingOffset` (درجات الدوران ليصبح «الأمام» نحو +Z) في نفس المانيفست أو scene.json — واللعبة تطبقهما تلقائياً عند التحميل.

**جدول المقاسات البشرية المرجعي (بالمتر):** كنيسة 14×10×12 · منزل ريفي 8×7×6 · برج مراقبة 3×3×7 · مستودع 10×6×5 · بئر ⌀1.2×1.1 · بوابة 4×0.4×3 · شجرة ⌀3×5 · سياج 2×0.15×1 · فانوس ⌀0.3×0.9 (وعلى عمود 2.8م) · إنسان/زومبي 0.55×1.75×0.3 · بقرة 1.6×1.3×0.7 · دجاجة 0.35×0.4· مسدس 0.24×0.16×0.05 · ماغنوم 0.3×0.15· قناصة 1.1×0.15 · بازوكة 1.3×0.4 · علبة إسعاف 0.3×0.12×0.22 · صندوق خشبي 0.6³ · برميل ⌀0.55×0.9 · عملة ⌀0.03.

## 8. الدخول والكشاف — Interiors + Flashlight
المباني قابلة للدخول (غرف/أبواب تُفتح) + Spotlight يتبع اتجاه نظر اللاعب بزاوية مخروط 28° وشدة تخفت مع اقتراب الجدران. أطفئ مصابيح الخارج عند الدخول (أداء + رعب).

## 9. الصوت المكاني — WebAudio PannerNode
كل صوت له موقع: `const p = ctx.createPanner(); p.panningModel='HRTF';` حدّث `p.positionX/Y/Z` كل إطار. خطوات/زئير من اتجاههما، صدى الكنيسة بـ ConvolverNode بضجيج متلاشي.

## 10. فيزياء Rapier — مدمجة محلياً `libs/physics/rapier3d-compat.mjs`
```js
import RAPIER from 'three/addons/libs/physics/rapier3d-compat.mjs';
await RAPIER.init(); const world = new RAPIER.World({x:0,y:-9.81,z:0});
// الأجسام: world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...)) + collider
// كل إطار: world.step() ثم انسخ الترجمات إلى Meshes — أبواب تتتأرجح، براميل تنقلب، شظايا حقيقية
```

## 11. مسارات الأعداء — مدمجة `libs/pathfinding/three-pathfinding.module.js`
```js
import { Pathfinding } from 'three/addons/libs/pathfinding/three-pathfinding.module.js';
const pf = new Pathfinding(); const zone = Pathfinding.createZone(navMeshGeometry, 1); pf.setZoneData('village', zone);
const path = pf.findPath(start, end, 'village', 1); // الزومبي يسير عليها ويتفادى الجدران
```
navMesh: نسخة مبسطة من أرض المشهد (LevelGeometry) — Wireframe بأقصي 200 مثلث.

## 12. الطقس والتضاريس
مطر/ثلج: 3000 نقطة PointsMaterial تسقط وتُعاد للأعلى. برق: وميض DirectionalLight شدة 8 لـ120ms + رعد صوتي متأخر. تضاريس: PlaneGeometry 128×128 بارتفاعات noise + ماء بموجات قمة (vertex sin في onBeforeCompile).

## 13. الأنيميشن الإجرائي (للمجسمات الثابتة)
بدون هيكل عظمي: تنفس scale 1±0.01، تمايل rotation.z sin، مشي = bob موضعي + ميل أمامي، هجوم = اندفاع أمامي سريع 0.25s، موت = سقوط rotation.x → 90° مع ارتخاء. اخلط اثنين معاً لحيوية.

## 14. وضع التصحيح — مفتاح F1 (للتطوير، يُخفى في النسخة النهائية)
طبقة واحدة تعرض: FPS/رسمات (Stats) + wireframe للمشهد + صناديق التصادم + مسارات الأعداء الحالية + عدد الأجسام المرئية.

## 15. بوابة الأداء (شرط تسليم)
بعد كل بناء: قس FPS متوسطاً 10 ثوانٍ (بعد تحميل كامل). اللعبة لا تُسلَّم دون 45+ إطاراً. الدواء: سقف pixelRatio 1.5، ظلال 1024، matrixAutoUpdate=false للثوابت، LOD (بند 24) — **لا حذف أصول أبدًا**.

## 16. اللمس وPWA — عصا مدمجة `libs/touch/nipplejs.min.js` + قابلة للتثبيت
```html
<link rel="manifest" href="manifest.webmanifest">
```
manifest: `{ "name":"اللعبة", "display":"fullscreen", "background_color":"#0d0e12" }` + service worker بسيط يخزن الملفات مؤقتاً (cache-first). العصا: nipplejs أسفل يسار + زر إطلاق يمين للشاشات اللمسية.

## 17. معيار scene.json — كل لعبة تُبنى عليه
```json
{ "meta": {"title":"","lang":"ar","playerStart":[0,0,6]},
  "assets": {"<name>": {"file":"","scale":1,"facingOffset":0}},
  "objects": [{"asset":"","name":"","pos":[0,0,0],"rotY":0,"zone":"","tags":[]}],
  "zones": [{"kind":"building|x|path","x1":0,"z1":0,"x2":0,"z2":0}],
  "enemies": [{"asset":"","spawn":[0,0,0],"count":3,"brain":"chaser","hp":100}],
  "lights": [{"type":"lantern|spot|moon","pos":[0,0,0]}] }
```
اللعبة تقرأه وتبني منه — والمحرر المستقبلي يحرره.

## 18. متحكم الشخصية القياسي (كبسولة)
كبسولة تصادم ⌀0.55×1.75: تسارع/تباطؤ ناعم (lerp)، سرعة مشي 4.5 وجري 8 م/ث، دوران نحو اتجاه الحركة بمعدل 10/ث، خطوات سلالم حتى 0.4م بلا قفز، ميل على منحدرات حتى 35°. حركة الكاميرا: تتبع من الخلف بإزاحة ناعمة (exp smoothing 5/ث) + التصويب يحرّك الكاميرا فوق الكتف.

## 19. أدمغة الأعداء — شجرة سلوك جاهزة
حالات: idle → patrol (مسار دائري) → investigate (سمعت صوتاً: اتجاهه 3 ثوانٍ) → chase (رؤية مباشرة/مسافة) → attack (نطاق 1.6م، ضرر كل 0.9 ث) → stagger (عند الإصابة 0.4 ث) → flee (hp<20% للجبناء). كل عدو: سرعة/نطاق رؤية/ضرر/دم من scene.json. **اتجاه العدو دائماً نحو حركته** (مع facingOffset الأصل).

## 20. الحشود — تفادي متبادل (boids)
كل إطار: لكل عدو مجموع متجهات (انفصال عن الأقربين < 1.2م بوزن 2، تجاه الهدف بوزن 1، محاذاة مع الجيران بوزن 0.5) — يتدفقون كسرب لا كتلة.

## 21. مخرج الصعوبة
راقب: صحة اللاعب، دقته، عدد مرات موته. مؤشر توتر 0-1: يرفع/يخفض فترة ظهور الموجات ±30% وعدد الأعداء ±2 تدريجياً — بلا قفزات محسوسة.

## 22. روتين السكان (لعوالم حية)
جدول يومي: 6-9 صباحاً الأكل أمام البيت، 9-12 الحقل، 12-2 قيلولة، ... حيوانات تتجول نهاراً وتنام قرب البيت ليلًا. كل NPC نقطة بيت + نقطة عمل + مسار بينهما.

## 23. القواطع السينمائية
CameraRig: CatmullRomCurve3 للكاميرا + lookAt هدف، شريط أسود علوي/سفلي 6%، نص ترجمة عربي أسفل، تسريع بالنقر. استخدمها للافتتاحية (5-8 ثوانٍ فقط — لا تطول).

## 24. القائمة الرئيسية الموحدة
شاشة عنوان بخط كبير + «لعبة جديدة/استئناف/الإعدادات» — الإعدادات: حساسية الفأرة، جودة (عالية=ظلال+توهج/متوازنة/سريعة)، مستوى الصوت، اللغة (بند 26). خلفية القائمة: المشهد نفسه بكاميرا بطيئة الدوران.

## 25. وضع الصورة
P يوقف ويظهر: كاميرا حرة (WASD + عجلة سرعة)، فلاتر (تعبيرية/باردة/دافئة/أبيض وأسود)، إخفاء الواجهة، وحفظ اللقطة (renderer.domElement.toDataURL → تحميل). زر عائم أثناء اللعب اختياري.

## 26. التوطين الثلاثي داخل اللعبة (ar/en/zh)
ملف نصوص واحد `i18n.json` + دالة `t('health')` في كل نصوص الواجهة، ومبدّل لغة في الإعدادات، الاتجاه RTL للعربية فقط. اسم اللعبة يبقى بلغته الأصلية في كل اللغات.

## 27. الخريطة الصغرى والبوصلة
canvas 140×140 أعلى الزاوية: أرضية بلون واحد، مستطيلات المباني، نقطة اللاعب بسهم اتجاه، أعداء كنقاط حمراء (فقط ضمن 25م)، بوصلة شريط N/E/S/W أعلى الشاشة.

## 28. LOD والتحميل المقسم
قريب <15م: المجسم كامل. متوسط: نسخة مبسطة (نصف مضلعات عبر BufferGeometryUtils.mergeVertices؟ لا — استخدم نسخة decimate جاهزة إن وُجدت وإلا أبقِ الكامل). بعيد >40م: صندوق مظلل بلون الأصل. عوالم كبيرة: قسّم لشبكة 40م وشحن مرئي فقط.

## 29. الحفظ الشامل
localStorage: `save_v1` = {player pos/hp, inventory, ammo, day/time, enemies hp/state, المودِفِيد flags}. حفظ تلقائي كل 60 ث + عند الأحداث. 3 خانات + «استئناف آخر». أزرار حذف/نسخ الخانة.

## 30. الثقوب والدم — Decals
عند إصابة سطح: plane صغير 0.12م بمادة ثقب (دائرة سوداء بحواف) موجهة عكس اتجاه الرصاصة + إزاحة 0.01 عن السطح. حد أقصى 120 ديكال (الأقدم يُحذف). دم الزومبي: بقعة حمراء داكنة تتلاشى بعد 20 ث.

## 31. التحطيم
البراميل/الصناديق: عند تدميرها استبدلها بـ 6-8 قطع (أجزاء BoxGeometry بمادة الأصل) تتطاير بفيزياء بسيطة (سرعة عشوائية + جاذبية + دوران) وتستقر 5 ث ثم تتلاشى — بدون Rapier إن أردت خفة.

## 32. الموسيقى الطبقية التفاعلية
ثلاث طبقات WebAudio مولدة: هادئة (درجة منخفضة + رياح)، توتر (نبض كتم + وترين)، قتال (طبول إيقاعية + باص). مستوى الطبقات يتناسب مع «عدد الأعداء القريبين + الخطر» بانتقالات 2 ثانية.

---

## خريطة الاختيار السريع حسب النوع (إرشادية — القرار النهائي عقلك)

| نوع المشروع | مناسب له |
|---|---|
| رعب/تصويب (رزدنت إيفل) | 2 قفل الفأرة + 7 Bloom + أ جزيئات + ب وميض + ج ارتجاف + د صوت + 6 انعكاسات أسلحة |
| مزرعة/عالم مفتوح هادئ | 1 Sky + 4 نصوص + 3 مضاعف + وصفة هـ إن ركبت |
| سباق سيارات | 3 مضاعف + هـ أثر + 6 انعكاسات هيكل + 7 نيون ليلي |
| طائرات حرب | 3 مضاعف + أ جزيئات دخان/انفجار + ج ارتجاف + هـ أثر + 1 سماء |
| أبراج دفاع/استراتيجية | 3 مضاعف + 4 نصوص أرقام + 7 توهج سحري |
| واقعي محاكاة | 1 + 6 + 3 (بلا Bloom قوي) |
| كرتوني غير واقعي | 4 + وصفات أ/هـ بألوان صريحة + Bloom خفيف |

**تذكير دائم:** لا تضف قدرة لا تخدم نوع المشروع. البساطة المتقنة أقوى من الحشو.

---

# الجزء الثالث — الذكاء العميق (معتمد بالكامل)

## 33. ذاكرة المشروع — `.dsh-tools/PROJECT.md`
بعد كل جلسة اكتب/حدّث: قرارات العميل (رفض/استثناء/موافقة)، ذوقه الجمالي، أخطاء جذرية وإصلاحاتها، المتبقي. **قبل أي جلسة جديدة اقرأه أولاً** — لا تسأل العميل عما أجاب عنه سابقًا، ولا تكرر ما رفضه أبدًا.

## 34. الاختبار الفوضوي (الفشل الجميل) — داخل أداة game_playtest
مرر chaos: ["offline","slow","blockglb"] — الروبوت يقطع الشبكة/يبطئها/يحجب المجسمات ويتأكد أن اللعبة تظل مستجيبة وتعرض رسالة عربية واضحة بدل التعليق. أي تجميد صامت = رفض تسليم.

## 35. مدرّب التوازن
شغّل game_playtest عدة جولات واقرأ hudChecks (نسب الموت/القتل/الاستهلاك) ثم اضبط أرقام الصعوبة تدريجيًا ±20% كحد أقصى لكل تعديل ووثّق الأرقام قبل/بعد في PROJECT.md.

## 36. شهادات الجودة — من game_playtest تلقائيًا
خشب(<40) / برونز / فضة / ذهب / أسطوري(100). الشرط الأدنى للتسليم ok=true: تحميل كامل + صفر أخطاء برمجية + حركة مثبتة. أعلن الوسام في تقريرك النهائي.

## 37. إعادة المشاهدة الشبحية
game_playtest بـ save_replay يحفظ لقطة لكل خطوة في .dsh-tools/playtest/replay-*/ — شاهدها كمقطع من المعرض.

## 38. فرق الوكلاء للمشاريع الكبيرة
مقسّم العمل عبر وكلاء هارنس الفرعيين: (بيئة ومجسمات) / (أعداء وذكاء) / (واجهة وصوت) — ينسقون عبر scene.json واحد وذاكرة المشروع. الوكيل الرئيسي يدمج ويشغّل المختبر النهائي.

## 39. طبيب الجلسات (ذاتي)
تقارير المراقبة الدورية ترصد أخطاء المزود المتكررة (خصوصًا does not support image input): العلاج المعتمد = تشغيل strip-image.mts ثم إعادة تشغيل 3060 فقط (بشرط خمول الوكيل) ثم إيقاظ الجلسة. ممنوع إعادة التشغيل أثناء عمل الوكيل.

## 40. التبديل الحي — وضع التطوير
في وضع dev أضف مستمعًا يستطلع scene.json (fetch كل ثانية) وعند تغيّره يعيد بناء المشهد فورًا بلا إعادة تحميل — للتحرير اللحظي القادم في المحرر المصغر.

## 41. معايير الشخصية الرئيسية والكاميرا والسلاح (دائمة لكل لعبة)
- **اللاعب مرئي دائمًا** في منظور الشخص الثالث: مجسم بشري واضح (واجهة اللعبة تصف مظهره) مع هيكل و حركات (idle/walk/run/aim/shoot/hurt) من أنبوب تيربو rig→retarget الجماعي.
- **الكاميرا القياسية للكتف (منظور رزدنت)**: ارتفاع 1.6-1.7م، خلف اللاعب 2.2-3م، إزاحة يمين الكتف 0.4-0.5م، FOV 60-70 (وضع التصويب: FOV يضيق لـ35-45 بتقريب ناعم lerp)، متابعة ناعمة exp-smoothing، ولا قصّ للأرض بالجدران (raycast يمنع دخول الكاميرا في المجسمات).
- **تركيب السلاح الصحيح**: فوهة السلاح تتجه دائمًا **بعيدًا عن الكاميرا نحو الهدف** (أمام اللاعب) — يُضبط بـ facingOffset فردي لكل نموذج سلاح ويُختبر بالنظر: السلاح لا يشير نحو اللاعب أبدًا. نقطة تعليق: يد يمنى بميل طبيعي.

## 42. معيار أنيميشن الشخصيات عبر تيربو (دائم — لأي مشروع، ليس لرزدنت فقط)
كل لعبة فيها شخصيات/مخلوقات تقيّم هذا الأنبوب وتستخدمه حسب نوعها:
- **الوصفة التقنية**: openapi.tripo3d.ai/v3 — ارفع GLB الجاهز عبر file_token (رفع مجاني — لا تعد توليد ما موجود) ← rig-check مجاني ← rig (25 كردت/شخصية، نموذج v1.0 للبشر بدعم 90+ حركة، v2.5 للمخلوقات) ← retarget **دفعة واحدة حتى 5 حركات** (حد API) مع animate_in_place=true وbake_animation=true وout_format=glb — ثم الدمج بـTHREE.AnimationMixer مع انتقالات حالات (وقوف↔مشي↔جري↔إصابة...).
- **اختيار العدد بالذكاء**: عدد الحركات ونوعها يُشتق من دور الشخصية ونوع اللعبة وصورتها — لا قالب ثابت لكل مشروع.
- **اقتصاد الدفعة**: ما دام الطلب واحدًا بنفس التكلفة، **املأ الخانات الخمس بحركات مفيدة** — لكن ممنوع الحشو: كل حركة يجب أن لها وظيفة لعبية حقيقية (لا تُعقّد اللعبة بحركات لن تُستخدم).
- **كل شخصية طقمها الخاص**: الزومبي النحيل غير البطل غير الحيوان — طقم حركات مستقل لكل نوع حسب سلوكه في اللعبة.
- **الشخصية الرئيسية = أغنى طقم**: اللاعب/البطل يحصل على أكبر عدد من الحركات الملائمة للفكرة (وقوف/مشي/جري/تصويب/إطلاق/إصابة/قفز...) لأنه أكثر من يُرى على الشاشة — إن كانت متوافقة مع مفهوم اللعبة.
- **انضباط الكردت**: rig واحد لكل شخصية يخدم كل الدفعات بعده؛ لا تكرر retarget بلا حاجة؛ وثّق التكلفة الفعلية في تقرير التسليم.

## 43. إيضاح الأنيميشن للعميل قبل التخطيط (دائم — أول خطوة عند أي طلب لعبة 3D)
قبل إنشاء خطة أي لعبة ثلاثية الأبعاد فيها شخصيات، **اسأل العميل صراحةً** (ask_user_question أو نصًا في ردك) واعرض الخيارين بتكلفتهما:
- **بدون أنيميشن**: تكلفة المجسمات فقط (حسب العدد والجودة).
- **مع أنيميشن**: زيادة حقيقية في الكردت — ارفع رقمًا واضحًا: +25 كردت لكل شخصية متحركة (هيكل) + كلفة دفعة(دفعات) الحركات لكل شخصية، مع ذكر عدد الشخصيات المتأثرة والعدد الإجمالي التقديري.
قرار العميل ملزم ولا تتجاوزه — ومع «مع أنيميشن» طبق بند 42 (العدد المناسب للنوع، البطل أغنى طقم).

## 44. حد طول برومت تيربو (مفروض من الشركة 2026-08-20 — دائم)
- خدمة Tripo ترفض أي برومت أطول من ~1000 حرف بالخطأ 1004 «parameter invalid» (قياس فعلي: 649 حرفًا نجح، 1204 رُفض). خطأ 400/1004 من إنشاء المهمة = طول البرومت أول ما تفحصه.
- قاعدة الكتابة: **برومت كل أصل ≤ 600 حرف + ستايل بايبل ≤ 250 حرفًا**. الأداة تدمج الاثنين بسقف أمان 900 حرفًا وتقتطع الأولوية الأدنى (الستايل) أولًا.
- القواعد العربية للإدراك الواقعي لم تعد تُدمج في نداء API (حدها وحدها يتجاوز الألف) — تبقى مرجعًا للوكيل عند تركيب المشهد محليًا.


---

# English Edition — Local three.js Addon Capabilities Book

> **The golden rule of choice:** this is not a list to inject into every game. Read the project type and pick only what serves it.
> Everything is 100% local (no internet) inside the tools repo — copy only what you need into the game folder.

## Permanent Policy (applies to every project and update — the client's word is final)

1. **Addons with discipline:** add a capability only if (a) the client explicitly asked, or (b) by your judgment it is a true necessity for this project type. Nothing is added automatically "for every game".
2. **Client deletions are absolute and final:** if the client asks to remove any feature — remove it immediately, no debate, and never re-add it in later updates of the same project no matter how useful you think it is. Their wish outranks your judgment.
3. **World-class aesthetics bar:** every addition must lift the project to world-class game level; an element with no function or beauty = delete it.
4. **Performance by measurement, not deletion:** before heavy effects measure with Stats; on lag optimize (resolution cap, lighter shadows, freezing constants) — **never delete or reduce the client's assets** to solve performance.
5. **Human engineering order:** every build uses strict realistic human scale (door/wall/ceiling dimensions), nothing floats without physical cause, characters face their movement direction, spacing is comfortable to move through.
6. **No stock icons ever:** no emoji or ready-made symbols in game UIs or the hub/chat — except by the client's explicit request. The alternative: hand-drawn SVG icons with clean lines or clear text.

## Setup in any game (two steps)

1. Copy the needed files from `tools-suite/three/examples/jsm/...` (inside the harness repo) into `<game>/libs/addons/...` (keep the structure: objects/ controls/ postprocessing/ shaders/ renderers/ environments/ libs/).
2. Add an importmap in `<head>` before any script (with the local three copy at `<game>/libs/three.module.js`):

```html
<script type="importmap">
{ "imports": { "three": "./libs/three.module.js", "three/addons/": "./libs/addons/" } }
</script>
```

Then: `import { Sky } from 'three/addons/objects/Sky.js'`

---

## Ready Local Capabilities

### 1. Sky — dynamic sky `objects/Sky.js`
A physical sky with a real sun/moon whose color shifts.
**Use for:** farms / open worlds / day-night. **Not for:** full horror night (use fog + a fixed sky color).

### 2. PointerLockControls — FPS aiming `controls/PointerLockControls.js`
Mouse lock for looking/aiming like horror and shooter games.
**Use for:** horror/shooting/first-person. **Not for:** top-down farms or racing.
Arabic UI: show "انقر للتصويب" (click to aim) before locking; Esc exits automatically.

### 3. InstancedMesh — instancing (built into three, no file)
Draw hundreds/thousands of identical copies in one draw call.
**Use for:** trees / repeating zombies / coins / rocks / traffic — any dense repetition.

### 4. CSS2DRenderer — Arabic labels above objects `renderers/CSS2DRenderer.js`
Damage numbers, names and prices above any object with perfect text quality (full RTL).
**Use for:** any game with numbers/prices/dialogue above things.

### 5. Stats.js — performance meter `libs/stats.module.js`
Visible FPS (development only — hide in the final build).

### 6. RoomEnvironment — realistic reflections `environments/RoomEnvironment.js`
Environmental reflections on metals and weapons with no HDR files.
**Use for:** weapons / cars / shiny metals.

### 7. Cinematic post-processing `postprocessing/* + shaders/*`
Files: EffectComposer, RenderPass, ShaderPass, Pass, MaskPass, UnrealBloomPass, OutputPass + shaders (CopyShader, LuminosityHighPassShader, OutputShader).
**Use for:** horror/magic/night/neon. Bloom makes lanterns and neon genuinely glow.
Vignette (dark edges): add a CSS radial overlay div above the canvas: `box-shadow: inset 0 0 180px 60px rgba(0,0,0,.75)`.

---

## Ready Recipes (code patterns with no files — write as needed)

### A. Fire/spark/smoke particles (Points + additive materials)
**Use for:** RPG explosions, fires, hit sparks, magic dust.
Pattern: BufferGeometry with N points + a velocities array; each frame update positions and decay life; PointsMaterial with graded sizes and AdditiveBlending for fire. Explosion = 150 orange particles expanding and fading over 0.7s.

### B. Muzzle flash
A small plane with an emissive MeshBasicMaterial shown 40ms at the barrel + a fleeting PointLight.

### C. Camera shake
On explosion/hit: add noise to the camera position `A * e^(-6t) * sin(47t)` on two axes, decaying over half a second.

### D. Generated ambient sound (WebAudio, no files)
Wind: filtered brown noise with a wandering LowPass frequency. Heartbeat: 55Hz sine oscillator, two pulses. Gunshot: short noise with fast frequency drop. Pulse rises as the nearest enemy closes in.

### E. Glowing trails for cars/planes
A Line that refreshes: keep the last 40 positions, update geometry.positions each frame with a fading transparent material.

### F. Touch joystick for phones
A simple pattern: a fixed SVG circle bottom-left + pointer events computing the movement vector (no libraries).

---

## The heavy — "available on request" (never download on your own)
If a project truly needs it, tell the user to prepare it first: **GSAP** for UI animation.

---

# Part Two — Approved Engine Upgrades (apply to every project)

## First: mandatory normalization before any placement (the book's most important item)

**Discovered fact:** Tripo models all come out at a unified size of roughly one meter as the largest dimension (a watchtower the height of a well!). Therefore:
1. After every generation run: `node <repo>/tools-suite/three/glb-stats.mjs <game>/assets/3d` → produces `_manifest.json` with each model's real raw dimensions.
2. Multiply by a scale factor converting to human scale per the reference table below — e.g. a church at raw 1m targeting 12m → scale=12.
3. Record for each asset its `scale` and `facingOffset` (rotation degrees so "front" faces +Z) in the same manifest or scene.json — the game applies both automatically on load.

**Reference human-scale table (meters):** church 14×10×12 · rural house 8×7×6 · watchtower 3×3×7 · warehouse 10×6×5 · well ⌀1.2×1.1 · gate 4×0.4×3 · tree ⌀3×5 · fence 2×0.15×1 · lantern ⌀0.3×0.9 (on a 2.8m pole) · human/zombie 0.55×1.75×0.3 · cow 1.6×1.3×0.7 · chicken 0.35×0.4 · pistol 0.24×0.16×0.05 · magnum 0.3×0.15 · sniper 1.1×0.15 · bazooka 1.3×0.4 · medkit 0.3×0.12×0.22 · wooden crate 0.6³ · barrel ⌀0.55×0.9 · coin ⌀0.03.

## 8. Interiors + Flashlight
Buildings are enterable (rooms/openable doors) + a Spotlight following the player's gaze with a 28° cone and intensity fading near walls. Kill exterior lamps when inside (performance + horror).

## 9. Spatial audio — WebAudio PannerNode
Every sound has a location: `const p = ctx.createPanner(); p.panningModel='HRTF';` update `p.positionX/Y/Z` each frame. Footsteps/roars come from their direction; church echo via ConvolverNode with decaying noise.

## 10. Rapier physics — bundled locally `libs/physics/rapier3d-compat.mjs`
Rigid bodies + colliders, `world.step()` each frame, then copy transforms onto meshes — swinging doors, toppling barrels, real debris.

## 11. Enemy paths — bundled `libs/pathfinding/three-pathfinding.module.js`
`Pathfinding.createZone(navMeshGeometry, 1)` then `pf.findPath(start, end, 'village', 1)` — zombies walk it and avoid walls. navMesh: a simplified copy of the scene floor (LevelGeometry) — wireframe, max 200 triangles.

## 12. Weather and terrain
Rain/snow: 3000 PointsMaterial points falling and recycling up. Lightning: a DirectionalLight intensity-8 flash for 120ms + delayed thunder. Terrain: 128×128 PlaneGeometry with noise heights + water with vertex-wave tops (sin i
n in onBeforeCompile).

## 13. Procedural animation (for static models)
Without a skeleton: breathing scale 1±0.01, sway rotation.z sin, walk = positional bob + forward lean, attack = fast forward lunge 0.25s, death = rotation.x → 90° fall with slack. Blend two together for liveliness.

## 14. Debug mode — F1 key (development, hidden in the final build)
One layer showing: FPS/draws (Stats) + scene wireframe + collision boxes + current enemy paths + visible object count.

## 15. The performance gate (delivery condition)
After every build: measure average FPS over 10 seconds (after full load). The game is NOT delivered below 45+ FPS. The cure: pixelRatio cap 1.5, 1024 shadows, matrixAutoUpdate=false for statics, LOD (item 28) — never delete assets.

## 16. Touch & PWA — bundled joystick `libs/touch/nipplejs.min.js` + installable
manifest `{ "name":"…", "display":"fullscreen", "background_color":"#0d0e12" }` + a simple cache-first service worker. Joystick: nipplejs bottom-left + a fire button right on touch screens.

## 17. The scene.json standard — every game is built on it
meta (title/lang/playerStart) · assets (file/scale/facingOffset per asset) · objects (pos/rotY/zone/tags) · zones (building rectangles) · enemies (asset/spawn/count/brain/hp) · lights (lantern|spot|moon). The game reads it and builds from it — and the future editor edits it.

## 18. Standard character controller (capsule)
Collision capsule 0.55×1.75: soft accel/decel (lerp), walk 4.5 and run 8 m/s, rotation toward movement at 10/s, step-up to 0.4m without jumping, slopes to 35°. Camera: rear follow with exp smoothing 5/s + aiming pulls it over the shoulder.

## 19. Enemy brains — a ready behavior tree
States: idle → patrol (circular route) → investigate (heard a sound: face it 3s) → chase (direct sight/distance) → attack (1.6m range, damage every 0.9s) → stagger (0.4s on hit) → flee (hp<20% for cowards). Every enemy: speed/sight/damage/hp from scene.json. Enemies always face their movement direction (with the asset's facingOffset).

## 20. Crowds — mutual avoidance (boids)
Each frame per enemy: sum vectors (separation from the two nearest <1.2m weight 2, goal seek weight 1, neighbor alignment weight 0.5) — they flow as a swarm, not a blob.

## 21. Difficulty valve
Watch: player HP, accuracy, death count. A 0-1 tension meter raises/lowers wave spawn period ±30% and enemy count ±2 gradually — no perceptible jumps.

## 22. Population routine (for living worlds)
A daily schedule: 6-9am eating by the house, 9-12 the field, 12-2 a nap, ... animals roam by day and sleep near the house at night. Every NPC: a home point + a work point + a path between.

## 23. Cinematic cutscenes
CameraRig: CatmullRomCurve3 for the camera + a lookAt target, 6% black bars top/bottom, Arabic subtitle text below, click to speed up. Use for the intro (5-8 seconds only — never long).

## 24. The unified main menu
Title screen with large type + "New Game/Resume/Settings" — settings: mouse sensitivity, quality (high=shadows+bloom / balanced / fast), volume, language (item 26). Menu background: the scene itself with a slowly rotating camera.

## 25. Photo mode
P pauses and shows: free camera (WASD + wheel speed), filters (expressive/cold/warm/black-white), hide UI, and save the shot (renderer.domElement.toDataURL → download). An in-game floating button is optional.

## 26. In-game trilingual localization (ar/en/zh)
One strings file `i18n.json` + a `t('health')` function across all UI code, a language switch in settings, RTL direction for Arabic only. The game's name stays in its original language everywhere.

## 27. Minimap and compass
A 140×140 canvas top-corner: flat ground color, building rectangles, player dot with heading arrow, enemies as red dots (only within 25m), an N/E/S/W compass strip at the top.

## 28. LOD and chunked loading
Near <15m: full model. Medium: a simplified copy (a pre-decimated version if available, else keep full). Far >40m: a shaded box in the asset's color. Big worlds: split into a 40m grid and stream only the visible.

## 29. Comprehensive saving
localStorage: `save_v1` = {player pos/hp, inventory, ammo, day/time, enemies hp/state, modified flags}. Autosave every 60s + on events. 3 slots + "resume last". Slot delete/copy buttons.

## 30. Bullet holes and blood — decals
On surface hit: a small 0.12m plane with a hole material (dark circle with edges) oriented against the bullet direction + 0.01 offset off the surface. Max 120 decals (oldest removed). Zombie blood: a dark red stain fading after 20s.

## 31. Destruction
Barrels/crates: on destruction replace with 6-8 pieces (BoxGeometry parts in the original material) flying with simple physics (random velocity + gravity + spin), settling 5s then fading — without Rapier if you want it light.

## 32. Interactive layered music
Three generated WebAudio layers: calm (low pad + wind), tension (muted pulse + two chords), combat (rhythmic drums + bass). Layer levels track "nearby enemy count + danger" with 2-second transitions.

---

## Quick-pick map by genre (advisory — your brain makes the final call)

| Project type | Fits it |
|---|---|
| Horror/shooter (Resident Evil) | 2 pointer lock + 7 Bloom + A particles + B flash + C shake + D sound + 6 weapon reflections |
| Farm/quiet open world | 1 Sky + 4 labels + 3 instancing + recipe E if mounted |
| Car racing | 3 instancing + E trails + 6 body reflections + 7 night neon |
| War planes | 3 instancing + A smoke/explosion particles + C shake + E trails + 1 sky |
| Tower defense/strategy | 3 instancing + 4 number labels + 7 magic glow |
| Realistic simulation | 1 + 6 + 3 (no strong Bloom) |
| Unreal cartoon | 4 + recipes A/E in bold colors + light Bloom |

**Standing reminder:** never add a capability that doesn't serve the project type. Mastered simplicity beats stuffing.

---

# Part Three — Deep Intelligence (fully approved)

## 33. Project memory — `.dsh-tools/PROJECT.md`
After every session write/update: client decisions (rejections/exceptions/approvals), their aesthetic taste, root-cause bugs and fixes, what remains. Before any new session read it first — never ask the client what they already answered, and never repeat what they rejected.

## 34. Chaos testing (beautiful failure) — inside the game_playtest tool
Pass chaos: ["offline","slow","blockglb"] — the robot cuts the network/slows it/blocks models and verifies the game stays responsive and shows a clear Arabic message instead of hanging. Any silent freeze = delivery refused.

## 35. Balance trainer
Run game_playtest for several rounds, read hudChecks (death/kill/consumption ratios), then adjust difficulty numbers gradually ±20% max per change, documenting before/after numbers in PROJECT.md.

## 36. Quality medals — automatic from game_playtest
Wood(<40) / bronze / silver / gold / legendary(100). Minimum delivery bar ok=true: full load + zero script errors + movement verified. Announce the medal in your final report.

## 37. Ghost replay
game_playtest with save_replay stores a snapshot of every step in .dsh-tools/playtest/replay-*/ — watch it as a gallery clip.

## 38. Agent teams for big projects
Work split across harness sub-agents: (environment & models) / (enemies & AI) / (UI & sound) — coordinating through one scene.json and the project memory. The main agent merges and runs the final lab.

## 39. Session doctor (self-healing)
Periodic monitoring reports spot repeated provider errors (especially "does not support image input"): the approved cure = run strip-image.mts then restart only the harness server (provided the agent is idle) then wake the session. Never restart while the agent is working.

## 12) قانون التنوع والإبداع — ممنوع تكرار نفس اللعبة (إلزامي)

1. **دوران الشخصيات**: قبل البناء، جرد كل الشخصيات المجهزة (rigged) في local_assets — **يُمنع استخدام بطل اللعبة السابقة مرة أخرى**؛ اختر بطلاً مختلفاً يناسب الاتجاه الفني واذكر لماذا اخترته. (سيزارمان ليس البطل الوحيد في المكتبة!)
2. **السلاح بطلب صريح فقط**: لا سلاح إطلاقاً (فأس/سيف/بندقية...) ما لم يسمّيه العميل في طلبه حرفياً. الافتراضي: بلا سلاح أو قدرة نوعية تناسب النوع — وعند الشك اقترح واسأل.
3. **فكرة جديدة كل مرة**: كل لعبة جديدة يجب أن تختلف جوهرياً عن كل الألعاب السابقة في نفس مساحة العمل (النوع/البيئة/الميكانيكا الأساسية) — قبل البناء اعرض على العميل 2-3 مفاهيم متمايزة باختصار وانتظر اختياره، إلا إن قال «فاجئني» أو «أكمل نفس اللعبة».
4. **ذاكرة التنوع**: قبل الت pitches اقرأ أسماء الألعاب السابقة في مساحة العمل وتجنب صيغتها.

## 12) Variety & Originality Law (English, mandatory)

1. **Hero rotation**: inventory ALL rigged characters in local_assets first — NEVER reuse the previous game's hero; pick a different one fitting the art direction and say why. (CesiumMan is not the only hero in the library!)
2. **Weapons by explicit request ONLY**: no weapon at all (axe/sword/rifle...) unless the client literally names it. Default: unarmed or a genre-appropriate ability — when unsure, propose and ask.
3. **A fresh idea every time**: each new game must differ fundamentally from every previous game in the same workspace (genre/setting/core mechanic) — before building, pitch 2-3 distinct concepts briefly and wait for the client's pick, unless they said "surprise me" or "continue the same game".
4. **Variety memory**: before pitching, list the workspace's previous game names and avoid their formulas.

## 13) عزل المشاريع — لا تستكشف غير مساحتك (إلزامي)

**يُمنع** على الوكيل استعراض أو الإشارة إلى أي مشروع/مساحة عمل أخرى غير المساحة المفتوحة في جلسته الحالية — إلا إذا:
- أعطى العميل المسار صراحةً، أو
- طلب العميل البحث في كل المشاريع، أو
- كان العمل يتطلب ذلك (مثل نسخ ملف من مشروع قديم بطلب صريح).

عند الحاجة لملف من مشروع آخر: اسأل العميل عن المسار أولاً ولا تلجأ للتخمين أو فحص مساحات العمل الأخرى من تلقاء نفسك.

## 13) Project Isolation (English, mandatory)

The agent must NOT browse or reference any workspace/project other than the one open in the current session — UNLESS the client explicitly gives the path, asks to search all projects, or the task requires it by explicit request. When needing a file from another project: ask the client for the path first. Never scan other workspaces on your own.
