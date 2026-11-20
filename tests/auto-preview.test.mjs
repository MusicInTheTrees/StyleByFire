import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyWardrobe} from '../accounts.mjs';
import {buildPreviewSpec} from '../app/mannequin.js';
import {createOutfitPreview} from '../app/outfit-preview.js';

const item=(id,category)=>({id,name:id,category,role:'base',color:'Black',colorVerified:true,pattern:'Solid',formality:2,warmth:1,tags:[],modes:['Business'],favorite:false,subcategory:'',src:`/media/seed-${id}.jpg`});
function fixture(){
 const state=emptyWardrobe();state.items=[item('shirt','Top'),item('pants','Bottom'),item('tie','Accessories')];
 const pending=new Map(),calls=[],saved=new Map();let count=0,active=true;
 const api=async(url,options={})=>{
  calls.push({url,...options});
  if(url==='/api/mannequin'&&options.method!=='POST')return {previews:[...saved.values()]};
  if(options.method==='POST'){
   const input=JSON.parse(options.body),spec=buildPreviewSpec(state,input.itemIds,input);
   const detail={id:'request-'+(++count),status:'prepared',spec,mode:spec.mode,itemIds:spec.items.map(i=>i.id),createdAt:'2026-11-20'};
   saved.set(detail.id,detail);return detail;
  }
  return saved.get(url.split('/').at(-1));
 };
 const controller=createOutfitPreview({api,escape:s=>s,onChange:()=>{},isActive:()=>active,schedule:(fn,delay)=>{const id=Symbol();pending.set(id,{fn,delay});return id;},cancel:id=>pending.delete(id)});
 async function tick(){const entry=pending.entries().next().value;assert.ok(entry,'expected a scheduled task');pending.delete(entry[0]);await entry[1].fn();}
 return {state,controller,pending,calls,saved,tick,setActive:value=>active=value};
}
test('rapid manual edits prepare only the final selection after debounce',async()=>{
 const f=fixture();await f.controller.load('one');
 await f.controller.update(f.state,f.state.items.slice(0,2),'Business',{automatic:true});
 await f.controller.update(f.state,f.state.items,'Business',{automatic:true});
 assert.equal(f.pending.size,1);assert.equal([...f.pending.values()][0].delay,2000);
 assert.equal(f.calls.filter(c=>c.method==='POST').length,0);
 await f.tick();
 assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
 assert.deepEqual(JSON.parse(f.calls.at(-1).body).itemIds,['shirt','pants','tie']);
 assert.match(f.controller.requestMessage(),/request-1/);assert.equal([...f.pending.values()][0].delay,5000);
});
test('a completed Codex image appears automatically and polling stops',async()=>{
 const f=fixture();await f.controller.load('one');await f.controller.update(f.state,f.state.items,'Business',{automatic:true});await f.tick();
 const saved=f.saved.get('request-1');f.saved.set(saved.id,{...saved,status:'complete',imageSrc:'/image',completedAt:'now'});
 await f.tick();assert.equal(f.controller.selected().id,'request-1');assert.equal(f.pending.size,0);
 assert.match(f.controller.markup(true),/<img/);
});
test('existing complete previews are reused without preparation or polling',async()=>{
 const f=fixture();f.saved.set('old',{id:'old',status:'complete',mode:'Business',itemIds:f.state.items.map(i=>i.id),spec:buildPreviewSpec(f.state,['shirt','pants','tie'],{mode:'Business'}),imageSrc:'/image'});
 await f.controller.load('one');await f.controller.update(f.state,f.state.items,'Business',{automatic:true});
 assert.equal(f.pending.size,0);assert.equal(f.calls.filter(c=>c.method==='POST').length,0);assert.equal(f.controller.selected().id,'old');
});
test('incomplete outfits, opt-out, page pause and account changes do not prepare requests',async()=>{
 const f=fixture();await f.controller.load('one');await f.controller.update(f.state,[f.state.items[0]],'Business',{automatic:true});assert.equal(f.pending.size,0);
 await f.controller.update(f.state,f.state.items,'Business',{automatic:false});assert.equal(f.pending.size,0);
 await f.controller.update(f.state,f.state.items,'Business',{automatic:true});f.controller.pause();assert.equal(f.pending.size,0);
 await f.controller.update(f.state,f.state.items,'Business',{automatic:true});f.controller.reset('two');assert.equal(f.pending.size,0);
 assert.equal(f.calls.filter(c=>c.method==='POST').length,0);
});
test('late preparation for the previous outfit never supplies the current request',async()=>{
 const f=fixture();let finish;
 const old={id:'old',status:'prepared',spec:buildPreviewSpec(f.state,['shirt','pants'],{mode:'Business'})};
 const timers=new Map();let n=0;
 const c=createOutfitPreview({api:async(url,options)=>options?.method==='POST'?new Promise(resolve=>finish=resolve):{previews:[]},escape:s=>s,onChange:()=>{},schedule:fn=>{timers.set(++n,fn);return n;},cancel:id=>timers.delete(id)});
 await c.load('one');await c.update(f.state,f.state.items.slice(0,2),'Business',{automatic:true});
 const work=timers.get(1)();await c.update(f.state,f.state.items,'Business',{automatic:true});finish(old);await work;
 assert.equal(c.requestMessage(),'');assert.equal(c.selected(),null);
});
test('poll failures stop retries and keep the handoff request available',async()=>{
 const f=fixture();await f.controller.load('one');await f.controller.update(f.state,f.state.items,'Business',{automatic:true});await f.tick();
 f.saved.delete('request-1');await f.tick();
 assert.equal(f.pending.size,0);assert.match(f.controller.markup(true),/Automatic checking paused/);assert.match(f.controller.requestMessage(),/request-1/);
});
