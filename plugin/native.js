(function(){'use strict';
  // Functions passed to callCommand must be self-contained: R7 serializes them.
  function snapshot(api){try{var d=api.GetDocument(),range=d.Document.IsTextSelectionUse()?d.GetRangeBySelect():null,ps=d.GetAllParagraphs();return {ok:true,text:ps.map(function(p){return p.GetText()}).join('\n'),selection:range&&d.Document.IsTextSelectionUse()?(range.GetText()||''):'',selectionKey:JSON.stringify(ps.filter(function(p){return p.Paragraph.Selection&&p.Paragraph.Selection.Use;}).map(function(p){return [p.Paragraph.Get_Id(),p.Paragraph.Selection.StartPos,p.Paragraph.Selection.EndPos];})),title:typeof d.GetTitle==='function'?d.GetTitle():''};}catch(e){return {ok:false,error:String(e)};}}
  function selection(){try{var d=Api.GetDocument();return {ok:true,hasSelection:!!(d.Document.IsTextSelectionUse()&&(d.GetRangeBySelect().GetText()||'').trim())};}catch(e){return {ok:false,error:String(e)};}}
  function pageSettings(api){try{
    var d=api.GetDocument(),sections=d.GetSections(),range=d.Document.IsTextSelectionUse()?d.GetRangeBySelect():null,paragraphs=range?range.GetAllParagraphs():[],current=paragraphs[0],active=0;
    var result=sections.map(function(section,index){var raw=section.ToJSON(),j=typeof raw==='string'?JSON.parse(raw):raw,size=j.pgSz||{},m=j.pgMar||{},toMm=function(v){return Number(v)*25.4/1440;},margin=function(v){var n=toMm(v);return Number.isFinite(n)&&n>=0?n:20;},w=toMm(size.w),h=toMm(size.h);
      if(!(w>0&&h>0))throw Error('Размер страницы недоступен');
      if(current&&typeof current.GetSection==='function'){var selected=current.GetSection();if(selected&&selected.Section===section.Section)active=index;}
      return {widthMm:w,heightMm:h,marginsMm:{left:margin(m.left),right:margin(m.right),top:margin(m.top),bottom:margin(m.bottom)},sectionIndex:index};});
    return {ok:true,sections:result,activeSection:active};
  }catch(e){return {ok:false,error:'Не удалось прочитать формат страниц: '+String(e)};}}
  function apply(){try{
    var q=Asc.scope.aiAssistant,d=Api.GetDocument(),text=d.GetAllParagraphs().map(function(p){return p.GetText()}).join('\n');
    if(q.action!=='insert'&&text!==q.documentText)return {ok:false,mutated:false,error:'Исходный документ изменился. Восстановите источник или создайте новый запрос.'};
    if(q.action==='replace'){
      var range=d.GetRangeBySelect(),selected=range&&d.Document.IsTextSelectionUse()?range.GetText():'';
      var key=JSON.stringify(d.GetAllParagraphs().filter(function(p){return p.Paragraph.Selection&&p.Paragraph.Selection.Use;}).map(function(p){return [p.Paragraph.Get_Id(),p.Paragraph.Selection.StartPos,p.Paragraph.Selection.EndPos];}));
      if(q.scope==='selection'&&(selected!==q.source||key!==q.selectionKey))return {ok:false,mutated:false,error:'Выделение изменилось. Повторно выделите исходный текст или создайте запрос заново.'};
      if(q.scope==='document'){
        if(typeof d.GetAllDrawingObjects==='function'&&d.GetAllDrawingObjects().length)return {ok:false,error:'Есть графические объекты. Используйте вставку результата.'};
        // A whole-document rewrite is intentionally restricted to simple text.
        for(var i=0;i<d.GetElementsCount();i++){
          var el=d.GetElement(i);if(el.GetClassType()!=='paragraph')return {ok:false,error:'Есть таблицы или сложные объекты. Используйте вставку результата.'};
          for(var j=0;j<el.GetElementsCount();j++){
            var child=el.GetElement(j);if(child.GetClassType()!=='run')return {ok:false,error:'Есть поля, ссылки или сложные объекты. Используйте вставку результата.'};
            if(typeof child.GetAllDrawingObjects==='function'&&child.GetAllDrawingObjects().length)return {ok:false,error:'Есть графические объекты. Используйте вставку результата.'};
          }
        }
        if(typeof d.GetAllImages==='function'&&d.GetAllImages().length)return {ok:false,error:'Есть изображения. Используйте вставку результата.'};
        if(typeof d.Document.SelectAll!=='function')return {ok:false,error:'Замена всего документа не поддерживается этой версией Р7. Используйте вставку.'};d.Document.SelectAll();
      }
    }
    if(q.action==='insert'&&d.Document.IsTextSelectionUse())return {ok:false,mutated:false,error:'Снимите выделение перед вставкой'};
    if(q.action==='insert'&&!d.Document.GetCurrentParagraph(undefined,undefined,{CheckDocContent:true}))return {ok:false,mutated:false,error:'Установите текстовый курсор в месте вставки.'};
    var content=[];
    if(q.image){var p=Api.CreateParagraph();p.AddDrawing(Api.CreateImage(q.image.data,q.image.width,q.image.height));content.push(p);}
    else q.text.split(/\r?\n/).forEach(function(line){var p=Api.CreateParagraph();p.AddText(line);content.push(p);});
    if(typeof d.InsertContent!=='function')return {ok:false,error:'API вставки отсутствует'};
    var before=q.image?d.GetAllImages().length:0;
    if(!d.InsertContent(content))return {ok:false,error:'Р7 не подтвердил вставку.'};
    if(q.image&&d.GetAllImages().length!==before+1)return {ok:false,error:'Р7 не подтвердил появление изображения в документе.'};
    return {ok:true};
  }catch(e){return {ok:false,error:'Ошибка вставки. Проверьте документ; при частичной вставке используйте Ctrl+Z. '+String(e)};}}
  // The single-image loader invokes the editor's global insertion callback.
  // Use its separate batch path to populate the cache without inserting anything.
  function preloadImage(src){
    var loader=parent.Asc?.editor?.ImageLoader||parent.editor?.ImageLoader;
    if(typeof loader?.LoadImagesWithCallback!=='function'){
      return Promise.reject(Object.assign(Error('Р7 не поддерживает загрузку изображения для вставки.'),{noMutation:true}));
    }
    return new Promise(function(resolve,reject){
      var deadline=Date.now()+10000,timer;
      function fail(){
        clearTimeout(timer);
        reject(Object.assign(Error('Р7 не загрузил изображение. Повторите вставку.'),{noMutation:true}));
      }
      function check(){
        clearTimeout(timer);
        var cached=loader.map_image_index[src];
        if(cached?.Image?.complete&&cached.Image.naturalWidth>0){resolve();return;}
        if(cached?.Image===null){delete loader.map_image_index[src];fail();return;}
        if(Date.now()>=deadline){fail();return;}
        timer=setTimeout(check,50);
      }
      try{
        if(!loader.map_image_index[src])loader.LoadImagesWithCallback([src],check);
        check();
      }catch(e){fail();}
    });
  }
  var commandQueue=Promise.resolve();
  function command(fn,recalculate,payload){
    var run=function(){return new Promise(function(resolve,reject){
      var timer=setTimeout(function(){reject(Error('Р7 не подтвердил операцию. Проверьте документ перед повтором.'));},20000);
      if(payload)Asc.scope.aiAssistant=payload;
      try{Asc.plugin.callCommand(new Function("return JSON.stringify(("+fn.toString()+")());"),false,!!recalculate,function(value){clearTimeout(timer);try{value=JSON.parse(value);}catch(_){}if(!value||!value.ok)reject(Object.assign(Error(value&&value.error||'Р7 не вернул результат'),{noMutation:value?.mutated===false}));else resolve(value);});}catch(e){clearTimeout(timer);reject(e);}
    });};
    var result=commandQueue.then(run,run);commandQueue=result.catch(function(){});return result;
  }
  function format(q) {
    if (q.action === 'capture') return command(window.AIFormatCommand, false, q);
    const theme = parent.Common?.Utils?.ThemeColor;
    const themeFills = {};
    for (const style of [q.profile.body, ...q.profile.headings]) {
      if (style.themeColor === undefined || themeFills[style.themeColor]) continue;
      const entry = theme?.getEffectColors?.()?.find(color => color.effectId === style.themeColor);
      if (!entry) return Promise.reject(Object.assign(Error('Цвет темы недоступен в Р7.'), {noMutation:true}));
      const color = parent.AscFormat.CreateUnifillFromAscColor(theme.getRgbColor(entry)).fill.color;
      themeFills[style.themeColor] = {id:color.color.id, mods:color.Mods.Mods.map(({name,val})=>({name,val}))};
    }
    return command(window.AIFormatCommand, true, {...q,themeFills});
  }

  function checkpoint() {
    const api = parent.Asc?.editor, history = parent.AscCommon?.History;
    if (!history || !api?.WordControl?.m_oLogicDocument) return null;
    return {document:api.WordControl.m_oLogicDocument, points:history.Points.slice(0,history.Index+1)};
  }

  function restoreCheckpoint(target) {
    const api = parent.Asc?.editor, history = parent.AscCommon?.History;
    if (!target || !history || target.document !== api?.WordControl?.m_oLogicDocument ||
        target.points.some((point,i)=>history.Points[i]!==point)) {
      throw Error('Состояние документа больше недоступно в истории отмены Р7.');
    }
    if (!parent.AscCommon.CollaborativeEditing.Is_SingleUser()) throw Error('Восстановление доступно только в локальном документе.');
    const destination = target.points.length - 1;
    while (history.Index !== destination) {
      const previous = history.Index;
      if (previous > destination && history.Can_Undo()) api.Undo();
      else if (previous < destination && history.Can_Redo()) api.Redo();
      if (history.Index !== previous + (previous > destination ? -1 : 1) && history.Index !== destination)
        throw Error('Р7 не смог восстановить выбранное состояние. Проверьте документ.');
    }
  }

  // Read directly: even a read-only callCommand can truncate the editor's redo branch.
  async function readDocument(read) {
    const value = read(parent.Asc.editor);
    if (!value.ok) throw Error(value.error);
    return value;
  }

  window.R7Native={preloadImage:preloadImage,selection:function(){var logic=parent.Asc?.editor?.WordControl?.m_oLogicDocument;if(logic&&typeof logic.IsTextSelectionUse==='function'&&typeof logic.GetSelectedText==='function'){return Promise.resolve({ok:true,hasSelection:!!(logic.IsTextSelectionUse()&&(logic.GetSelectedText()||'').trim())});}return command(selection,false);},format:format,checkpoint:checkpoint,restoreCheckpoint:restoreCheckpoint,pageSettings:function(){return readDocument(pageSettings);},snapshot:function(){return readDocument(snapshot);},apply:async function(q){if(q.image)await preloadImage(q.image.data);return command(apply,true,q);}};
})();

