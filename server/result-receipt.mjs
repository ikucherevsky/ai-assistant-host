import {createHash} from 'node:crypto';
export function fingerprint(result){const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;return createHash('sha256').update(JSON.stringify(canonical(result))??'undefined').digest('hex');}
export function deliveryForTask(t){return {ok:true,taskId:t.id,documentTitle:t.documentTitle,state:t.state,delivered:true,resultKind:t.result.kind,resultCharacters:t.result.kind==='text'?t.result.text.length:undefined};}
