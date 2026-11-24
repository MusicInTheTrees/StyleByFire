import {buildPreviewSpec,previewKey} from './mannequin.js';

const samePieces=(a,b)=>a.length===b.length&&a.every(id=>b.includes(id));
const matches=(detail,entry)=>!!detail?.spec&&!!entry.spec&&previewKey(detail.spec)===previewKey({...entry.spec,bodyShape:detail.spec.bodyShape,pose:detail.spec.pose});
const imageURL=detail=>`${detail.imageSrc}?v=${encodeURIComponent(detail.completedAt||detail.createdAt||'')}`;

// Read existing requests only. A look must match the complete clothing snapshot,
// including accessories and corrections, before its collage can become a mannequin.
export function createSavedPreviews({api,onChange=()=>{},isActive=()=>true,schedule=setTimeout,cancel=clearTimeout,pollMs=5000}){
 let accountId=null,epoch=0,key='',entries=[],context=null,timer=null;
 const failedImages=new Set();
 function stop(){if(timer!==null)cancel(timer);timer=null;}
 function pause(){stop();epoch++;key='';}
 function reset(id=null){pause();accountId=id;entries=[];context=null;failedImages.clear();}
 const current=(ticket,id)=>ticket===epoch&&id===accountId&&isActive();
 function watch(){
  stop();
  if(!isActive()||!entries.some(entry=>entry.detail?.status==='prepared'))return;
  timer=schedule(()=>{timer=null;if(isActive()&&context)return update(context,{refresh:true});},pollMs);timer?.unref?.();
 }
 async function update(state,{refresh=false}={}){
  if(!accountId||!isActive())return;
  const next=state.looks.map(look=>{
   let spec=null;try{spec=buildPreviewSpec(state,look.itemIds,{mode:look.mode});}catch{}
   return {id:look.id,itemIds:[...look.itemIds],mode:look.mode,spec,detail:null};
  });
  const nextKey=JSON.stringify(next.map(entry=>[entry.id,entry.spec?previewKey(entry.spec):[entry.itemIds,entry.mode]]));
  if(!refresh&&key===nextKey)return;
  stop();const ticket=++epoch,id=accountId;key=nextKey;context=structuredClone(state);
  for(const entry of next){const old=entries.find(previous=>previous.id===entry.id)?.detail;if(matches(old,entry))entry.detail=old;}
  entries=next;onChange();
  if(!entries.some(entry=>entry.spec))return;
  try{
   const result=await api('/api/mannequin',{accountId:id});if(!current(ticket,id))return;
   const history=result.previews||[],cache=new Map();
   await Promise.all(entries.map(async entry=>{
    if(!entry.spec)return;
    const candidates=history.filter(p=>p.mode===entry.mode&&samePieces(p.itemIds||[],entry.itemIds)).sort((a,b)=>Number(b.status==='complete')-Number(a.status==='complete')||String(b.completedAt||b.createdAt||'').localeCompare(String(a.completedAt||a.createdAt||'')));
    let found=null;
    for(const candidate of candidates){
     if(!current(ticket,id))return;
     try{
      if(!cache.has(candidate.id))cache.set(candidate.id,api(`/api/mannequin/${candidate.id}`,{accountId:id}));
      const detail=await cache.get(candidate.id);if(!current(ticket,id))return;
      if(matches(detail,entry)&&(detail.status==='prepared'||detail.status==='complete'&&detail.imageSrc&&!failedImages.has(imageURL(detail)))){found=detail;break;}
     }catch{}
    }
    if(current(ticket,id))entry.detail=found;
   }));
   if(current(ticket,id)){onChange();watch();}
  }catch{/* Keep the clothing collage, or an already verified matching image. */}
 }
 function selected(lookId){const detail=entries.find(entry=>entry.id===lookId)?.detail;return detail?.status==='complete'&&detail.imageSrc&&!failedImages.has(imageURL(detail))?detail:null;}
 function rejectImage(lookId){const detail=selected(lookId);if(detail){failedImages.add(imageURL(detail));onChange();}}
 return {reset,pause,update,selected,rejectImage};
}

export function savedLookMedia(look,pieces,detail,{escape,photo}){
 if(detail?.status==='complete'&&detail.imageSrc)return `<button class="saved-look-preview" data-saved-preview="${escape(look.id)}" aria-label="Open mannequin preview for ${escape(look.name)}"><img data-saved-look-image="${escape(look.id)}" src="${escape(imageURL(detail))}" alt="${escape(look.name)} outfit on a mannequin" loading="lazy"><span class="saved-preview-badge">Mannequin preview</span></button>`;
 return `<div class="look-collage">${pieces.slice(0,4).map(item=>photo(item)).join('')}</div>`;
}
