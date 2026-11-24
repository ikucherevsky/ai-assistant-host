// Human-readable names from existing content; no additional model request.
export function shortDocumentName(task) {
  const result=task.result;
  let text=result?.kind==='slides'?result.slides?.find(s=>s.title?.trim())?.title:
    result?.kind==='formatted'?(result.blocks.find(b=>b.type==='heading'&&b.text?.trim())?.text||result.blocks.find(b=>b.text?.trim())?.text):result?.text;
  text=String(text||task.text||'').normalize('NFC');
  const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const heading=lines.find(s=>/^#{1,6}\s+/.test(s));
  text=(heading||lines[0]||'').replace(/^#{1,6}\s+|^[•*\-]\s+/g,'').replace(/[*_`]/g,'');
  text=text.replace(/<[^>]*>/g,' ').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim();
  text=text.replace(/\.(docx|pptx|txt|png|jpe?g)$/i,'').split(/[.!?;](?:\s|$)/)[0].trim();
  const words=text.split(' ').slice(0,7);
  let title='';
  for(const word of words){if(Array.from((title?title+' ':'')+word).length>60)break;title+=(title?' ':'')+word;}
  if(!title&&text)title=Array.from(text).slice(0,60).join('');
  title=title.replace(/[.\s,;:!\-–—]+$/g,'').trim()||(result?.kind==='slides'?'Презентация':'Документ');
  if(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(title))title='Документ '+title;
  return title;
}

function key(value){
  return String(value).normalize('NFC').split(/[\\/]/).at(-1)
    .replace(/\s+[-—–]\s+(?:Р7|R7|P7).*$/i,'').replace(/^[*●\s]+|[*\s]+$/g,'')
    .replace(/\.(docx|pptx|txt|png|jpe?g)$/i,'').trim().toLocaleLowerCase('ru-RU');
}

export function availableDocumentName(title,extension,openNames=[]){
  const occupied=new Set(openNames.map(key));
  let name=title,index=0;
  while(occupied.has(key(name)))name=title+' ('+(++index)+')';
  return name+'.'+extension;
}
