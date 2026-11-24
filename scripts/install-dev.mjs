import {cp,mkdir} from 'node:fs/promises';import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..'),target=join(process.env.LOCALAPPDATA,'R7-Office','Editors','data','sdkjs-plugins','{B23577B0-9BD5-45E7-A218-1D2F22057BF4}');
await mkdir(target,{recursive:true});await cp(join(root,'plugin'),target,{recursive:true});console.log('Dev plugin installed: '+target);
const sidebarTarget=join(target,'..','{26AD9633-DE82-4527-9B0B-7D5BE6419CA7}');
await mkdir(sidebarTarget,{recursive:true});await cp(join(root,'sidebar-plugin'),sidebarTarget,{recursive:true});console.log('Sidebar launcher installed: '+sidebarTarget);
