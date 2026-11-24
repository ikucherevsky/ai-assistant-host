import {discoverR7Installation} from './windows.mjs';
import {solutionVersion} from './version.mjs';
import {richResult} from './rich-result.mjs';
import {shortDocumentName,availableDocumentName} from './document-name.mjs';
import {deliveryForTask} from './result-receipt.mjs';
import http from 'node:http';
import {randomInt,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {mkdir,writeFile,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {Store,equal,secret} from './store.mjs';
import {createMcp} from './mcp.mjs';
import {presentation} from './presentation.mjs';
import {copyImage,copyRichText,saveFile,openDocumentNames,prepareSaveDialog,chooseSaveFile} from './windows.mjs';
import {dataDirectory} from './runtime-paths.mjs';
import {verifyR7Peer} from './r7-peer.mjs';
import {makeDocx} from './docx.mjs';
export async function start({port=47847,code=String(randomInt(100000,1000000)),store=new Store(),hostToken=secret(),allowCodePair=false,verifyPeer=verifyR7Peer,onSaveDialogShown,saveDialogCancelAfterMs,r7Exe=undefined}={}){
  let failures=[],hostSeen=0;
  const instanceId=randomUUID(),startedAt=new Date().toISOString();let closing;
  const close=()=>closing||(closing=new Promise(accept=>{clearInterval(namesTimer);server.closeAllConnections();server.close(()=>accept());}));
  const openingNames=new Map();
  const saveTickets=new Map();let cachedNames=[],refreshingNames=false;
  async function refreshNames(){if(refreshingNames)return;refreshingNames=true;try{cachedNames=await openDocumentNames();}catch(_){}finally{refreshingNames=false;}}
  let namesTimer;
  async function fileStamp(file){try{const s=await stat(file);return [s.size,s.mtimeMs,s.ino].join(':');}catch(e){if(e.code==='ENOENT')return null;throw e;}}
  async function resultFilename(task,extension,reserve=false,cached=false){
    const now=Date.now();
    for(const [name,until] of openingNames)if(until<now)openingNames.delete(name);
    // Native tab titles include documents that have never connected to AI Assistant Host.
    const nativeNames=cached?cachedNames:await openDocumentNames().catch(()=>cachedNames);
    const names=[...nativeNames,...[...store.sessions.values()].filter(s=>!s.closed&&now-s.seen<store.ttl).map(s=>s.title),...openingNames.keys()];
    const filename=availableDocumentName(shortDocumentName(task),extension,names);
    if(reserve)openingNames.set(filename,Date.now()+30000);
    return filename;
  }
  const server=http.createServer(async(req,res)=>{
    const origin=req.headers.origin;
    const allowed=!origin||origin==='null'||/^file:\/\//.test(origin)||/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
    if(!allowed){res.writeHead(403);return res.end();}
    if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host||'')){res.writeHead(403);return res.end();}
    res.setHeader('Access-Control-Allow-Origin',origin||'*');res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, MCP-Protocol-Version, MCP-Session-Id');res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS');res.setHeader('Cache-Control','no-store');
    if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
    const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    try{
      const url=new URL(req.url,'http://127.0.0.1');
      if(req.method==='GET'&&url.pathname==='/health')return json({ok:true,service:'r7-ai-assistant-host',version:solutionVersion,instanceId,pid:process.pid,startedAt});
      let raw='';if(req.method==='POST'){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>9000000)throw Object.assign(Error('Превышен лимит запроса'),{status:413});chunks.push(chunk);}raw=Buffer.concat(chunks).toString('utf8');}
      const body=raw?JSON.parse(raw):{};
      if(req.method==='POST'&&url.pathname==='/pair'){
        let editorExecutable=r7Exe;
        failures=failures.filter(t=>Date.now()-t<60000);if(failures.length>=10)return json({error:'Слишком много попыток. Подождите минуту.'},429);
        if(allowCodePair){if(!equal(body.code,code)){failures.push(Date.now());return json({error:'Неверный код подключения'},401);}}
        else {editorExecutable=r7Exe|| (verifyPeer===verifyR7Peer&&process.platform==='win32'?await discoverR7Installation():undefined);if(!await verifyPeer(req.socket,editorExecutable)){failures.push(Date.now());return json({error:'Подключение документа доступно только из приложения Р7-Офис. Проверьте выбранную установку в local/r7-settings.json.'},403);}}
        const s=store.pair(body);if(editorExecutable)Object.defineProperty(s,'r7Executable',{value:editorExecutable});return json({sessionId:s.id,pluginToken:s.pluginToken,mcpToken:s.mcpToken,title:s.title,mcpUrl:`http://127.0.0.1:${server.address().port}/mcp`});
      }
      const token=(req.headers.authorization||'').replace(/^Bearer /,'');
      if(url.pathname.startsWith('/host/')){
        if(!equal(token,hostToken))return json({error:'Host не авторизован'},401);
        if(req.method!=='GET')return json({error:'Метод не поддерживается'},405);
        if(url.pathname==='/host/pending'){hostSeen=Date.now();return json([...store.sessions.values()].filter(s=>!s.testing&&!s.closed&&Date.now()-s.seen<store.ttl).flatMap(s=>store.pending(s).filter(t=>t.state==='queued').map(t=>({id:t.id,title:s.title,scenario:t.scenario,created:t.created,sessionId:s.id,mcpUrl:`http://127.0.0.1:${server.address().port}/mcp`,mcpToken:s.mcpToken}))).sort((a,b)=>a.created-b.created));}
        const target=url.pathname.match(/^\/host\/tasks\/([a-f0-9-]+)\/([a-f0-9-]+)$/);
        if(!target)throw Error('Неизвестный маршрут host');const s=store.sessions.get(target[1]);if(!s)throw Error('Исходная панель закрыта');store.auth(s.mcpToken,'mcp');const t=store.find(s,target[2]);return json({id:t.id,state:t.state,...(['ready','applied'].includes(t.state)&&t.result?{submissionHash:t.submissionHash,delivery:deliveryForTask(t)}:{})});
      }
      if(url.pathname==='/mcp'){
        const s=store.auth(token,'mcp');
        const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
        const mcp=createMcp(store,s);res.on('close',()=>{transport.close();mcp.close();});await mcp.connect(transport);await transport.handleRequest(req,res,body);return;
      }
      const s=store.auth(token,'plugin');
      if(req.method==='POST'&&url.pathname==='/heartbeat'){store.heartbeat(s);return json({ok:true,coworkReady:Date.now()-hostSeen<10000});}
      if(req.method==='DELETE'&&url.pathname==='/session'){store.close(s);return json({ok:true});}
      if(req.method==='POST'&&url.pathname==='/tasks')return json(store.task(s,body));
      if(req.method==='POST'&&url.pathname==='/format/draft'){
        const t=store.task(s,{...body,scenario:'format'});t.result={kind:'formatted',profile:t.formatting.profile,blocks:t.formatting.sourceBlocks};t.state='ready';return json(t);
      }
      const match=url.pathname.match(/^\/tasks\/([a-f0-9-]+)(?:\/(cancel|export|open|applied|clipboard|save|save-dialog))?$/);
      if(!match) return json({error:'Неизвестный маршрут'},404);
      const t=store.find(s,match[1]);
      if(req.method==='POST'&&match[2]==='cancel')return json(store.cancel(s,t.id));
      if(req.method==='POST'&&match[2]==='applied'){if(!['ready','applied'].includes(t.state))throw Error('Результат недоступен');t.state='applied';return json({ok:true});}
      if(req.method==='GET'&&!match[2]){const {claim,...publicTask}=t;return json(publicTask);}
      if(!['ready','applied'].includes(t.state)||!t.result)throw Error('Результат недоступен');
      if(req.method==='POST'&&match[2]==='save-dialog'){
        const receivedAt=Date.now(),r=t.result,ext=r.kind==='slides'?'pptx':r.kind==='image'?(r.data.startsWith('data:image/png')?'png':'jpg'):'docx';
        const filename=await resultFilename(t,ext,false,true);
        const choice=await chooseSaveFile(ext,filename,['text','formatted'].includes(r.kind)?['docx','txt']:[ext],onSaveDialogShown,saveDialogCancelAfterMs??(s.testing&&Number.isInteger(body.testCancelAfterMs)&&body.testCancelAfterMs>=100&&body.testCancelAfterMs<=30000?body.testCancelAfterMs:undefined));
        const timing={receivedAt,nativeShownAt:choice.dialogShownAt,paintedAt:choice.dialogPaintedAt,requestToPaintMs:choice.dialogPaintedAt-receivedAt,...(Number.isFinite(body.clickedAt)&&Math.abs(receivedAt-body.clickedAt)<60000?{clickedAt:body.clickedAt,clickToPaintMs:choice.dialogPaintedAt-body.clickedAt}:{} )};
        if(choice.cancelled)return json({...choice,timing});
        const now=Date.now();for(const [key,value] of saveTickets)if(value.expires<now)saveTickets.delete(key);
        if(s.closed)throw Error('Исходная панель закрыта');
        const ticket=randomUUID();saveTickets.set(ticket,{sessionId:s.id,taskId:t.id,file:choice.file,extension:choice.extension,stamp:await fileStamp(choice.file),expires:now+300000});
        return json({ok:true,saveTicket:ticket,extension:choice.extension,timing});
      }
      if(req.method==='POST'&&match[2]==='clipboard'){if(t.result.kind==='image')return json(await copyImage(t.result.data));if(!['text','formatted'].includes(t.result.kind))throw Error('Для этого результата используйте копирование тезисов');const rich=richResult(t.result,t.exportObjects);return json(await copyRichText(rich.html,rich.text));}
      if((req.method==='GET'&&match[2]==='export')||(req.method==='POST'&&['open','save'].includes(match[2]))){
        const r=t.result;
        let destination;
        if(match[2]==='save'&&body.saveTicket){
          destination=saveTickets.get(body.saveTicket);
          if(!destination||destination.sessionId!==s.id||destination.taskId!==t.id||destination.expires<Date.now())throw Error('Повторите выбор файла для сохранения');
          saveTickets.delete(body.saveTicket);
        }
        if(match[2]==='open'&&!['slides','text','formatted'].includes(r.kind))throw Error('Открытие доступно для документов и презентаций');
        const textual=['text','formatted'].includes(r.kind),format=destination?.extension||(match[2]==='save'&&textual?'docx':body.format||url.searchParams.get('format')||'docx');
        if(textual&&!['docx','txt'].includes(format))throw Error('Выберите DOCX или TXT');
        const plain=r.kind==='formatted'?globalThis.AIFormat.text(r.blocks):r.text;
        const bytes=r.kind==='slides'?await presentation(r.slides):r.kind==='image'?Buffer.from(r.data.split(',')[1],'base64'):format==='docx'?await makeDocx(r,body.page,{applyMargins:t.formatting?.applyMargins??false,exportObjects:t.exportObjects}):Buffer.from(plain,'utf8');
        const ext=r.kind==='slides'?'pptx':r.kind==='image'?(r.data.startsWith('data:image/png')?'png':'jpg'):format;
        if(destination){
          if(destination.extension!==ext)throw Error('Тип результата изменился. Повторите выбор файла.');
          if(await fileStamp(destination.file)!==destination.stamp)throw Error('Файл изменился после выбора. Повторите сохранение и подтвердите замену.');
          await writeFile(destination.file,bytes);return json({ok:true,file:destination.file});
        }
        const filename=await resultFilename(t,ext,match[2]==='open');
        if(match[2]==='save')return json(await saveFile(bytes,ext,filename,textual?{txt:Buffer.from(plain,'utf8').toString('base64')}:undefined));
        if(match[2]==='open'){
          const folder=join(dataDirectory,r.kind==='slides'?'presentations':'documents',randomUUID());await mkdir(folder,{recursive:true});const file=join(folder,filename);await writeFile(file,bytes);
          const executable=s.r7Executable||r7Exe||await discoverR7Installation();
          await new Promise((accept,reject)=>{const p=spawn(executable,[file],{windowsHide:true,detached:true,stdio:'ignore'});p.once('error',reject);p.once('spawn',()=>{p.unref();accept();});});return json({ok:true,file});
        }
        res.writeHead(200,{'Content-Type':r.kind==='slides'?'application/vnd.openxmlformats-officedocument.presentationml.presentation':r.kind==='image'?`image/${ext==='jpg'?'jpeg':'png'}`:ext==='docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="AI Assistant.${ext}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())}`});return res.end(bytes);
      }
      return json({error:'Метод не поддерживается'},405);
    }catch(e){if(!res.headersSent)json({error:e.message},e.status||400);else res.end();}
  });
  await new Promise((accept,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',accept);});
  if(process.platform==='win32'){
    namesTimer=setInterval(refreshNames,5000);
    namesTimer.unref();
    void Promise.allSettled([prepareSaveDialog(),refreshNames()]);
  }
  return {server,store,code,hostToken,instanceId,startedAt,url:`http://127.0.0.1:${server.address().port}`,close};
}
