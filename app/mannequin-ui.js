import {BODY_SHAPES,buildPreviewSpec,previewKey} from './mannequin.js';

let active=null,epoch=0;
const shapeLabels={straight:'Straight',broad:'Broad',curved:'Curved'};
const providerLabels={assisted:'With Codex',local:'On this computer',openai:'OpenAI API'};
const fallbackProviders=[{id:'assisted',ready:true,label:'With Codex',message:'Prepare this outfit, then ask Codex to create the image.'},{id:'local',ready:false,label:'Local ComfyUI',message:'Local generation is not configured.'},{id:'openai',ready:false,label:'OpenAI API',message:'API generation is not configured.'}];
const current=s=>active===s&&s.epoch===epoch&&!s.controller.signal.aborted&&s.dialog?.open;
const sameIds=(a,b)=>a.length===b.length&&a.every(id=>b.includes(id));
const imageURL=preview=>`${preview.imageSrc}?v=${encodeURIComponent(preview.completedAt||preview.createdAt)}`;

export function closeMannequin(){
 epoch++;
 if(active){
  active.controller.abort();
  active.dialog?.removeEventListener('close',active.onClose);
  active.dialog?.removeEventListener('click',active.onClick);
  active.dialog?.removeEventListener('change',active.onChange);
  active.dialog?.removeAttribute('aria-labelledby');
  active.dialog?.removeAttribute('aria-describedby');
 }
 active=null;
}

export async function openMannequin({state,itemIds,mode,api,openModal,modalHead,photo,escape,accountId,savedPreview=null}){
 closeMannequin();
 const bodyShape=savedPreview?.bodyShape||'straight';
 const initialSpec=buildPreviewSpec(state,itemIds,{mode,bodyShape});
 const s={state,itemIds:[...itemIds],mode,api,openModal,modalHead,photo,escape,accountId,initialSpec,bodyShape,provider:'assisted',providers:fallbackProviders,history:[],selected:null,viewingHistory:false,loading:true,busy:false,error:'',message:'Loading your mannequin studio…',controller:new AbortController(),epoch};
 active=s;
 render(s);
 s.dialog=document.querySelector('#modal');
 s.onClose=()=>{if(active===s)closeMannequin();};
 s.onClick=event=>{
  const button=event.target.closest('[data-mannequin-action]');
  if(!button||!s.dialog.contains(button))return;
  event.preventDefault();event.stopPropagation();
  if(button.disabled||!current(s)||s.busy||s.loading)return;
  const action=button.dataset.mannequinAction;
  if(action==='prepare')void run(s,()=>prepare(s));
  if(action==='refresh')void run(s,()=>refresh(s));
  if(action==='copy')void copyRequest(s);
  if(action==='upload')s.dialog.querySelector('#mannequin-upload').click();
  if(action==='download')void run(s,()=>downloadPNG(s));
  if(action==='history')void run(s,()=>openHistory(s,button.dataset.previewId));
  if(action==='current'){s.selected=null;s.viewingHistory=false;s.error='';s.message='Showing the outfit you selected in Designer.';render(s);}
 };
 s.onChange=event=>{
  if(event.target.id==='mannequin-shape'){
   event.stopPropagation();
   if(!current(s)||s.busy||s.loading)return;
   s.bodyShape=event.target.value;s.selected=null;s.viewingHistory=false;s.error='';
   s.message=`${shapeLabels[s.bodyShape]} mannequin selected. Prepare a preview of your current outfit.`;render(s);
  }
  if(event.target.id==='mannequin-provider'){
   event.stopPropagation();
   if(!current(s)||s.busy||s.loading)return;
   s.provider=event.target.value;s.error='';s.message='';render(s);
  }
  if(event.target.id==='mannequin-upload'){
   event.stopPropagation();const file=event.target.files?.[0];
   if(file&&current(s)&&!s.busy&&!s.loading)void run(s,()=>upload(s,file));
  }
 };
 s.dialog.addEventListener('close',s.onClose);
 s.dialog.addEventListener('click',s.onClick);
 s.dialog.addEventListener('change',s.onChange);
 const results=await Promise.allSettled([request(s,'/api/mannequin/providers'),request(s,'/api/mannequin')]);
 if(!current(s))return;
 const warnings=[];
 if(results[0].status==='fulfilled')s.providers=fallbackProviders.map(fallback=>({...fallback,...results[0].value.providers?.find(p=>p.id===fallback.id)}));
 else warnings.push('Generation options could not be checked. The Codex handoff is still available.');
 if(results[1].status==='fulfilled')s.history=results[1].value.previews||[];
 else warnings.push('Saved previews could not be loaded.');
 const candidate=s.history.find(p=>p.id===savedPreview?.id)||s.history.find(p=>p.mode===mode&&p.bodyShape===s.bodyShape&&sameIds(p.itemIds||[],s.itemIds));
 if(candidate){
  try{
   const detail=await request(s,`/api/mannequin/${candidate.id}`);
   if(!current(s))return;
   if(previewKey(detail.spec)===previewKey(initialSpec))s.selected=detail;
  }catch(error){if(current(s)&&error.name!=='AbortError')warnings.push('The previous preview could not be opened.');}
 }
 if(!current(s))return;
 s.loading=false;s.message=warnings.join(' ');render(s);
}

function request(s,url,options={}){return s.api(url,{...options,accountId:s.accountId,signal:s.controller.signal});}
function updateHistory(s,detail){s.history=[detail,...s.history.filter(p=>p.id!==detail.id)].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
function requestMessage(s){return `Generate mannequin request ${s.selected.id} for my signed-in StyleByFire account using its saved clothing reference photos and styling corrections. Save the generated mannequin image back to this request.`;}
function stamp(value){const date=new Date(value);return Number.isNaN(date.getTime())?'Saved preview':date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});}
function busyLabel(s){return s.provider==='assisted'?'Preparing outfit…':'Generating your preview…';}

async function run(s,work){
 if(!current(s)||s.busy)return;
 s.busy=true;s.error='';s.message='Updating your preview…';render(s);
 try{await work();}
 catch(error){if(current(s)&&error.name!=='AbortError'){s.message='';s.error=error.message||'The preview could not be updated. Please try again.';}}
 finally{if(current(s)){s.busy=false;render(s);if(s.revealResult){s.dialog.scrollTo?.({top:0,behavior:'instant'});s.revealResult=false;}if(s.error)s.dialog.querySelector('.mannequin-error')?.focus();}}
}

async function prepare(s){
 if(!s.selected){
  s.message='Saving the selected pieces and their color corrections…';render(s);
  const detail=await request(s,'/api/mannequin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemIds:s.itemIds,mode:s.mode,bodyShape:s.bodyShape})});
  if(!current(s))return;s.selected=detail;updateHistory(s,detail);
 }
 if(s.provider==='assisted'){
  s.message='Your request is ready. Copy the message below into this Codex chat, then refresh after the image is saved.';
  return;
 }
 const provider=s.providers.find(p=>p.id===s.provider);
 if(!provider?.ready)throw Error(provider?.message||'This generation option is not available.');
 s.message='Creating your mannequin image. This can take several minutes. Closing this window may leave generation running.';render(s);
 const detail=await request(s,`/api/mannequin/${s.selected.id}/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:s.provider})});
 if(!current(s))return;s.selected=detail;updateHistory(s,detail);s.message='Your mannequin preview is ready.';s.revealResult=true;
}

async function refresh(s){
 const results=await Promise.allSettled([request(s,'/api/mannequin'),s.selected?request(s,`/api/mannequin/${s.selected.id}`):Promise.resolve(null),request(s,'/api/mannequin/providers')]);
 if(!current(s))return;
 if(results[0].status==='fulfilled')s.history=results[0].value.previews||[];
 if(results[2].status==='fulfilled')s.providers=fallbackProviders.map(fallback=>({...fallback,...results[2].value.providers?.find(p=>p.id===fallback.id)}));
 if(results[1].status==='rejected')throw results[1].reason;
 if(results[0].status==='rejected')throw results[0].reason;
 if(results[1].value){s.revealResult=s.selected?.status!=='complete'&&results[1].value.status==='complete';s.selected=results[1].value;}
 s.message=s.selected?.status==='complete'?'Your saved preview is up to date.':'No image has been saved to this request yet. Finish the Codex handoff or attach a generated image below.';
}

async function openHistory(s,id){
 const detail=await request(s,`/api/mannequin/${id}`);
 if(!current(s))return;
 s.selected=detail;s.bodyShape=detail.bodyShape;s.viewingHistory=true;s.message='Showing the saved outfit and color corrections from this request.';s.revealResult=true;
}

async function upload(s,file){
 if(!s.selected)throw Error('Prepare an outfit request before attaching its image.');
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose a PNG, JPEG, or WebP image.');
 if(!file.size||file.size>20*1024*1024)throw Error('Choose an image under 20 MB.');
 const detail=await request(s,`/api/mannequin/${s.selected.id}/image`,{method:'POST',headers:{'Content-Type':file.type},body:file});
 if(!current(s))return;s.selected=detail;updateHistory(s,detail);s.message='The image was saved to this outfit request.';s.revealResult=true;
}

async function copyRequest(s){
 if(!s.selected)return;
 const input=s.dialog.querySelector('#mannequin-request-message');
 try{
  if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');
  await navigator.clipboard.writeText(requestMessage(s));
  if(current(s)){s.message='Copied. Paste this message into your Codex chat.';render(s);}
 }catch{
  if(current(s)){input?.focus();input?.select();const status=s.dialog.querySelector('.mannequin-status');if(status)status.textContent='Select and copy the message, then paste it into your Codex chat.';}
 }
}

async function downloadPNG(s){
 if(s.selected?.status!=='complete')return;
 const response=await fetch(imageURL(s.selected),{headers:{'X-StyleByFire-Account':s.accountId},signal:s.controller.signal,cache:'no-store'});
 if(!response.ok)throw Error('The preview could not be downloaded. Refresh and try again.');
 const blob=await response.blob();if(!current(s))return;
 const source=URL.createObjectURL(blob);let resultURL;
 try{
  const image=new Image();image.src=source;await image.decode();if(!current(s))return;
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const context=canvas.getContext('2d');if(!context)throw Error('Your browser could not prepare the PNG download.');
  context.drawImage(image,0,0);
  const png=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('The PNG could not be created.')),'image/png'));
  if(!current(s))return;
  resultURL=URL.createObjectURL(png);const link=document.createElement('a');link.href=resultURL;link.download=`stylebyfire-${s.selected.mode.toLowerCase().replace(/\s+/g,'-')}-mannequin.png`;document.body.append(link);link.click();link.remove();
  s.message='Your PNG download is ready.';
 }finally{URL.revokeObjectURL(source);if(resultURL)setTimeout(()=>URL.revokeObjectURL(resultURL),1000);}
}

function render(s){
 if(active!==s||s.epoch!==epoch)return;
 const e=s.escape,detail=s.selected,disabled=s.busy||s.loading?' disabled':'',complete=detail?.status==='complete';
 const provider=s.providers.find(p=>p.id===s.provider),references=detail?.references||s.initialSpec.items;
 const title=detail?`${detail.mode} · ${shapeLabels[detail.bodyShape]} mannequin`:`${s.mode} · ${shapeLabels[s.bodyShape]} mannequin`;
 const wasFocused=s.dialog?.contains(document.activeElement)?document.activeElement.id:null;
 const head=s.modalHead('Your outfit, brought together','Mannequin preview').replace('<h2>','<h2 id="mannequin-title">');
 const generationLabel=s.provider==='assisted'?(detail?'Request prepared':'Prepare with Codex'):s.provider==='local'?(complete?'Generate another locally':'Generate locally'):(complete?'Generate another · billed API':'Generate · billed API');
 const status=s.loading?'Loading your saved previews…':s.message||(s.busy?busyLabel(s):complete?'Saved to your account.':detail?'Request prepared. The image will appear after it is generated and saved.':'Start with the pieces in your current outfit.');
 s.openModal(`${head}
  <p class="mannequin-intro" id="mannequin-description">A styling preview of your outfit on a faceless mannequin. Fit, drape, and small details may vary.</p>
  <div class="mannequin-status${s.busy?' is-busy':''}" role="status" aria-live="polite" aria-atomic="true">${e(status)}</div>
  ${s.error?`<div class="mannequin-error" role="alert" tabindex="-1">${e(s.error)}</div>`:''}
  <div class="mannequin-layout" aria-busy="${s.busy||s.loading}">
   <section class="mannequin-result" aria-label="Mannequin image">
    <div class="mannequin-result-heading"><div><span class="mannequin-kicker">${s.viewingHistory?'Saved outfit snapshot':'Outfit preview'}</span><h3>${e(title)}</h3></div>${complete?'<span class="mannequin-badge">Ready</span>':''}</div>
    <div class="mannequin-stage${complete?' has-image':''}">
     ${complete?`<img class="mannequin-image" src="${e(imageURL(detail))}" alt="${e(`${detail.mode} outfit on a ${shapeLabels[detail.bodyShape].toLowerCase()} mannequin. Selected pieces: ${detail.spec.items.map(item=>item.name).join(', ')}.`)}">`:`<div class="mannequin-empty"><span class="mannequin-empty-mark" aria-hidden="true">01 — ${String(references.length).padStart(2,'0')}</span><h3>Your pieces.<br>One complete look.</h3><p>${s.busy?'Your preview is in progress.':detail?'Your outfit references are saved. Use the request message to generate the image, or choose an available generation option.':'Prepare your outfit with Codex, or choose an available generation option to create its mannequin preview.'}</p><span class="mannequin-empty-note">Every selected accessory is included.</span></div>`}
    </div>
    <div class="mannequin-result-footer"><p>${complete?`Saved ${e(stamp(detail.completedAt))}. Compare with the reference photos below.`:'Your clothing photos and corrected colors guide the preview.'}</p>${complete?`<button type="button" class="btn secondary" id="mannequin-download" data-mannequin-action="download"${disabled}>Download PNG</button>`:''}</div>
   </section>
   <aside class="mannequin-controls" aria-label="Preview controls">
    <label for="mannequin-shape">Mannequin shape<select id="mannequin-shape"${disabled}>${BODY_SHAPES.map(shape=>`<option value="${shape}"${shape===s.bodyShape?' selected':''}>${shapeLabels[shape]}</option>`).join('')}</select><small>Front view · proportions for visual comparison.</small></label>
    ${s.viewingHistory?`<div class="mannequin-snapshot-note">You are viewing a saved outfit. Changing shape starts a new preview of the outfit selected in Designer.<button type="button" class="text-button" data-mannequin-action="current"${disabled}>Return to selected outfit</button></div>`:''}
    <label for="mannequin-provider">How to create it<select id="mannequin-provider"${disabled}>${s.providers.map(p=>`<option value="${e(p.id)}"${p.id===s.provider?' selected':''}${!p.ready?' disabled':''}>${e(providerLabels[p.id]||p.label)}${p.ready?'':' · unavailable'}</option>`).join('')}</select></label>
    <p class="mannequin-provider-note">${s.provider==='assisted'?'Codex creates the image after you paste the prepared request into this chat. Preparing a request saves the references locally.':s.provider==='local'?'Use your configured ComfyUI workflow to generate the image on this computer.':`Generate with ${e(provider?.model||'OpenAI')}. This uses billed API credits.`}</p>
    ${s.provider==='openai'?'<p class="mannequin-privacy">Clicking Generate sends the selected clothing photos and styling corrections to OpenAI. Personal notes are excluded.</p>':'<p class="mannequin-privacy">Personal notes are excluded from every preview request.</p>'}
    ${!(s.provider==='assisted'&&detail)?`<button type="button" class="btn primary full" id="mannequin-prepare" data-mannequin-action="prepare"${disabled||!provider?.ready?' disabled':''}>${s.busy?'Working…':generationLabel}</button>`:''}
    ${detail&&s.provider==='assisted'?`${complete?'<details class="mannequin-handoff-details"><summary>Request another image with Codex</summary>':''}<div class="mannequin-handoff"><label for="mannequin-request-message">Paste this into your Codex chat<textarea id="mannequin-request-message" rows="5" readonly spellcheck="false">${e(requestMessage(s))}</textarea></label><button type="button" class="btn primary full" id="mannequin-copy" data-mannequin-action="copy"${disabled}>Copy request message</button><p>When Codex has saved the generated image, choose Refresh preview.</p></div>${complete?'</details>':''}`:''}
    <div class="mannequin-secondary-actions"><button type="button" class="btn secondary" id="mannequin-refresh" data-mannequin-action="refresh"${disabled}>Refresh preview</button>${detail?`<button type="button" class="btn secondary" id="mannequin-attach" data-mannequin-action="upload"${disabled}>Attach generated image</button><input type="file" id="mannequin-upload" accept="image/png,image/jpeg,image/webp" hidden>`:''}</div>
    ${detail?`<p class="mannequin-upload-note">You can also attach a generated PNG, JPEG, or WebP under 20 MB.</p><details class="mannequin-prompt"><summary>Saved preview instructions</summary><pre>${e(detail.prompt)}</pre></details>`:''}
    <details class="mannequin-provider-details"><summary>Generation options</summary>${s.providers.map(p=>`<div><strong>${e(providerLabels[p.id]||p.label)}</strong><span>${p.ready?'Available':'Not configured'}</span><p>${e(p.message||'')}</p></div>`).join('')}<a class="mannequin-setup-link" href="https://github.com/MusicInTheTrees/StyleByFire/blob/main/docs/mannequin-engines.md" target="_blank" rel="noopener noreferrer">Set up a generation option ↗</a></details>
   </aside>
  </div>
  <section class="mannequin-references" aria-labelledby="mannequin-reference-title"><div class="mannequin-section-heading"><h3 id="mannequin-reference-title">${detail?'Saved outfit references':'Selected outfit pieces'}</h3><span>${references.length} pieces · accessories included</span></div><div class="mannequin-reference-grid">${references.map((item,n)=>`<figure><div class="mannequin-reference-photo">${s.photo(item,'',true)}</div><figcaption><span class="mannequin-reference-slot">${n+1} · ${e(item.slot==='accessory'?(item.accessoryType||'Accessory'):(item.slot||item.category))}</span><strong>${e(item.name)}</strong><span>${e([item.color,item.secondaryColor].filter(Boolean).join(' + '))}</span>${item.accessoryType==='wallet'?'<span>May be concealed in a pocket.</span>':''}</figcaption></figure>`).join('')}</div><p class="mannequin-reference-note">These reference photos show your saved photo edits. Generation uses the original photos with their saved color labels and styling corrections. Each prepared request keeps its own snapshot.</p></section>
  <section class="mannequin-history" aria-labelledby="mannequin-history-title"><div class="mannequin-section-heading"><h3 id="mannequin-history-title">Your previous previews</h3><span>${s.history.length} saved requests</span></div>${s.history.length?`<div class="mannequin-history-grid">${s.history.map(p=>`<button type="button" class="mannequin-history-card" data-mannequin-action="history" data-preview-id="${e(p.id)}" aria-pressed="${detail?.id===p.id}"${disabled}>${p.imageSrc?`<img src="${e(imageURL(p))}" alt="" loading="lazy">`:'<span class="mannequin-history-placeholder">Awaiting<br>image</span>'}<span class="mannequin-history-label"><strong>${e(p.mode)} · ${e(shapeLabels[p.bodyShape]||p.bodyShape)}</strong><span>${e(stamp(p.createdAt))} · ${p.status==='complete'?'Ready':'Prepared'}</span><span>${e((p.itemNames||[]).join(', '))}</span></span></button>`).join('')}</div>`:'<p class="mannequin-history-empty">Your prepared requests and finished previews will stay here, in your account.</p>'}</section>
 `,'mannequin-modal');
 const dialog=document.querySelector('#modal');dialog.setAttribute('aria-labelledby','mannequin-title');dialog.setAttribute('aria-describedby','mannequin-description');
 if(wasFocused)dialog.querySelector(`#${wasFocused}`)?.focus({preventScroll:true});
}
