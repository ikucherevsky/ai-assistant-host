import test from 'node:test';import assert from 'node:assert/strict';import JSZip from 'jszip';import {randomUUID} from 'node:crypto';
import {prepareExportObjects,richResult} from '../server/rich-result.mjs';import {makeDocx} from '../server/docx.mjs';import {Store} from '../server/store.mjs';import {start} from '../server/main.mjs';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGP4z8DwH4QBFvkD/bo2tG4AAAAASUVORK5CYII=';
const assets={list:{html:'<ol start="3"><li><p>Существующий пункт</p></li></ol>'},image:{html:'<p><a href="https://example.com">Ссылка</a><img width="120" height="60" src="'+png+'"></p>'}};
function result(){const profile=AIFormat.profile('academic','violet');profile.body.size=12;profile.headings[0].underline=true;return {kind:'formatted',profile,blocks:[{type:'heading',level:1,text:'Предпросмотр'},{type:'preserve',id:'list'},{type:'preserve',id:'image'}]};}
test('снимки очищаются от executable HTML и скрытых native docData, модель не получает снимки',()=>{
  const clean=prepareExportObjects({list:{html:'<p class="docData;SECRET" onclick="bad()">Текст<script>bad()</script><a href="javascript:bad()">Ссылка</a></p>'}},['list']);assert.doesNotMatch(clean.list.html,/SECRET|onclick|javascript:|<script/);
  assert.throws(()=>prepareExportObjects({image:{html:'<img src="http://localhost/private">'}},['image']),/встроенное изображение/);
  const store=new Store(),s=store.pair({panelId:randomUUID(),title:'QA'}),r=result(),t=store.task(s,{scenario:'format',scope:'document',text:'Источник',formatting:{profile:r.profile,sourceBlocks:r.blocks,protectedIds:['list','image']},exportObjects:assets});
  assert.ok(t.exportObjects.list);assert.equal(JSON.parse(JSON.stringify(t)).exportObjects,undefined);
});
test('HTML буфера содержит подготовленные шрифты, подчёркивание, список, ссылку и изображение',()=>{
  const rendered=richResult(result(),assets);assert.match(rendered.html,/Times New Roman/);assert.match(rendered.html,/font-size:12pt/);assert.match(rendered.html,/text-decoration:underline/);assert.match(rendered.html,/<ol start="3"/);assert.match(rendered.html,/<img/);assert.match(rendered.html,/https:\/\/example.com/);assert.match(rendered.text,/3\. Существующий пункт/);assert.doesNotMatch(rendered.text,/Исходный объект/);
});
test('DOCX с preserve содержит настоящие список, ссылку и PNG, а не заглушки',async()=>{
  const bytes=await makeDocx(result(),{widthMm:297,heightMm:210},{exportObjects:assets});const zip=await JSZip.loadAsync(bytes),xml=await zip.file('word/document.xml').async('string'),rels=await zip.file('word/_rels/document.xml.rels').async('string');assert.match(xml,/Предпросмотр/);assert.match(xml,/Существующий пункт/);assert.match(xml,/w:numPr/);assert.match(xml,/w:drawing/);assert.match(xml,/Times New Roman/);assert.match(xml,/w:val="24"/);assert.match(rels,/https:\/\/example.com/);assert.ok(Object.keys(zip.files).some(n=>/word\/media\/.*png/.test(n)));assert.doesNotMatch(xml,/Исходный объект/);
});
test('HTTP экспорт готового конструктора со снимком больше не блокируется preserve',async()=>{
  const app=await start({port:0});try{const s=app.store.pair({panelId:randomUUID(),title:'QA'}),r=result(),t=app.store.task(s,{scenario:'format',scope:'document',text:'Источник',formatting:{profile:r.profile,sourceBlocks:r.blocks,protectedIds:['list','image']},exportObjects:assets});app.store.claim(s,t.id);app.store.submit(s,t.id,t.claim,r);const response=await fetch(app.url+'/tasks/'+t.id+'/export',{headers:{Authorization:'Bearer '+s.pluginToken}});assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/wordprocessingml/);assert.ok((await response.arrayBuffer()).byteLength>2000);}finally{await app.close();}
});
test('богатый DOCX сохраняет альбомный A4, пропорции изображения, интервалы и Heading9',async()=>{
  const r=result();r.profile.body.line=1.5;r.blocks.unshift({type:'heading',level:9,text:'Девятый уровень'});
  const zip=await JSZip.loadAsync(await makeDocx(r,{widthMm:297,heightMm:210},{exportObjects:assets})),xml=await zip.file('word/document.xml').async('string'),styles=await zip.file('word/styles.xml').async('string');
  assert.match(xml,/<w:pgSz[^>]*w:w="16838"[^>]*w:h="11906"/);assert.match(xml,/w:line="360"/);assert.match(xml,/w:val="Heading9"/);assert.match(styles,/w:outlineLvl w:val="8"/);
  const image=/<wp:extent[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(xml);assert.ok(image);assert.equal(Number(image[1])/Number(image[2]),2);
});
