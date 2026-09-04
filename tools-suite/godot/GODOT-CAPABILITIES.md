# كتاب قدرات Godot 4.7 — للمbuild ألعاب كاملة بالمحرك المحلي

> المحرر الرسمي محمّل جاهز: `tools-suite/godot/Godot.exe` (نسخة محمولة 4.7.2-stable).
> العميل يملك المحرر ويفتح المشروع بنفسه للتحرير البشري (الاتجاهات والمقاسات قراره).
> **بروتوكول أول برومت لأي لعبة Godot**: اقرأ هذا الكتاب كاملًا → استكشف مجلد المشروع →
> اسأل العميل عن النوع (2D/3D) والأسلوب → ثم ابنِ هيكل مشروع كامل يفتح بالمحرر مباشرة بلا أخطاء.

## 1) هيكل المشروع (يجب أن يكتمل دائمًا)
```
<اللعبة>/
  project.godot        # إعدادات المشروع (config_version=5, اسم، أيقونات، input map)
  scenes/
    main.tscn          # المشهد الرئيسي (يُضبط في project.godot: run/main_scene)
    player.tscn, ui.tscn, ...
  scripts/
    player.gd, world.gd, ...
  assets/              # الصور/الأصوات/الخطوط — تُستورد تلقائيًا عند فتح المحرر
```
- `.tscn` نصي: `[gd_scene format=3 uid="..."]` + `[node name="..." type="..."]` + `[ext_resource path="res://..."]`.
- **لا تُرفق صور للنموذج أبدًا** (GLM لا يرى الصور) — ضع ملفات الصور في assets/ واكتب مسارات `res://` في الكود.

## 2) GDScript — الزبدة
```gdscript
extends CharacterBody2D            # أو Node3D / CharacterBody3D / RigidBody3D
const SPEED := 8.0                  # م/ث في 3D؛ بكسل/ث في 2D
@onready var sprite := $Sprite2D
func _ready(): pass                 # مرة عند الإدخال
func _physics_process(delta):       # فيزياء ثابتة 60Hz — الحركة هنا
  var dir := Input.get_vector("ui_left","ui_right","ui_up","ui_down")
  velocity = dir * SPEED; move_and_slide()
func _input(event):                 # أحداث لحظية (مفاتيح/لمس)
  if event.is_action_pressed("jump"): jump()
```
- إشارات (signals) للتفكيك: `signal died` → `died.emit()` → في مشهد آخر `player.died.connect(game_over)`.
- `Input.is_action_pressed("attack")` — عرّف الأكشنات في project.godot بقسم `[input]`.

## 3) المقاسات والأبعاد (الميزة البشرية)
- **3D: وحدة Godot = 1 متر حقيقي** — شخصية 1.8، باب 2.1، غرفة 3×4. اكتب الأرقام في تعليقات بجانب كل قيمة.
- 2D: بكسل (نافذة افتراضية 1152×648) — أرضية 64px للبلاطة شائعة.
- عرّف ثوابت الأبعاد أعلى الملف: `const LANE_W := 2.0  # عرض المسار متر` ليحررها العميل لاحقًا بسهولة.

## 4) عناصر جاهزة (استخدمها قبل أي إضافة خارجية)
- فيزياء: CharacterBody3D + move_and_slide، Area3D للالتقاط، RayCast3D للرؤية.
- 2D: TileMapLayer، AnimatedSprite2D، Camera2D مع limit.
- 3D: WorldEnvironment (Sky/الضباب)، DirectionalLight3D بظلال، NavigationAgent3D للمطاردة، GPUParticles3D.
- صوت: AudioStreamPlayer (SFX) و`AudioStreamPlayer` غير موضعي للموسيقى.
- واجهة عربية: Control + Label بـ `text` عربي مباشرة؛ الاتجاه RTL بخاصية `layout_direction=2`، وخط عربي في assets/fonts.

## 5) قواعد إلزامية (مطابقة لسياسات المحرك)
1. لغة واجهة اللعبة تتبع لغة الموقع تلقائياً (اقرأ ui_lang من أداة local_assets): ar=عربي كامل، en=إنجليزي كامل، zh=صيني كامل — ولغة رسائل العميل في الشات تتقدم عند اختلافها. ركّز كل النصوص في ملف واحد (مثل strings.gd أو i18n.json). بلا أيقونات جاهزة/إيموجي إلا بطلب صريح.
2. لا تشغّل المحرر من الأدوات — العميل (أو صفحة Godot في المركز عبر زر «افتح Godot») من يفتحه ويرى.
3. الحركة سريعة والأسهم+WASD دائمًا، بلا تلميحات تحكم على الشاشة.
4. اكتب مشروعًا **يفتح بلا أخطاء**: كل `res://` موجود فعلًا، وmain_scene صحيح.
5. الفحص النصي فقط: `godot --headless --check-only` غير متاح للألعاب — اعتمد فحص المسارات والتراكيب يدويًا + اطلب من العميل فتح المحرر محليًا للتأكد البصري.

## 6) سير العمل المقترح للعبة كاملة
1. اسأل العميل: النوع والفكرة والأسلوب → خطة مختصرة بالأرقام (مشاهد/سكربتات/أصول وأحجامها بالمتر/بكسل).
2. ابنِ الهيكل كاملًا: project.godot → scenes → scripts → assets (استخدم مجسمات Tripo بصيغة GLB: Godot يستوردها تلقائيًا مع AnimationPlayer).
3. حرّك بالأرقام المقيسة ووثّقها بتعليقات عربية، ثم سلّم: «افتح Godot من زر المركز على مجلد المشروع».
4. ممنوع صور تُرجع إليك — ملفات فقط.

## 7) البيئة والتحكم الكامل — ترسانة Godot 4.7 المدمجة (كلها تحت يدك بلا إضافات)
- **WorldEnvironment/Environment**: سماء إجرائية (ProceduralSkyMaterial/PhysicalSkyMaterial)، ضباب (Fog + Height Fog)، توهج Glow، SSAO، SSIL، SDFGI (إضاءة عامة ديناميكية)، VoxelGI، Adjustments (سطوع/تباين/تشبع بعد المعالجة)، DOF، FSR/DLSS scaling.
- **الإضاءة**: DirectionalLight3D (شمس بظلال LOD) + Omni/Spot + ReflectionProbe + LightmapGI للخبز.
- **الجزيئات**: GPUParticles3D/2D (ثلج/حمم/غبار/شرر — sub-emitters وtrails) + CPUParticles للأجهزة الضعيفة. **قاعدة العميل: المؤثرات لا تغير إضاءة اللعبة**.
- **الأرضيات**: لا Terrain مدمج — البروتوكول المعتمد: MeshProcedural/ArrayMesh + ShaderMaterial، أو GridMap للبلاط ثلاثي الأبعاد؛ إضافة Terrain3D مفتوحة المصدر **بقرار العميل فقط**.
- **التحكم والفيزياء**: InputMap كامل، CharacterBody/Rigid/Area/RayCast/VehicleBody، NavigationAgent3D (مسارات مطاردة ذكية)، PhysicsMaterial (احتكاك/ارتداد)، MoveAndSlide مع floor_snap.
- **الصوت**: AudioStreamPlayer (2D/3D) + buses + effects (Reverb/EQ/Pitch) + AudioStreamGenerator للتوليد الإجرائي (أصوات الحجر والوحوش بلا ملفات).
- **الكاميرات**: Camera3D +平滑 damping + CameraAttributes (تعريض/عمق مجال) + shake برمجي.
- **UI عربي**: Control/Label/Button + layout_direction RTL + خطوط عربية + Theme مركزي.
- **التسجيل المرجعي**: كل أرقام البيئة/الإضاءة تُكتب في consts.gd بتعليقات عربية ليحررها العميل لاحقًا.
مصادر الأصول الخارجية: اعتمد المشاع الخالي من الحقوق (CC0) فقط، وسجّل المصدر والترخيص لكل أصل خارجي.

## 8) الجسر الحي — ديب سيك داخل المحرر (إضافة addons/dsh_bridge)
- إضافة مدمجة (منصبة في مشروع الهروب + قالبها في tools-suite/godot/addons/) تضيف لوحة «ديب سيك» في المحرر: دردشة عربية ترسل الأوامر لنفس جلسة هارنس (نفس الوكيل والسياق من البابين).
- آلية الاتصال: POST /api/session.prompt (وضع queue) على 3030 + استطلاع /tools/api/bridge/last كل 3 ثوانٍ لجلب ردود الوكيل + /tools/api/bridge/session لاكتشاف جلسة المشروع تلقائيًا.
- التجسد الحي: الإضافة تراقب ملفات scripts/ وscenes/ كل ثانيتين، وعند أي تغيير من الوكيل تستدعي filesystem.scan فيتحدث المحرر أمام عينيك فورًا.
- ملاحظة تشفير الجلسات (لاكتشافها): فك ترميز ~XXXX→حرف و '-'→'/' مع تجاهل النقطتين في المقارنة (النقطتان تضيعان في ترميز dsh).

## 9) قائمة الصقل الإلزامية — لا تُسلَّم لعبة بدونها (فحص بشري خارق للتفاصيل)

1. **لا شيء يطفو في السماء**: كل مبنى/شجرة/ديكور يُثبَّت على `terrain_math.ground_at(x,z)` (أو ما يعادلها) عند الوضع — وبعد البناء شغّل فحصاً آلياً يمسح كل المواضع ويثبت أي قطعة فوق الأرض أو تحتها (تسامح ≤ 0.05م).
2. **تصادم مضمون لكل شيء صلب**: كل مبنى وجدار وبروplist له CollisionShape3D أو شبكة `-col`؛ اختبر بالمشي ضد كل جدار — لا عبور عبر الهندسة أبداً.
3. **كاميرا بشرية**: تحكم ماوس للاتجاه (pointer captured + pitch/yaw)، حساسية مضبوطة، تصادم كاميرا (لا تخترق الجدران)، اهتزاز عند الإصابة/الانفجار، وتقريب عند التصويب.
4. **أنميشن إلزامي للقتال**: للعدو واللاعب: هجوم (ضربة/طلقة + خروج السلاح/سحبه)، إصابة (stagger)، موت (سقوط)، وموت اللاعب. بلا أنميشن موت/هجوم = غير مسلَّم.
5. **الأبواب تُفتح فعلياً**: إن كان في GLB عقدة باب مسماة فأدرها على مفصلة بتحرك tween؛ وإلا فأنشئ باباً بديلاً بمفصلة عند مدخل كل مبنى قابل للدخول — مع صوت + إغلاق تلقائي.
6. **تفاعل حي بكل شيء لامع**: أبواب، صناديق تُفتح، مصابيح تُشعل، كراسي تُجلس، NPC حوارات — كل شيء قابل للتفاعل يظهر مؤشر «E» عند الاقتراب.
7. **تفاصيل الحياة**: أصوات خطى حسب المادة، غبار/شرر عند الإصابة، دخان مداخن، طيور/فراشات، أضواء تشتعل تلقائياً ليلاً.

## 9) Mandatory Polish Checklist (English) — no game ships without it

1. **Nothing floats**: every building/tree/prop snaps to `ground_at(x,z)`; run a post-build sweep that re-grounds any piece off by >0.05m.
2. **Guaranteed collision**: every solid has CollisionShape3D / `-col` mesh; walk-test every wall — no clipping through geometry ever.
3. **Human camera**: mouse look (pointer captured, pitch/yaw), tuned sensitivity, camera collision (never through walls), shake on hits/explosions, zoom on aim.
4. **Mandatory combat animations** for player AND enemies: attack (swing/shoot + draw/holster), hit stagger, and death fall. No death/attack anim = not deliverable.
5. **Doors actually open**: rotate named GLB door nodes on a hinge via tween; otherwise add a hinged proxy door at every enterable building — with sound + auto-close.
6. **Living interaction**: doors, openable chests, lamps, sittable chairs, NPC dialogs — anything interactive shows an «E» prompt when near.
7. **Life details**: material-keyed footsteps, hit dust/sparks, chimney smoke, birds/butterflies, lights that auto-turn-on at night.


---

# Godot 4.7 Capabilities Book (English Edition) — building complete games with the local engine

> The official editor ships ready at `tools-suite/godot/Godot.exe` (portable 4.7.2-stable, auto-downloaded by the launcher).
> The client owns the editor and opens the project personally for human editing (orientations and sizes are their call).
> **First-prompt protocol for any Godot game:** read this whole book → explore the project folder →
> ask the client about genre (2D/3D) and style → then build a complete project structure that opens in the editor with zero errors.

## 1) Project structure (must always be complete)
```
<game>/
  project.godot        # project settings (config_version=5, name, icons, input map)
  scenes/
    main.tscn          # main scene (set in project.godot: run/main_scene)
    player.tscn, ui.tscn, ...
  scripts/
    player.gd, world.gd, ...
  assets/              # images/sounds/fonts — auto-imported when the editor opens
```
- `.tscn` is text: `[gd_scene format=3 uid="..."]` + `[node name="..." type="..."]` + `[ext_resource path="res://..."]`.
- **Never attach images for the model to see** (GLM can't see images) — put image files in assets/ and write `res://` paths in code.

## 2) GDScript — the essentials
```gdscript
extends CharacterBody2D            # or Node3D / CharacterBody3D / RigidBody3D
const SPEED := 8.0                  # m/s in 3D; px/s in 2D
@onready var sprite := $Sprite2D
func _ready(): pass                 # once on entry
func _physics_process(delta):       # fixed 60Hz physics — movement goes here
  var dir := Input.get_vector("ui_left","ui_right","ui_up","ui_down")
  velocity = dir * SPEED; move_and_slide()
func _input(event):                 # instantaneous events (keys/touch)
  if event.is_action_pressed("jump"): jump()
```
- Signals for decoupling: `signal died` → `died.emit()` → in another scene `player.died.connect(game_over)`.
- `Input.is_action_pressed("attack")` — define actions in project.godot under `[input]`.

## 3) Sizes and dimensions (the human edge)
- **3D: one Godot unit = 1 real meter** — a character 1.8, a door 2.1, a room 3×4. Write the numbers in comments next to every value.
- 2D: pixels (default window 1152×648) — a 64px ground tile is common.
- Define dimension constants at the top of the file: `const LANE_W := 2.0  # lane width in meters` so the client can tweak later easily.

## 4) Ready-made elements (use before any external addon)
- Physics: CharacterBody3D + move_and_slide, Area3D for pickups, RayCast3D for sight.
- 2D: TileMapLayer, AnimatedSprite2D, Camera2D with limit.
- 3D: WorldEnvironment (Sky/Fog), DirectionalLight3D with shadows, NavigationAgent3D for chasing, GPUParticles3D.
- Audio: AudioStreamPlayer (SFX) and a non-positional `AudioStreamPlayer` for music.
- Arabic UI: Control + Label with Arabic `text` directly; RTL via `layout_direction=2`, and an Arabic font in assets/fonts.

## 5) Mandatory rules (matching engine policies)
1. Game UI language follows the site language automatically (read ui_lang from the local_assets tool): ar = full Arabic, en = full English, zh = full Chinese — the client's chat language takes precedence when different. Centralize strings in one file (strings.gd / i18n.json). No stock icons/emoji unless explicitly requested.
2. Never launch the editor from tools — the client (or the hub's Godot page via "Open Godot") opens and sees it.
3. Fast movement with arrows+WASD always, no on-screen control hints.
4. Write a project that **opens with zero errors**: every `res://` actually exists, main_scene is correct.
5. Text-only checking: `godot --headless --check-only` isn't available for games — verify paths and structures manually + ask the client to open the editor locally for visual confirmation.

## 6) Suggested workflow for a complete game
1. Ask the client: genre, idea, style → a short numbered plan (scenes/scripts/assets with sizes in meters/pixels).
2. Build the full structure: project.godot → scenes → scripts → assets (use Tripo models as GLB: Godot auto-imports them with AnimationPlayer).
3. Animate with measured numbers documented in Arabic comments, then hand off: "Open Godot from the hub button on the project folder".
4. No images back to you — files only.

## 7) Environment & full control — the built-in Godot 4.7 arsenal (all at hand, no addons)
- **WorldEnvironment/Environment**: procedural skies (ProceduralSkyMaterial/PhysicalSkyMaterial), fog (Fog + Height Fog), Glow, SSAO, SSIL, SDFGI (dynamic global illumination), VoxelGI, Adjustments (post brightness/contrast/saturation), DOF, FSR/DLSS scaling.
- **Lighting**: DirectionalLight3D (sun with LOD shadows) + Omni/Spot + ReflectionProbe + LightmapGI for baking.
- **Particles**: GPUParticles3D/2D (snow/lava/dust/sparks — sub-emitters & trails) + CPUParticles for weak devices. **Client rule: effects never change the game's lighting.**
- **Terrain**: no built-in Terrain — approved protocol: MeshProcedural/ArrayMesh + ShaderMaterial, or GridMap for 3D tiling; the open-source Terrain3D addon **only by the client's decision**.
- **Control & physics**: full InputMap, CharacterBody/Rigid/Area/RayCast/VehicleBody, NavigationAgent3D (smart chase paths), PhysicsMaterial (friction/bounce), MoveAndSlide with floor_snap.
- **Audio**: AudioStreamPlayer (2D/3D) + buses + effects (Reverb/EQ/Pitch) + AudioStreamGenerator for procedural sound (stone & monster sounds with no files).
- **Cameras**: Camera3D + smooth damping + CameraAttributes (exposure/DOF) + programmatic shake.
- **Arabic UI**: Control/Label/Button + RTL layout_direction + Arabic fonts + central Theme.
- **Reference recording**: every environment/lighting number goes into consts.gd with Arabic comments so the client can edit later.
- External asset sources: use royalty-free (CC0) only, and record source + license for every external asset.

## 8) The live bridge — DeepSeek inside the editor (addons/dsh_bridge)
- A bundled addon (installed in the harness project + template in tools-suite/godot/addons/) that adds a "DeepSeek" panel in the editor: an Arabic chat that sends commands to the same harness session (same agent and context from both doors).
- Connection: POST /api/session.prompt (queue mode) on this harness port + polling /tools/api/bridge/last every 3 seconds to fetch agent replies + /tools/api/bridge/session to auto-discover the project's session.
- Live embodiment: the addon watches scripts/ and scenes/ every two seconds; on any agent change it calls filesystem.scan and the editor updates before your eyes.
- Session-name decoding note (for discovery): decode ~XXXX→char and '-'→'/' while ignoring the drive colon in comparison (the colon is lost in dsh encoding).

## 10) عقد الإتقان الشامل — البيئة والحركة والمهارات (إلزامي حسب الطلب)

1. **أرض مطابقة بلا فجوات**: كل مبنى/شجرة/ديكور يلتصق بالتضاريس تماماً (تل/مستوٍ/صخري) — صفر فجوات وصفر طيران في السماء؛ والتضاريس تُرسم متساوية متطابقة مع مواضع الأصول.
2. **لا أرض عارية**: الأرضية تُغطى دائماً (عشب/نبات/صخور صغيرة من حزمة nature في local_assets) — لا فراغ قبيح.
3. **مهارات بأنميشن كامل**: كل مهارة لها أنميشن + مؤثرات (نار، برق، سحر، ظلام، ضوء، جليد...) بجزيئات + إضاءة ديناميكية + صوت — حسب الطلب.
4. **حركة متقنة**: قفز، وطيران قابل للتفعيل عند الطلب مع **أجنحة تُبنى/تُركب للشخصية** بأنميشن رفرفة.
5. **سياسة الشخصية**: **يُمنع** استخدام المجسم الأزرق الافتراضي كشخصية رئيسية — اختر دائماً شخصية مجهزة (rigged) من أصول local_assets؛ الأزرق فقط كبديل صريح بطلب العميل أو لاختبار مؤقت.
6. **عالم حي كامل حسب الطلب**: سماء وغيوم وشمس، ليل بنجوم وقمر، ثلج، بحر/ماء بموجات، نبات متنوع، وتضاريس متنوعة (تلال/سهول/صخور).

## 10) Total-Mastery Contract — world, movement & skills (mandatory on request) (English)

1. **Gapless ground**: every building/prop conforms EXACTLY to terrain (hill/flat/rocky) — zero gaps, nothing floating; terrain heightfield matches placements perfectly.
2. **No bare ground**: always cover terrain (grass/foliage/small rocks from the nature assets in local_assets).
3. **Skills with full animation**: every skill gets animation + VFX (fire, lightning, magic, darkness, light, ice...) with particles + dynamic light + sound — as requested.
4. **Mastered movement**: jump; optional flight with **wings built/attached to the character** including flap animation.
5. **Character policy**: NEVER use the default blue mannequin as the hero — always pick a rigged character from local_assets; blue only by explicit client request or as a temporary test.
6. **A living world on request**: sky with clouds and sun, starry night, snow, sea/waves, varied vegetation, varied terrain (hills/plains/rocks).

## 11) الواقعية أولاً + إتقان حمل السلاح والطيران (إلزامي)

1. **لا تضف ميزة لم تُطلب**: الواقعية هي الافتراض — لا طيران ولا أسلحة ولا مهارات إلا بطلب العميل الصريح. عند الشك: اسأل.
2. **حمل السلاح الواقعي**: كل سلاح له وضعان — (أ) مُعلّق على الظهر/الحزام بزاوية طبيعية عند السير، (ب) في اليد بقبضة صحيحة عند السحب/القتال فقط. **يُمنع اختراق السلاح لجسد الشخصية** — اضبط موضع اليد (grip) والدوران لكل سلاح، وافحصه بصرياً من كل الزوايا.
3. **الطيران بلا أجنحة ممنوع**: لا يُفعّل طيران إلا إذا كانت الشخصية تحمل أجنحة مبنية/مركبة بأنميشن رفرفة؛ وإلا فلن يكون هناك طيران أصلاً.
4. **طبيعية البيئة**: الغطاء النباتي والصخور تُوزَّع بعاكس عشوائي (دوران/مقياس/انحراف موضع) — لا صفوف ولا زوايا موحدة؛ وبكثافات متفاوتة طبيعياً (أكثر قرب الماء، أقل على الصخر).

## 11) Realism-first + weapon & flight mastery (English, mandatory)

1. **No unrequested features**: realism is the default — no flight/weapons/skills unless explicitly requested. When unsure, ask.
2. **Realistic weapon carry**: every weapon has two poses — (a) holstered on back/belt at a natural angle while walking, (b) correct hand grip only when drawn/combat. NEVER let a weapon clip through the body — tune grip position+rotation per weapon and visually verify from all angles.
3. **No wings, no flight**: flight is only enabled when the character actually wears built/attached wings with flap animation; otherwise there is no flight at all.
4. **Natural environment**: scatter foliage/rocks with randomized rotation/scale/offset jitter — no rows or uniform angles; density varies naturally (denser near water, sparser on rock).

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
