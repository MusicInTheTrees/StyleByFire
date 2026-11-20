import {buildPreviewSpec,previewKey} from './mannequin.js';
import {previewMatchesOutfit} from './outfit-builder.js';

// Account-scoped cache; every async result is guarded against account/outfit changes.
export function createOutfitPreview({api,escape,onChange}){
 let accountId=null,history=[],details=new Map(),epoch=0,key='',selected=null,loading=false,error='',prepared=false;
 function reset(id=null){epoch++;accountId=id;history=[];details.clear();key='';selected=null;loading=false;error='';prepared=false;}
 async function load(id){
  reset(id);const ticket=epoch;
  try{const result=await api('/api/mannequin',{accountId:id});if(ticket===epoch)history=result.previews||[];}
  catch{if(ticket===epoch)error='Saved previews could not be loaded. Try Refresh preview.';}
  return ticket===epoch?history:[];
 }
 async function update(state,items,mode,{refresh=false}={}){
  const ids=items.map(item=>item.id);
  let nextKey;
  try{nextKey=previewKey(buildPreviewSpec(state,ids,{mode}));}catch{nextKey=JSON.stringify({mode,ids});}
  if(!refresh&&key===nextKey)return;
  key=nextKey;selected=null;prepared=false;loading=true;
  const ticket=++epoch,id=accountId;
  const current=()=>ticket===epoch&&id===accountId;
  onChange();
  try{
   if(refresh){const result=await api('/api/mannequin',{accountId:id});if(!current())return;history=result.previews||[];details.clear();error='';}
   const candidates=history.filter(p=>p.mode===mode&&p.itemIds.length===ids.length&&p.itemIds.every(itemId=>ids.includes(itemId)));
   for(const candidate of candidates){
    let detail=details.get(candidate.id);
    if(!detail){detail=await api(`/api/mannequin/${candidate.id}`,{accountId:id});if(!current())return;details.set(candidate.id,detail);}
    if(previewMatchesOutfit(detail,state,ids,mode)){selected=detail;break;}
    if(detail.status!=='complete'){
     try{prepared=previewKey(detail.spec)===previewKey(buildPreviewSpec(state,ids,{mode,bodyShape:detail.spec.bodyShape,pose:detail.spec.pose}));}catch{}
    }
   }
  }catch{if(current())error='The saved preview could not be checked. Try Refresh preview.';}
  finally{if(current()){loading=false;onChange();}}
 }
 function markup(hasOutfit){
  const e=escape,complete=!!selected;
  return `<section class="outfit-hero" aria-labelledby="outfit-preview-title" aria-busy="${loading}">
   <div class="outfit-hero-heading"><div><p class="eyebrow">THE COMPLETE PICTURE</p><h3 id="outfit-preview-title">On the mannequin</h3></div><span class="preview-state">${loading?'Checking preview…':complete?'Saved preview':prepared?'Awaiting image':'Preview your selection'}</span></div>
   <div class="outfit-hero-stage${complete?' has-image':''}">${complete?`<button class="outfit-hero-image" data-action="mannequin" aria-label="Open large mannequin preview"><img src="${e(selected.imageSrc)}?v=${encodeURIComponent(selected.completedAt||selected.createdAt)}" alt="${e(`${selected.mode} outfit on a mannequin: ${selected.spec.items.map(item=>item.name).join(', ')}`)}"></button>`:`<div class="outfit-hero-empty"><h3>Your pieces.<br>One complete look.</h3><p>${loading?'Checking your saved outfit previews…':error||(!hasOutfit?'Choose your pieces below, or let your stylist suggest a look.':prepared?'Your request is ready. After its image is saved, refresh the preview here.':'Create a mannequin preview for this selection. Changing pieces or color corrections needs a matching preview.')}</p><button class="btn primary" data-action="${hasOutfit?'mannequin':'build-manually'}">${hasOutfit?'Create mannequin preview':'Choose my pieces'}</button></div>`}</div>
   <div class="outfit-hero-footer"><p>${complete?'Matches these pieces and their saved corrections. A styling illustration; fit and details may vary.':'Your clothing photos and corrected colors guide the image.'}</p><div class="button-row"><button class="btn secondary" data-action="refresh-outfit-preview" ${loading?'disabled':''}>Refresh preview</button>${complete?'<button class="btn secondary" data-action="mannequin">Preview options</button>':''}</div></div>
  </section>`;
 }
 return {reset,load,update,markup,selected:()=>selected};
}
