# PLAYBOOK: ألعاب إطلاق النظر FPS (fps_war) — الخلاصة المستخلصة من مشروع بشري حقيقي

> مصدر التعلم: مشروع FPS بشري مفتوح المصدر في Godot (15 سكربتًا / ~800 سطر، حُلّل نصيًا فقط ثم حُذف).
> القاعدة: الأكواد أدناه **إعادة صياغة أصلية** للأنماط بـ GDScript 4 (المشروع كان Godot 3 — حوّلنا الاصطلاحات)، ليست نسخًا. الوكيل يكتب من هذا الدليل دون رؤية الأصل أبدًا.

---

## 1) جوهر الأسلوب البشري في FPS

البشر لا يضعون كل شيء في سكربت اللاعب واحد. البنية الإنسانية هي **فصل مسؤوليات صارم**:
- `movement.gd` على جسم اللاعب (KinematicBody→CharacterBody3D): مشي/جري/قفز/انحناء فقط.
- `weapons.gd` عقدة `Spatial` مستقلة **toplevel** تحمل «ترسانة» قاموسية من أسلحة مبنية من **class weapon** صغيرة.
- `camera.gd` كاميرا باهتة الاهتزاز (shake) مستقلة؛ السلاح لا يحرك الكاميرا مباشرة بل يضبط `shake_force/shake_time`.
- كل قطعة سلاح = مشهد فرعي: `mesh + anim + ray + barrel + effect(shoot-light/fire/smoke) + audio(shoot/out)`.

«الشعور الإنساني» يأتي من تفاصيل صغيرة متراكمة:
ارتداد كاميرا lerp يُعاد إلى الصفر تلقائيًا، وميض فوهة = ضوء energy يقفز لـ 2 ويخبو 5*delta، صوت طلقة بـ pitch عشوائي 0.9–1.1، سلاح يميل 40° عند الجري ويعود، zoom بتغيير fov 70↔40 مع سحب السلاح لعين الكاميرا.

---

## 2) هيكل المشهد النموذجي

```
Player (CharacterBody3D, movement.gd)
├─ collision (CollisionShape3D, capsule)   ← الانحناء يعدّل height بالـ lerp
├─ head (Area3D/RayCast للسقف)             ← يمنع الوقوف تحت سقف منخفض
│  └─ neck → camera (Camera3D, camera.gd)
└─ weapons (Node3D, set_as_toplevel, weapons.gd)
   ├─ mk_23/
   │  ├─ mesh (+anim AnimationPlayer: Draw/Hide/Shoot/Reload)
   │  ├─ ray (RayCast3D مدى السلاح)
   │  ├─ barrel (Marker3D نقطة خروج الرصاص/الأثر)
   │  ├─ effect/ shoot(OmniLight3D)+fire(GPUParticles3D)+smoke
   │  └─ audio/ shoot+out
   └─ glock_17/, kriss/ …
```

عناصر العالم: براميل `RigidBody3D` بمجموعات (`prop`, `metal`) ودالة `_damage()`، آثار طلقات `decal.tscn` تُضاف **كطفل للمصاب**، شرارات `spark.tscn` للمعادن، أرض محروقة بعد انفجار البرميل.

---

## 3) الحركة (نمط movement)

```gdscript
# fps_movement.gd — نمط معاد صياغته
extends CharacterBody3D

const WALK := 8.0; const SPRINT := 12.0; const CROUCH_CAP := 0.5
var gravity := 50.0
var current_speed := WALK
var direction := Vector3.ZERO

func _physics_process(delta: float) -> void:
    var basis_x := $head.global_transform.basis.x
    var basis_z := $head.global_transform.basis.z
    direction = (basis_z * Input.get_axis("fwd","back") + basis_x * Input.get_axis("left","right"))
    direction.y = 0.0; direction = direction.normalized()
    if is_on_floor():
        velocity.y = -gravity * delta if Input.is_action_just_pressed("jump") == false else 15.0
    else:
        velocity.y -= gravity * delta
    velocity.x = lerpf(velocity.x, direction.x * current_speed, current_speed * delta)
    velocity.z = lerpf(velocity.z, direction.z * current_speed, current_speed * delta)
    move_and_slide()
    # انحناء: تصغير كبسولة تدريجيًا فقط إن لم يكن هناك سقف
    var target_h := 2.0 - (1.5 if Input.is_action_pressed("crouch") else 0.0)
    $collision.shape.height = lerpf($collision.shape.height, target_h, 10.0 * delta)
    # جري: سرعة متغيرة بسلاسة بدل تبديل ثابت
    var goal := SPRINT if Input.is_action_pressed("sprint") and not Input.is_action_pressed("crouch") else WALK
    current_speed = lerpf(current_speed, goal, 3.0 * delta)
```

مفاتيح النمط: اتجاه الحركة من **basis الرأس** وليس الجسم، احتكاك عبر lerp نحو السرعة الهدف، والانحناء يُرفض تحت سقف (ray للأعلى).

---

## 4) صنف السلاح + الترسانة (نمط class weapon)

```gdscript
# gun_data.gd — Resource في Godot 4 (كان class في الأصل)
class_name GunData extends RefCounted

var title: String; var fire_rate: float; var mag: int
var bullets_in_mag: int; var reserve: int; var damage: int; var reload_speed: float

func _init(t,fr,mag,res,dmg,rl):
    title=t; fire_rate=fr; mag=mag; bullets_in_mag=mag; reserve=res; damage=dmg; reload_speed=rl
```

```gdscript
# arsenal.gd — على Node3D toplevel فوق الكاميرا
@onready var cam: Camera3D = get_node(^"../head/neck/cam")
var guns := {}
var idx := 0

func _ready() -> void:
    top_level = true
    guns["sidearm"] = GunData.new("sidearm", 3.0, 12, 999, 35, 1.2)
    guns["smg"]     = GunData.new("smg", 6.0, 32, 999, 25, 1.5)
    for k in guns: _set_visible(guns[k], false)
```

---

## 5) الإطلاق (قلب الشعور الإنساني)

```gdscript
func _fire(delta: float) -> void:
    if g.bullets_in_mag <= 0:
        if not $audio/out.playing: $audio/out.play(); return
    if anim.current_animation in ["Shoot","Reload","Draw","Hide"]: return

    g.bullets_in_mag -= 1
    # ارتداد: دوران كاميرا عشوائي صغير + اهتزاز مؤقت (الكاميرا نفسها تخبو العائد للصفر)
    cam.rotation.x = lerpf(cam.rotation.x, randf_range(1,2), delta)
    cam.rotation.y = lerpf(cam.rotation.y, randf_range(-1,1), delta)
    cam.shake_force = 0.002; cam.shake_time = 0.2

    # وميض الفوهة: طاقة ضوء تقفز ثم تخبو في _update
    $effect/shoot.light_energy = 2.0
    $effect/fire.emitting = true; $effect/smoke.emitting = true
    $audio/shoot.pitch_scale = randf_range(0.9, 1.1); $audio/shoot.play()
    anim.play("Shoot", 0.0, g.fire_rate)

    # أثر رصاصة من فوهة السلاح باتجاه دوران الكاميرا
    var trail := TRAIL.instantiate()
    trail.position = $barrel.global_position
    trail.rotation = cam.global_transform.basis.get_euler()
    get_tree().root.get_child(0).add_child(trail)

    if $ray.is_colliding():
        var hit: Node3D = $ray.get_collider()
        var dmg := int(randf_range(g.damage / 1.5, g.damage))   # ضرر متغير قليلًا
        if hit is RigidBody3D:
            hit.apply_central_impulse(-$ray.get_collision_normal() * dmg * 0.3)
        if hit.is_in_group("prop"):
            if hit.is_in_group("metal"):
                var sp := SPARK.instantiate(); hit.add_child(sp)
                sp.global_position = $ray.get_collision_point(); sp.emitting = true
            if hit.has_method("_damage"): hit._damage(dmg)
        var dc := DECAL.instantiate(); hit.add_child(dc)
        dc.global_position = $ray.get_collision_point()
        dc.look_at($ray.get_collision_point() + $ray.get_collision_normal(), Vector3.ONE)
```

ثبات ما بعد الطلقة في `_update`: عند عدم الإطلاق يرجع دوران الكاميرا للصفر بـ `lerpf(...,10*delta)`، وطاقة الضوء تخبو `lerpf(e,0,5*delta)`، وميل mesh يعود `lerpf(rx,0,5*delta)`.

**الارتداد البشري ليس دفعًا دائمًا** — هو نبضة تُمحى تلقائيًا؛ الزوم `fov 70↔40` مع تحريك mesh لنقطة العين `(y≈0, x≈-0.088)`.

---

## 6) الكاميرا المهتزة (16 سطرًا فقط — البساطة مقصودة)

```gdscript
# shake_cam.gd
extends Camera3D
@export var shake_time := 0.0; @export var shake_force := 0.0
func _process(delta: float) -> void:
    if shake_time > 0.0:
        h_offset = randf_range(-shake_force, shake_force)
        v_offset = randf_range(-shake_force, shake_force)
        shake_time -= delta
    else:
        h_offset = 0.0; v_offset = 0.0
```

أي نظام (سلاح/انفجار) يستدعي فقط ضبط `shake_time/shake_force`.

---

## 7) خطوات القدم مرتبطة بالمادة (groups-keyed)

```gdscript
# footsteps.gd — RayCast تحت القدمين؛ أسماء مجموعات الأرضية = أسماء أطفال الصوت
var step_timer := 0.0
var bank := {}          # "concrete": Node(children=AudioStreamPlayer3D variants)
var last_idx := -1      # منع التكرار المتتالي

func _process(delta: float) -> void:
    if step_timer > 0.0: step_timer -= delta; return
    if player.direction.length() > 0.01 and $feet.is_colliding():
        for grp in $feet.get_collider().get_groups():
            if not bank.has(grp): continue
            var kids: Array = bank[grp].get_children()
            var i := randi() % kids.size()
            if kids.size() > 1 and i == last_idx: i = (i + 1) % kids.size()  # لا تكرار
            last_idx = i; kids[i].play()
            step_timer = 1.0 - 0.06 * player.current_speed   # أسرع جريًا
            break
```

---

## 8) البراميل المتفجرة بسلسلة (durability chain)

```gdscript
# explosive_barrel.gd
extends RigidBody3D
@export var durability := 100.0
var exploded := false

func _damage(dmg: float) -> void:
    if durability <= 0.0 or exploded: return
    durability -= dmg
    $audio/impact.pitch_scale = randf_range(0.9,1.1); $audio/impact.play()
    if durability <= 0.0: exploded = true; _explode(); $blast_timer.start(0.15)

func _explode() -> void:
    $shape.set_deferred("disabled", true); freeze = true
    $mesh.visible = false
    for fx in [$fx/fire,$fx/pillar,$fx/shock]: fx.emitting = true
    $audio/boom.play()
    get_tree().create_timer(6.0).timeout.connect(queue_free)   # ابقَ للصوت ثم اخفِ
    $blast_timer.timeout.connect(_chain)

func _chain() -> void:
    for body in $blast_area.get_overlapping_bodies():           # Area3D نصف قطرها ~60م²
        if body != self and body.has_method("_damage") and "durability" in body:
            body._damage(300.0 - 5.0 * body.global_position.distance_to(global_position))
```

سر السلسلة: الضرر `300 − 5×المسافة` يجعل القريب ينفجر فورًا والبعيد يتضرر جزئيًا — انفجارات متتالية طبيعية بدون جدولة يدوية. أضف `burnt_ground.tscn` أرضية محروقة عند نقطة الانفجار، واحذف decal الأطفال عند الاختفاء.

---

## 9) أخطاء شائعة يجب تجنبها

1. **decal كطفل للعالم**: ستطفو عن الأجسام المتحركة — اجعلها طفلًا للمصاب، ووجّهها بـ `look_at(point + normal)` (وليس point فقط).
2. **إطلاق أثناء Reload/Draw**: افحص `anim.current_animation` قبل كل طلقة وإلا انكسر الإيقاع.
3. **صوت طلقة pitch ثابت**: يُسمع آليًا ومكررًا؛ عشوائية ±10% إلزامية (تنطبق على الخطوات والاصطدامات أيضًا).
4. **تعديل collision.shape.height فورًا عند الانحناء**: قد يعلق اللاعب في الأرض — lerp + ray سقف.
5. **trail/decal/spark تتكدس للأبد**: كل مشهد أثر يحمل Timer → queue_free.
6. **HUD داخل سكربت اللاعب**: افصل hud.gd عن movement.gd؛ اللاعب يبث إشارات (`ammo_changed`, `health_changed`).
7. **debug CanvasLayer دائم**: في الأصل طبقة debug تُبنى بشكل خامل (lazy) وتُظهر fps/position فقط عند تفعيلها — لا تكلفة في الإنتاج.


---

# PLAYBOOK: FPS games (fps_war) — English Edition

> Learning source: a human open-source FPS project in Godot (15 scripts / ~800 lines, analyzed text-only then deleted).
> The rule: the code below is an **original re-expression** of the patterns in GDScript 4 (the project was Godot 3 — conventions converted), not a copy. The agent writes from this book without ever seeing the original.

## 1) The core of the human style in FPS

Humans never put everything in one player script. The human structure is **strict separation of concerns**:
- `movement.gd` on the player body (KinematicBody→CharacterBody3D): walk/run/jump/crouch only.
- `weapons.gd` an independent `Spatial` node marked **toplevel** holding a dictionary "arsenal" built from small **weapon classes**.
- `camera.gd` an independent shake-capable camera; the weapon never moves the camera directly — it sets `shake_force/shake_time`.
- Every weapon piece = a sub-scene: `mesh + anim + ray + barrel + effect(shoot-light/fire/smoke) + audio(shoot/out)`.

The "human feel" comes from accumulated small details: camera recoil lerp returning to zero automatically, muzzle flash = light energy jumping to 2 then decaying at 5*delta, gunshot audio at random pitch 0.9–1.1, weapon tilting 40° while sprinting and returning, zoom switching fov 70↔40 while pulling the weapon toward the camera eye.

## 2) The model scene structure

Player (CharacterBody3D + movement.gd) with a capsule CollisionShape3D (crouch modifies height via lerp), a head Area3D/RayCast preventing standing under low ceilings, neck→camera (Camera3D + camera.gd), and weapons (Node3D, set_as_toplevel, weapons.gd) containing per-weapon folders (mk_23/, glock_17/, kriss/…) each with mesh(+AnimationPlayer Draw/Hide/Shoot/Reload), ray (RayCast3D weapon range), barrel (Marker3D muzzle point), effect/ (shoot OmniLight3D + fire GPUParticles3D + smoke), audio/ (shoot + out).
World elements: barrels as `RigidBody3D` in groups (`prop`, `metal`) with a `_damage()` function, bullet-hole `decal.tscn` added **as a child of the hit object**, sparks `spark.tscn` for metals, scorched ground after a barrel explosion.

## 3) Movement (the movement pattern)

Key points of the pattern (full GDScript in the Arabic edition above): movement direction comes from the **head basis** not the body; friction via lerp toward target speed; crouch shrinks the capsule gradually ONLY when no ceiling ray blocks it; sprint is a smoothly-varying speed instead of a hard toggle (`current_speed = lerpf(current_speed, goal, 3.0 * delta)`); gravity with a single jump impulse (15.0) on floor.

## 4) The weapon class + arsenal

`GunData` (class_name extends RefCounted in Godot 4 — was a plain class in Godot 3) holds title/fire_rate/mag/bullets_in_mag/reserve/damage/reload_speed via `_init()`. The arsenal sits on a toplevel Node3D above the camera with a dictionary `guns` (e.g. sidearm 3.0 rate/12 mag/999 reserve/35 dmg/1.2s reload; smg 6.0/32/999/25/1.5), hiding all weapons at start and switching by index.

## 5) Firing (the heart of the human feel)

The full `_fire(delta)` pattern (Arabic edition above) does, in order: refuse when the magazine is empty (play the "out" click only once); refuse while anim is Shoot/Reload/Draw/Hide (rhythm protection); decrement the magazine; **recoil = small random camera rotation that the camera itself lerps back to zero** + a transient shake (shake_force 0.002 / shake_time 0.2); muzzle flash = shoot-light energy jumps to 2.0 then decays in `_update`, fire+smoke particles emit, shoot audio at random pitch 0.9–1.1; a bullet trail instantiated at the barrel's global position with the camera's rotation; on ray hit — slightly randomized damage (`randf_range(dmg/1.5, dmg)`), impulse on RigidBody3D props, sparks on the "metal" group, `_damage()` on the "prop" group, and a decal added as a child of the hit object oriented with `look_at(point + normal)`.
Post-shot stability in `_update`: when not firing, camera rotation returns to zero at `lerpf(...,10*delta)`, light energy decays `lerpf(e,0,5*delta)`, weapon mesh tilt returns `lerpf(rx,0,5*delta)`.
**Human recoil is not a permanent push** — it is a pulse that erases itself; zoom is `fov 70↔40` while moving the mesh toward the eye point `(y≈0, x≈-0.088)`.

## 6) The shake camera (16 lines only — simplicity is deliberate)

Camera3D with exported shake_time/shake_force; in `_process`, while shake_time > 0 set h_offset/v_offset to `randf_range(-force, force)` and count down, else zero both. Any system (weapon/explosion) only sets `shake_time/shake_force`.

## 7) Material-keyed footsteps

A RayCast under the feet; ground group names = audio bank child names ("concrete": a Node of AudioStreamPlayer3D variants). While moving and colliding: pick a random variant (never the same one twice in a row), play it, and set `step_timer = 1.0 - 0.06 * current_speed` (faster while sprinting).

## 8) Chain-reacting explosive barrels (durability chain)

RigidBody3D barrel with exported durability; `_damage()` reduces it (impact sound at random pitch), and at zero: disable the shape (deferred), freeze, hide the mesh, emit fire/pillar/shock particles, play the boom, queue_free after 6s (stay for the sound), and after a 0.15s blast timer `_chain()` damages overlapping bodies (Area3D ~60m² radius) with `300 − 5×distance` — the near one explodes instantly, the far one is partially damaged: natural cascading explosions with no manual scheduling. Add a burnt-ground scene at the explosion point and clean child decals on removal.

## 9) Common mistakes to avoid

1. **Decal as a child of the world**: it will float off moving objects — parent it to the hit object and orient with `look_at(point + normal)` (not point alone).
2. **Firing during Reload/Draw**: check `anim.current_animation` before every shot or the rhythm breaks.
3. **Fixed gunshot pitch**: sounds robotic and repetitive; ±10% randomness is mandatory (applies to footsteps and impacts too).
4. **Changing collision.shape.height instantly on crouch**: can stick the player into the ground — lerp it + a ceiling ray.
5. **trail/decal/spark piling up forever**: every effect scene carries a Timer → queue_free.
6. **HUD inside the player script**: separate hud.gd from movement.gd; the player broadcasts signals (`ammo_changed`, `health_changed`).
7. **A permanent debug CanvasLayer**: in the original, the debug layer was built lazily and showed fps/position only when enabled — zero production cost.
