# PLAYBOOK: ألعاب السباقات (Racing) — الخلاصة المستخلصة من مشروع بشري حقيقي

> مصدر التعلم: مشروع سباق Godot 4.2 بشري مفتوح المصدر (تم تحليله نصيًا فقط ثم حذفه).
> القاعدة: الأكواد أدناه **إعادة صياغة أصلية** للأنماط، ليست نسخًا. الهدف أن يكتب الوكيل ألعاب سباق "بطريقة بشرية" من دون رؤية المشروع الأصلي أبدًا.

---

## 1) جوهر الأسلوب البشري في سباقات Godot

البشر لا يستخدمون `VehicleBody3D` الجاهز في الألعاب الأركيد الجيدة — بل يبنون **RigidBody3D مخصص** مع 4 عجلات كل عجلة `RayCast3D` تطبّق 4 قوى مستقلة:
1. **قوة التعليق (Suspension)** — نابض + مخمّد نحو الأعلى.
2. **قوة الدفع (Acceleration)** — على العجلات الخلفية فقط، باتجاه -Z المحلي.
3. **مقاومة الحركة الطولية (Rolling/Drag)** — قوة معاكسة لمركبة السرعة على المحور الأمامي.
4. **قوة القبضة الجانبية (Lateral Grip)** — قوة معاكسة للسرعة الجانبية؛ **هنا يولد الانجراف** بتخفيض قبضة الخلفية ديناميكيًا.

الشعور "الإنساني" يأتي من: تعليق مرئي حقيقي (العجلة تلحق الأرض)، صوت محرك مربوط بـ RPM مربوط بالسرعة/الترس، دخان عند فقدان القبضة، كاميرا تميل مع التوجيه، وعدّاد لفات بقطاعات (sectors) مع حفظ أفضل الأزمنة.

---

## 2) هيكل المشهد النموذجي (Scene Composition)

```
Car (RigidBody3D, car.gd)            ← الجسم الفيزيائي، مركز الكتلة منخفض
├─ Body (MeshInstance3D)             ← هيكل السيارة (من GLB المستخدم — لا مجسمات جاهزة)
├─ EngineSound (AudioStreamPlayer)
├─ CarInfo (CanvasLayer HUD)         ← عدّاد سرعة + ترس + مؤشر RPM (Sprite2D يدور)
├─ Wheels (Node3D)
│   ├─ FL_Wheel (RayCast3D, is_front=true)  └─ Mesh (العجلة المرئية، طفل 0)
│   ├─ FR_Wheel (RayCast3D, is_front=true)
│   ├─ RL_Wheel (RayCast3D) + Smoke (GPUParticles3D)
│   └─ RR_Wheel (RayCast3D) + Smoke2
└─ CameraPivot (Node3D, chase_cam.gd)
    └─ Camera3D
```

قواعد تركيب:
- الرايكاست يبدأ فوق العجلة ويستهدف لأسفل؛ `add_exception(car)` إلزامي وإلا اصطدم السيارة بنفسه.
- نقطة تطبيق القوة = نقطة التلامس + نصف قطر العجلة للأعلى، **ناقص موضع السيارة** (عزم دوران صحيح).
- الدخان GPUParticles3D يوضع عند العجلتين الخلفيتين ويُشغَّل/يُطفأ من سكربت العجلة.

---

## 3) سكربت السيارة (النمط المعاد صياغته)

```gdscript
# car_controller.gd — نمط RigidBody3D الأركيدي
extends RigidBody3D

@export var car_id: String = "coupe"        # مفتاح في جدول السيارات
@export var suspension_rest := 0.6          # طول النابض الساكن (متر)
@export var spring_strength := 12.0         # صلابة النابض k
@export var spring_damper := 1.0            # تخميد الارتداد
@export var wheel_radius := 0.22
@export var engine_power := 6.0
@export var steer_max_deg := 25.0
@export var grip_front := 4.0
@export var grip_rear := 1.8                # أقل من الأمامية => ميل للانجراف

var rpm := 0.0
const RPM_IDLE := 1000.0
const RPM_MAX := 7000.0
var gear := 1                               # فهرس: 1=خلفي، 0=محايد، 2+=أمامية
var gear_ratios: Array[float] = [0.0, -0.8, 1.0, 1.1, 1.3, 1.5]
var neutral := true
var reversing := false

# بيانات مدفوعة بالجدول: كل طراز له سرعة قصوى لكل ترس (كم/س)
const CAR_TABLE := {
    "coupe":   [0, -20, 45, 75, 110, 145],
    "hyper":   [0, -30, 100, 150, 200, 260],
    "rally":   [0, -25, 55, 85, 115, 150],
}
var gear_top_speeds: Array = []

func _ready() -> void:
    gear_top_speeds = CAR_TABLE.get(car_id, CAR_TABLE["coupe"])
    center_of_mass_mode = RigidBody3D.CENTER_OF_MASS_MODE_CUSTOM
    center_of_mass = Vector3(0, -0.4, 0)    # منخفض = لا ينقلب في المنعطفات

func _physics_process(delta: float) -> void:
    var throttle := Input.get_action_strength("accelerate")
    var steer := Input.get_axis("steer_right", "steer_left")  # -1..1
    _gate_input(throttle)
    _update_gears(throttle)
    _update_feedback(delta)                  # RPM + صوت + HUD
```

**بوابة الإدخال (منطق الاتجاهات):** في ترس أمامي، ضغط الرجوع يُهمَل (لا فرملة عكسية)؛ في الخلفي، الضغط الأمامي يُعكس ليصبح فرملة/تقدم. وفوق السرعة القصوى للترس الحالي يُصفَّر الدفع (يُسمح بالتباطؤ فقط).

---

## 4) سكربت العجلة — القلب الفيزيائي (نمط معاد صياغته)

```gdscript
# wheel_ray.gd — كل عجلة RayCast3D تطبق 4 قوى
extends RayCast3D
@export var is_front := false
var prev_spring_len := 0.0

func _physics_process(delta: float) -> void:
    if not is_colliding():
        return
    var contact := get_collision_point()
    _suspension(delta, contact)
    _drive(contact)
    _rolling_drag(contact)
    _lateral_grip(delta, contact)
    _place_visual(contact, delta)

func _suspension(delta: float, contact: Vector3) -> void:
    var rest: float = owner.suspension_rest
    var length := clampf(global_position.distance_to(contact) - owner.wheel_radius, 0.0, rest)
    var spring_f: float = owner.spring_strength * (rest - length)
    var spring_vel := (prev_spring_len - length) / delta
    var force := owner.global_basis.y * (spring_f + owner.spring_damper * spring_vel)
    prev_spring_len = length
    owner.apply_force(force, contact + Vector3.UP * owner.wheel_radius - owner.global_position)

func _drive(contact: Vector3) -> void:
    if is_front or owner.neutral:
        return
    if absf(owner.linear_velocity.length() * 3.6) > absf(owner.current_top_speed()):
        return                                   # الترس شبعان — لا دفع إضافي
    var fwd := -owner.global_basis.z
    if owner.reversing:
        fwd = owner.global_basis.z
    var torque: float = owner.throttle * owner.engine_power * owner.gear_ratios[absi(owner.gear)]
    owner.apply_force(fwd * torque, contact + Vector3.UP * owner.wheel_radius - owner.global_position)

func _rolling_drag(contact: Vector3) -> void:
    # مقاومة تتناسب مع السرعة الأمامية: تجعل السيارة تتوقف بلا فرامل وتحدّ السرعة القصوى
    var fwd := owner.global_basis.z
    var v_fwd := fwd.dot(_point_velocity(global_position))
    owner.apply_force(-fwd * v_fwd * owner.mass / 10.0, contact - owner.global_position)

func _lateral_grip(_delta: float, contact: Vector3) -> void:
    var right := owner.global_basis.x
    var v_lat := right.dot(_point_velocity(global_position))
    var grip: float = owner.grip_rear if not is_front else owner.grip_front
    _set_smoke(grip < 1.4)                       # فقدان قبضة = دخان انجراف
    owner.apply_force(right * (-v_lat * grip), contact - owner.global_position)

func _point_velocity(p: Vector3) -> Vector3:
    # سرعة أي نقطة على جسم صلب = سرعة المركز + ω × r
    return owner.linear_velocity + owner.angular_velocity.cross(p - owner.global_position)

func _place_visual(contact: Vector3, delta: float) -> void:
    var mesh := get_child(0) as Node3D
    mesh.global_position = contact + Vector3.UP * owner.wheel_radius   # تلحق الأرض
    var circ := TAU * owner.wheel_radius
    var spin := (owner.linear_velocity.length() / circ) * 360.0 * delta
    mesh.rotate_object_local(Vector3.RIGHT, deg_to_rad(spin))
    if is_front:
        mesh.rotation.y = owner.steer_input * deg_to_rad(owner.steer_max_deg)
```

**لماذا هذا "بشري":** العجلة المرئية تنزل وترتفع فعليًا مع التضاريس، تدور بسرعة حقيقية محسوبة من المحيط، والعجلات الأمامية تتجه مع المقود — هذه التفاصيل الثلاث هي ما يفرّق لعبة سباق محترمة عن مكعب ينزلق.

---

## 5) الانجراف (Drift) والجوس (Feedback)

```gdscript
# داخل car_controller.gd
func _drift_model(steer: float, throttle: float) -> void:
    if absf(steer) > 0.05:
        var target := 1.0 - maxf(absf(steer), absf(throttle)) * 0.1
        grip_rear = lerpf(grip_rear, target, 0.1)      # تآكل تدريجي أثناء الانعطاف+الدفع
    else:
        var rate := 0.05 + maxf(0.0, (2.0 - grip_rear) * 2.0)  # تعافٍ أسرع كلما فقدها أكثر
        grip_rear = lerpf(grip_rear, 2.0, rate)
```

- عتبة الدخان: قبضة خلفية < 1.4 ⇒ `Smoke.emitting = true`.
- **RPM مربوط بكل شيء** (النمط المركزي للجوس):
```gdscript
func _update_rpm(delta: float, speed_kmh: float) -> void:
    var target := RPM_IDLE
    var top := gear_top_speeds[gear]
    if gear >= 2:
        target = remap(clampf(speed_kmh, 0, top), 0, top, RPM_IDLE, RPM_MAX)
    rpm = clampf(lerpf(rpm, target, 100.0 * delta), RPM_IDLE, RPM_MAX)
    engine_sound.pitch_scale = remap(rpm, RPM_IDLE, RPM_MAX, 0.75, 1.5)  # صوت يعلو مع الدورات
    needle.rotation_degrees = lerpf(33.0, 230.0, (rpm - RPM_IDLE) / (RPM_MAX - RPM_IDLE))
```

---

## 6) ناقل الحركة اليدوي (دلالات الفهرس)

الفهرس 1 = خلفي، 0 = محايد، 2 = أولى... (لهذا يُعرض `gear - 1` في HUD):
```gdscript
func shift_up() -> void:
    if reversing:  reversing = false; neutral = true; gear = 0
    elif neutral:  neutral = false;  gear = 2
    elif gear < gear_ratios.size() - 1: gear += 1

func shift_down() -> void:
    if gear == 2 and linear_velocity.length() * 3.6 < 5.0: neutral = true; gear = 0
    elif gear > 2: gear -= 1
    elif neutral:  neutral = false; reversing = true; gear = 1
```
قاعدة: النزول من أولى إلى محايد مسموح فقط تحت سرعة منخفضة (~5 كم/س) — تفصيلة واقعية يضعها البشر دائمًا.

---

## 7) كاميرا المطاردة (Chase Cam)

```gdscript
# chase_cam.gd — مدار بالزر الأوسط + ميل تلقائي مع المقود
extends Node3D
@export var orbit_speed := 0.005
@export var pitch_min := -50.0   # درجات
@export var pitch_max := 20.0
@export var sway_max := 15.0
var pitch := 0.0
var sway := 0.0

func _input(e: InputEvent) -> void:
    if e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_MIDDLE:
        Input.mouse_mode = Input.MOUSE_MODE_HIDDEN if e.pressed else Input.MOUSE_MODE_VISIBLE
    if Input.is_mouse_button_pressed(MOUSE_BUTTON_MIDDLE) and e is InputEventMouseMotion:
        rotate_y(-e.relative.x * orbit_speed)
        pitch = clampf(pitch - e.relative.y * orbit_speed, deg_to_rad(pitch_min), deg_to_rad(pitch_max))
        rotation.x = pitch

func _process(delta: float) -> void:
    if not Input.is_mouse_button_pressed(MOUSE_BUTTON_MIDDLE):
        var steer := Input.get_axis("steer_right", "steer_left")
        sway = 0.0 if absf(steer) < 0.01 else clampf(sway + steer * 0.05 * delta * 60.0, deg_to_rad(-sway_max), deg_to_rad(sway_max))
        rotation.y = lerpf(rotation.y, sway, 1.0 * delta)   # يتبع المقود ثم يعود
        pitch = lerpf(pitch, 0.0, 1.0 * delta)              # ويعود للوضع المحايد
```

---

## 8) نظام اللفات والقطاعات + الحفظ

نمط بشرية قياسي: **خط نهاية + نقاط قطاعات** (Area3D لكل واحدة)، والعدّاد يعتمد `Time.get_ticks_msec()`:
- أول عبور لخط النهاية = بدء السباق (لا يبدأ العد عند الظهور).
- عبور كل قطاع يجمّد زمن القطاع ويبدأ عدّاد التالي.
- عبور النهاية مرة أخرى = زمن اللفة = مجموع القطاعات ⇒ حفظ فوري.
- التحقق من الجسم: `if body.name == "Car"` (أو group) حتى لا تعدّ الأجسام الأخرى.

```gdscript
# lap_store.gd — autoload: أفضل 3 أزمنة لكل خريطة
extends Node
const PATH := "user://best_times.cfg"
var cfg := ConfigFile.new()

func _ready() -> void:
    if cfg.load(PATH) != OK:
        for map in ["circuit_a", "circuit_b"]:
            cfg.set_value(map, "times", [INF, INF, INF])
        cfg.save(PATH)

func record(map: String, t: float) -> Array:
    var times: Array = cfg.get_value(map, "times", [INF, INF, INF])
    times.append(t); times.sort(); times = times.slice(0, 3)
    cfg.set_value(map, "times", times); cfg.save(PATH)
    return times
```

**تدفق المشاهد:** autoload بسيط يحمل اختيارات القائمة (خريطة + سيارة) إلى مشهد السباق — لا singletons معقدة.

---

## 9) فخاخ Godot المستفادة (Gotchas)

1. `apply_force(force, position)` — الموضع **نسبي لمركز الكتلة**؛ نسيان `- global_position` يقتل العزم الدوراني.
2. RayCast3D على عجلة داخل شجرة السيارة يجب `add_exception(car)` في `_ready`.
3. `lerp` بمعامل ثابت (0.3) في `_physics_process` يجعل الاستجابة تتغير مع FPS — استخدم `lerpf(a,b,rate*delta)` للنعومة المستقلة عن الإطارات.
4. صوت المحرك: غيّر `pitch_scale` فقط (0.75→1.5)، لا تبدّل الـ stream أثناء التشغيل.
5. `Time.get_ticks_msec()` للتوقيت (ملي ثانية int) — لا `delta` التراكمي.
6. HUD داخل السيارة (CanvasLayer طفل) يعمل لكن الأفضل فصله لمشهد HUD مستقل يقرأ من group `"player_car"`.
7. `move_toward` للعودة السلسة للصفر (عجلة المقود)، `lerp` للتتبع — لا تخلطهما بلا سبب.
8. Forward+ مناسب لسباق بمواد PBR؛ Mobile إن استهدفنا أجهزة ضعيفة.

## 10) ضعفاء المشروع الأصلي — نتجنبها

- كود ميت (دوال RPM قديمة لم تُحذف) + `print` متفرقة في الإنتاج.
- **باج حقيقي:** تحميل صوت السيارة حسب النوع ثم الكتابة فوقه بـ preload لصوت ثابت — نضبط مصدرًا واحدًا فقط.
- أرقام سحرية منتشرة (33/230 للعقرب، 1.4 عتبة الدخان) — نضعها ثوابت مسماة أعلى الملف.
- استخدام أفعال ui_* المدمجة بدل أفعال مخصصة — نعرّف InputMap خاصًا بالمشروع دائمًا.
- HUD مبني داخل مشهد السيارة — يصعّب إعادة استخدام السيارة بلا HUD.

## 11) قالب التنفيذ في المحرر (ما يولده الوكيل)

عند طلب "لعبة سباق": CarController (RigidBody3D) + 4 WheelRay + جدول سيارات data-driven (id → سرعات ترس/قوة/قبضة) + ChaseCam + LapSystem (قطاعات + أفضل أزمنة ConfigFile) + HUD (سرعة/ترس/عقرب) + دخان انجراف + صوت RPM. **المجسمات: إجرائية (BoxMesh/CylinderMesh مركّبة) افتراضيًا، مع فتحة استبدال GLB من المستخدم في `assets/models/user/` — لا مجسمات جاهزة أبدًا.**


---

# PLAYBOOK: Racing games — English Edition

> Learning source: a human open-source Godot 4.2 racing project (analyzed text-only then deleted).
> The rule: the code below is an **original re-expression** of the patterns, not a copy. The goal is that the agent writes racing games "the human way" without ever seeing the original project.

## 1) The core of the human style in Godot racing

Humans don't use the ready `VehicleBody3D` in good arcade games — they build a **custom RigidBody3D** with 4 wheels, each wheel a `RayCast3D` applying 4 independent forces:
1. **Suspension force** — spring + damper upward.
2. **Acceleration force** — rear wheels only, along local -Z.
3. **Rolling/drag resistance** — a force opposing the forward-axis velocity component.
4. **Lateral grip** — a force opposing lateral velocity; **this is where drift is born** by dynamically lowering rear grip.

The "human" feel comes from: real visible suspension (the wheel follows the ground), an engine sound tied to RPM tied to speed/gear, smoke on grip loss, a camera leaning with steering, and a sector-based lap counter saving best times.

## 2) Model scene composition

Car (RigidBody3D, car.gd, low custom center of mass) with Body MeshInstance3D (from the user's GLB — never stock models), EngineSound AudioStreamPlayer, CarInfo CanvasLayer HUD (speed + gear + RPM needle Sprite2D), Wheels Node3D with 4 RayCast3D wheels (front two is_front=true; rear two with GPUParticles3D smoke), and a CameraPivot (Node3D, chase_cam.gd) holding Camera3D.
Assembly rules: the raycast starts above the wheel aiming down; `add_exception(car)` is mandatory or the car collides with itself; the force application point = contact point + wheel radius up, **minus the car's position** (correct torque); rear-wheel smoke is toggled by the wheel script.

## 3) The car script (re-expressed pattern)

RigidBody3D with data-driven exports: car_id (a key into the car table), suspension_rest/spring_strength/spring_damper/wheel_radius/engine_power/steer_max_deg/grip_front/grip_rear (rear < front ⇒ drift tendency). RPM idle 1000/max 7000; gear index semantics 1=reverse, 0=neutral, 2+=forward; `gear_ratios` array; a CAR_TABLE const mapping each model to its top speed per gear in km/h (coupe/hyper/rally). In `_ready`: pick the table row and set a low custom center of mass (`Vector3(0, -0.4, 0)` = no flipping in corners). In `_physics_process`: read throttle/steer, gate input, update gears, update feedback (RPM + sound + HUD).
**Input gating (direction logic):** in a forward gear, pressing back is ignored (no reverse braking); in reverse, forward press becomes brake/forward; above the current gear's top speed the drive force is zeroed (only deceleration allowed).

## 4) The wheel script — the physics heart

Each RayCast3D wheel applies, when colliding (full GDScript in the Arabic edition): **suspension** — spring force k*(rest−length) plus damper × spring velocity, applied at contact + wheel_radius − car position along global up; **drive** — rear wheels only, when not neutral and below the gear's top speed, force = throttle × engine_power × gear_ratio along ±forward; **rolling drag** — a force proportional to forward velocity (car stops without brakes, top speed bounded); **lateral grip** — force opposing lateral velocity × per-axle grip, with smoke emitting when grip < 1.4 (drift); **point velocity** — any point on a rigid body = center velocity + ω × r; **visual placement** — the visible wheel mesh follows the contact point, spins at a speed computed from its circumference (`spin = v / (TAU*r) * 360 * delta` degrees), and front wheels rotate with steering.

**Why this is "human":** the visible wheel actually drops and rises with terrain, spins at a true computed rate, and front wheels point with the steering — these three details separate a respectable racing game from a sliding cube.

## 5) Drift model and feedback

While steering beyond 0.05: `grip_rear = lerpf(grip_rear, 1.0 - max(|steer|,|throttle|)*0.1, 0.1)` — gradual erosion while cornering+throttling; otherwise it recovers faster the more it lost (`rate = 0.05 + (2.0 - grip_rear) * 2.0`). Smoke threshold: rear grip < 1.4.
**RPM tied to everything** (the central feedback pattern): target RPM = remap of speed within the current gear's top speed (idle→max), smoothed with `lerpf(rpm, target, 100*delta)`; engine sound `pitch_scale = remap(rpm, idle, max, 0.75, 1.5)` (never swap the stream while playing); the HUD needle rotates from 33° to 230° with RPM.

## 6) Manual gearbox (index semantics)

Index 1 = reverse, 0 = neutral, 2 = first... (hence `gear - 1` in the HUD). shift_up: reverse→neutral, neutral→gear 2, else gear+1 up to the array end. shift_down: first→neutral allowed only under ~5 km/h, else gear−1, and from neutral into reverse.
Rule: downshifting from first to neutral only at low speed (~5 km/h) — a realistic detail humans always add.

## 7) Chase camera

Node3D pivot: middle-mouse orbit (hide the cursor while held; rotate_y with relative.x, pitch clamped −50°..20°), and when not orbiting the camera sways with steering (±15°, `rotation.y = lerpf(rotation.y, sway, 1.0*delta)`) then returns, and pitch lerps back to neutral.

## 8) Lap & sector system + saving

Standard human pattern: **finish line + sector points** (an Area3D each) with `Time.get_ticks_msec()` timing: first finish-line crossing starts the race (not spawn); each sector freezes its time and starts the next; the next finish crossing = lap time = sector sum ⇒ immediate save; body check `if body.name == "Car"` (or a group).
`lap_store.gd` autoload: best 3 times per map in a ConfigFile at `user://best_times.cfg`, `record(map, t)` appends, sorts, slices to 3, saves, returns the array.
Scene flow: a simple autoload carries menu choices (map + car) into the race scene — no complex singletons.

## 9) Learned Godot gotchas

1. `apply_force(force, position)` — the position is **relative to the center of mass**; forgetting `- global_position` kills the torque.
2. A RayCast3D wheel inside the car tree needs `add_exception(car)` in `_ready`.
3. A constant lerp factor (0.3) in `_physics_process` makes response vary with FPS — use `lerpf(a, b, rate*delta)` for frame-independent smoothness.
4. Engine sound: change `pitch_scale` only (0.75→1.5), never swap streams mid-play.
5. `Time.get_ticks_msec()` for timing (int milliseconds) — not accumulated `delta`.
6. A HUD inside the car (child CanvasLayer) works but a separate HUD scene reading group `"player_car"` is better.
7. `move_toward` for smooth return-to-zero (steering wheel), `lerp` for following — don't mix them without reason.
8. Forward+ renderer fits PBR racing; Mobile renderer for weak devices.

## 10) The original project's weaknesses — we avoid them

- Dead code (old RPM functions never deleted) + stray `print` in production.
- **A real bug:** loading the car sound by type then overwriting it with a fixed preload — configure exactly one source.
- Scattered magic numbers (33/230 for the needle, 1.4 smoke threshold) — make named constants at the top of the file.
- Using built-in ui_* actions instead of custom ones — always define a project-specific InputMap.
- HUD built inside the car scene — makes reusing the car without a HUD hard.

## 11) The editor implementation template (what the agent generates)

On a "racing game" request: CarController (RigidBody3D) + 4 WheelRays + a data-driven car table (id → gear top speeds/power/grip) + ChaseCam + LapSystem (sectors + best times ConfigFile) + HUD (speed/gear/needle) + drift smoke + RPM sound. **Models: procedural by default (composed BoxMesh/CylinderMesh) with a user GLB replacement slot in `assets/models/user/` — never stock models.**
