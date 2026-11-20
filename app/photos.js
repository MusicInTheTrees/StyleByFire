import { DEFAULT_ADJUSTMENTS } from './domain.js';
const cache=new Map();
export function clearPhotoCache(){cache.clear();}
export function loadPhoto(src){if(!cache.has(src))cache.set(src,new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>{cache.delete(src);reject(Error('This photo could not be loaded.'));};im.src=src;}));return cache.get(src);}
export async function drawPhoto(canvas,src,adjustments={},maxSize=1100,original=false){
 const image=await loadPhoto(src);const a={...DEFAULT_ADJUSTMENTS,...adjustments};
 const crop=original?null:a.crop;const x=(crop?.x||0)*image.width,y=(crop?.y||0)*image.height,w=(crop?.w||1)*image.width,h=(crop?.h||1)*image.height;
 const rotation=original?0:a.rotation;const quarter=rotation%180!==0;const ratio=Math.min(1,maxSize/Math.max(w,h));
 canvas.width=Math.max(1,Math.round((quarter?h:w)*ratio));canvas.height=Math.max(1,Math.round((quarter?w:h)*ratio));const ctx=canvas.getContext('2d',{willReadFrequently:true});
 ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(rotation*Math.PI/180);ctx.drawImage(image,x,y,w,h,-w*ratio/2,-h*ratio/2,w*ratio,h*ratio);ctx.setTransform(1,0,0,1,0,0);
 if(!original&&(a.exposure||a.contrast||a.saturation||a.temperature||a.tint)){
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);const p=pixels.data;const exposure=2**(a.exposure/70),contrast=1+a.contrast/120,sat=1+a.saturation/100;
  for(let i=0;i<p.length;i+=4){let r=p[i]*exposure+a.temperature*.35+a.tint*.12,g=p[i+1]*exposure-a.tint*.25,b=p[i+2]*exposure-a.temperature*.35+a.tint*.12;const l=.2126*r+.7152*g+.0722*b;r=l+(r-l)*sat;g=l+(g-l)*sat;b=l+(b-l)*sat;p[i]=(r-128)*contrast+128;p[i+1]=(g-128)*contrast+128;p[i+2]=(b-128)*contrast+128;}
  ctx.putImageData(pixels,0,0);
 }
 return canvas;
}
export function hasAdjustments(a){return a&&Object.keys(DEFAULT_ADJUSTMENTS).some(k=>a[k]&&!(k==='crop'&&!a.crop));}
export async function renderAdjustedImages(root=document){
 for(const canvas of root.querySelectorAll('canvas[data-photo]')){try{await drawPhoto(canvas,canvas.dataset.photo,JSON.parse(canvas.dataset.adjustments),600);}catch{canvas.replaceWith(Object.assign(document.createElement('span'),{textContent:'Photo unavailable'}));}}
}
