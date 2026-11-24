import {randomBytes, randomUUID, timingSafeEqual, createHash} from 'node:crypto';
import '../plugin/format-model.js';
import {validateSemanticResult} from './semantic-format.mjs';
import {fingerprint} from './result-receipt.mjs';
import {prepareExportObjects} from './rich-result.mjs';
const Format=globalThis.AIFormat;
export const SCENARIOS = ['style','summary','questions','presentation','image','format'];
export const digest = text => createHash('sha256').update(text).digest('hex');
export const secret = () => randomBytes(32).toString('base64url');
export function equal(a,b) { return typeof a==='string' && typeof b==='string' && Buffer.byteLength(a)===Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b)); }
export class Store {
  constructor({now=Date.now,ttl=120000}={}) { this.sessions=new Map();this.now=now;this.ttl=ttl; }
  pair({panelId,title,testing=false}) {
    if(typeof panelId!=='string'||!/^[a-f0-9-]{36}$/i.test(panelId)||typeof title!=='string'||!title.trim()||title.length>200) throw Error('Некорректная панель или название документа');
    for(const s of this.sessions.values()) if(s.panelId===panelId) this.sessions.delete(s.id);
    const s={id:randomUUID(),panelId,title,testing:testing===true,pluginToken:secret(),mcpToken:secret(),seen:this.now(),tasks:[],closed:false};this.sessions.set(s.id,s);return s;
  }
  auth(token,role) {
    const s=[...this.sessions.values()].find(s=>equal(token,s[role==='mcp'?'mcpToken':'pluginToken']));
    if(!s||s.closed||this.now()-s.seen>this.ttl)throw Object.assign(Error('Сессия закрыта или панель не отвечает'),{status:401});return s;
  }
  heartbeat(s){s.seen=this.now();}
  task(s,input){
    const {scenario,scope,text,prompt='',style='official'}=input;
    if(!SCENARIOS.includes(scenario)||!['selection','document'].includes(scope)||typeof text!=='string'||text.length>250000||typeof prompt!=='string'||prompt.length>8000) throw Error('Некорректная задача или превышен лимит');
    if(scenario!=='image'&&!text.trim())throw Error('Нет текста для обработки');
    if(['image','questions'].includes(scenario)&&!prompt.trim())throw Error('Введите запрос');
    if(scenario==='style'&&!['conversational','official','technical','poetic'].includes(style))throw Error('Неизвестный стиль');
    if(s.tasks.some(t=>['queued','working'].includes(t.state)))throw Error('Сначала завершите или отмените текущую задачу');
    const t={id:randomUUID(),sessionId:s.id,documentTitle:s.title,scenario,scope,text,prompt,style,sourceHash:digest(text),created:this.now(),state:'queued',progress:[],result:null};
    if(scenario==='format'){
      const f=input.formatting;if(!f)throw Error('Нет параметров оформления');Format.validateProfile(f.profile);
      if(!Array.isArray(f.protectedIds)||f.protectedIds.some(id=>typeof id!=='string')||f.protectedIds.length>500)throw Error('Некорректные исходные объекты');
      Format.validateBlocks(f.sourceBlocks,f.protectedIds);t.formatting=structuredClone(f);
      Object.defineProperty(t,'exportObjects',{value:prepareExportObjects(input.exportObjects,f.protectedIds),enumerable:false});
    }
    s.tasks.push(t);if(s.tasks.length>20)s.tasks.shift();return t;
  }
  find(s,id){const t=s.tasks.find(t=>t.id===id);if(!t)throw Error('Задача отсутствует в этой вкладке');return t;}
  pending(s){return s.tasks.filter(t=>['queued','working'].includes(t.state));}
  claim(s,id){const t=this.find(s,id);if(t.state!=='queued')throw Error('Задача уже получена или завершена');t.state='working';t.claim=secret();return t;}
  active(s,id,claim){const t=this.find(s,id);if(t.state!=='working'||!equal(t.claim,claim))throw Error('Задача отменена, завершена или принадлежит другому исполнителю');return t;}
  progress(s,id,claim,message){const t=this.active(s,id,claim);if(typeof message!=='string'||message.length>2000)throw Error('Некорректный комментарий');t.progress.push({at:this.now(),message});t.progress=t.progress.slice(-30);return t;}
  submit(s,id,claim,result){const t=this.find(s,id),hash=fingerprint(result);if(['ready','applied'].includes(t.state)&&equal(t.claim,claim)){if(t.submissionHash===hash)return t;throw Error('Задача уже доставлена. Изменённый ответ не заменяет принятый результат; отправьте новую задачу из Р7.');}this.active(s,id,claim);if(t.scenario==='format'&&result?.kind==='formatted')result=completeFormat(result,t.formatting.profile);validateResult(t,result);if(t.scenario==='format'){const same=JSON.stringify(result.blocks)===JSON.stringify(t.formatting.sourceBlocks);if(!same&&!t.formatting.allowStructure)throw Error('В этом режиме разрешено только оформление без перестройки текста');t.formatting.purpose=same?'style':'structure';}t.result=result;t.submissionHash=hash;t.state='ready';return t;}
  cancel(s,id){const t=this.find(s,id);if(['queued','working','ready'].includes(t.state)){t.state='cancelled';t.result=null;}return t;}
  close(s){s.closed=true;s.tasks.forEach(t=>{t.state='cancelled';t.result=null;});this.sessions.delete(s.id);}
}
function completeFormat(result,base){
  const patch=result.profile??{};
  if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('profile должен быть объектом оформления');
  if(patch.preset&&!Format.presets.some(p=>p.id===patch.preset)||patch.theme&&!Format.themes.some(t=>t.id===patch.theme))throw Error('Неизвестный шаблон или тема');
  base=structuredClone(base);
  if(patch.preset&&patch.preset!==base.preset)base=Format.profile(patch.preset,patch.theme||base.theme);
  else if(patch.theme&&patch.theme!==base.theme){const colors=Format.profile(base.preset,patch.theme);base.theme=colors.theme;base.body.color=colors.body.color;delete base.body.themeColor;base.headings.forEach((h,i)=>{h.color=colors.headings[i].color;delete h.themeColor;});for(const key of ['header','light','border','color'])base.table[key]=colors.table[key];}
  if(patch.headings!==undefined&&(!Array.isArray(patch.headings)||patch.headings.some(h=>!h||!Number.isInteger(h.level)||h.level<1||h.level>9)||new Set(patch.headings.map(h=>h.level)).size!==patch.headings.length))throw Error('headings: укажите уникальные уровни level от 1 до 9');
  const profile={...structuredClone(base),...patch};
  for(const key of ['body','margins','table','lists']){if(patch[key]!==undefined&&(!patch[key]||typeof patch[key]!=='object'||Array.isArray(patch[key])))throw Error('profile.'+key+' должен быть объектом');profile[key]={...(key==='lists'?{bullet:'keep',number:'keep'}:{}),...base[key],...patch[key]};}
  profile.headings=base.headings.map(h=>({...h,...patch.headings?.find(p=>p.level===h.level)}));
  if(patch.body?.color!==undefined && patch.body.themeColor===undefined)delete profile.body.themeColor;
  for(const h of patch.headings||[])if(h.color!==undefined&&h.themeColor===undefined)delete profile.headings[h.level-1].themeColor;
  return {...result,profile};
}
export function validateResult(task,r){
  if(!r||typeof r!=='object')throw Error('Пустой результат');
  if(task.scenario==='format'){
    if(r.kind!=='formatted')throw Error('Ожидается структурированный результат оформления');
    Format.validateProfile(r.profile);Format.validateBlocks(r.blocks,task.formatting?.protectedIds||[]);validateSemanticResult(task,r);
  }else if(task.scenario==='image'){
    if(r.kind!=='image'||typeof r.data!=='string'||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(r.data)||r.data.length>8400000)throw Error('Ожидается PNG/JPEG до 6 МБ');
    const bytes=Buffer.from(r.data.split(',')[1],'base64');
    const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    if(!(r.data.startsWith('data:image/png')?png:jpeg))throw Error('Содержимое не соответствует формату изображения');
  }else if(task.scenario==='presentation'){
    if(r.kind!=='slides'||!Array.isArray(r.slides)||r.slides.length<1||r.slides.length>30)throw Error('Ожидается от 1 до 30 слайдов');
    for(const s of r.slides)if(typeof s.title!=='string'||s.title.length>150||!Array.isArray(s.bullets)||s.bullets.length>8||s.bullets.some(b=>typeof b!=='string'||b.length>400))throw Error('Слишком длинный или некорректный слайд');
  }else{
    if(r.kind!=='text')throw Error('Сценарий '+task.scenario+' ожидает result.kind="text" и полный result.text; получен kind="'+String(r.kind)+'". formatted/profile/blocks предназначены для сценария format. Получите актуальную задачу через r7_ai_host_get_task.');
    if(typeof r.text!=='string'||!r.text.trim())throw Error('Передайте непустой result.text со всем готовым текстом, а не только kind или описание выполнения');
    if(r.text.length>250000)throw Error('result.text содержит '+r.text.length+' символов; допустимо не более 250000. Не обрезайте текст молча: сообщите о превышении лимита.');
    if(task.scenario==='style'&&r.text.replace(/\s+/g,' ').trim()===task.text.replace(/\s+/g,' ').trim())throw Error('Манера изложения не изменена: результат совпадает с источником. Переработайте полный текст в запрошенном стиле, а не возвращайте исходник.');
    if(task.scenario==='style'&&task.text.trim().length>=400&&r.text.trim().length<task.text.trim().length*.25)throw Error('Результат изменения стиля слишком короткий относительно источника ('+r.text.trim().length+' из '+task.text.trim().length+' символов). Верните полный переработанный текст, а не образец или суммаризацию.');
  }
}
