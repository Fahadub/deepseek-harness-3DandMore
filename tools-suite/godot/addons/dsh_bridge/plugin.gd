@tool
extends EditorPlugin

const DOCK_SCRIPT := preload("res://addons/dsh_bridge/dock.gd")
var _dock: Control

func _enter_tree() -> void:
	_dock = DOCK_SCRIPT.new()
	add_control_to_dock(DOCK_SLOT_RIGHT_UL, _dock)

func _exit_tree() -> void:
	if _dock != null:
		remove_control_from_docks(_dock)
		_dock.queue_free()
