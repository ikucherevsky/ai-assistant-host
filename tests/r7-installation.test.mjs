import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,copyFile,access} from 'node:fs/promises';import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {isR7ProcessInInstallation} from '../server/r7-peer.mjs';
const root=resolve(import.meta.dirname,'..'),execute=promisify(execFile);
test('проверка процесса учитывает выбранный каталог, включая суффикс и другой диск',()=>{
 for(const dir of ['C:\\Program Files\\R7-Office\\Editors-2026.3.1','D:\\Apps\\Р7 Офис\\Версия 2026']){const exe=dir+'\\DesktopEditors.exe';assert.equal(isR7ProcessInInstallation({name:'editors',path:dir+'\\editors.exe'},exe),true);assert.equal(isR7ProcessInInstallation({name:'node',path:dir+'\\node.exe'},exe),false);assert.equal(isR7ProcessInInstallation({name:'editors',path:dir+'-fake\\editors.exe'},exe),false);assert.equal(isR7ProcessInInstallation({name:'editors',path:'C:\\Temp\\editors.exe'},exe),false);}
 assert.equal(isR7ProcessInInstallation({name:'editors',path:'editors.exe'},'DesktopEditors.exe'),false);
});
test('общий native resolver: настоящий Р7 в другом каталоге, конфигурация, авто и неоднозначность',{skip:process.platform!=='win32'},async()=>{
 const folder=await mkdtemp(join(tmpdir(),'r7-discovery-test-')),harness=join(folder,'Probe.cs'),exe=join(folder,'Probe.exe');
 await writeFile(harness,`using System;using System.Collections.Generic;using System.Web.Script.Serialization;class Probe{static int Main(string[] args){Console.OutputEncoding=new System.Text.UTF8Encoding(false);try{object value;if(args[0]=="validate")value=new{ok=true,path=R7Installation.Validate(args[1])};else if(args[0]=="discover")value=R7Installation.Discover(null,args[1]);else{var found=new Dictionary<string,string>{{"C:\\\\One\\\\DesktopEditors.exe","registry"},{"D:\\\\Two\\\\DesktopEditors.exe","registry"}};var none=R7Installation.SelectKnown(found,new HashSet<string>());var one=R7Installation.SelectKnown(found,new HashSet<string>{"D:\\\\Two\\\\DesktopEditors.exe"});var both=R7Installation.SelectKnown(found,new HashSet<string>{"C:\\\\One\\\\DesktopEditors.exe","D:\\\\Two\\\\DesktopEditors.exe"});value=new{none=none,one=one,both=both};}Console.Write(new JavaScriptSerializer().Serialize(value));return 0;}catch(Exception e){Console.Write(new JavaScriptSerializer().Serialize(new{ok=false,error=e.Message}));return 0;}}}`);
 await execute(join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/out:'+exe,'/reference:System.Web.Extensions.dll',join(root,'server/R7Installation.cs'),harness],{windowsHide:true});
 const invoke=async(args,env=process.env)=>JSON.parse((await execute(exe,args,{windowsHide:true,env})).stdout);
 const choices=await invoke(['select']);assert.equal(choices.none,null);assert.equal(choices.both,null);assert.equal(choices.one,'D:\\Two\\DesktopEditors.exe');
 const installed=await invoke(['discover',folder],{...process.env,R7_EXE:''});assert.equal(installed.ok,true,installed.error);const source=installed.executable;
 const alternate=join(folder,'Р7 Офис','Editors-2026.3.1');await mkdir(alternate,{recursive:true});for(const name of ['DesktopEditors.exe','editors.exe'])await copyFile(join(source,'..',name),join(alternate,name));
 assert.equal((await invoke(['validate',alternate])).path,join(alternate,'DesktopEditors.exe'));
 await writeFile(join(folder,'r7-settings.json'),JSON.stringify({mode:'explicit',executable:join(alternate,'DesktopEditors.exe')}));const selected=await invoke(['discover',folder]);assert.equal(selected.executable,join(alternate,'DesktopEditors.exe'));assert.equal(selected.source,'configured');
 await writeFile(join(folder,'r7-settings.json'),JSON.stringify({mode:'auto'}));assert.equal((await invoke(['discover',folder],{...process.env,R7_EXE:'Z:\\Missing\\DesktopEditors.exe'})).ok,true);
 await writeFile(join(folder,'r7-settings.json'),JSON.stringify({mode:'explicit',executable:'Z:\\Missing\\DesktopEditors.exe'}));assert.equal((await invoke(['discover',folder])).reason,'invalid-configured-path');
 await writeFile(join(folder,'r7-settings.json'),'{invalid json');assert.equal((await invoke(['discover',folder])).reason,'invalid-settings');
 await writeFile(join(alternate,'DesktopEditors.exe'),'MZ not an R7 executable');assert.equal((await invoke(['validate',alternate])).ok,false);
});
