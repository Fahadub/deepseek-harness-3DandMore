/** Browser input test fixture only, not a game project. Always removed in finally. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { runPlaytest } from '../tool-playtest.ts'

const page = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><canvas width="300" height="180" tabindex="0" style="touch-action:none"></canvas><script>' + [
  'window.keyCount=0;window.touchCount=0;window.lastKey="";',
  'const canvas=document.querySelector("canvas"),ctx=canvas.getContext("2d");',
  'canvas.addEventListener("keydown",e=>{if(e.isTrusted){window.keyCount++;window.lastKey=e.key+":"+e.code;}});',
  'for(const name of ["touchstart","touchmove","touchend"]){canvas.addEventListener(name,e=>{e.preventDefault();if(e.isTrusted)window.touchCount++;},{passive:false});}',
  'function draw(){ctx.fillStyle="#223344";ctx.fillRect(0,0,300,180);ctx.fillStyle="#ffffff";ctx.fillRect(20+window.keyCount*30,40,30,30);requestAnimationFrame(draw);}draw();',
].join(String.fromCharCode(10)) + '</script></body></html>'

test('trusted keyboard and multi-touch work in desktop/mobile/tablet profiles; failed state check fails delivery', {timeout:180000}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-input-test-'))
  const server = createServer((_req,res) => {res.writeHead(200,{'content-type':'text/html'});res.end(page)})
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve))
  const url = 'http://127.0.0.1:' + (server.address() as {port:number}).port
  try {
    for (const device of ['desktop','mobile','tablet'] as const) {
      const actions: any[] = device === 'desktop' ? [{type:'key',key:'KeyW',ms:120}] : [
        {type:'touch',phase:'start',points:[{x:40,y:40,id:1},{x:100,y:100,id:2}],ms:120},
        {type:'touch',phase:'move',points:[{x:60,y:40,id:1},{x:110,y:100,id:2}],ms:120},
        {type:'touch',phase:'end',points:[],ms:120},
      ]
      const hudChecks = device === 'desktop' ? [{name:'trusted keyboard input',expr:'window.keyCount'}, {name:'correct key and code',expr:'window.lastKey'}] : [{name:'trusted touch input',expr:'window.touchCount'}]
      const report = await runPlaytest(url,{game:'input-fixture',actions,fpsSeconds:2,hudChecks,chaos:[],replay:false,workspaceRoot:root,device,minFps:1},undefined)
      assert.equal(report.ok,true,JSON.stringify(report))
      assert.equal(report.device,device)
      if (device === 'desktop') assert.equal(report.hudChecks[1].after,'w:KeyW')
      console.log('Input profile passed:',device,'FPS:',report.avgFps)
    }
    const negative = await runPlaytest(url,{game:'negative-fixture',actions:[{type:'wait',ms:10}],fpsSeconds:2,hudChecks:[{name:'must change',expr:'window.keyCount'}],chaos:[],replay:false,workspaceRoot:root,minFps:1},undefined)
    assert.equal(negative.ok,false)
    assert.equal(negative.acceptance?.behavior,false)
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve()))
    await rm(root,{recursive:true,force:true,maxRetries:3})
  }
})
