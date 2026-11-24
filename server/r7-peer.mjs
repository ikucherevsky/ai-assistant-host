import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join,win32} from 'node:path';
import {processInfo} from './windows.mjs';
const execute=promisify(execFile);
export function isR7ProcessInInstallation(process,executable){
  if(typeof process?.path!=='string'||typeof executable!=='string'||!win32.isAbsolute(process.path)||!win32.isAbsolute(executable)||!/^DesktopEditors\.exe$/i.test(win32.basename(executable)))return false;
  const root=win32.resolve(win32.dirname(executable)).toLowerCase()+'\\';
  return win32.resolve(process.path).toLowerCase().startsWith(root)&&/^(DesktopEditors|editors|editors_helper)$/i.test(process.name);
}
async function owner(clientPort,serverPort){
  const {stdout}=await execute(join(process.env.WINDIR||'C:\\Windows','System32/netstat.exe'),['-ano','-p','tcp'],{windowsHide:true,timeout:5000,maxBuffer:4000000});
  for(const line of stdout.split(/\r?\n/)){const fields=line.trim().split(/\s+/);if(fields[0]==='TCP'&&fields[1]==='127.0.0.1:'+clientPort&&fields[2]==='127.0.0.1:'+serverPort&&fields[3]==='ESTABLISHED')return Number(fields[4]);}
  return null;
}
// Windows owns this socket/process mapping. Headers and browser UA are irrelevant.
export async function verifyR7Peer(socket,executable){
  if(process.platform!=='win32')return false;
  const clientPort=Number(socket.remotePort),serverPort=Number(socket.localPort);
  if(!Number.isInteger(clientPort)||!Number.isInteger(serverPort))return false;
  try{
    const pid=await owner(clientPort,serverPort);if(!Number.isInteger(pid)||pid<1)return false;
    const p=await processInfo(pid);
    if(!isR7ProcessInInstallation(p,executable))return false;
    return !socket.destroyed&&(await owner(clientPort,serverPort))===pid;
  }catch(_){return false;}
}
