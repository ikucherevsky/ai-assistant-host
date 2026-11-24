import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {Store,validateResult} from '../server/store.mjs';import {start} from '../server/main.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';const pair=store=>store.pair({panelId:randomUUID(),title:'Тестовый документ'});
const task=(store,s,extra={})=>store.task(s,{scenario:'style',scope:'selection',text:'Исходный текст',style:'official',...extra});
test('документы изолированы; повторная пара отзывает оба токена',()=>{const store=new Store(),a=pair(store),b=pair(store),t=task(store,a);assert.throws(()=>store.find(b,t.id));assert.throws(()=>store.auth(a.pluginToken,'mcp'));store.pair({panelId:a.panelId,title:'Новое подключение'});assert.throws(()=>store.auth(a.mcpToken,'mcp'));assert.equal(store.auth(b.mcpToken,'mcp'),b);});
test('отмена блокирует поздний результат и комментарий',()=>{const store=new Store(),s=pair(store),t=task(store,s);store.claim(s,t.id);store.cancel(s,t.id);assert.throws(()=>store.submit(s,t.id,t.claim,{kind:'text',text:'Поздний ответ'}));assert.throws(()=>store.progress(s,t.id,t.claim,'Поздно'));});
test('единственный исполнитель и результат; ограничения очереди',()=>{const store=new Store(),s=pair(store),t=task(store,s);assert.throws(()=>task(store,s));store.claim(s,t.id);assert.throws(()=>store.claim(s,t.id));assert.throws(()=>store.submit(s,t.id,'wrong',{kind:'text',text:'Ответ'}));store.submit(s,t.id,t.claim,{kind:'text',text:'Ответ'});assert.throws(()=>store.submit(s,t.id,t.claim,{kind:'text',text:'Другой'}));});
test('панель истекает без heartbeat',()=>{let time=100;const store=new Store({now:()=>time,ttl:50}),s=pair(store);time=140;store.heartbeat(s);time=180;assert.equal(store.auth(s.mcpToken,'mcp'),s);time=200;assert.throws(()=>store.auth(s.mcpToken,'mcp'));});
test('контракты сценариев и неподлинные изображения отклоняются',()=>{const store=new Store(),s=pair(store);assert.throws(()=>task(store,s,{scenario:'unknown'}));assert.throws(()=>task(store,s,{scenario:'questions',prompt:''}));assert.throws(()=>validateResult({scenario:'image'},{kind:'image',data:'https://example.com/image.png'}));assert.throws(()=>validateResult({scenario:'image'},{kind:'image',data:'data:image/png;base64,ZmFrZQ=='}));assert.throws(()=>validateResult({scenario:'presentation'},{kind:'slides',slides:[]}));});
test('SDK MCP HTTP: полный цикл, отдельные вкладки, экспорт PPTX, Origin/Host/auth',async()=>{
  const app=await start({port:0,code:'123456',allowCodePair:true});const clients=[];
  const post=async(path,body,token)=>fetch(app.url+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
  try{
    assert.equal((await post('/pair',{code:'wrong'})).status,401);
    assert.equal((await fetch(app.url+'/health',{headers:{Origin:'https://evil.example'}})).status,403);
    const a=await(await post('/pair',{code:app.code,panelId:randomUUID(),title:'Документ A'})).json(),b=await(await post('/pair',{code:app.code,panelId:randomUUID(),title:'Документ B'})).json();
    for(const s of [a,b]){const client=new Client({name:'QA',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(a.mcpUrl),{requestInit:{headers:{Authorization:'Bearer '+s.mcpToken}}}));clients.push(client);}
    const call=async(c,name,args={})=>{const response=await c.callTool({name,arguments:args});assert.ok(!response.isError,JSON.stringify(response));return JSON.parse(response.content[0].text);};
    const t=await(await post('/tasks',{scenario:'presentation',scope:'document',text:'План: запуск продукта.'},a.pluginToken)).json();
    assert.equal((await call(clients[1],'r7_list_tasks')).length,0);assert.equal((await call(clients[0],'r7_list_tasks'))[0].id,t.id);
    const claimed=await call(clients[0],'r7_claim_task',{taskId:t.id});assert.equal(claimed.text,'План: запуск продукта.');
    await call(clients[0],'r7_progress',{taskId:t.id,claim:claimed.claim,message:'Готовлю тезисы'});
    await call(clients[0],'r7_submit_result',{taskId:t.id,claim:claimed.claim,result:{kind:'slides',slides:[{title:'Запуск',bullets:['Анализ','Разработка','Проверка']}]}});
    const file=await fetch(app.url+'/tasks/'+t.id+'/export',{headers:{Authorization:'Bearer '+a.pluginToken}});assert.equal(file.status,200);const bytes=Buffer.from(await file.arrayBuffer());assert.equal(bytes.subarray(0,2).toString(),'PK');assert.ok(bytes.length>5000);
    assert.equal((await fetch(app.url+'/tasks/'+t.id,{headers:{Authorization:'Bearer '+b.pluginToken}})).status,400);
    assert.equal((await fetch(app.url+'/tasks/'+t.id)).status,401);
    const status=await(await fetch(app.url+'/tasks/'+t.id,{headers:{Authorization:'Bearer '+a.pluginToken}})).json();assert.equal(status.state,'ready');assert.equal(status.claim,undefined);
  }finally{await Promise.all(clients.map(c=>c.close()));await app.close();}
});
