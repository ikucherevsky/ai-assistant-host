import {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,WidthType,BorderStyle,AlignmentType,LevelFormat,UnderlineType} from 'docx';
import '../plugin/format-model.js';
import {richDocx} from './rich-result.mjs';
const F=globalThis.AIFormat,hex=s=>s.slice(1),twip=n=>Math.round(n*1440/25.4);
export async function makeDocx(result,page,{applyMargins=true,exportObjects}={}){
  const p=F.validateProfile(result.kind==='formatted'?result.profile:F.profile());
  const blocks=result.kind==='formatted'?result.blocks:result.text.split(/\r?\n/).map(text=>({type:'paragraph',text}));
  if(blocks.some(b=>b.type==='preserve'))return richDocx(result,page,{applyMargins,exportObjects});
  function headingDecoration(h) {
    if (h.decoration === 'band') return {shading:{fill:hex(h.bandColor||p.table.light)}};
    if (!['bottom','left'].includes(h.decoration)) return {};
    const left=h.decoration==='left';
    return {border:{[h.decoration]:{style:BorderStyle.SINGLE,size:left?18:10,space:left?5:3,color:hex(h.color)}}};
  }
  const styles=p.headings.map(h=>({id:'Heading'+h.level,name:'Heading '+h.level,basedOn:'Normal',next:'Normal',quickFormat:true,run:{font:h.font,size:h.size*2,color:hex(h.color),bold:h.bold,underline:h.underline?{type:UnderlineType.SINGLE}:undefined},paragraph:{...headingDecoration(h),outlineLevel:h.level-1,spacing:{before:h.before*20,after:h.after*20,line:Math.round(h.line*240)},keepNext:true}}));
  function paragraph(b,table=false){const h=b.type==='heading'?p.headings[b.level-1]:null,body=p.body;
    return new Paragraph({style:h?'Heading'+b.level:undefined,children:[new TextRun({text:b.text,font:table?p.table.font:h?h.font:body.font,size:(table?p.table.size:h?h.size:body.size)*2,color:hex(h?h.color:table?p.table.color:body.color),bold:h?.bold,underline:h?.underline?{type:UnderlineType.SINGLE}:undefined})],
      numbering:h&&p.numbering==='decimal'?{reference:'headings',level:b.level-1}:undefined,bullet:b.type==='bullet'?{level:b.level||0}:undefined,
      alignment:h?AlignmentType.LEFT:body.align==='both'?AlignmentType.JUSTIFIED:body.align,spacing:{before:(h?h.before:body.before)*20,after:(h?h.after:body.after)*20,line:Math.round((h?h.line:body.line)*240)},indent:{firstLine:twip(h||b.type==='bullet'?0:body.first),left:twip(body.left),right:twip(body.right)}});
  }
  const border={style:p.table.style==='none'?BorderStyle.NONE:BorderStyle.SINGLE,size:4,color:hex(p.table.border)};
  const children=blocks.map(b=>b.type==='table'?new Table({width:{size:100,type:WidthType.PERCENTAGE},borders:{top:border,bottom:border,left:border,right:border,insideHorizontal:border,insideVertical:border},rows:b.rows.map((row,i)=>new TableRow({tableHeader:i===0,children:row.map(text=>new TableCell({shading:{fill:hex(i===0&&p.table.style==='accent'?p.table.header:i===0&&p.table.style!=='none'&&p.table.style!=='grid'?p.table.light:i%2===0&&p.table.style==='banded'?p.table.light:'#FFFFFF')},children:[new Paragraph({children:[new TextRun({text,font:p.table.font,size:p.table.size*2,bold:i===0,color:hex(i===0&&p.table.style==='accent'?'#FFFFFF':p.table.color)})]})]}))}))}):paragraph(b));
  const width=page?.widthMm??210,height=page?.heightMm??297;
  if(![width,height].every(n=>Number.isFinite(n)&&n>=50&&n<=1200))throw Error('Некорректный размер страницы DOCX');
  const margins=!applyMargins&&page?.marginsMm?page.marginsMm:p.margins;
  if(!['top','bottom','left','right'].every(k=>Number.isFinite(margins[k])&&margins[k]>=0&&margins[k]<=200)||margins.left+margins.right>=width||margins.top+margins.bottom>=height)throw Error('Поля не помещаются на странице DOCX');
  const document=new Document({creator:'AI Assistant / GigaCowork',title:'Результат AI Assistant',styles:{default:{document:{run:{font:p.body.font,size:p.body.size*2,color:hex(p.body.color)}}},paragraphStyles:styles},
    numbering:{config:[{reference:'headings',levels:Array.from({length:9},(_,i)=>({level:i,format:LevelFormat.DECIMAL,text:Array.from({length:i+1},(_,n)=>'%'+(n+1)).join('.')+'.',alignment:AlignmentType.LEFT}))}]},
    sections:[{properties:{page:{size:{width:twip(width),height:twip(height)},margin:{top:twip(margins.top),bottom:twip(margins.bottom),left:twip(margins.left),right:twip(margins.right)}}},children}]});
  return Packer.toBuffer(document);
}
