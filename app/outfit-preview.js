import {buildPreviewSpec,previewKey} from './mannequin.js';
import {previewMatchesOutfit} from './outfit-builder.js';

// Each outfit/account change invalidates old requests and stops their timers.
export function createOutfitPreview({api,escape,onChange,isActive=()=>true,schedule=setTimeout,cancel=clearTimeout,debounceMs=2000,pollMs=5000}){
 let accountId=null,history=[],details=new Map(),epoch=0,key='',selected=null,loading=false,error='',prepared=null;
 let timer=null,phase='',automatic=false,context=null;
 function stopTimer(){if(timer!==null)cancel(timer);timer=null;}
 function pause(){stopTimer();epoch++;key='';loading=false;phase='';}
 function reset(id=null){pause();accountId=id;history=[];details.clear();selected=null;error='';prepared=null;context=null;automatic=false;}
 async function load(id){
  reset(id);const ticket=epoch;
  try{const result=await api('/api/mannequin',{accountId:id});if(ticket===epoch)history=result.previews||[];}
  catch{if(ticket===epoch)error='Saved previews could not be loaded. Try Refresh preview.';}
  return ticket===epoch?history:[];
 }
 function remember(detail){details.set(detail.id,detail);history=[detail,...history.filter(p=>p.id!==detail.id)];}
 function current(ticket,id){return ticket===epoch&&id===accountId&&isActive();}
 function later(work,delay){stopTimer();timer=schedule(()=>{timer=null;return work();},delay);timer?.unref?.();}
 function requestMessage(){return prepared?`Generate mannequin request ${prepared.id} for my signed-in StyleByFire account using its saved clothing reference photos and styling corrections. Save the generated mannequin image back to this request.`:'';}
 async function watch(ticket,id){
  if(!current(ticket,id)||!automatic||!prepared)return;
  try{
   const detail=await api(`/api/mannequin/${prepared.id}`,{accountId:id});
   if(!current(ticket,id))return;remember(detail);
   if(previewMatchesOutfit(detail,context.state,context.ids,context.mode)){selected=detail;prepared=null;phase='';error='';onChange();return;}
   later(()=>watch(ticket,id),pollMs);
  }catch{if(current(ticket,id)){error='Automatic checking paused. Choose Refresh preview to try again.';phase='';onChange();}}
 }
 async function prepare(ticket,id){
  if(!current(ticket,id)||!automatic||!context?.spec)return;
  phase='preparing';onChange();
  try{
   const detail=await api('/api/mannequin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemIds:context.ids,mode:context.mode,bodyShape:'straight'}),accountId:id});
   if(!current(ticket,id))return;
   if(previewKey(detail.spec)!==previewKey(context.spec))throw Error('Your wardrobe changed while preparing this outfit. Refresh the page to use the latest corrections.');
   remember(detail);
   if(previewMatchesOutfit(detail,context.state,context.ids,context.mode)){selected=detail;prepared=null;phase='';}
   else{prepared=detail;phase='waiting';later(()=>watch(ticket,id),pollMs);}
  }catch(err){if(current(ticket,id)){phase='';error=err.message||'The preview request could not be prepared. Choose Refresh preview to retry.';}}
  finally{if(current(ticket,id))onChange();}
 }
 async function update(state,items,mode,{refresh=false,automatic:enableAutomatic=false}={}){
  const ids=items.map(item=>item.id);let spec=null,validation='';
  try{spec=buildPreviewSpec(state,ids,{mode});}catch(err){validation=err.message;}
  const nextKey=(spec?previewKey(spec):JSON.stringify({mode,ids}))+':auto='+enableAutomatic;
  if(!refresh&&key===nextKey)return;
  stopTimer();key=nextKey;selected=null;prepared=null;loading=true;phase='';automatic=enableAutomatic;
  context={state:structuredClone(state),ids,mode,spec,validation};
  const ticket=++epoch,id=accountId;
  onChange();
  try{
   if(refresh){const result=await api('/api/mannequin',{accountId:id});if(!current(ticket,id))return;history=result.previews||[];details.clear();error='';}
   const candidates=history.filter(p=>p.mode===mode&&p.itemIds?.length===ids.length&&p.itemIds.every(itemId=>ids.includes(itemId)));
   for(const candidate of candidates){
    let detail=details.get(candidate.id);
    if(!detail){detail=await api(`/api/mannequin/${candidate.id}`,{accountId:id});if(!current(ticket,id))return;details.set(candidate.id,detail);}
    if(previewMatchesOutfit(detail,context.state,ids,mode)){selected=detail;error='';break;}
    if(spec&&detail.status!=='complete'&&previewKey(detail.spec)===previewKey(spec))prepared=detail;
   }
   if(!current(ticket,id))return;
   if(automatic&&!selected&&spec&&!error){
    if(prepared){phase='waiting';later(()=>watch(ticket,id),pollMs);}
    else{phase='scheduled';later(()=>prepare(ticket,id),debounceMs);}
   }
  }catch{if(current(ticket,id))error='The saved preview could not be checked. Try Refresh preview.';}
  finally{if(current(ticket,id)){loading=false;onChange();}}
 }
 function markup(hasOutfit){
  const e=escape,complete=!!selected;
  const status=loading?'Checking preview…':complete?'Saved preview':phase==='scheduled'?'Updating selection…':phase==='preparing'?'Preparing request…':prepared?'Ready for Codex':'Preview your selection';
  const message=loading?'Checking your saved outfit previews…':error||(phase==='scheduled'?'Your new selection will be prepared after a short pause.':phase==='preparing'?'Saving these pieces and their styling corrections…':prepared?'Send the request below to Codex. The finished image will appear here automatically.':!hasOutfit?'Choose your pieces below, or let your stylist suggest a look.':automatic&&context?.validation?context.validation:'Create a mannequin preview for this selection. Changing pieces or color corrections needs a matching preview.');
  return `<section class="outfit-hero" aria-labelledby="outfit-preview-title" aria-busy="${loading||phase==='preparing'}">
   <div class="outfit-hero-heading"><div><p class="eyebrow">THE COMPLETE PICTURE</p><h3 id="outfit-preview-title">On the mannequin</h3></div><span class="preview-state" role="status">${status}</span></div>
   <div class="outfit-hero-stage${complete?' has-image':''}">${complete?`<button class="outfit-hero-image" data-action="mannequin" aria-label="Open large mannequin preview"><img src="${e(selected.imageSrc)}?v=${encodeURIComponent(selected.completedAt||selected.createdAt)}" alt="${e(`${selected.mode} outfit on a mannequin: ${selected.spec.items.map(item=>item.name).join(', ')}`)}"></button>`:`<div class="outfit-hero-empty"><h3>Your pieces.<br>One complete look.</h3><p>${e(message)}</p>${!loading&&!phase&&!prepared?`<button class="btn primary" data-action="${hasOutfit?'mannequin':'build-manually'}">${hasOutfit?'Create mannequin preview':'Choose my pieces'}</button>`:''}</div>`}</div>
   ${prepared&&!complete?`<div class="outfit-auto-handoff"><label for="outfit-codex-request">Send this request to Codex<textarea id="outfit-codex-request" rows="3" readonly>${e(requestMessage())}</textarea></label><div class="button-row"><button class="btn primary" data-action="copy-outfit-request">Copy Codex request</button><button class="btn secondary" data-action="mannequin">Preview options</button></div><p>${automatic?'Watching for the finished image. You can keep building; only the matching image will be shown.':'Automatic checking is off. Use Refresh preview after the image is saved.'}</p>${error?`<p role="alert">${e(error)}</p>`:''}</div>`:''}
   <div class="outfit-hero-footer"><p>${complete?'Matches these pieces and their saved corrections. A styling illustration; fit and details may vary.':'Your clothing photos and corrected colors guide the image.'}</p><div class="button-row"><button class="btn secondary" data-action="refresh-outfit-preview" ${loading||phase==='preparing'?'disabled':''}>Refresh preview</button>${complete?'<button class="btn secondary" data-action="mannequin">Preview options</button>':''}</div></div>
  </section>`;
 }
 return {reset,load,update,markup,pause,requestMessage,selected:()=>selected};
}
