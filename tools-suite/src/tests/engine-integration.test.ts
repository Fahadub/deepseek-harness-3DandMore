/** Real Blender + Godot tests in disposable temporary directories. No existing projects. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { apply, verifyGodot, resolveBlender, resolveGodot } from '../tool-blender.ts'
const definitions = new Map<string, any>()
apply({ tools: { register: (t: any) => definitions.set(t.name, t) } } as any)
const call = (name: string, args: any, root: string) => definitions.get(name).execute(args, { agent: { session: { header: { cwd: root } } } })
function glbJson(buffer: Buffer) {
  assert.equal(buffer.toString('ascii', 0, 4), 'glTF')
  return JSON.parse(buffer.toString('utf8', 20, 20 + buffer.readUInt32LE(12)))
}

test('Blender executes bpy and preserves multi-part transforms, floor and collision', { timeout: 240000 }, async t => {
  if (!await resolveBlender()) { t.skip('Blender unavailable'); return }
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-asset-test-'))
  try {
    const source = path.join(root, 'assembly.glb')
    const code = [
      'bpy.ops.wm.read_factory_settings(use_empty=True)',
      'for x in (-2, 2):',
      '    bpy.ops.mesh.primitive_cube_add(size=2, location=(x,0,1))',
      'bpy.ops.export_scene.gltf(filepath=' + JSON.stringify(source) + ', export_format="GLB")',
      'print("BYP_CODE_EXECUTED")',
    ].join(String.fromCharCode(10))
    const made = await call('blender_code', { code }, root)
    assert.equal(made.ok, true, JSON.stringify(made)); assert.match(made.log, /BYP_CODE_EXECUTED/)
    const before = await readFile(source)
    const result = await call('asset_pipeline', { source, godot_import: false, ops: [
      { op: 'rotate', args: { axis: 'Z', degrees: 90 } }, { op: 'normalize_size', args: { fit_m: 3 } },
      { op: 'origin_to_floor' }, { op: 'collision', args: { ratio: .5, suffix: '-convcol' } },
    ] }, root)
    assert.equal(result.ok, true, JSON.stringify(result))
    assert.ok(Math.abs(Math.max(...result.bounds_m.size) - 3) < .001, JSON.stringify(result.bounds_m))
    assert.ok(Math.abs(result.bounds_m.min[2]) < .001)
    assert.deepEqual(await readFile(source), before, 'source asset must remain unchanged')
    const exported = glbJson(await readFile(path.join(root, result.out)))
    assert.ok(exported.nodes.some((n: any) => n.name === 'DSH_AssetRoot'))
    assert.ok(exported.nodes.some((n: any) => n.name.endsWith('-convcol')))
    console.log('Blender assembly bounds:', result.bounds_m)
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 3 }) }
})

test('Rigged GLB keeps skin and animation and rejects destructive decimation', { timeout: 240000 }, async t => {
  if (!await resolveBlender()) { t.skip('Blender unavailable'); return }
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-rig-test-'))
  try {
    const source = path.join(root, 'rig.glb')
    const code = [
      'bpy.ops.wm.read_factory_settings(use_empty=True)',
      'bpy.ops.object.armature_add()',
      'rig=bpy.context.object; rig.name="TestRig"',
      'rig.location.x=0; rig.keyframe_insert(data_path="location", frame=1)',
      'rig.location.x=1; rig.keyframe_insert(data_path="location", frame=10)',
      'bpy.context.scene.frame_set(1)',
      'bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,.5))',
      'mesh=bpy.context.object; mesh.name="SkinnedCube"',
      'group=mesh.vertex_groups.new(name=rig.data.bones[0].name)',
      'group.add(list(range(len(mesh.data.vertices))), 1.0, "REPLACE")',
      'mod=mesh.modifiers.new("Skin", "ARMATURE"); mod.object=rig',
      'mesh.parent=rig',
      'bpy.context.scene.frame_end=10',
      'bpy.ops.export_scene.gltf(filepath=' + JSON.stringify(source) + ', export_format="GLB", export_animations=True)',
    ].join(String.fromCharCode(10))
    const made = await call('blender_code', { code }, root)
    assert.equal(made.ok,true,JSON.stringify(made))
    const transformed = await call('asset_pipeline', { source, godot_import:false, ops:[{op:'normalize_size',args:{fit_m:2}},{op:'origin_to_floor'}] }, root)
    assert.equal(transformed.ok,true,JSON.stringify(transformed)); assert.equal(transformed.rigged,true)
    const asset = glbJson(await readFile(path.join(root, transformed.out)))
    assert.ok(asset.skins?.length > 0, 'skin lost during export')
    assert.ok(asset.animations?.length > 0, 'animation lost during export')
    const refused = await call('asset_pipeline', { source, godot_import:false, out_path:'unsafe.glb', ops:[{op:'decimate',args:{ratio:.5}}] }, root)
    assert.equal(refused.ok,false); assert.ok(String(refused.error).includes('Rigged/animated asset'))
  } finally { await rm(root, {recursive:true,force:true,maxRetries:3}) }
})

test('Godot imports and runs a disposable scene, rejects zero-exit script errors', { timeout: 300000 }, async t => {
  if (!await resolveGodot()) { t.skip('Godot unavailable'); return }
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-godot-test-'))
  const nl = String.fromCharCode(10)
  try {
    await writeFile(path.join(root, 'project.godot'), ['config_version=5', '[application]', 'config/name="DSH Engine Smoke"', 'run/main_scene="res://main.tscn"', '[rendering]', 'renderer/rendering_method="gl_compatibility"'].join(nl))
    await writeFile(path.join(root, 'main.tscn'), ['[gd_scene load_steps=2 format=3]', '[ext_resource type="Script" path="res://main.gd" id="1"]', '[node name="Smoke" type="Node2D"]', 'script = ExtResource("1")'].join(nl))
    await writeFile(path.join(root, 'main.gd'), ['extends Node2D', 'func _ready() -> void:', '    print("DSH_SCENE_READY")'].join(nl))
    const good = await verifyGodot(root, 240)
    assert.equal(good.ok, true, JSON.stringify(good)); assert.match(good.runtime?.tail ?? '', /DSH_SCENE_READY/)
    console.log('Godot version:', good.version)
    await writeFile(path.join(root, 'main.gd'), ['extends Node2D', 'func _ready() -> void:', '    push_error("DSH_INTENTIONAL_TEST_ERROR")'].join(nl))
    const bad = await verifyGodot(root, 10)
    assert.equal(bad.ok, false, JSON.stringify(bad))
    assert.ok(bad.runtime?.errors.some(e => e.includes('DSH_INTENTIONAL_TEST_ERROR')))
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 3 }) }
})
