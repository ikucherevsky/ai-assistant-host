import '../plugin/image-layout.js';import test from 'node:test';import assert from 'node:assert/strict';
const {crop,request}=globalThis.AIImageLayout;
test('ответ другого формата заполняет область центральной обрезкой без искажения масштаба',()=>{
 const r=crop(400,300,3/4);assert.deepEqual(r,{x:87.5,y:0,w:225,h:300});
 for(const [w,h,ratio] of [[1024,1024,16/9],[1024,768,.75],[768,1024,(1+Math.sqrt(5))/2],[300,400,.75]]){
  const c=crop(w,h,ratio);assert.ok(Math.abs(c.w/c.h-ratio)<1e-10);assert.ok(c.x>=0&&c.y>=0&&c.x+c.w<=w+.0001&&c.y+c.h<=h+.0001);
 }
});
test('размер запроса берётся из фактической области, включая золотое сечение',()=>{
 const r=request({w:80,h:120},16/9,'выбранная область');assert.equal(r.aspectRatio,2/3);assert.equal(r.widthMm,80);assert.equal(r.heightMm,120);assert.equal(r.crop,'center');assert.ok(r.widthPx>0&&r.heightPx<=2048);assert.equal(r.widthPx/r.heightPx,2/3);
 for(const ratio of [1,.75,4/3,16/9,9/16,3/2,2/3,2]){const p=request(null,ratio,'preset');assert.equal(p.widthPx/p.heightPx,ratio);assert.ok(Math.max(p.widthPx,p.heightPx)<=2048);}
 const phi=(1+Math.sqrt(5))/2;assert.ok(Math.abs(request(null,phi,'golden').aspectRatio-phi)<1e-10);
});
