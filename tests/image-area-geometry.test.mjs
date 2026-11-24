import '../plugin/image-area-geometry.js';
import assert from 'node:assert/strict';
const constrain=globalThis.ImageAreaGeometry.constrain,page={width:210,height:297};
for(const ratio of [16/9,1,2/3,9/16])for(const [dx,dy] of [[60,15],[-60,15],[60,-15],[-60,-15],[0,90],[90,0],[1000,2000],[-1000,-2000]]){
 const anchor={page:0,x:100,y:140},r=constrain(anchor,{x:anchor.x+dx,y:anchor.y+dy},page,ratio);
 assert.ok(r.w>0&&r.h>0);assert.ok(Math.abs(r.w/r.h-ratio)<1e-10);assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=210+1e-10&&r.y+r.h<=297+1e-10);
 assert.ok(Math.abs((dx<0?r.x+r.w:r.x)-anchor.x)<1e-10);assert.ok(Math.abs((dy<0?r.y+r.h:r.y)-anchor.y)<1e-10);
}
for(const anchor of [{page:0,x:0,y:0},{page:0,x:210,y:297}]){
 const r=constrain(anchor,{x:anchor.x?1000:-100,y:anchor.y?1000:-100},page,16/9);assert.equal(r.w,0);assert.equal(r.h,0);
}
assert.throws(()=>constrain({x:0,y:0},{x:1,y:1},page,0));
console.log('PASS: four aspect ratios, all drag directions, page clipping, zero-space corners');
