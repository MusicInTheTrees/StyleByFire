import {buildPreviewSpec,previewKey} from './mannequin.js';
import {WEEK_DAYS} from './weekly-settings.js';

const nameOf=id=>WEEK_DAYS.find(([key])=>key===id)?.[1]||id;
const samePieces=(a,b)=>a.length===b.length&&a.every(id=>b.includes(id));
const matches=(detail,entry)=>!!entry.spec&&!!detail?.spec&&previewKey(detail.spec)===previewKey({...entry.spec,bodyShape:detail.spec.bodyShape,pose:detail.spec.pose});

// One account-scoped history lookup serves the whole week, including repeated outfits.
// The saved snapshot, not the weekday or item IDs alone, decides whether an image fits.
export function createWeeklyPreviews({api,onChange=()=>{},isActive=()=>true,schedule=setTimeout,cancel=clearTimeout,pollMs=5000}){
 let accountId=null,epoch=0,key='',entries=[],context=null,timer=null,loading=false,preparing=false,error='';
 function stop(){if(timer!==null)cancel(timer);timer=null;}
 function pause(){stop();epoch++;key='';loading=false;preparing=false;}
 function reset(id=null){pause();accountId=id;entries=[];context=null;error='';}
 const current=(ticket,id)=>ticket===epoch&&id===accountId&&isActive();
 function notify(){onChange();}
 function watch(){
  stop();
  if(!entries.some(entry=>entry.detail?.status==='prepared')||error||!isActive())return;
  timer=schedule(()=>{timer=null;if(isActive()&&context)return update(context,{refresh:true,background:true});},pollMs);timer?.unref?.();
 }
 async function update(state,{refresh=false,background=false}={}){
  if(!accountId||!isActive())return;
  const next=(state.weeklyPlanner?.plan?.days||[]).map(day=>{
   let spec=null,validation='';try{spec=buildPreviewSpec(state,day.itemIds,{mode:day.mode});}catch(err){validation=err.message;}
   return {id:day.id,mode:day.mode,itemIds:[...day.itemIds],spec,validation,detail:null,error:''};
  });
  const nextKey=JSON.stringify(next.map(entry=>[entry.id,entry.spec?previewKey(entry.spec):[entry.itemIds,entry.mode,entry.validation]]));
  if(!refresh&&key===nextKey)return;
  stop();const ticket=++epoch,id=accountId;key=nextKey;context=structuredClone(state);error='';preparing=false;
  for(const entry of next){const previous=entries.find(old=>old.id===entry.id)?.detail;if(matches(previous,entry))entry.detail=previous;}
  entries=next;const canPreview=next.some(entry=>entry.spec);loading=canPreview&&!background;notify();
  if(!canPreview)return;
  try{
   const result=await api('/api/mannequin',{accountId:id});if(!current(ticket,id))return;
   const history=result.previews||[],cache=new Map();
   await Promise.all(entries.map(async entry=>{
    if(!entry.spec)return;
    const candidates=history.filter(p=>p.mode===entry.mode&&samePieces(p.itemIds||[],entry.itemIds)).sort((a,b)=>Number(b.status==='complete')-Number(a.status==='complete'));
    let found=null,failed=false;
    for(const candidate of candidates){
     if(!current(ticket,id))return;
     try{
      if(!cache.has(candidate.id))cache.set(candidate.id,api(`/api/mannequin/${candidate.id}`,{accountId:id}));
      const detail=await cache.get(candidate.id);if(!current(ticket,id))return;
      if(matches(detail,entry)){found=detail;break;}
     }catch{failed=true;}
    }
    if(current(ticket,id)){entry.detail=found;entry.error=!found&&failed?'This preview could not be checked. Try Refresh previews.':'';}
   }));
  }catch{if(current(ticket,id))error='Saved previews could not be loaded. Use Refresh previews to try again.';}
  finally{if(current(ticket,id)){loading=false;notify();if(!entries.some(entry=>entry.error))watch();}}
 }
 async function prepare(){
  if(loading||preparing||error||!context||!isActive())return;
  stop();const ticket=epoch,id=accountId;preparing=true;notify();
  try{
   for(const entry of entries){
    if(!current(ticket,id))return;
    if(!entry.spec||entry.detail)continue;
    try{
     const detail=await api('/api/mannequin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemIds:entry.itemIds,mode:entry.mode,bodyShape:'straight'}),accountId:id});
     if(!current(ticket,id))return;
     if(!matches(detail,entry))throw Error('The outfit changed while preparing its preview. Refresh the app to use your latest corrections.');
     for(const repeated of entries)if(matches(detail,repeated)){repeated.detail=detail;repeated.error='';}
    }catch(err){if(current(ticket,id))entry.error=err.message||'This request could not be prepared. Try again.';}
    if(current(ticket,id))notify();
   }
  }finally{if(current(ticket,id)){preparing=false;notify();watch();}}
 }
 function requestMessage(){
  const grouped=new Map();
  for(const entry of entries){const detail=entry.detail;if(detail?.status!=='prepared')continue;if(!grouped.has(detail.id))grouped.set(detail.id,[]);grouped.get(detail.id).push(nameOf(entry.id));}
  if(!grouped.size)return '';
  return `Generate these weekly mannequin requests for my signed-in StyleByFire account using each request's saved clothing reference photos and styling corrections. Save each generated mannequin image back to its corresponding request. Generate one image per unique request; repeated days share the same outfit preview.\n\n${[...grouped].map(([id,days])=>`${days.join(', ')}: ${id}`).join('\n')}`;
 }
 function view(dayId){const entry=entries.find(entry=>entry.id===dayId);return {...entry,loading,preparing,error:entry?.error||error};}
 function summary(){return {loading,preparing,error,total:entries.length,ready:entries.filter(entry=>entry.detail?.status==='complete'&&entry.detail.imageSrc).length,pending:entries.filter(entry=>entry.detail?.status==='prepared').length,missing:entries.filter(entry=>entry.spec&&!entry.detail).length,invalid:entries.filter(entry=>!entry.spec).length,message:requestMessage()};}
 return {reset,pause,update,prepare,view,summary,requestMessage,selected:dayId=>entries.find(entry=>entry.id===dayId)?.detail||null};
}

export function weeklyMannequinMarkup(day,{escape},view={}){
 const e=escape,name=nameOf(day.id),detail=view.detail,ready=detail?.status==='complete'&&detail.imageSrc,pending=detail?.status==='prepared';
 const status=ready?'Saved preview':pending?'Ready for Codex':view.loading?'Checking preview…':view.preparing?'Preparing request…':'Full outfit preview';
 const message=view.error||view.validation||(pending?'Your references are ready. Send the week’s request to Codex; the finished image will appear here.':'Bring this day’s clothing and accessories together on a mannequin.');
 return `<section class="week-mannequin" aria-label="${name} mannequin preview"><div class="week-preview-label"><span>ON THE MANNEQUIN</span><span role="status">${status}</span></div>
  ${ready?`<button class="week-mannequin-image" data-week-preview="${day.id}" aria-label="Open ${name} mannequin preview"><img src="${e(detail.imageSrc)}?v=${encodeURIComponent(detail.completedAt||detail.createdAt)}" alt="${e(`${name} · ${day.mode} outfit on a mannequin: ${detail.spec.items.map(item=>item.name).join(', ')}`)}" loading="lazy"></button>`:`<div class="week-mannequin-empty"><span class="week-preview-number" aria-hidden="true">${String(WEEK_DAYS.findIndex(([id])=>id===day.id)+1).padStart(2,'0')}</span><h3>Your ${name} look,<br>all together.</h3><p>${e(message)}</p>${view.validation?`<button class="btn secondary" data-week-edit="${day.id}">Edit ${name} pieces</button>`:`<button class="btn secondary" data-week-preview="${day.id}" ${view.loading||view.preparing?'disabled':''}>${pending?'Preview options':'Create preview'}</button>`}</div>`}
  ${ready?'<p class="week-preview-caption">Matches these pieces and saved corrections. Select to enlarge.</p>':''}${ready&&view.error?`<p class="week-preview-error" role="alert">${e(view.error)}</p>`:''}
 </section>`;
}

export function weeklyPreviewToolbar(summary,{escape}){
 const s=summary,e=escape,working=s.loading||s.preparing;
 return `<div class="week-preview-toolbar"><div><h2>See your whole week.</h2><p>${s.preparing?'Preparing your outfit references…':`${s.ready} of ${s.total} mannequin previews ready.`} Codex creates the images after you send the prepared request.</p>${s.invalid?'<p>Days that need a top and bottom, a dress, or available pieces can be edited before previewing.</p>':''}</div><div class="button-row"><button class="btn primary" data-action="prepare-week-previews" ${working||s.error||!s.missing?'disabled':''}>${s.preparing?'Preparing…':'Prepare week previews'}</button><button class="btn secondary" data-action="refresh-week-previews" ${working?'disabled':''}>Refresh previews</button></div></div>
 ${s.error?`<p class="week-preview-error" role="alert">${e(s.error)}</p>`:''}
 ${s.message?`<details class="week-preview-handoff"><summary>${s.pending} ${s.pending===1?'day is':'days are'} ready for Codex · copy the request</summary><label for="week-codex-request">Send this message to Codex<textarea id="week-codex-request" rows="5" readonly>${e(s.message)}</textarea></label><button class="btn primary" data-action="copy-week-request">Copy week request</button><p>The planner checks for finished images while it is open. Identical outfits share a preview. Preparing requests does not start billed generation.</p></details>`:''}`;
}
