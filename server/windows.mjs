import {spawn,execFile} from 'node:child_process';import {promisify} from 'node:util';import {readFile,writeFile,mkdir,unlink,rename} from 'node:fs/promises';import {createHash,randomUUID} from 'node:crypto';import {resolve,join} from 'node:path';
import {createInterface} from 'node:readline';
import {solutionRoot as root,dataDirectory as folder} from './runtime-paths.mjs';
let building;
async function ensureHelper(){
  if(process.platform!=='win32')throw Error('Системные операции доступны только в Windows');
  if(building)return building;
  building=(async()=>{const source=join(root,'server/WindowsUI.cs'),installation=join(root,'server/R7Installation.cs'),manifest=join(root,'server/WindowsUI.manifest'),hash=createHash('sha256').update(await readFile(source)).update(await readFile(installation)).update(await readFile(manifest)).digest('hex'),exe=join(folder,'R7AssistantUI-'+hash.slice(0,12)+'.exe');try{await readFile(exe);return exe;}catch(_){}
    await mkdir(folder,{recursive:true});const stagingExe=join(folder,'build-'+randomUUID()+'.exe');const compiler=join(process.env.WINDIR||'C:\\Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
    try{await promisify(execFile)(compiler,['/nologo','/target:winexe','/win32manifest:'+manifest,'/out:'+stagingExe,'/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll','/reference:'+join(process.env.WINDIR||'C:\\Windows','Microsoft.NET/Framework64/v4.0.30319/WPF/UIAutomationClient.dll'),'/reference:'+join(process.env.WINDIR||'C:\\Windows','Microsoft.NET/Framework64/v4.0.30319/WPF/UIAutomationTypes.dll'),source,installation],{windowsHide:true});}catch(e){throw Error('Не удалось собрать системный помощник Windows: '+(e.stdout||e.message));}
    try{await rename(stagingExe,exe);}catch(error){try{await readFile(exe);}catch(_){throw error;}finally{await unlink(stagingExe).catch(()=>{});}}
    await writeFile(join(folder,'windows-ui.sha256'),hash);return exe;
  })();try{return await building;}finally{building=null;}
}
async function run(operation,bytes,extension,filename,alternatives){const file=await ensureHelper();const input=join(folder,'ui-'+randomUUID()+'.json');await writeFile(input,JSON.stringify({data:bytes.toString('base64'),extension:extension||'',filename:filename||'',alternatives:JSON.stringify(alternatives||{})}));return new Promise((accept,reject)=>{
  const p=spawn(file,[operation,input],{env:{...process.env,R7_AI_DATA_DIR:folder},windowsHide:false,stdio:['ignore','pipe','pipe']});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.once('error',reject);p.once('close',async code=>{await unlink(input).catch(()=>{});if(code!==0)return reject(Error('Ошибка системной операции: '+err.slice(0,300)));try{accept(JSON.parse(out));}catch(_){reject(Error('Системный помощник не вернул результат'));}});
});}
export function saveFile(bytes,extension,filename,alternatives){if(!['txt','png','jpg','pptx','docx'].includes(extension))throw Error('Неподдерживаемый формат');return run('save',bytes,extension,filename,alternatives);}
export function copyImage(data){return run('clipboard',Buffer.from(data.split(',')[1],'base64'));}
export function copyRichText(html,text){return run('clipboard-html',Buffer.from(JSON.stringify({html,text}),'utf8'));}
export async function readRichClipboard(){const file=await ensureHelper();const {stdout}=await promisify(execFile)(file,['read-rich'],{windowsHide:true,encoding:'utf8'});return JSON.parse(stdout);}
export async function processInfo(pid){
  if(!Number.isInteger(pid)||pid<1)throw Error('Некорректный PID');
  const file=await ensureHelper();
  const {stdout}=await promisify(execFile)(file,['peer',String(pid)],{windowsHide:true,timeout:5000,encoding:'utf8'});
  return JSON.parse(stdout.replace(/^\uFEFF/,''));
}

export async function discoverR7Installation(){
  const file=await ensureHelper();
  const {stdout}=await promisify(execFile)(file,['r7-installations'],{windowsHide:true,timeout:15000,encoding:'utf8',env:{...process.env,R7_AI_DATA_DIR:folder}});
  const result=JSON.parse(stdout.replace(/^\uFEFF/,''));
  if(!result.ok)throw Object.assign(Error(result.error),{status:409,reason:result.reason});
  return result.executable;
}

export async function openDocumentNames(){
  const file=await ensureHelper();
  const {stdout}=await promisify(execFile)(file,['document-names'],{env:{...process.env,R7_AI_DATA_DIR:folder},windowsHide:true,timeout:5000,encoding:'utf8'});
  return JSON.parse(stdout.replace(/^\uFEFF/,''));
}

// The native STA process stays warm: clicks send only a short name and filter list.
let saveHost,saveHostStarting,savePending;
export async function prepareSaveDialog(){
  if(saveHost&&!saveHost.killed)return;
  if(saveHostStarting)return saveHostStarting;
  saveHostStarting=(async()=>{
    const file=await ensureHelper();
    await new Promise((resolveReady,reject)=>{
      const child=spawn(file,['save-host'],{env:{...process.env,R7_AI_DATA_DIR:folder},windowsHide:true,stdio:['pipe','pipe','pipe']});
      const lines=createInterface({input:child.stdout});let ready=false,errorText='';
      const timeout=setTimeout(()=>{child.kill();reject(Error('Окно сохранения ещё не готово'));},10000);
      child.stderr.on('data',b=>{errorText=(errorText+b).slice(-500);});
      function failed(error){clearTimeout(timeout);if(saveHost===child)saveHost=null;if(!ready)reject(error);if(savePending){savePending.reject(error);savePending=null;}}
      child.once('error',failed);
      child.once('close',()=>{lines.close();failed(Error(errorText||'Системный диалог закрыт'));});
      lines.on('line',line=>{
        let message;try{message=JSON.parse(line);}catch(_){return;}
        if(message.ready){ready=true;clearTimeout(timeout);saveHost=child;resolveReady();return;}
        if(message.eventType==='phase'){if(savePending)savePending.phases.push({phase:message.phase,at:message.at});return;}
        if(message.eventType==='dialog-shown'){if(savePending)savePending.shownAt=message.shownAt||Date.now();return;}
        if(message.eventType==='dialog-painted'){if(savePending){savePending.paintedAt=message.paintedAt||Date.now();savePending.onShown?.({shownAt:savePending.shownAt,phases:savePending.phases,paintedAt:savePending.paintedAt,elapsedMs:performance.now()-savePending.started});}return;}
        const pending=savePending;savePending=null;
        if(pending){if(message.error)pending.reject(Error(message.error));else pending.resolve({...message,dialogShownAt:pending.shownAt,dialogPaintedAt:pending.paintedAt});}
      });
      child.unref();child.stdout.unref?.();child.stderr.unref?.();child.stdin.unref?.();
    });
  })();
  try{await saveHostStarting;}finally{saveHostStarting=null;}
}
export async function chooseSaveFile(extension,filename,extensions=[extension],onShown,cancelAfterMs){
  await prepareSaveDialog();
  if(savePending)throw Error('Диалог сохранения уже открыт');
  const alternatives=Object.fromEntries(extensions.filter(ext=>ext!==extension).map(ext=>[ext,'']));
  return new Promise((resolve,reject)=>{
    savePending={resolve,reject,onShown,phases:[],started:performance.now()};
    saveHost.stdin.write(JSON.stringify({extension,filename,data:'',cancelAfterMs:cancelAfterMs===undefined?'':String(cancelAfterMs),alternatives:JSON.stringify(alternatives)})+'\n',error=>{if(error&&savePending){savePending=null;reject(error);}});
  });
}
process.once('exit',()=>{saveHost?.kill();});
export const ensureWindowsHelper=ensureHelper;
export async function stopWindowsHelper(){await saveHostStarting?.catch(()=>{});saveHost?.kill();saveHost=null;}

