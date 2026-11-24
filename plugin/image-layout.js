/* Fill an explicitly selected document frame without stretching the source. */
(function(root){'use strict';
 function crop(width,height,ratio){
  if(!(width>0&&height>0&&ratio>0&&Number.isFinite(ratio)))throw Error('Некорректные размеры изображения или области.');
  const w=Math.min(width,height*ratio),h=w/ratio;
  return {x:(width-w)/2,y:(height-h)/2,w,h};
 }
 function request(box,ratio,label){
  const widthMm=box?.w||100,heightMm=box?.h||100/ratio;
  const scale=Math.min(150/25.4,2048/Math.max(widthMm,heightMm));
  const aspectRatio=widthMm/heightMm,common=[[1,1],[3,4],[4,3],[16,9],[9,16],[3,2],[2,3],[2,1]].find(([w,h])=>Math.abs(w/h-aspectRatio)<1e-8);
  let widthPx=Math.max(8,Math.round(widthMm*scale/8)*8),heightPx=Math.max(8,Math.round(heightMm*scale/8)*8);
  if(common){const [w,h]=common,unit=Math.min(Math.max(8,Math.round(Math.min(widthMm*scale/w,heightMm*scale/h)/8)*8),Math.floor(2048/Math.max(w,h)/8)*8);widthPx=w*unit;heightPx=h*unit;}
  return {widthMm:Number(widthMm.toFixed(3)),heightMm:Number(heightMm.toFixed(3)),aspectRatio,aspectLabel:label,widthPx,heightPx,placement:'fill',crop:'center'};
 }
 async function normalize(data,ratio){
  const image=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Не удалось прочитать ответ генератора.'));im.src=data;});
  const width=image.naturalWidth,height=image.naturalHeight;
  if(!width||!height||width>8192||height>8192||width*height>16000000)throw Error('Изображение превышает допустимое разрешение.');
  const region=crop(width,height,ratio),changed=Math.abs(width/height-ratio)>1e-6;
  if(!changed)return {data,width,height,changed:false,crop:region};
  const scale=Math.min(1,2048/Math.max(region.w,region.h),Math.sqrt(4000000/(region.w*region.h)));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(region.w*scale));canvas.height=Math.max(1,Math.round(region.h*scale));
  const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(image,region.x,region.y,region.w,region.h,0,0,canvas.width,canvas.height);
  return {data:canvas.toDataURL('image/png'),width:canvas.width,height:canvas.height,changed:true,crop:region};
 }
 root.AIImageLayout={crop,request,normalize};
})(globalThis);
