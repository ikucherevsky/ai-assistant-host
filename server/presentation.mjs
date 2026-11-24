import pptxgen from 'pptxgenjs';
export async function presentation(slides){
  const p=new pptxgen();p.layout='LAYOUT_WIDE';p.author='AI Assistant / GigaCowork';p.subject='Тезисы исходного документа';p.title=slides[0].title;p.lang='ru-RU';
  slides.forEach((s,i)=>{
    const slide=p.addSlide();slide.background={color:'F5F7F5'};
    slide.addShape(p.ShapeType.rect,{x:0,y:0,w:.18,h:7.5,fill:{color:'16665B'},line:{color:'16665B'}});
    slide.addText(s.title,{x:.65,y:.5,w:12,h:1,fontFace:'Arial',fontSize:28,bold:true,color:'17473F',breakLine:false,fit:'shrink'});
    slide.addText(s.bullets.map(text=>({text,options:{bullet:{indent:18},breakLine:true}})),{x:.85,y:1.8,w:11.5,h:4.8,fontFace:'Arial',fontSize:22,color:'243831',paraSpaceAfterPt:16,fit:'shrink',valign:'top'});
    slide.addText(String(i+1),{x:12,y:7,w:.6,h:.2,fontSize:10,color:'587168'});
  });return p.write({outputType:'nodebuffer'});
}
