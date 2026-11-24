import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {start} from '../server/main.mjs';
test('production pairing: no code/User-Agent bypass from Node or browser',async()=>{
  const app=await start({port:0,allowCodePair:false});
  try{const r=await fetch(app.url+'/pair',{method:'POST',headers:{'Content-Type':'application/json',Origin:'null','User-Agent':'R7-Office DesktopEditors.exe'},body:JSON.stringify({code:app.code,panelId:randomUUID(),title:'Spoofed client'})});assert.equal(r.status,403);assert.equal(app.store.sessions.size,0);}finally{await app.close();}
});
test('pairing obtains per-document credentials only after OS peer verifier accepts',async()=>{
  let checked=false;const app=await start({port:0,allowCodePair:false,verifyPeer:async socket=>{assert.ok(socket.remotePort>0);checked=true;return true;}});
  try{const r=await fetch(app.url+'/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({panelId:randomUUID(),title:'Verified R7 document'})});assert.equal(r.status,200);const s=await r.json();assert.ok(s.pluginToken);assert.notEqual(s.pluginToken,s.mcpToken);assert.ok(checked);}finally{await app.close();}
});
