import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
import {start} from '../server/main.mjs';import {createHostHooks} from '../server/host-tools.mjs';
import {z} from 'zod/v4';
import '../plugin/format-model.js';
test('настоящий host-адаптер + MCP: автоматическое получение и доставка в исходную сессию',async()=>{
  const app=await start({port:0}),folder=await mkdtemp(join(tmpdir(),'r7-ai-host-test-'));let hooks;
  try{const prompts=[];hooks=await createHostHooks({directory:folder,client:{session:{promptAsync:async request=>{prompts.push(request);return {response:{ok:true}};}}}},()=>app);
    for(const tool of Object.values(hooks.tool))assert.doesNotThrow(()=>z.toJSONSchema(z.object(tool.args)),'Host tools must use compatible Zod 4 schemas');
    const s=app.store.pair({panelId:randomUUID(),title:'Исходная вкладка'}),other=app.store.pair({panelId:randomUUID(),title:'Другая вкладка'});
    const t=app.store.task(s,{scenario:'summary',scope:'document',text:'Данные для суммаризации'});
    const qa=app.store.pair({panelId:randomUUID(),title:'Изолированный QA',testing:true});
    const qaTask=app.store.task(qa,{scenario:'summary',scope:'document',text:'Тестовый ответ доставляет SDK, а не реальная модель'});
    const pending=await(await fetch(app.url+'/host/pending',{headers:{Authorization:'Bearer '+app.hostToken}})).json();
    assert.ok(pending.some(p=>p.id===t.id));assert.ok(!pending.some(p=>p.id===qaTask.id),'Live host must not consume test fixtures');
    const context={sessionID:'host-chat'};await hooks.tool.r7_ai_host_listen.execute({},context);
    for(let n=0;n<40&&!prompts.length;n++)await new Promise(r=>setTimeout(r,100));assert.equal(prompts.length,1);assert.match(prompts[0].body.parts[0].text,/Исходная вкладка/);
    const got=JSON.parse(await hooks.tool.r7_ai_host_get_task.execute({},context));assert.equal(got.id,t.id);assert.equal(got.text,'Данные для суммаризации');assert.equal(got.mcpToken,undefined);assert.equal(got.claim,undefined);
    await hooks.tool.r7_ai_host_progress.execute({taskId:t.id,message:'Готовлю краткий ответ'},context);
    await hooks.tool.r7_ai_host_submit_result.execute({taskId:t.id,result:{kind:'text',text:'Краткий ответ'}},context);
    assert.equal(app.store.find(s,t.id).state,'ready');assert.equal(other.tasks.length,0);assert.equal(t.progress[0].message,'Готовлю краткий ответ');
    assert.equal((await fetch(app.url+'/host/pending')).status,401);
  }finally{await hooks?.event({event:{type:'session.deleted',properties:{info:{id:'host-chat'}}}});await app.close();await rm(folder,{recursive:true});}
});

test('format: явная схема, JSON ошибки MCP и исправленный ответ в той же задаче',async()=>{
  const app=await start({port:0}),folder=await mkdtemp(join(tmpdir(),'r7-format-host-'));let hooks;
  try{
    let prompts=0;
    hooks=await createHostHooks({directory:folder,client:{session:{promptAsync:async()=>{prompts++;return {response:{ok:true}};}}}},()=>app);
    const schema=z.toJSONSchema(z.object(hooks.tool.r7_ai_host_submit_result.args));
    assert.ok(schema.properties.result.properties.profile.properties.body.properties.font);
    const s=app.store.pair({panelId:randomUUID(),title:'QA format'}),profile=globalThis.AIFormat.profile('academic','forest'),sourceBlocks=[{type:'paragraph',text:'Текст без изменения фактов'}];
    const t=app.store.task(s,{scenario:'format',scope:'document',text:'Текст без изменения фактов',formatting:{profile,sourceBlocks,protectedIds:[],allowStructure:true}}),ctx={sessionID:'format-chat'};
    await hooks.tool.r7_ai_host_listen.execute({},ctx);for(let i=0;i<40&&!prompts;i++)await new Promise(r=>setTimeout(r,100));assert.equal(prompts,1);
    const task=JSON.parse(await hooks.tool.r7_ai_host_get_task.execute({},ctx));assert.deepEqual(task.resultContract.resultTemplate.profile,profile);
    // Actual SDK validation returns plain text; the host must not JSON.parse it blindly.
    const bad=JSON.parse(await hooks.tool.r7_ai_host_submit_result.execute({taskId:t.id,result:{kind:'formatted',profile:{body:{size:'large'}},blocks:sourceBlocks}},ctx));
    assert.equal(bad.ok,false);assert.match(bad.error,/size|number/);assert.doesNotMatch(bad.error,/not valid JSON/);assert.equal(t.state,'working');
    const wrong=JSON.parse(await hooks.tool.r7_ai_host_submit_result.execute({taskId:t.id,result:{kind:'text',text:'Заголовки готовы'}},ctx));assert.equal(wrong.ok,false);assert.match(wrong.error,/структурированный/);
    const blocks=[{type:'heading',level:1,text:'Заголовок'},{type:'paragraph',text:'Текст без изменения фактов'}];
    const ok=JSON.parse(await hooks.tool.r7_ai_host_submit_result.execute({taskId:t.id,result:{kind:'formatted',profile:{headings:[{level:1,underline:true}]},blocks}},ctx));
    assert.equal(ok.ok,true);assert.equal(t.state,'ready');assert.equal(t.result.profile.body.font,'Times New Roman');assert.equal(t.result.profile.headings.length,9);assert.equal(t.result.profile.headings[0].underline,true);assert.deepEqual(t.result.blocks,blocks);
  }finally{await hooks?.event({event:{type:'session.deleted',properties:{info:{id:'format-chat'}}}});await app.close();await rm(folder,{recursive:true});}
});
