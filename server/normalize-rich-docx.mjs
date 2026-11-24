import {DOMParser} from 'linkedom';import JSZip from 'jszip';
const parse=xml=>new DOMParser().parseFromString(xml,'text/xml');
const elements=(node,name)=>[...node.getElementsByTagName(name)];
const first=(node,name)=>node.getElementsByTagName(name)[0];
const create=(doc,name,attrs={})=>{const e=doc.createElement(name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));return e;};
// Normalize the converter's OOXML to the explicit geometry and profile of our preview.
export async function normalizeRichDocx(bytes,{profile,width,height,margins,headingLevels,images}){
  const zip=await JSZip.loadAsync(bytes),doc=parse(await zip.file('word/document.xml').async('string')),body=first(doc,'w:body');let heading=0,image=0;
  for(const p of elements(body,'w:p')){
    let pr=first(p,'w:pPr');if(!pr){pr=create(doc,'w:pPr');p.prepend(pr);}
    const style=first(pr,'w:pStyle');let level=0;
    if(style&&/^Heading[1-9]$/.test(style.getAttribute('w:val'))){level=headingLevels[heading++]||Number(style.getAttribute('w:val').slice(7));style.setAttribute('w:val','Heading'+level);}
    const s=level?profile.headings[level-1]:profile.body;let spacing=first(pr,'w:spacing');if(!spacing){spacing=create(doc,'w:spacing');pr.append(spacing);}
    for(const [key,value] of Object.entries({line:Math.round(s.line*240),lineRule:'auto',before:Math.round(s.before*20),after:Math.round(s.after*20)}))spacing.setAttribute('w:'+key,String(value));
    for(const child of [...pr.children])if(child.tagName==='w:u')child.remove();
  }
  for(const drawing of elements(body,'w:drawing')){
    const size=images[image++];if(!size)continue;
    for(const e of [...elements(drawing,'wp:extent'),...elements(drawing,'a:ext')]){e.setAttribute('cx',String(Math.round(size.width*9525)));e.setAttribute('cy',String(Math.round(size.height*9525)));}
  }
  const twip=n=>Math.round(n*1440/25.4),section=first(body,'w:sectPr');
  if(section){const size=first(section,'w:pgSz');size.setAttribute('w:w',String(twip(width)));size.setAttribute('w:h',String(twip(height)));size.setAttribute('w:orient',width>height?'landscape':'portrait');body.append(section);}
  zip.file('word/document.xml',doc.toString());
  const styles=parse(await zip.file('word/styles.xml').async('string')),root=first(styles,'w:styles');
  for(const h of profile.headings){const id='Heading'+h.level;for(const old of elements(root,'w:style'))if(old.getAttribute('w:styleId')===id)old.remove();
    const style=create(styles,'w:style',{'w:type':'paragraph','w:styleId':id});style.append(create(styles,'w:name',{'w:val':'Heading '+h.level}),create(styles,'w:basedOn',{'w:val':'Normal'}),create(styles,'w:next',{'w:val':'Normal'}),create(styles,'w:qFormat'));
    const pr=create(styles,'w:pPr');pr.append(create(styles,'w:outlineLvl',{'w:val':h.level-1}),create(styles,'w:keepNext'),create(styles,'w:spacing',{'w:line':Math.round(h.line*240),'w:lineRule':'auto','w:before':h.before*20,'w:after':h.after*20}));style.append(pr);
    const run=create(styles,'w:rPr');run.append(create(styles,'w:rFonts',{'w:ascii':h.font,'w:hAnsi':h.font}),create(styles,'w:sz',{'w:val':h.size*2}),create(styles,'w:color',{'w:val':h.color.slice(1)}));if(h.bold)run.append(create(styles,'w:b'));if(h.underline)run.append(create(styles,'w:u',{'w:val':'single'}));style.append(run);root.append(style);
  }
  zip.file('word/styles.xml',styles.toString());return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
