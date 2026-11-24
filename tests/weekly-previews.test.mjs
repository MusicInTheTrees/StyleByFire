import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyWardrobe} from '../accounts.mjs';
import {defaultWeeklySettings} from '../app/weekly-settings.js';
import {buildPreviewSpec} from '../app/mannequin.js';
import {createWeeklyPreviews,weeklyMannequinMarkup,weeklyPreviewToolbar} from '../app/weekly-previews.js';

const item=(id,category)=>({id,name:id,category,role:'base',color:'Blue',colorVerified:true,pattern:'Solid',formality:3,warmth:1,tags:[],modes:['Business','Casual'],favorite:false,subcategory:'',src:`/media/seed-${id}.jpg`});
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function fixture(){
 const state=emptyWardrobe();state.items=[item('shirt','Top'),item('pants','Bottom'),item('tie','Accessories'),item('watch','Accessories'),item('other-shirt','Top')];
 const settings=defaultWeeklySettings();settings.days.forEach(day=>{day.enabled=['monday','tuesday','wednesday'].includes(day.id);day.mode='Business';});
 const days=settings.days.filter(day=>day.enabled).map(day=>({id:day.id,mode:day.mode,itemIds:['shirt','pants','tie','watch']}));
 state.weeklyPlanner={version:1,settings,plan:{generatedAt:'2026-11-23',settings:structuredClone(settings),days}};
 const saved=new Map(),calls=[],timers=new Map();let count=0,active=true,failList=false,failPost=false;
 const api=async(url,options={})=>{
  calls.push({url,...options});
  if(url==='/api/mannequin'&&options.method!=='POST'){
   if(failList)throw Error('offline');
   return {previews:[...saved.values()].map(({spec,...summary})=>summary)};
  }
  if(options.method==='POST'){
   if(failPost)throw Error('No room for another preview.');
   const input=JSON.parse(options.body),spec=buildPreviewSpec(state,input.itemIds,input);
   const detail={id:'request-'+(++count),status:'prepared',spec,mode:spec.mode,bodyShape:spec.bodyShape,itemIds:spec.items.map(i=>i.id),createdAt:'2026-11-23'};
   saved.set(detail.id,detail);return detail;
  }
  const result=saved.get(url.split('/').at(-1));if(!result)throw Error('not found');return result;
 };
 const options={api,onChange:()=>{},isActive:()=>active,schedule:fn=>{const id=Symbol();timers.set(id,fn);return id;},cancel:id=>timers.delete(id)};
 const c=createWeeklyPreviews(options);c.reset('account-one');
 async function tick(){const entry=timers.entries().next().value;assert.ok(entry,'expected a poll');timers.delete(entry[0]);await entry[1]();}
 function completed(id='saved',day=days[0],shape='straight'){
  const spec=buildPreviewSpec(state,day.itemIds,{mode:day.mode,bodyShape:shape});
  const detail={id,status:'complete',spec,mode:day.mode,bodyShape:shape,itemIds:[...day.itemIds],imageSrc:'/api/mannequin/'+id+'/image',completedAt:'2026-11-23'};saved.set(id,detail);return detail;
 }
 return {state,c,days,saved,calls,timers,options,tick,completed,setActive:v=>active=v,failList:v=>failList=v,failPost:v=>failPost=v};
}

test('matching saved mannequins are shared across repeated days, with one list and detail read',async()=>{
 const f=fixture();f.completed('broad',f.days[0],'broad');await f.c.update(f.state);
 assert.equal(f.c.summary().ready,3);assert.equal(f.calls.length,2);assert.equal(f.c.selected('tuesday').id,'broad');
 await f.c.prepare();assert.equal(f.calls.filter(call=>call.method==='POST').length,0);assert.equal(f.timers.size,0);
});
test('prepare week deduplicates outfits and includes all accessories without generating images',async()=>{
 const f=fixture();f.days[2].itemIds=['other-shirt','pants','tie','watch'];await f.c.update(f.state);
 assert.equal(f.calls.filter(call=>call.method==='POST').length,0);
 await f.c.prepare();const posts=f.calls.filter(call=>call.method==='POST');assert.equal(posts.length,2);
 assert.deepEqual(JSON.parse(posts[0].body).itemIds,['shirt','pants','tie','watch']);
 assert.ok(posts.every(call=>call.url==='/api/mannequin'&&call.accountId==='account-one'));
 assert.match(f.c.requestMessage(),/Monday, Tuesday: request-1/);assert.match(f.c.requestMessage(),/Wednesday: request-2/);
 assert.equal(f.c.summary().pending,3);await f.c.prepare();assert.equal(f.calls.filter(call=>call.method==='POST').length,2);
});
test('finished requests appear on all matching days automatically and polling stops',async()=>{
 const f=fixture();await f.c.update(f.state);await f.c.prepare();assert.equal(f.timers.size,1);
 f.completed('request-1');await f.tick();assert.equal(f.c.summary().ready,3);assert.equal(f.timers.size,0);assert.equal(f.c.requestMessage(),'');
});
test('changing pieces clears just that day; locks and reordering preserve matching previews',async()=>{
 const f=fixture();f.completed();await f.c.update(f.state);
 f.days[0].locked=true;f.days[0].itemIds.reverse();await f.c.update(f.state);assert.equal(f.c.summary().ready,3);
 f.days[1].itemIds=['other-shirt','pants','watch'];const work=f.c.update(f.state);
 assert.equal(f.c.view('tuesday').detail,null);assert.equal(f.c.view('monday').detail.id,'saved');await work;
 assert.equal(f.c.summary().ready,2);assert.equal(f.c.selected('tuesday'),null);
});
test('color corrections, styling notes and photo edits invalidate saved images but private notes do not',async()=>{
 for(const change of [piece=>piece.color='White',piece=>piece.stylistNotes='Actually white with black pattern',piece=>piece.adjustments={rotation:90},piece=>piece.src='/media/changed.jpg']){
  const f=fixture();f.completed();await f.c.update(f.state);change(f.state.items[0]);await f.c.update(f.state);assert.equal(f.c.summary().ready,0);
 }
 const f=fixture();f.completed();await f.c.update(f.state);f.state.items[0].notes='Private note';await f.c.update(f.state);assert.equal(f.c.summary().ready,3);
});
test('a different mode and stale pending snapshots never match merely by item IDs',async()=>{
 const f=fixture();f.completed();f.days[1].mode='Casual';f.state.weeklyPlanner.plan.settings.days[1].mode='Casual';
 const pending=f.completed('stale');pending.status='prepared';pending.spec.items[0].stylistNotes='Old correction';
 await f.c.update(f.state);assert.equal(f.c.summary().ready,2);assert.equal(f.c.view('tuesday').detail,null);assert.equal(f.c.requestMessage(),'');
});
test('empty, partial and unavailable outfits explain what to fix without creating requests',async()=>{
 const f=fixture();f.days[0].itemIds=[];f.days[1].itemIds=['shirt'];f.days[2].itemIds=['other-shirt','pants'];f.state.items.find(i=>i.id==='other-shirt').availability='laundry';
 await f.c.update(f.state);await f.c.prepare();assert.equal(f.c.summary().invalid,3);assert.equal(f.calls.length,0);assert.equal(f.timers.size,0);
 assert.match(f.c.view('tuesday').validation,/top and a bottom/);
 f.state.weeklyPlanner.plan=null;await f.c.update(f.state);assert.equal(f.c.summary().total,0);
});
test('account changes discard late history results and do not leak another account’s image',async()=>{
 const f=fixture();let finish;const detail=f.completed();
 const c=createWeeklyPreviews({...f.options,api:async url=>url==='/api/mannequin'?new Promise(resolve=>finish=resolve):detail});
 c.reset('one');const work=c.update(f.state);c.reset('two');finish({previews:[detail]});await work;
 assert.equal(c.summary().total,0);assert.equal(c.selected('monday'),null);assert.equal(f.timers.size,0);
});
test('an edited week discards a late preparation response and account reset cancels further posts',async()=>{
 const f=fixture();let finish;let posts=0;
 const c=createWeeklyPreviews({...f.options,api:async(_url,options)=>options.method==='POST'?(posts++,new Promise(resolve=>finish=resolve)):{previews:[]}});
 c.reset('one');await c.update(f.state);const work=c.prepare();
 f.days[0].itemIds=['other-shirt','pants'];await c.update(f.state);finish({id:'old',status:'prepared',spec:buildPreviewSpec(f.state,['shirt','pants','tie','watch'],{mode:'Business'})});await work;
 assert.equal(c.view('monday').detail,null);assert.equal(c.requestMessage(),'');assert.equal(posts,1);
 const work2=c.prepare();c.reset('two');finish({id:'old',status:'prepared'});await work2;assert.equal(posts,2);assert.equal(c.summary().total,0);
});
test('pause stops polling and a visible return resumes checking existing pending requests',async()=>{
 const f=fixture();await f.c.update(f.state);await f.c.prepare();f.c.pause();assert.equal(f.timers.size,0);
 f.setActive(false);await f.c.update(f.state,{refresh:true});assert.equal(f.timers.size,0);
 f.setActive(true);await f.c.update(f.state,{refresh:true});assert.equal(f.timers.size,1);
});
test('network and request failures retain useful errors and can be retried',async()=>{
 const f=fixture();f.failList(true);await f.c.update(f.state);assert.match(f.c.summary().error,/Refresh previews/);await f.c.prepare();assert.equal(f.calls.filter(call=>call.method==='POST').length,0);
 f.failList(false);await f.c.update(f.state,{refresh:true});f.failPost(true);await f.c.prepare();assert.match(f.c.view('monday').error,/No room/);
 f.failPost(false);await f.c.prepare();assert.equal(f.c.summary().pending,3);
 f.failList(true);await f.tick();assert.equal(f.timers.size,0);assert.match(f.c.requestMessage(),/request-1/);
 f.failList(false);await f.c.update(f.state,{refresh:true});assert.equal(f.timers.size,1);
});
test('weekly preview UI exposes per-day context, full image, fixes, and a copyable batch request',async()=>{
 const f=fixture();f.state.items[0].name='<script>alert("test")</script>';f.completed();await f.c.update(f.state);
 let html=weeklyMannequinMarkup(f.days[0],{escape},f.c.view('monday'));
 assert.match(html,/Open Monday mannequin preview/);assert.match(html,/loading="lazy"/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
 f.days[0].itemIds=[];await f.c.update(f.state);html=weeklyMannequinMarkup(f.days[0],{escape},f.c.view('monday'));assert.match(html,/Edit Monday pieces/);assert.doesNotMatch(html,/<img/);
 const other=fixture();await other.c.update(other.state);await other.c.prepare();html=weeklyPreviewToolbar(other.c.summary(),{escape});
 assert.match(html,/Copy week request/);assert.match(html,/Monday, Tuesday, Wednesday: request-1/);assert.match(html,/does not start billed generation/);
});
