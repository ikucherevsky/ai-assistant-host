import {parseHTML} from 'linkedom';import HtmlToDocx from '@turbodocx/html-to-docx';
import '../plugin/format-model.js';import '../plugin/result-html.js';
import {normalizeRichDocx} from './normalize-rich-docx.mjs';
const document=()=>parseHTML('<html><body></body></html>').document;
export function prepareExportObjects(input,ids){
  if(input===undefined)return {};
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Некорректные снимки исходных объектов');
  const result=Object.create(null),doc=document();let size=0;
  for(const [id,asset] of Object.entries(input)){
    if(!ids.includes(id)||!asset||typeof asset.html!=='string')throw Error('Снимок не соответствует исходному объекту');
    size+=asset.html.length;if(size>7000000)throw Error('Снимки объектов превышают 7 МБ');
    const headingLevel=asset.headingLevel||0;if(!Number.isInteger(headingLevel)||headingLevel<0||headingLevel>9)throw Error('Некорректный уровень заголовка снимка');
    result[id]={html:globalThis.AIResultHTML.clean(asset.html,doc),headingLevel};
  }
  return result;
}
export function richResult(result,assets){return globalThis.AIResultHTML.render(result,assets,document());}
export async function richDocx(result,page,{applyMargins=true,exportObjects}={}){
  const p=result.profile,width=page?.widthMm??210,height=page?.heightMm??297,m=!applyMargins&&page?.marginsMm?page.marginsMm:p.margins;
  if(![width,height].every(n=>Number.isFinite(n)&&n>=50&&n<=558)||!['top','bottom','left','right'].every(k=>Number.isFinite(m[k])&&m[k]>=0&&m[k]<=200)||m.left+m.right>=width||m.top+m.bottom>=height)throw Error('Некорректный размер или поля страницы DOCX');
  const twip=n=>Math.round(n*1440/25.4),rendered=richResult(result,exportObjects),doc=document();doc.body.innerHTML=rendered.html;
  const headingLevels=[...doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6,h7,h8,h9')].map(e=>{const level=Number(e.localName.slice(1));if(level>6){const h=doc.createElement('h6');h.innerHTML=e.innerHTML;h.setAttribute('style',e.getAttribute('style'));e.replaceWith(h);}return level;});
  const maxWidth=(width-m.left-m.right)*96/25.4,images=[...doc.body.querySelectorAll('img')].map(e=>{const originalWidth=Number(e.getAttribute('width')),originalHeight=Number(e.getAttribute('height'));if(!(originalWidth>0&&originalHeight>0))throw Error('В снимке изображения отсутствуют размеры');const scale=Math.min(1,maxWidth/originalWidth),size={width:originalWidth*scale,height:originalHeight*scale};e.style.width=size.width+'px';e.style.height=size.height+'px';return size;});
  const bytes=await HtmlToDocx(doc.body.innerHTML,null,{title:'Результат AI Assistant',creator:'AI Assistant / GigaCowork',font:p.body.font,fontSize:p.body.size*2,orientation:width>height?'landscape':'portrait',pageSize:{width:twip(Math.min(width,height)),height:twip(Math.max(width,height))},margins:Object.fromEntries(Object.entries(m).map(([k,v])=>[k,twip(v)])),table:{row:{cantSplit:false},addSpacingAfter:false}});
  return normalizeRichDocx(Buffer.from(bytes),{profile:p,width,height,margins:m,headingLevels,images});
}
