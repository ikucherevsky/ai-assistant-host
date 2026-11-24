import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import JSZip from 'jszip';
import '../plugin/format-model.js';import {Store} from '../server/store.mjs';import {makeDocx} from '../server/docx.mjs';import {start} from '../server/main.mjs';
const F=globalThis.AIFormat;
test('DOCX содержит текст, девять уровней заголовков, нумерацию и таблицу',async()=>{
  const profile=F.profile('academic','forest');profile.numbering='decimal';profile.headings[0].underline=true;
  const bytes=await makeDocx({kind:'formatted',profile,blocks:[{type:'heading',level:1,text:'Отчёт'},{type:'heading',level:9,text:'Подраздел'},{type:'bullet',text:'Первый пункт'},{type:'table',rows:[['Срок','Статус'],['Ноябрь','Готово']]}]},{widthMm:297,heightMm:420});
  const zip=await JSZip.loadAsync(bytes),document=await zip.file('word/document.xml').async('string'),styles=await zip.file('word/styles.xml').async('string');
  assert.match(document,/Отчёт/);assert.match(document,/<w:tbl>/);assert.match(document,/Готово/);assert.match(document,/w:pgSz w:w="16838" w:h="23811"/);assert.match(document,/w:numPr/);assert.match(styles,/Heading9/);assert.match(styles,/<w:u w:val="single"/);assert.match(styles,/Times New Roman/);
});
test('обычный текст экспортируется DOCX без потери Unicode и пустых строк',async()=>{const b=await makeDocx({kind:'text',text:'Привет 🌿\n\nВторая строка'});const z=await JSZip.loadAsync(b);assert.match(await z.file('word/document.xml').async('string'),/Привет 🌿/);});

test('DOCX сохраняет поля документа при выключенном изменении полей и не уплощает сложные объекты',async()=>{
  const result={kind:'formatted',profile:F.profile(),blocks:[{type:'paragraph',text:'QA'}]};
  const bytes=await makeDocx(result,{widthMm:210,heightMm:297,marginsMm:{top:10,bottom:11,left:12,right:13}},{applyMargins:false});
  const zip=await JSZip.loadAsync(bytes),xml=await zip.file('word/document.xml').async('string');assert.match(xml,/w:top="567"/);assert.match(xml,/w:left="680"/);
  await assert.rejects(()=>makeDocx({...result,blocks:[{type:'preserve',id:'image'}]}),/нет снимка/);
  await assert.rejects(()=>makeDocx(result,{widthMm:-1,heightMm:297}),/размер/);
});
test('план не может потерять исходный защищённый объект или подменить структуру в режиме оформления',()=>{
  const store=new Store(),s=store.pair({panelId:randomUUID(),title:'QA'}),profile=F.profile(),sourceBlocks=[{type:'paragraph',text:'Смысл'},{type:'preserve',id:'image-1'}];
  const t=store.task(s,{scenario:'format',scope:'document',text:'Смысл',formatting:{profile,sourceBlocks,protectedIds:['image-1'],allowStructure:false}});store.claim(s,t.id);
  assert.throws(()=>store.submit(s,t.id,t.claim,{kind:'formatted',profile,blocks:[{type:'paragraph',text:'Смысл'}]}));
  assert.throws(()=>store.submit(s,t.id,t.claim,{kind:'formatted',profile,blocks:[{type:'paragraph',text:'Подмена'},{type:'preserve',id:'image-1'}]}));
  assert.equal(store.submit(s,t.id,t.claim,{kind:'formatted',profile,blocks:sourceBlocks}).state,'ready');
});
test('проверяются шрифты, размеры, уровни и прямоугольность таблиц',()=>{const p=F.profile();p.body.size=500;assert.throws(()=>F.validateProfile(p));assert.throws(()=>F.validateBlocks([{type:'heading',level:10,text:'Ошибка'}]));assert.throws(()=>F.validateBlocks([{type:'table',rows:[['А','Б'],['В']]}]));});

test('format без profile использует профиль задачи; дубли уровней отклоняются',()=>{
  const store=new Store(),s=store.pair({panelId:randomUUID(),title:'QA'}),profile=F.profile(),blocks=[{type:'paragraph',text:'QA'}];
  const t=store.task(s,{scenario:'format',scope:'document',text:'QA',formatting:{profile,sourceBlocks:blocks,protectedIds:[],allowStructure:false}});store.claim(s,t.id);
  assert.throws(()=>store.submit(s,t.id,t.claim,{kind:'formatted',blocks,profile:{headings:[{level:1},{level:1}]}}),/уникальные/);
  assert.deepEqual(store.submit(s,t.id,t.claim,{kind:'formatted',blocks}).result.profile,profile);
});
test('HTTP export по умолчанию DOCX, TXT остаётся отдельным вариантом',async()=>{const app=await start({port:0});try{const s=app.store.pair({panelId:randomUUID(),title:'QA'}),t=app.store.task(s,{scenario:'summary',scope:'document',text:'Текст'});app.store.claim(s,t.id);app.store.submit(s,t.id,t.claim,{kind:'text',text:'Итог'});const headers={Authorization:'Bearer '+s.pluginToken};const r=await fetch(app.url+'/tasks/'+t.id+'/export',{headers});assert.match(r.headers.get('content-type'),/wordprocessingml/);assert.ok((await r.arrayBuffer()).byteLength>1000);const txt=await fetch(app.url+'/tasks/'+t.id+'/export?format=txt',{headers});assert.equal(await txt.text(),'Итог');}finally{await app.close();}});

test('частичная тема меняет палитру, сохраняя выбранный шрифт',()=>{const store=new Store(),s=store.pair({panelId:randomUUID(),title:'QA'}),profile=F.profile(),blocks=[{type:'paragraph',text:'QA'}];profile.body.font='Georgia';const t=store.task(s,{scenario:'format',scope:'document',text:'QA',formatting:{profile,sourceBlocks:blocks,protectedIds:[],allowStructure:false}});store.claim(s,t.id);const r=store.submit(s,t.id,t.claim,{kind:'formatted',blocks,profile:{theme:'forest'}}).result;assert.equal(r.profile.body.font,'Georgia');assert.equal(r.profile.headings[0].color,F.profile('business','forest').headings[0].color);assert.equal(profile.theme,'office');});
