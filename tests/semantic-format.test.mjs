import JSZip from 'jszip';
import {makeDocx} from '../server/docx.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import '../plugin/format-model.js';import {Store} from '../server/store.mjs';import {enumerationCandidates,semanticContract} from '../server/semantic-format.mjs';
const inventory='Что есть у солдата: топор, ремень, шанцевый инструмент, ружье и боеприпасы, мешок со снаряжением';
const items=['топор','ремень','шанцевый инструмент','ружье и боеприпасы','мешок со снаряжением'];
function fixture(text=inventory,structure={headings:true,bullets:true}){const store=new Store(),session=store.pair({panelId:randomUUID(),title:'QA'}),sourceBlocks=[{type:'paragraph',text}];const task=store.task(session,{scenario:'format',scope:'document',text,formatting:{profile:AIFormat.profile(),sourceBlocks,protectedIds:[],allowStructure:true,structure}});store.claim(session,task.id);return {store,task,submit:result=>store.submit(session,task.id,task.claim,result)};}
test('перечень из запроса распознаётся, смысловая пара не разрывается',()=>{
  const found=enumerationCandidates([{type:'paragraph',text:inventory}]);assert.equal(found.length,1);assert.equal(found[0].inventory,true);assert.deepEqual(found[0].items,items);
  assert.equal(enumerationCandidates([{type:'preserve',id:'image-1'},{type:'paragraph',text:'Он пришёл в деревню, постучался и попросил воды.'}]).length,0);
});
test('нельзя молча пропустить смысловые опции или выдать обычные абзацы за буллеты',()=>{
  const f=fixture(),blocks=[{type:'paragraph',text:inventory}];assert.throws(()=>f.submit({kind:'formatted',blocks}),/semanticReview/);
  assert.throws(()=>f.submit({kind:'formatted',blocks,semanticReview:{headings:{applied:false,reason:'Короткому перечню не нужны заголовки.'},bullets:{applied:false,reason:'Оставлен исходный текст перечисления.'}}}),/Пропущен явный перечень/);assert.equal(f.task.state,'working');
});
test('один длинный bullet и потерянный предмет отклоняются; пять отдельных пунктов принимаются',()=>{
  const f=fixture(),semanticReview={headings:{applied:true,reason:'Название сформулировано по теме исходника.'},bullets:{applied:true,reason:'Пять предметов оформлены отдельными пунктами.'}},heading={type:'heading',level:1,text:'Снаряжение солдата'};
  assert.throws(()=>f.submit({kind:'formatted',semanticReview,blocks:[heading,{type:'bullet',text:inventory}]}),/Пропущен явный перечень/);
  assert.throws(()=>f.submit({kind:'formatted',semanticReview,blocks:[heading,...items.slice(0,4).map(text=>({type:'bullet',text})),{type:'bullet',text:'Неизвестный предмет'}]}),/мешок со снаряжением/);
  const result=f.submit({kind:'formatted',semanticReview,blocks:[heading,{type:'paragraph',text:'Что есть у солдата:'},...items.map(text=>({type:'bullet',text}))]});assert.equal(result.state,'ready');
});
test('для цельного короткого текста допустим обоснованный отказ от заголовков и списков',()=>{
  const f=fixture('Солдат подошёл к дому.'),blocks=f.task.formatting.sourceBlocks;
  assert.equal(f.submit({kind:'formatted',blocks,semanticReview:{headings:{applied:false,reason:'Одно цельное предложение не требует заголовка.'},bullets:{applied:false,reason:'Однородных предметов или тезисов в источнике нет.'}}}).state,'ready');
});
test('выключенные смысловые функции не принуждают к перестройке, контракт не требует лишней иерархии',()=>{
  const f=fixture(inventory,{headings:false,bullets:false});assert.equal(f.submit({kind:'formatted',blocks:f.task.formatting.sourceBlocks}).state,'ready');
  const other=fixture();const c=semanticContract(other.task);assert.match(c.instructions,/не выдумывай лишнюю иерархию/);assert.match(c.instructions,/не добавляя событий и фактов/);assert.equal(c.enumerations[0].items.length,5);
});


test('сопоставимые данные принимаются как редактируемая таблица и сохраняются в DOCX', async () => {
  const source = 'Север: 12 заявок, срок 3 дня. Юг: 7 заявок, срок 5 дней. Запад: 19 заявок, срок 2 дня.';
  const rows = [
    ['Регион', 'Заявки', 'Срок, дни'],
    ['Север', '12', '3'],
    ['Юг', '7', '5'],
    ['Запад', '19', '2']
  ];
  const {task, submit} = fixture(source, {tables: true});
  const blocks = [{type: 'table', rows}];
  const semanticReview = {tables: {applied: true, reason: 'По каждому региону указаны число заявок и срок.'}};

  assert.match(semanticContract(task).instructions, /только для сопоставимых данных/);
  assert.throws(() => submit({kind: 'formatted', blocks}), /semanticReview.tables/);
  assert.throws(() => submit({
    kind: 'formatted', blocks: task.formatting.sourceBlocks, semanticReview
  }), /semanticReview.tables не соответствует/);
  assert.throws(() => submit({
    kind: 'formatted', blocks: [{type: 'table', rows: [rows[0], ['Север', '12']]}], semanticReview
  }));
  assert.equal(task.state, 'working');

  const finished = submit({kind: 'formatted', blocks, semanticReview});
  assert.equal(finished.state, 'ready');
  assert.equal(finished.formatting.purpose, 'structure');
  assert.deepEqual(finished.result.blocks, blocks);

  const zip = await JSZip.loadAsync(await makeDocx(finished.result));
  const xml = await zip.file('word/document.xml').async('string');
  const tables = [...xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)];
  assert.equal(tables.length, 1);
  const exportedRows = [...tables[0][0].matchAll(/<w:tr>[\s\S]*?<\/w:tr>/g)].map(row =>
    [...row[0].matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map(cell => cell[1])
  );
  assert.deepEqual(exportedRows, rows);
});

test('для связного рассказа принимается обоснованный отказ от таблицы', () => {
  const {task, submit} = fixture('Солдат вошёл в дом, поздоровался и попросил воды.', {tables: true});
  const result = submit({
    kind: 'formatted',
    blocks: task.formatting.sourceBlocks,
    semanticReview: {tables: {applied: false, reason: 'Это последовательность событий без сопоставимых данных.'}}
  });
  assert.equal(result.state, 'ready');
  assert.equal(result.formatting.purpose, 'style');
  assert.ok(result.result.blocks.every(block => block.type !== 'table'));
});
