import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Store} from '../server/store.mjs';import {formatContract} from '../server/result-schema.mjs';import {start} from '../server/main.mjs';import {createHostHooks} from '../server/host-tools.mjs';
test('style имеет текстовый контракт; другой тип и короткая заглушка не завершают задачу',()=>{
  const store=new Store(),s=store.pair({panelId:randomUUID(),title:'Документ стиля'}),text='Факты сохраняются при смене манеры изложения. '.repeat(150),t=store.task(s,{scenario:'style',scope:'document',text,style:'official'});store.claim(s,t.id);
  assert.equal(formatContract(t).expectedKind,'text');assert.match(formatContract(t).instructions,/ПОЛНЫМ/);
  assert.throws(()=>store.submit(s,t.id,t.claim,{kind:'formatted',blocks:[{type:'paragraph',text}]}),/Сценарий style ожидает/);
  assert.throws(()=>store.submit(s,t.id,t.claim,{kind:'text',text:'Готово.'}),/слишком короткий/);assert.equal(t.state,'working');
  assert.throws(()=>store.submit(s,t.id,t.claim,{kind:'text',text:'Я'.repeat(250001)}),/250001/);
  assert.throws(()=>store.submit(s,t.id,t.claim,{kind:'text',text}),/Манера изложения не изменена/);assert.equal(t.state,'working');
  const result={kind:'text',text:text.replaceAll('Факты сохраняются','Сохранение фактов обеспечивается')};store.submit(s,t.id,t.claim,result);assert.equal(store.submit(s,t.id,t.claim,{text:result.text,kind:'text'}).state,'ready');
  assert.throws(()=>store.submit(s,t.id,t.claim,{kind:'text',text:text+' Изменение'}),/уже доставлена/);assert.equal(t.result.text,result.text);
});
test('настоящий host+MCP: полный длинный style, квитанция, повтор и следующая задача без listen',async()=>{
  const app=await start({port:0}),folder=await mkdtemp(join(tmpdir(),'r7-style-host-'));let hooks;
  try{
    const prompts=[];
    hooks=await createHostHooks({directory:folder,client:{session:{promptAsync:async r=>{prompts.push(r);return {response:{ok:true}};}}}},()=>app);
    const s=app.store.pair({panelId:randomUUID(),title:'Документ стиля'}),text='Солдат попросил воды. Старуха принесла котелок. '.repeat(3500),t=app.store.task(s,{scenario:'style',scope:'document',text,style:'official'}),ctx={sessionID:'style-chat'};
    await hooks.tool.r7_ai_host_listen.execute({},ctx);for(let n=0;n<40&&!prompts.length;n++)await new Promise(r=>setTimeout(r,100));
    const task=JSON.parse(await hooks.tool.r7_ai_host_get_task.execute({},ctx));assert.equal(task.id,t.id);assert.equal(task.resultContract.expectedKind,'text');assert.equal(task.text.length,text.length);
    const bad=JSON.parse(await hooks.tool.r7_ai_host_submit_result.execute({taskId:t.id,result:{kind:'formatted',blocks:[{type:'paragraph',text}]}},ctx));assert.equal(bad.ok,false);assert.match(bad.error,/kind="text"/);
    const short=JSON.parse(await hooks.tool.r7_ai_host_submit_result.execute({taskId:t.id,result:{kind:'text',text:'Краткий пример'}},ctx));assert.equal(short.ok,false);assert.equal(t.state,'working');
    const unchanged=JSON.parse(await hooks.tool.r7_ai_host_submit_result.execute({taskId:t.id,result:{kind:'text',text}},ctx));assert.equal(unchanged.ok,false);assert.match(unchanged.error,/не изменена/);
    const result={kind:'text',text:text.replaceAll('Солдат попросил воды.','Солдат запросил воду.')},receipt=JSON.parse(await hooks.tool.r7_ai_host_submit_result.execute({taskId:t.id,result},ctx));assert.equal(receipt.delivered,true);assert.equal(receipt.resultCharacters,result.text.length);assert.equal(receipt.listenerActive,true);assert.equal(t.result.text,result.text);
    const repeat=JSON.parse(await hooks.tool.r7_ai_host_submit_result.execute({taskId:t.id,result},ctx));assert.equal(repeat.alreadyDelivered,true);
    const last=JSON.parse(await hooks.tool.r7_ai_host_get_task.execute({},ctx));assert.equal(last.delivered,true);assert.equal(last.taskId,t.id);
    const next=app.store.task(s,{scenario:'summary',scope:'document',text:'Следующий источник'});for(let n=0;n<40&&prompts.length<2;n++)await new Promise(r=>setTimeout(r,100));assert.equal(prompts.length,2);assert.equal(JSON.parse(await hooks.tool.r7_ai_host_get_task.execute({},ctx)).id,next.id);
    await hooks.tool.r7_ai_host_submit_result.execute({taskId:t.id,result},ctx);assert.equal(JSON.parse(await hooks.tool.r7_ai_host_get_task.execute({},ctx)).id,next.id);
  }finally{await hooks?.event({event:{type:'session.deleted',properties:{info:{id:'style-chat'}}}});await app.close();await rm(folder,{recursive:true});}
});
