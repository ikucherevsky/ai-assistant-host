(function(root){'use strict';
  // Self-contained; serialized into the R7 editor sandbox by R7Native.
  function formatCommand(){
    var q=Asc.scope.aiAssistant,changed=false;
    function parse(v){return typeof v==='string'?JSON.parse(v):v||{};}
    function fail(message){return {ok:false,error:message+(changed?' Проверьте документ; при необходимости нажмите Ctrl+Z.':'')};}
    function rgb(hex){var n=parseInt(hex.slice(1),16);return [(n>>16)&255,(n>>8)&255,n&255];}
    try{
      var d=Api.GetDocument(),all=[],tables=[];
      function walk(content){for(var i=0;i<content.GetElementsCount();i++){var e=content.GetElement(i),type=e.GetClassType();if(type==='paragraph'){if(!all.some(function(p){return p.Paragraph===e.Paragraph;}))all.push(e);}else if(type==='table'){tables.push(e);for(var r=0;r<e.GetRowsCount();r++)for(var c=0;c<e.GetRow(r).GetCellsCount();c++)walk(e.GetCell(r,c).GetContent());}else if(typeof e.GetContent==='function')walk(e.GetContent());}}
      walk(d);if(all.length>3000)return fail('Поддерживается не более 3000 абзацев за операцию.');
      var range=d.GetRangeBySelect(),selection=d.Document.IsTextSelectionUse()&&range?(range.GetText({Numbering:false})||''):'',targets=q.scope==='selection'?(range?range.GetAllParagraphs():[]):all;
      if(q.scope==='selection'&&!selection.trim())return fail('Выделите текст или выберите весь документ.');
      if(targets.some(function(p){return !all.some(function(a){return a.Paragraph===p.Paragraph;});}))return fail('Выделение должно находиться в основном тексте документа.');
      function role(p){var pr=parse(p.GetParaPr().ToJSON()),s=p.GetStyle(),sp=s?parse(s.GetParaPr().ToJSON()):{},level=Number.isInteger(pr.outlineLvl)?pr.outlineLvl:sp.outlineLvl,name=s?s.GetName():'';if(Number.isInteger(level)&&level>=0&&level<=8)return level+1;var m=/^(heading|заголовок)\s*([1-9])$/i.exec(name);return m?Number(m[2]):0;}
      function protectedParagraph(p){var j=parse(p.ToJSON());if(j.pPr&&j.pPr.sectPr)return true;var stack=[j];while(stack.length){var v=stack.pop();if(!v||typeof v!=='object')continue;if(['drawing','picture','graphicFrame','paraDrawing','shape','chart','image','groupShape','hyperlink','fldChar','field','sdt'].indexOf(v.type)>=0)return true;Object.keys(v).forEach(function(k){if(v[k]&&typeof v[k]==='object')stack.push(v[k]);});}return false;}
      var selectedIndices=targets.map(function(p){return all.findIndex(function(a){return a.Paragraph===p.Paragraph;});});
      var guard=JSON.stringify({scope:q.scope,selection:q.scope==='selection'?selection:'',indices:selectedIndices,paragraphs:targets.map(function(p){return p.ToJSON();}),sections:d.GetSections().map(function(s){return s.ToJSON();})});
      if(guard.length>3000000)return fail('Область слишком велика для безопасного снимка.');
      function simpleTable(t){var count=t.GetRow(0).GetCellsCount();for(var r=0;r<t.GetRowsCount();r++){if(t.GetRow(r).GetCellsCount()!==count)return false;for(var c=0;c<count;c++){var content=t.GetCell(r,c).GetContent();for(var n=0;n<content.GetElementsCount();n++){var e=content.GetElement(n);if(e.GetClassType()!=='paragraph'||protectedParagraph(e))return false;}var pr=t.GetCell(r,c).Cell.Pr;if(pr&&(pr.GridSpan>1||pr.VMerge!==undefined&&pr.VMerge!==null))return false;}}return true;}
      var sourceBlocks=[],protectedIds=[],protectedObjects={};
      if(q.scope==='document'){
        for(var i=0;i<d.GetElementsCount();i++){var e=d.GetElement(i),type=e.GetClassType(),id='source-'+i;
          if(type==='paragraph'&&!protectedParagraph(e)){var level=role(e);if(!level&&e.GetNumbering()){protectedIds.push(id);protectedObjects[id]=e;sourceBlocks.push({type:'preserve',id:id});}else sourceBlocks.push({type:level?'heading':'paragraph',level:level||undefined,text:e.GetText({Numbering:false})});}
          else if(type==='table'&&simpleTable(e)){var rows=[];for(var rr=0;rr<e.GetRowsCount();rr++){var row=[];for(var cc=0;cc<e.GetRow(rr).GetCellsCount();cc++)row.push(e.GetCell(rr,cc).GetContent().GetAllParagraphs().map(function(p){return p.GetText({Numbering:false});}).join('\n'));rows.push(row);}sourceBlocks.push({type:'table',rows:rows});}
          else{protectedIds.push(id);protectedObjects[id]=e;sourceBlocks.push({type:'preserve',id:id});}
        }
       }else{
        var lines=selection.split(/\r?\n/);
        if(lines.length===targets.length+1&&lines[lines.length-1]==='')lines.pop();
        sourceBlocks=lines.map(function(text,index){
          var level=lines.length===targets.length?role(targets[index]):0;
          return level?{type:'heading',level:level,text:text}:{type:'paragraph',text:text};
        }).filter(function(block){return block.text.length;});
      }
      if(q.action==='capture'){var exportObjects={},saved=d.Document.SaveDocumentState();try{protectedIds.forEach(function(id){var original=protectedObjects[id];if(typeof original.Select!=='function')throw Error('Объект не поддерживает создание снимка');original.Select();var collector={data:'',pushData:function(type,value){this.data=value;}};d.Document.Api.asc_CheckCopy(collector,2);if(!collector.data)throw Error('Пустой снимок объекта');var html=collector.data.replace(/\sclass="[^"]*"/g,'').replace(/src="([^"]+)"/g,function(attribute,src){if(/^data:image\/(png|jpeg);base64,/i.test(src))return attribute;var decoded=src.replace(/&amp;/g,'&'),images=d.Document.Api.ImageLoader&&d.Document.Api.ImageLoader.map_image_index||{},image;Object.keys(images).some(function(key){var candidate=images[key]&&images[key].Image;if(candidate&&(key===decoded||candidate.src===decoded)){image=candidate;return true;}return false;});if(!image)return attribute;try{var width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;if(!width||!height||width*height>16000000)return attribute;var canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(image,0,0);return 'src="'+canvas.toDataURL('image/png')+'"';}catch(ignore){return attribute;}});exportObjects[id]={html:html,headingLevel:original.GetClassType()==='paragraph'?role(original):0};});}finally{d.Document.LoadDocumentState(saved);d.Document.UpdateSelection();}return {ok:true,exportObjects:exportObjects,guard:guard,count:targets.length,sourceBlocks:sourceBlocks,protectedIds:protectedIds,text:q.scope==='selection'?selection:all.map(function(p){return p.GetText({Numbering:false});}).join('\n')};}
      if(q.guard!==guard)return fail('Документ или выделение изменились. Подготовьте оформление заново.');
      var profile=q.profile,b=profile&&profile.body;
      if(!profile||!b||!Array.isArray(profile.headings)||profile.headings.length!==9)return fail('Некорректный профиль оформления.');
      if(q.applyMargins){var margins=profile.margins,invalidMargins=d.GetSections().some(function(s){var j=parse(s.ToJSON()),size=j.pgSz||{};return !margins||(margins.left+margins.right)*1440/25.4>=size.w||(margins.top+margins.bottom)*1440/25.4>=size.h;});if(invalidMargins)return fail('Поля не помещаются на странице. Уменьшите значения.');}
      var numbered=d.CreateNumbering('numbered'),none=d.CreateNumbering('numbered'),bullet=d.CreateNumbering('bullet');none.GetLevel(0).SetCustomType('none','','left');
      for(i=0;i<9;i++)numbered.GetLevel(i).SetCustomType('decimal',Array.from({length:i+1},function(_,n){return '%'+(n+1);}).join('.')+'.','left');
      var listCopies=new Map(),listStyles=profile.lists||{};
      var listTemplate=d.CreateNumbering('numbered');
      var bulletFormat=bullet.Num.GetLvl(0).Format,noneFormat=none.Num.GetLvl(0).Format;
      var marker={disc:'•',circle:'○',square:'▪',dash:'–'};
      function styleList(p){
        if((!listStyles.bullet||listStyles.bullet==='keep')&&(!listStyles.number||listStyles.number==='keep'))return;
        var current=p.GetNumbering();
        if(!current)return;
        var original=current.Num,index=current.GetLevelIndex(),level=original.GetLvl(index);
        var isBullet=level.Format===bulletFormat;
        if(level.Format===noneFormat)return;
        var style=isBullet?listStyles.bullet:listStyles.number;
        if(!style||style==='keep')return;
        var replacement=listCopies.get(original);
        if(!replacement){
          replacement=original.Copy();
          for(var i=0;i<9;i++){
            var old=original.GetLvl(i),next=old.Copy(),bulleted=old.Format===bulletFormat;
            var variant=bulleted?listStyles.bullet:listStyles.number;
            if(!variant||variant==='keep'||old.Format===noneFormat)continue;
            var format=bulleted?'bullet':variant==='decimalParen'?'decimal':variant;
            var label=bulleted?marker[variant]:'%'+(i+1)+(variant==='decimalParen'?')':'.');
            listTemplate.GetLevel(i).SetCustomType(format,label,'left');
            next.Format=listTemplate.Num.GetLvl(i).Format;
            next.LvlText=listTemplate.Num.GetLvl(i).Copy().LvlText;
            if(bulleted)next.TextPr.RFonts.SetAll('Arial',-1);
            else next.TextPr=old.TextPr.Copy();
            replacement.SetLvl(next,i);
          }
          listCopies.set(original,replacement);
          listCopies.set(replacement,replacement);
        }
        p.Paragraph.SetNumPr(replacement.GetId(),index);
      }
      function font(r,s,heading,p){var col=rgb(s.color),pr=Api.CreateTextPr();pr.SetFontFamily(s.font);pr.SetFontSize(s.size*2);pr.SetColor(col[0],col[1],col[2],false);if(s.themeColor!==undefined&&q.themeFills?.[s.themeColor]){var spec=q.themeFills[s.themeColor],color=Api.CreateSchemeColor('accent1');color.Unicolor.color.id=spec.id;color.Unicolor.Mods=new AscFormat.CColorModifiers();spec.mods.forEach(function(mod){var item=new AscFormat.CColorMod();item.name=mod.name;item.val=mod.val;color.Unicolor.Mods.addMod(item);});pr.SetFill(Api.CreateSolidFill(color));}else pr.SetFill(Api.CreateSolidFill(Api.CreateRGBColor(col[0],col[1],col[2])));if(heading){pr.SetBold(s.bold);pr.SetUnderline(s.underline);}if(p)p.SetTextPr(pr);else r.SetTextPr(pr);}

      function paragraph(p,level,selectionOnly){var s=level?profile.headings[level-1]:b,pr=p.GetParaPr();if(!selectionOnly||level)font(null,s,!!level,p);pr.SetSpacingBefore(s.before*20,false);pr.SetSpacingAfter(s.after*20,false);pr.SetSpacingLine(Math.round(s.line*240),'auto');pr.SetJc(level?'left':b.align);if(!p.GetNumbering()){pr.SetIndFirstLine(level?0:b.first*1440/25.4);pr.SetIndLeft(b.left*1440/25.4);pr.SetIndRight(b.right*1440/25.4);}if(level){
        if(s.decoration!==undefined){
          pr.SetBottomBorder('none',0,0,0,0,0);
          pr.SetLeftBorder('none',0,0,0,0,0);
          pr.SetShd('nil',255,255,255,false);
          var color=rgb(s.decoration==='band'?(s.bandColor||profile.table.light):s.color);
          if(s.decoration==='band')pr.SetShd('clear',color[0],color[1],color[2],false);
          else if(s.decoration==='bottom')pr.SetBottomBorder('single',10,3,color[0],color[1],color[2]);
          else if(s.decoration==='left')pr.SetLeftBorder('single',18,5,color[0],color[1],color[2]);
        }
        pr.SetKeepNext(true);pr.SetKeepLines(true);if(profile.numbering==='decimal')p.SetNumbering(numbered.GetLevel(level-1));else if(profile.numbering==='none')p.SetNumbering(none.GetLevel(0));}else styleList(p);}
      function table(t){var st=d.GetStyle(profile.table.style==='none'?'Normal Table':'Table Grid');if(st)t.SetStyle(st);var color=rgb(profile.table.border),border={Value:profile.table.style==='none'?0:1,Size:.18,Color:{r:color[0],g:color[1],b:color[2],Auto:false},Space:0};['Top','Bottom','Left','Right','InsideH','InsideV'].forEach(function(side){t.Table['Set_TableBorder_'+side](border);});for(var row=0;row<t.GetRowsCount();row++)for(var col=0;col<t.GetRow(row).GetCellsCount();col++){var cell=t.GetCell(row,col),s=profile.table,fill=row===0&&s.style==='accent'?s.header:row===0&&s.style!=='none'&&s.style!=='grid'?s.light:row%2===0&&s.style==='banded'?s.light:'#FFFFFF',color=row===0&&s.style==='accent'?'#FFFFFF':s.color,v=rgb(fill);cell.SetBackgroundColor(v[0],v[1],v[2],false);var ps=cell.GetContent().GetAllParagraphs();ps.forEach(function(p){font(null,{font:s.font,size:s.size,color:color},false,p);if(row===0){var bold=Api.CreateTextPr();bold.SetBold(true);p.SetTextPr(bold);}});}}
      // Preflight all API entry points before any document mutation.
      if(targets.some(function(p){return typeof p.GetRange().SetUnderline!=='function'||typeof p.GetParaPr().SetIndLeft!=='function';}))return fail('Эта версия Р7 не поддерживает нужные параметры оформления.');
      var textBefore=all.map(function(p){return p.GetText({Numbering:false});}).join('\u0000');
      if(q.action==='structure'){
        if(q.scope==='selection'&&targets.some(protectedParagraph))return fail('Для перестройки выделения выберите обычный текст без встроенных объектов.');
        if(q.scope==='selection'&&tables.some(function(t){for(var r=0;r<t.GetRowsCount();r++)for(var c=0;c<t.GetRow(r).GetCellsCount();c++)if(t.GetCell(r,c).GetContent().GetAllParagraphs().some(function(p){return targets.some(function(a){return a.Paragraph===p.Paragraph;});}))return true;return false;}))return fail('Для перестройки выделения выберите текст вне таблиц или весь документ.');
        var seen={},content=[];
        q.blocks.forEach(function(block){var p;if(block.type==='preserve'){var original=protectedObjects[block.id];if(!original||seen[block.id]||typeof original.Copy!=='function')throw Error('Не удалось сохранить исходный объект');seen[block.id]=true;var copy=original.Copy();if(copy.GetClassType()==='paragraph')paragraph(copy,role(original),false);else if(copy.GetClassType()==='table')table(copy);content.push(copy);}
          else if(block.type==='table'){var t=Api.CreateTable(block.rows[0].length,block.rows.length);block.rows.forEach(function(row,r){row.forEach(function(value,c){t.GetCell(r,c).GetContent().GetElement(0).AddText(value);});});table(t);content.push(t);}
          else{p=Api.CreateParagraph();p.AddText(block.text);if(block.type==='heading'){var st=d.GetStyle('Heading '+block.level);if(st)p.SetStyle(st);}if(block.type==='bullet')p.SetNumbering(bullet.GetLevel(block.level||0));paragraph(p,block.type==='heading'?block.level:0,false);content.push(p);}});
        if(protectedIds.some(function(id){return !seen[id];}))return fail('План не содержит всех исходных сложных объектов.');
        if(!content.length)return fail('Пустой план структуры.');
        changed=true;
        if(q.scope==='document'){
          // InsertContent merges boundary paragraphs with the cursor paragraph.
          // Replace whole elements so the last paragraph retains its own properties.
          var oldCount=d.GetElementsCount();
          d.RemoveSelection();
          content.forEach(function(element,index){d.AddElement(index,element);});
          for(var index=0;index<oldCount;index++)d.RemoveElement(content.length);
          d.Document.MoveCursorToStartPos(false);
        }else if(!d.InsertContent(content))return fail('Р7 не подтвердил вставку структуры.');
      }else{
        if(q.scope==='selection')font(range,b,false);
        for(i=0;i<targets.length;i++){changed=true;paragraph(targets[i],role(targets[i]),q.scope==='selection');}
        tables.forEach(function(t){var ps=[];for(var r=0;r<t.GetRowsCount();r++)for(var c=0;c<t.GetRow(r).GetCellsCount();c++)ps=ps.concat(t.GetCell(r,c).GetContent().GetAllParagraphs());if(q.scope==='document'||ps.some(function(p){return targets.some(function(a){return a.Paragraph===p.Paragraph;});})){changed=true;table(t);}});
        if(all.map(function(p){return p.GetText({Numbering:false});}).join('\u0000')!==textBefore)return fail('Оформление неожиданно изменило текст.');
      }
      if(q.applyMargins){var m=profile.margins;d.GetSections().forEach(function(s){changed=true;s.SetPageMargins(m.left*1440/25.4,m.top*1440/25.4,m.right*1440/25.4,m.bottom*1440/25.4);});}
      return {ok:true,paragraphs:targets.length,tables:tables.length,textUnchanged:q.action!=='structure'};
    }catch(e){return fail('Не удалось применить оформление: '+String(e));}
  }
  root.AIFormatCommand=formatCommand;
})(window);
