import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyWardrobe} from '../accounts.mjs';
import {buildPreviewSpec} from '../app/mannequin.js';
import {createSavedPreviews,savedLookMedia} from '../app/saved-previews.js';

const item=(id,category)=>({id,name:id,category,role:'base',color:'Blue',colorVerified:true,pattern:'Solid',formality:3,warmth:1,tags:[],modes:['Business','Casual'],favorite:false,subcategory:'',src:`/media/seed-${id}.jpg`});
function fixture(){
 const state=emptyWardrobe();state.items=[item('shirt','Top'),item('pants','Bottom'),item('tie','Accessories')];
 state.looks=[{id:'one',name:'Business look',itemIds:['shirt','pants','tie'],mode:'Business'},{id:'two',name:'Same pieces',itemIds:['tie','pants','shirt'],mode:'Business'}];
 const saved=new Map(),calls=[],timers=new Map();let active=true;
 const api=async(url,options={})=>{calls.push({url,...options});if(url==='/api/mannequin')return {previews:[...saved.values()].map(({spec,...summary})=>summary)};const detail=saved.get(url.split('/').at(-1));if(!detail)throw Error('Missing request');return detail;};
 const options={api,isActive:()=>active,schedule:fn=>{const id=Symbol();timers.set(id,fn);return id;},cancel:id=>timers.delete(id)};
 const c=createSavedPreviews(options);c.reset('account-one');
 function preview(id='ready',status='complete',shape='straight'){
  const look=state.looks[0],spec=buildPreviewSpec(state,look.itemIds,{mode:look.mode,bodyShape:shape});
  const detail={id,status,spec,mode:look.mode,itemIds:[...look.itemIds],createdAt:'2026-11-24T10:00:00Z',...(status==='complete'?{imageSrc:`/api/mannequin/${id}/image`,completedAt:'2026-11-24T10:00:00Z'}:{})};saved.set(id,detail);return detail;
 }
 async function tick(){const [id,fn]=timers.entries().next().value;timers.delete(id);await fn();}
 return {state,saved,c,calls,timers,options,preview,tick,setActive:v=>active=v};
}

test('saved looks share a matching mannequin regardless of piece order or mannequin shape',async()=>{
 const f=fixture();f.preview('broad','complete','broad');await f.c.update(f.state);
 assert.equal(f.c.selected('one').id,'broad');assert.equal(f.c.selected('two').id,'broad');
 assert.equal(f.calls.length,2);assert.ok(f.calls.every(call=>call.accountId==='account-one'&&!call.method));
 assert.equal(f.timers.size,0);
});
test('accessory removal, occasion changes and clothing corrections never reuse the old image',async()=>{
 for(const change of [f=>f.state.looks[0].itemIds.pop(),f=>f.state.looks[0].mode='Casual',f=>f.state.items[0].color='White',f=>f.state.items[0].stylistNotes='White with black print',f=>f.state.items[0].adjustments={rotation:90},f=>f.state.items[0].src='/media/replacement.jpg']){
  const f=fixture();f.preview();await f.c.update(f.state);change(f);const work=f.c.update(f.state);assert.equal(f.c.selected('one'),null);await work;assert.equal(f.c.selected('one'),null);
 }
 const f=fixture();f.preview();await f.c.update(f.state);f.state.items[0].notes='Private reminder';await f.c.update(f.state);assert.equal(f.c.selected('one').id,'ready');
});
test('the newest completed matching image wins over older versions and prepared requests',async()=>{
 const f=fixture();f.preview('old');f.preview('latest').completedAt='2026-11-24T12:00:00Z';f.preview('pending','prepared').createdAt='2026-11-24T13:00:00Z';
 f.preview('stale').spec.items[0].color='Red';await f.c.update(f.state);assert.equal(f.c.selected('one').id,'latest');
});
test('pending requests keep the collage and become images automatically without generation calls',async()=>{
 const f=fixture();f.preview('pending','prepared');await f.c.update(f.state);assert.equal(f.c.selected('one'),null);assert.equal(f.timers.size,1);
 f.preview('pending');await f.tick();assert.equal(f.c.selected('one').id,'pending');assert.equal(f.c.selected('two').id,'pending');assert.equal(f.timers.size,0);
 assert.ok(f.calls.every(call=>!call.method));
});
test('account changes and newer selections discard late lookup results',async()=>{
 for(const reset of [true,false]){
  const f=fixture();const detail=f.preview();let finish;
  const c=createSavedPreviews({...f.options,api:async url=>url==='/api/mannequin'?new Promise(resolve=>finish=resolve):detail});
  c.reset('one');const work=c.update(f.state);
  if(reset)c.reset('two');else{f.state.looks=[];await c.update(f.state);}
  finish({previews:[detail]});await work;assert.equal(c.selected('one'),null);assert.equal(f.timers.size,0);
 }
});
test('page pauses stop polling, and returning resumes existing requests',async()=>{
 const f=fixture();f.preview('pending','prepared');await f.c.update(f.state);f.c.pause();assert.equal(f.timers.size,0);
 f.setActive(false);await f.c.update(f.state,{refresh:true});assert.equal(f.timers.size,0);
 f.setActive(true);await f.c.update(f.state);assert.equal(f.timers.size,1);f.c.reset();assert.equal(f.timers.size,0);
});
test('unavailable history, broken images and incomplete looks fall back without blocking the page',async()=>{
 const f=fixture();const broken=createSavedPreviews({...f.options,api:async()=>{throw Error('offline');}});broken.reset('one');await broken.update(f.state);assert.equal(broken.selected('one'),null);
 const detail=f.preview();await f.c.update(f.state);f.c.rejectImage('one');assert.equal(f.c.selected('one'),null);assert.equal(f.c.selected('two'),null);
 await f.c.update(f.state,{refresh:true});assert.equal(f.c.selected('one'),null);
 detail.completedAt='2026-11-24T15:00:00Z';await f.c.update(f.state,{refresh:true});assert.equal(f.c.selected('one').id,'ready');
 f.state.looks[0].itemIds=['shirt'];await f.c.update(f.state);assert.equal(f.c.selected('one'),null);assert.equal(f.c.selected('two').id,'ready');
});
test('saved card media preserves the collage fallback and escapes image labels',()=>{
 const f=fixture(),look=f.state.looks[0];look.name='A <look> & "tie"';
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const helpers={escape,photo:item=>`<img alt="${item.name}">`};
 assert.equal(savedLookMedia(look,f.state.items,null,helpers),'<div class="look-collage"><img alt="shirt"><img alt="pants"><img alt="tie"></div>');
 assert.match(savedLookMedia(look,f.state.items,f.preview('pending','prepared'),helpers),/look-collage/);
 const markup=savedLookMedia(look,f.state.items,f.preview(),helpers);assert.match(markup,/data-saved-preview="one"/);assert.match(markup,/A &lt;look&gt; &amp; &quot;tie&quot;/);assert.match(markup,/loading="lazy"/);assert.doesNotMatch(markup,/look-collage/);
});
