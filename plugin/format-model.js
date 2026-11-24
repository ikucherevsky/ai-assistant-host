(function(root){'use strict';
  const themes=[
    {id:'office',name:'Офисная · синий',ink:'#243447',accent:'#2F5496',light:'#E8EFF8',border:'#BCCADD'},
    {id:'forest',name:'Лес · зелёный',ink:'#213C35',accent:'#16665B',light:'#E4F0E9',border:'#A6C7B6'},
    {id:'violet',name:'Фиолетовая',ink:'#332C45',accent:'#7030A0',light:'#F0E7F7',border:'#CEB6DF'},
    {id:'warm',name:'Тёплая · оранжевый',ink:'#44352C',accent:'#B85C24',light:'#F9EEE5',border:'#DABBA4'},
    {id:'mono',name:'Монохромная',ink:'#222222',accent:'#222222',light:'#EEEEEE',border:'#AAAAAA'},
    {id:'ocean',name:'Морская',ink:'#203F4B',accent:'#007C91',light:'#DFF3F5',border:'#9BCBD2'}
  ];
  const presets=[
    {id:'business',name:'Деловой',font:'Arial',size:11,headingFont:'Arial',sizes:[22,17,14],line:1.15,after:6,first:0,align:'left'},
    {id:'academic',name:'Академический',font:'Times New Roman',size:14,headingFont:'Times New Roman',sizes:[18,16,14],line:1.5,after:0,first:12.5,align:'both'},
    {id:'minimal',name:'Минималистичный',font:'Calibri',size:11,headingFont:'Calibri',sizes:[26,19,14],line:1.2,after:8,first:0,align:'left'},
    {id:'report',name:'Аналитический отчёт',font:'Cambria',size:12,headingFont:'Cambria',sizes:[24,18,14],line:1.3,after:8,first:0,align:'both'},
    {id:'technical',name:'Технический',font:'Arial',size:11,headingFont:'Arial',sizes:[21,16,13],line:1.15,after:6,first:0,align:'left'},
    {id:'book',name:'Книжный',font:'Georgia',size:12,headingFont:'Georgia',sizes:[24,18,14],line:1.35,after:0,first:7,align:'both'},
    {id:'modern',name:'Современный',font:'Calibri',size:12,headingFont:'Calibri',sizes:[28,20,15],line:1.2,after:10,first:0,align:'left'},
    {id:'underline-rule',name:'Линия под заголовком',font:'Arial',size:11,headingFont:'Arial',sizes:[23,17,13],line:1.2,after:6,first:0,align:'left',decoration:'bottom'},
    {id:'side-rule',name:'Линия сбоку',font:'Calibri',size:11,headingFont:'Calibri',sizes:[24,18,14],line:1.2,after:6,first:0,align:'left',decoration:'left'},
    {id:'color-band',name:'Цветная плашка',font:'Calibri',size:11,headingFont:'Calibri',sizes:[23,17,14],line:1.2,after:6,first:0,align:'left',decoration:'band'},
    {id:'compact',name:'Компактный',font:'Arial',size:10,headingFont:'Arial',sizes:[18,14,12],line:1.05,after:3,first:0,align:'left'}
  ];
  const bulletStyles=[['keep','Как в документе'],['disc','• Круг'],['circle','○ Пустой круг'],['square','▪ Квадрат'],['dash','– Тире']];
  const numberStyles=[['keep','Как в документе'],['decimal','1. 2. 3.'],['decimalParen','1) 2) 3)'],['upperRoman','I. II. III.'],['lowerRoman','i. ii. iii.'],['upperLetter','A. B. C.'],['lowerLetter','a. b. c.']];
  function profile(preset='business',theme='office'){
    const p=presets.find(p=>p.id===preset)||presets[0],t=themes.find(t=>t.id===theme)||themes[0];
    return {preset:p.id,theme:t.id,body:{font:p.font,size:p.size,color:t.ink,align:p.align,line:p.line,before:0,after:p.after,first:p.first,left:0,right:0},headings:Array.from({length:9},(_,i)=>({level:i+1,font:p.headingFont,size:p.sizes[Math.min(i,2)],color:t.accent,bold:true,underline:false,decoration:p.decoration||'none',before:Math.max(8,20-i*3),after:6,line:1.1})),margins:{top:20,bottom:20,left:25,right:20},table:{style:'banded',font:p.font,size:p.size,header:t.accent,light:t.light,border:t.border,color:t.ink},numbering:'keep',lists:{bullet:'keep',number:'keep'}};
  }
  const number=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
  const font=f=>typeof f==='string'&&f.trim().length>0&&f.length<=80&&!/[<>;:{}\x00-\x1f]/.test(f);
  const color=c=>typeof c==='string'&&/^#[\da-f]{6}$/i.test(c);
  function validateProfile(p){
    if(!p||!p.body||!Array.isArray(p.headings)||p.headings.length!==9||!p.margins||!p.table)throw Error('Неполный профиль оформления');
    if(p.lists!==undefined&&(!p.lists||!bulletStyles.some(([key])=>key===p.lists.bullet)||!numberStyles.some(([key])=>key===p.lists.number)))throw Error('Некорректный стиль списка');
    const themeColor=s=>s.themeColor===undefined||Number.isInteger(s.themeColor)&&s.themeColor>=0&&s.themeColor<60;
    const b=p.body;
    if(![b,...p.headings].every(themeColor))throw Error('Некорректный цвет темы');
    if(!font(b.font)||!number(b.size,6,72)||!color(b.color)||!['left','right','center','both'].includes(b.align)||!number(b.line,.8,3)||![b.before,b.after].every(n=>number(n,0,144))||![b.first,b.left,b.right].every(n=>number(n,0,80)))throw Error('Некорректные параметры основного текста');
    p.headings.forEach((h,i)=>{if(h.bandColor!==undefined&&!color(h.bandColor)||h.decoration!==undefined&&!['none','bottom','left','band'].includes(h.decoration)||h.level!==i+1||!font(h.font)||!number(h.size,6,96)||!color(h.color)||typeof h.bold!=='boolean'||typeof h.underline!=='boolean'||![h.before,h.after].every(n=>number(n,0,144))||!number(h.line,.8,3))throw Error('Некорректный заголовок '+(i+1));});
    if(!['top','right','bottom','left'].every(k=>number(p.margins[k],0,80))||!['keep','decimal','none'].includes(p.numbering))throw Error('Некорректные поля или нумерация');
    const t=p.table;if(!['grid','light','banded','accent','none'].includes(t.style)||!font(t.font)||!number(t.size,6,40)||![t.header,t.light,t.border,t.color].every(color))throw Error('Некорректный стиль таблицы');
    return p;
  }
  function validateBlocks(blocks,protectedIds=[]){
    if(!Array.isArray(blocks)||blocks.length<1||blocks.length>500)throw Error('Нужно от 1 до 500 блоков');let length=0;const preserved=[];
    blocks.forEach(b=>{if(!b||!['paragraph','heading','bullet','table','preserve'].includes(b.type))throw Error('Неизвестный тип блока');
      if(b.type==='preserve'){if(typeof b.id!=='string'||!protectedIds.includes(b.id)||preserved.includes(b.id))throw Error('Недопустимый исходный объект');preserved.push(b.id);}
      else if(b.type==='table'){if(!Array.isArray(b.rows)||b.rows.length<1||b.rows.length>100||!Array.isArray(b.rows[0])||b.rows[0].length<1||b.rows[0].length>12)throw Error('Некорректная таблица');const cols=b.rows[0].length;b.rows.forEach(row=>{if(!Array.isArray(row)||row.length!==cols)throw Error('Разная ширина строк таблицы');row.forEach(v=>{if(typeof v!=='string'||v.length>10000)throw Error('Некорректная ячейка');length+=v.length;});});}
      else {if(typeof b.text!=='string'||b.text.length>100000)throw Error('Некорректный текст блока');length+=b.text.length;if(b.type==='heading'&&!Number.isInteger(b.level)||b.type==='heading'&&(b.level<1||b.level>9))throw Error('Уровень заголовка 1–9');if(b.type==='bullet'&&b.level!==undefined&&(!Number.isInteger(b.level)||b.level<0||b.level>8))throw Error('Уровень списка 0–8');}
    });
    if(length>250000||protectedIds.some(id=>!preserved.includes(id)))throw Error('Превышен объём или пропущен защищённый исходный объект');return blocks;
  }
  function text(blocks){return blocks.map(b=>b.type==='table'?b.rows.map(r=>r.join('\t')).join('\n'):b.type==='preserve'?'[Исходный объект '+b.id+']':(b.type==='bullet'?'• ':'')+b.text).join('\n\n');}
  root.AIFormat=Object.freeze({bulletStyles,numberStyles,themes,presets,profile,validateProfile,validateBlocks,text});
})(typeof window!=='undefined'?window:globalThis);
