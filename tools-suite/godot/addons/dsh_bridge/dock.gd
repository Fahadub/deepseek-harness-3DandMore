@tool
extends VBoxContainer
## لوحة «ديب سيك» — جسر حي بين محرر Godot ووكيل DeepSeek Harness.
## أرسل الأوامر من هنا؛ يعدّل الوكيل ملفات المشروع مباشرة، والمحرر
## يلتقط التغييرات ويحدّث نفسه لتشاهدها مجسدة أمامك.

const HUB := "http://127.0.0.1:3030"

var _session_id := ""
var _ws_path := ""
var _busy := false
var _last_seen_text := ""
var _scan_pending := false

var _log: RichTextLabel
var _input: LineEdit
var _send_btn: Button
var _status: Label
var _http_req: HTTPRequest
var _http_send: HTTPRequest
var _poll: Timer
var _fs_poll: Timer
var _mtimes := {}

func _init() -> void:
	custom_minimum_size = Vector2(360, 240)
	var title := Label.new()
	title.text = "ديب سيك — الجسر الحي"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(title)

	_log = RichTextLabel.new()
	_log.bbcode_enabled = true
	_log.scroll_following = true
	_log.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(_log)

	_input = LineEdit.new()
	_input.placeholder_text = "اكتب أمرك للوكيل… (Enter للإرسال)"
	_input.text_submitted.connect(_on_send)
	add_child(_input)

	_send_btn = Button.new()
	_send_btn.text = "إرسال للوكيل"
	_send_btn.pressed.connect(func(): _on_send(_input.text))
	add_child(_send_btn)

	_status = Label.new()
	_status.text = "…الاتصال بالجسر"
	_status.add_theme_font_size_override("font_size", 11)
	add_child(_status)

	_http_req = HTTPRequest.new()
	_http_req.timeout = 8.0
	add_child(_http_req)
	_http_send = HTTPRequest.new()
	_http_send.timeout = 8.0
	add_child(_http_send)

	_poll = Timer.new()
	_poll.wait_time = 3.0
	_poll.timeout.connect(_poll_last)
	add_child(_poll)

	_fs_poll = Timer.new()
	_fs_poll.wait_time = 2.0
	_fs_poll.timeout.connect(_check_project_changes)
	add_child(_fs_poll)

	_log.append_text("[color=#6fb3ff]ديب سيك جاهز — أكتب طلبك وسيتجسد في المحرر مباشرة[/color]\n")

func _ready() -> void:
	_ws_path = ProjectSettings.globalize_path("res://")
	_poll.start()
	_fs_poll.start()
	_resolve_session()

func _resolve_session() -> void:
	if _http_req.get_http_client_status() != HTTPClient.STATUS_DISCONNECTED:
		return
	var err := _http_req.request(HUB + "/tools/api/bridge/session?ws=" + _ws_path.uri_encode())
	if err != OK:
		_status.text = "تعذر الاتصال بهارنس (3030)"
		return
	var parts: Array = await _http_req.request_completed
	var body: PackedByteArray = parts[3]
	var json := JSON.parse_string(body.get_string_from_utf8())
	if json == null or not json.get("ok", false):
		_status.text = String(json.get("hint", "لا جلسة بعد — افتح دردشة هارنس لهذا المشروع مرة"))
		return
	_session_id = String(json.get("session_id", ""))
	_status.text = "متصل ✓ " + _session_id.substr(8, 8)
	_poll_last()

func _on_send(text: String) -> void:
	text = text.strip_edges()
	if text == "" or _busy:
		return
	if _session_id == "":
		await _resolve_session()
		if _session_id == "":
			_status.text = "لا جلسة — افتح هارنس أولاً"
			return
	_input.text = ""
	_busy = true
	_last_seen_text = ""
	_log.append_text("\n[color=#e8d44d]أنت:[/color] " + text + "\n")
	_status.text = "أُرسل — الوكيل يعمل…"
	var payload := JSON.stringify({
		"type": "client-request",
		"rpcId": "godot-bridge-" + str(Time.get_ticks_msec()),
		"method": "session.prompt",
		"payload": { "sessionId": _session_id, "mode": "queue",
			"content": [ { "type": "text", "text": text + "\n(مُرسل من داخل محرر Godot — طبّق التعديلات على ملفات هذا المشروع مباشرة)" } ] },
	})
	var headers := PackedStringArray(["Content-Type: application/json"])
	var err := _http_send.request(HUB + "/api/session.prompt", headers, HTTPClient.METHOD_POST, payload)
	if err != OK:
		_busy = false
		_status.text = "فشل الإرسال"
		return
	await _http_send.request_completed
	_scan_pending = true

func _poll_last() -> void:
	if _session_id == "":
		return
	if _http_req.get_http_client_status() != HTTPClient.STATUS_DISCONNECTED:
		return
	var err := _http_req.request(HUB + "/tools/api/bridge/last?session=" + _session_id)
	if err != OK:
		return
	var parts: Array = await _http_req.request_completed
	var body: PackedByteArray = parts[3]
	var json := JSON.parse_string(body.get_string_from_utf8())
	if json == null:
		return
	var text := String(json.get("text", ""))
	var busy: bool = json.get("busy", false)
	if text != "" and text != _last_seen_text:
		_last_seen_text = text
		_log.append_text("\n[color=#2ea043]الوكيل:[/color] " + text.left(1800) + "\n")
		_scan_pending = true
	if not busy and _busy:
		_busy = false
		_status.text = "متصل ✓ — جاهز لأمرك التالي"
	elif busy:
		_status.text = "الوكيل يعمل…"

func _check_project_changes() -> void:
	# رصد تغيّرات ملفات المشروع وتحديث المحرر لتشاهدها حية
	var fs := EditorInterface.get_resource_filesystem()
	if _scan_pending:
		fs.scan.call_deferred()
		_scan_pending = false
		_status.text = "حدّثت المحرر بالتعديلات الجديدة ✓"
	var dir := DirAccess.open(_ws_path)
	if dir == null:
		return
	_walk_mtime(_ws_path.path_join("scripts"), 0)
	_walk_mtime(_ws_path.path_join("scenes"), 0)

func _walk_mtime(dir_path: String, depth: int) -> void:
	if depth > 2:
		return
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return
	dir.list_dir_begin()
	var name := dir.get_next()
	while name != "":
		var full := dir_path.path_join(name)
		if dir.current_is_dir() and not name.begins_with("."):
			_walk_mtime(full, depth + 1)
		elif name.ends_with(".gd") or name.ends_with(".tscn"):
			var mt := FileAccess.get_modified_time(full)
			var key := full
			if _mtimes.has(key) and int(_mtimes[key]) != int(mt):
				_scan_pending = true
			_mtimes[key] = mt
		name = dir.get_next()
	dir.list_dir_end()
