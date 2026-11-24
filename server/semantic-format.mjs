// Candidates guide the model; they never rewrite document content locally.
export function enumerationCandidates(blocks=[]){
  const found=[];
  blocks.forEach((block,index)=>{
    if(block.type!=='paragraph')return;
    const pattern=/([^:\n.!?]{2,120}):[ \t]*([^\n.!?]+)/gu;let match;
    while((match=pattern.exec(block.text))&&found.length<30){
      const items=match[2].split(/[,;]/u).map(s=>s.trim()).filter(Boolean);
      if(items.length<3||items.length>30||items.some(s=>s.length>200))continue;
      const label=match[1].trim(),inventory=/^(?:что\s+(?:есть|имеется|было)\s+у(?:\s|$)|снаряжение(?:\s|$)|инвентарь(?:\s|$)|состав(?:\s|$)|комплект(?:\s|$))/iu.test(label);
      found.push({id:'enumeration-'+index+'-'+match.index,label,text:match[0],items,inventory});
    }
  });
  return found;
}

export function semanticContract(task){
  const requested=task.formatting.structure||{},enabled=Object.keys(requested).filter(k=>requested[k]===true);
  if(!task.formatting.allowStructure||!enabled.length)return undefined;
  return {requested,enumerations:enumerationCandidates(task.formatting.sourceBlocks),
    instructions:[
      'Выполни смысловое структурирование, а не только замену шрифта. Не сокращай и не пересказывай исходный текст, сохрани все факты и защищённые объекты.',
      requested.headings?'Прочитай весь источник. Сохрани подходящее заглавие или предложи содержательное заглавие по теме. Для достаточно длинного текста выдели смысловые разделы и при необходимости подчинённые подразделы (heading level 1/2/3). Не превращай каждое предложение в заголовок. Для короткого или цельного текста не выдумывай лишнюю иерархию. Названия можно сформулировать заново по смыслу, не добавляя событий и фактов.':'',
      requested.bullets?'Найди перечисления в обычных абзацах, в том числе внутри строки после двоеточия. Вынеси отдельные однородные пункты в отдельные блоки type=bullet. Сохрани вводную фразу отдельным paragraph. Не оставляй весь перечень одним bullet и не печатай символ • в paragraph. Смысловые пары вроде «ружье и боеприпасы» сохраняй одним пунктом. Не превращай обычную цепочку событий рассказа в список. Явный перечень инвентаря из enumerations с inventory=true обязательно разверни в пункты.':'',
      requested.tables?'Создавай таблицы только для сопоставимых данных, когда строки и столбцы делают информацию яснее. Не табулируй сюжет сказки.':'',
      'Верни semanticReview: для каждого включённого пункта headings/bullets/tables укажи applied:boolean и reason (краткое обоснование). Если структура неуместна, applied=false и объясни почему. Решения будут видны пользователю; нельзя молча пропускать включённые функции.'
    ].filter(Boolean).join('\n'),
    example:{source:'Что есть у солдата: топор, ремень, шанцевый инструмент, ружье и боеприпасы, мешок со снаряжением',blocks:[{type:'paragraph',text:'Что есть у солдата:'},...['топор','ремень','шанцевый инструмент','ружье и боеприпасы','мешок со снаряжением'].map(text=>({type:'bullet',level:0,text}))]}};
}

const words=text=>text.toLocaleLowerCase('ru').replace(/ё/gu,'е').match(/[\p{L}\p{N}]+/gu)||[];
export function validateSemanticResult(task,result){
  const contract=semanticContract(task);if(!contract)return;
  for(const key of ['headings','bullets','tables']){
    if(!contract.requested[key])continue;
    const review=result.semanticReview?.[key];
    if(!review||typeof review.applied!=='boolean'||typeof review.reason!=='string'||review.reason.trim().length<8||review.reason.length>1500)throw Error('Добавьте semanticReview.'+key+' с applied и содержательным reason; см. resultContract.semantic');
    const type={headings:'heading',bullets:'bullet',tables:'table'}[key],has=result.blocks.some(b=>b.type===type);
    if(review.applied!==has)throw Error('semanticReview.'+key+' не соответствует блокам результата');
  }
  if(contract.requested.bullets){
    const bullets=result.blocks.filter(b=>b.type==='bullet'),tokens=new Set(words(bullets.map(b=>b.text).join(' ')));
    for(const list of contract.enumerations.filter(c=>c.inventory)){
      const missing=list.items.filter(item=>words(item).some(w=>!tokens.has(w)));
      if(bullets.length<list.items.length||missing.length)throw Error('Пропущен явный перечень «'+list.label+'». Вынесите каждый предмет в отдельный bullet, сохранив формулировки и смысловые пары. Не хватает: '+(missing.join('; ')||'отдельных пунктов'));
    }
  }
}
