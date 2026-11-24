import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
test('история сохраняет снимок запроса, обновляет результат и разделяет сценарии',()=>{
 const window={};vm.runInNewContext(readFileSync(new URL('../plugin/request-history.js',import.meta.url),'utf8'),{window,Date});const h=window.AIRequestHistory;
 const a={id:'a',created:1,scenario:'summary',state:'working'},b={id:'b',created:2,scenario:'presentation',state:'ready'};
 h.remember(a,{text:'Первый источник'},{guard:'first'},{scope:'selection'});h.remember(b,{text:'Другой источник'},null,{scope:'document'});
 h.remember({...a,state:'ready',result:{kind:'text',text:'Первый ответ'}},{text:'НЕ ПОДМЕНЯТЬ'},null,{});
 assert.equal(h.latest('summary').task.result.text,'Первый ответ');assert.equal(h.find('a').snapshot.text,'Первый источник');assert.equal(h.find('a').formatCapture.guard,'first');assert.equal(h.latest('presentation').task.id,'b');assert.equal(h.all().length,2);
 for(let i=0;i<21;i++)h.remember({id:'new'+i,scenario:'summary',created:i,state:'ready'},{text:'test'},null,{});
 assert.equal(h.all().length,20);assert.equal(h.find('a'),undefined);assert.equal(h.latest('summary').task.id,'new20');
});
