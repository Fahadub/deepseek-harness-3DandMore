import test from 'node:test'
import assert from 'node:assert/strict'
import { Script } from 'node:vm'
import { apply as injectUI } from '../ui-inject.ts'
import { buildGameGuide } from '../lib/game-build-guide.ts'
import { validateAssetOps, engineRunPassed } from '../lib/engine-contract.ts'
import { keyEvent, validatePlayActions, deliveryGate } from '../lib/playtest-contract.ts'
import { runCaptured } from '../tool-blender.ts'

test('injected editor build-mode script parses and contains engineering protocol', () => {
  let hook: (html: string) => string = html => html
  injectUI({ effect: (fn: () => unknown) => fn(), webServer: { tapIndex: (fn: typeof hook) => { hook = fn; return () => {} } } } as any)
  const html = hook('<html><body></body></html>')
  assert.match(html, /game_build_guide/); assert.match(html, /godot_verify/)
  const scripts = html.split('<script').slice(1).map(s => s.slice(s.indexOf('>') + 1, s.indexOf('</script>')))
  assert.ok(scripts.length > 0)
  scripts.forEach(script => new Script(script))
})

test('guidance adapts engine, dimensions, platforms and never claims verification', () => {
  for (const engine of ['godot', 'three', 'blender']) for (const dimension of ['2d','3d']) {
    const plan = buildGameGuide(engine, dimension, ['mobile', 'tablet', 'web'], 'puzzle')
    assert.equal(plan.genre, 'puzzle'); assert.equal(plan.dimension, dimension)
    assert.ok(plan.device_matrix.every(row => row.verified === false))
    assert.ok(plan.input.some(s => s.includes('pointer')))
  }
  assert.throws(() => buildGameGuide('unknown', '3d', ['web']))
})

test('asset operations reject typos, NaN, destructive ordering and bad arguments', () => {
  for (const ops of [[{op:'typo'}], [{op:'rotate',args:{degrees:NaN}}], [{op:'normalize_size',args:{fit_m:0}}], [{op:'collision',args:{ratio:2}}], [{op:'collision'},{op:'rotate'}], [{op:'decimate',args:[]}], [{op:'collision',args:{suffix:'arbitrary'}}]]) assert.throws(() => validateAssetOps(ops))
  assert.equal(validateAssetOps([{op:'rotate',args:{axis:'Z',degrees:90}},{op:'collision',args:{suffix:'-convcol'}}]).length, 2)
})

test('Godot error logs fail even when exit code is zero', () => {
  assert.equal(engineRunPassed({code:0,timedOut:false,out:'SCRIPT ERROR: invalid access'}), false)
  assert.equal(engineRunPassed({code:0,timedOut:false,out:'ERROR: missing resource'}), false)
  assert.equal(engineRunPassed({code:0,timedOut:true,out:''}), false)
  assert.equal(engineRunPassed({code:0,timedOut:false,out:'ready'}), true)
})

test('keyboard and multi-touch contract validates trusted-event parameters', () => {
  assert.deepEqual(keyEvent('KeyW'), {code:'KeyW',key:'w',windowsVirtualKeyCode:87,nativeVirtualKeyCode:87})
  assert.equal(keyEvent('ArrowLeft').windowsVirtualKeyCode, 37)
  validatePlayActions([{type:'touch',phase:'start',points:[{id:1,x:10,y:10},{id:2,x:100,y:100}]},{type:'touch',phase:'end',points:[]}])
  assert.throws(() => validatePlayActions([{type:'key',key:'bad'}]))
  assert.throws(() => validatePlayActions([{type:'wait',ms:Infinity}]))
  assert.throws(() => validatePlayActions([{type:'touch',phase:'start',points:[]}]))
})

test('delivery gate never substitutes screenshot motion or score for behavior', () => {
  const base = { loaderHidden:true,consoleErrors:[],networkFails:[],avgFps:60,hudChecks:[],chaos:[] }
  assert.equal(deliveryGate(base).ok, false)
  assert.equal(deliveryGate({...base,hudChecks:[{ok:false}]}).ok, false)
  assert.equal(deliveryGate({...base,hudChecks:[{ok:true}]}).ok, true)
  assert.equal(deliveryGate({...base,hudChecks:[{ok:true}],chaos:[{verified:false}]}).ok, false)
  assert.equal(deliveryGate({...base,hudChecks:[{ok:true}],avgFps:1}).ok, false)
})

test('engine spawn errors are reported and timed-out processes are stopped', {timeout:15000}, async () => {
  const missing = await runCaptured('dsh-nonexistent-engine-for-test', [], {timeoutMs:1000})
  assert.equal(missing.code, -1)
  const timed = await runCaptured(process.execPath, ['-e','setInterval(()=>{},1000)'], {timeoutMs:100})
  assert.equal(timed.timedOut, true)
})
