/* Page-space geometry shared by pointer preview and insertion. */
(function(root){
 'use strict';
 function constrain(anchor,pointer,page,ratio){
  if(!(ratio>0&&Number.isFinite(ratio)))throw Error('Некорректные пропорции изображения');
  const dx=pointer.x-anchor.x,dy=pointer.y-anchor.y,sx=dx<0?-1:1,sy=dy<0?-1:1;
  const availableW=sx<0?anchor.x:page.width-anchor.x,availableH=sy<0?anchor.y:page.height-anchor.y;
  const w=Math.max(0,Math.min(Math.max(Math.abs(dx),Math.abs(dy)*ratio),availableW,availableH*ratio)),h=w/ratio;
  return {page:anchor.page,x:sx<0?anchor.x-w:anchor.x,y:sy<0?anchor.y-h:anchor.y,w,h};
 }
 root.ImageAreaGeometry={constrain};
})(globalThis);
