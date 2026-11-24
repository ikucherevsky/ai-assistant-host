(function(root){'use strict';
  const tags=new Set('p div span h1 h2 h3 h4 h5 h6 h7 h8 h9 ul ol li table thead tbody tfoot tr td th colgroup col img br strong b em i u s strike sub sup a blockquote'.split(' '));
  const properties=new Set('font-family font-size font-weight font-style color background-color text-decoration text-align text-indent line-height margin-top margin-bottom margin-left margin-right padding padding-top padding-bottom padding-left padding-right border border-top border-right border-bottom border-left border-collapse width height max-width vertical-align list-style-type'.split(' '));
  function clean(html,doc){
    if(typeof html!=='string'||html.length>8000000)throw Error('Слишком большой снимок объекта предпросмотра');
    const box=doc.createElement('div');box.innerHTML=html;
    for(const e of [...box.querySelectorAll('*')]){
      const tag=e.localName.toLowerCase();if(['script','style','iframe','object','embed','link','meta','form','input','button'].includes(tag)){e.remove();continue;}
      if(!tags.has(tag)){e.replaceWith(...e.childNodes);continue;}
      const css=[];for(const name of properties){const value=e.style?.getPropertyValue(name);if(value&&!/url\s*\(|expression|javascript:|[<>]/i.test(value))css.push(name+':'+value);}
      const attrs={};for(const a of [...e.attributes]){if(['rowspan','colspan','width','height','start','value'].includes(a.name)&&/^\d{1,5}%?$/.test(a.value))attrs[a.name]=a.value;if(a.name==='href'&&/^(https?:|mailto:)/i.test(a.value))attrs.href=a.value;if(a.name==='src'&&tag==='img'){if(!/^data:image\/(png|jpeg);base64,[a-z0-9+/]+=*$/i.test(a.value))throw Error('Не удалось получить встроенное изображение для предпросмотра');attrs.src=a.value;}}
      for(const a of [...e.attributes])e.removeAttribute(a.name);if(css.length)e.setAttribute('style',css.join(';'));for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);
    }
    return box.innerHTML;
  }
  function paragraphStyle(e,s,body,heading=false){Object.assign(e.style,{fontFamily:s.font,fontSize:s.size+'pt',color:s.color,lineHeight:String(s.line||body.line),marginTop:(s.before||0)+'pt',marginBottom:(s.after||0)+'pt',textAlign:heading?'left':body.align==='both'?'justify':body.align,textIndent:heading||e.localName==='li'?'0':body.first+'mm',marginLeft:body.left+'mm',marginRight:body.right+'mm'});if(heading){e.style.fontWeight=s.bold?'bold':'normal';e.style.textDecoration=s.underline?'underline':'none';}}
  function headingDecoration(element, style, fill) {
    element.style.borderBottom = style.decoration === 'bottom' ? '1.25pt solid ' + style.color : '';
    element.style.borderLeft = style.decoration === 'left' ? '2.25pt solid ' + style.color : '';
    element.style.backgroundColor = style.decoration === 'band' ? (style.bandColor || fill) : '';
    element.style.paddingLeft = ['left','band'].includes(style.decoration) ? '5pt' : '';
    element.style.paddingBottom = style.decoration === 'bottom' ? '3pt' : '';
  }
  function formatTree(box,p){
    for(const e of box.querySelectorAll('p,li,h1,h2,h3,h4,h5,h6,h7,h8,h9')){const level=/^h([1-9])$/.exec(e.localName),s=level?p.headings[+level[1]-1]:p.body;paragraphStyle(e,s,p.body,!!level);if(level)headingDecoration(e,s,p.table.light);if(e.closest('li'))e.style.textIndent='0';for(const child of e.querySelectorAll('span,a,strong,b,em,i,u,s,sub,sup')){child.style.fontFamily=s.font;child.style.fontSize=s.size+'pt';child.style.color=s.color;if(level){child.style.fontWeight=s.bold?'bold':'normal';child.style.textDecoration=s.underline?'underline':'none';}}}
    for(const table of box.querySelectorAll('table')){table.style.width='100%';table.style.borderCollapse='collapse';[...table.querySelectorAll('tr')].forEach((row,index)=>{for(const cell of row.children){if(!['td','th'].includes(cell.localName))continue;const t=p.table;cell.style.border=t.style==='none'?'none':'0.5pt solid '+t.border;cell.style.padding='4pt';cell.style.backgroundColor=index===0&&t.style==='accent'?t.header:index===0&&['light','banded'].includes(t.style)?t.light:index%2===0&&t.style==='banded'?t.light:'#FFFFFF';const color=index===0&&t.style==='accent'?'#FFFFFF':t.color;for(const e of [cell,...cell.querySelectorAll('p,span,a,strong,b,em,i')]){e.style.fontFamily=t.font;e.style.fontSize=t.size+'pt';e.style.color=color;if(index===0)e.style.fontWeight='bold';}}});}
    const bullet=p.lists?.bullet,number=p.lists?.number;
    if(bullet&&bullet!=='keep')for(const list of box.querySelectorAll('ul')){
      list.style.listStyleType=bullet==='dash'?'"–  "':bullet;
      for(const item of list.children)if(item.localName==='li')item.style.listStyleType='inherit';
    }
    if(number&&number!=='keep')for(const list of box.querySelectorAll('ol')){
      list.style.listStyleType=({upperRoman:'upper-roman',lowerRoman:'lower-roman',upperLetter:'upper-alpha',lowerLetter:'lower-alpha'})[number]||'decimal';
      for(const item of list.children)if(item.localName==='li')item.style.listStyleType='inherit';
    }
    for(const img of box.querySelectorAll('img')){img.style.maxWidth='100%';img.style.objectFit='contain';}
  }
  function block(b,p,assets,doc,counters){const box=doc.createElement('div');let e;
    if(b.type==='preserve'){const asset=assets?.[b.id];if(!asset?.html)throw Error('Для исходного объекта '+b.id+' нет снимка. Подготовьте предпросмотр заново.');box.innerHTML=clean(asset.html,doc);if(asset.headingLevel){const first=box.querySelector('p');if(first){const h=doc.createElement('h'+asset.headingLevel);h.innerHTML=first.innerHTML;first.replaceWith(h);}}}
    else if(b.type==='table'){e=doc.createElement('table');for(const row of b.rows){const tr=doc.createElement('tr');for(const value of row){const td=doc.createElement('td'),para=doc.createElement('p');para.textContent=value;td.append(para);tr.append(td);}e.append(tr);}box.append(e);}
    else if(b.type==='bullet'){e=doc.createElement('ul');const li=doc.createElement('li');li.textContent=b.text;if(b.level)e.style.marginLeft=(b.level*7)+'mm';e.append(li);box.append(e);}
    else{e=doc.createElement(b.type==='heading'?'h'+b.level:'p');let text=b.text;if(b.type==='heading'&&p.numbering==='decimal'){const n=b.level-1;for(let i=0;i<n;i++)if(!counters[i])counters[i]=1;counters[n]++;for(let i=n+1;i<9;i++)counters[i]=0;text=counters.slice(0,n+1).join('.')+'. '+text;}e.textContent=text;box.append(e);}
    formatTree(box,p);return box.innerHTML;
  }
  function plain(node){if(node.nodeType===3)return node.textContent;if(node.localName==='br')return '\n';let value='';if(node.localName==='li'){const parent=node.parentElement;value=parent.localName==='ol'?String((Number(parent.getAttribute('start'))||1)+[...parent.children].indexOf(node))+'. ':'• ';}for(const child of node.childNodes)value+=plain(child);if(['p','div','li','tr','h1','h2','h3','h4','h5','h6','h7','h8','h9'].includes(node.localName))value+='\n';if(['td','th'].includes(node.localName))value+='\t';return value;}
  function render(result,assets,doc){const profile=result.kind==='formatted'?result.profile:root.AIFormat.profile(),blocks=result.kind==='formatted'?result.blocks:result.text.split(/\r?\n/).map(text=>({type:'paragraph',text})),counters=Array(9).fill(0);const html=blocks.map(b=>block(b,profile,assets,doc,counters)).join(''),box=doc.createElement('div');box.innerHTML=html;return {html,text:plain(box).trim()};}
  root.AIResultHTML={headingDecoration,clean,block,render};
})(typeof window!=='undefined'?window:globalThis);
