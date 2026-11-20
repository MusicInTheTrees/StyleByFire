import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PROFILE,DEFAULT_RULES,DEFAULT_ADJUSTMENTS} from '../app/domain.js';
import {buildPreviewSpec} from '../app/mannequin.js';
import {toggleOutfitPiece,manualOutfit,restoreOutfitDraft,previewMatchesOutfit} from '../app/outfit-builder.js';
import {createOutfitPreview} from '../app/outfit-preview.js';

const piece=(id,category,extra={})=>({id,name:id,category,role:'base',color:'Black',colorVerified:true,pattern:'Solid',formality:2,warmth:1,tags:[],modes:['Business'],favorite:false,subcategory:'',src:`/media/seed-${id}.jpg`,adjustments:structuredClone(DEFAULT_ADJUSTMENTS),...extra});
const wardrobe=()=>({version:1,items:[piece('shirt','Top'),piece('pants','Bottom'),piece('coat','Top',{role:'outerwear'}),piece('belt','Accessories'),piece('tie','Accessories')],looks:[],subcategories:[],profile:structuredClone(DEFAULT_PROFILE),rules:structuredClone(DEFAULT_RULES)});
test('manual replacement keeps layers and accessories and toggles a selection off',()=>{
 const state=wardrobe(),shirt=piece('new-shirt','Top');
 const next=toggleOutfitPiece(state.items,shirt);
 assert.deepEqual(next.map(i=>i.id),['pants','coat','belt','tie','new-shirt']);
 assert.equal(state.items.length,5);
 assert.equal(toggleOutfitPiece(next,shirt).length,4);
 assert.equal(toggleOutfitPiece(next,piece('watch','Accessories')).length,6);
});
test('dress replaces separates but preserves leggings and outerwear; separates replace dress',()=>{
 const state=wardrobe(),leggings=piece('leggings','Bottom',{role:'leggings'}),dress=piece('dress','Top',{role:'dress'});
 const next=toggleOutfitPiece([...state.items,leggings],dress);
 assert.deepEqual(next.map(i=>i.id),['coat','belt','tie','leggings','dress']);
 assert.ok(!toggleOutfitPiece(next,state.items[0]).some(i=>i.id==='dress'));
});
test('unavailable pieces and excess accessories are blocked, but removal is always possible',()=>{
 const unavailable=piece('laundry','Top',{availability:'laundry'});
 assert.throws(()=>toggleOutfitPiece([],unavailable),/laundry/);
 assert.deepEqual(toggleOutfitPiece([unavailable],unavailable),[]);
 const accessories=Array.from({length:20},(_,n)=>piece('a'+n,'Accessories'));
 assert.throws(()=>toggleOutfitPiece(accessories,piece('extra','Accessories')),/20/);
});
test('manual selection preserves explicit excluded-tag choices as warnings and assesses missing essentials',()=>{
 const state=wardrobe();state.profile.avoidTags=['scratchy'];state.items[0].tags=['scratchy'];
 const outfit=manualOutfit([state.items[0]],'Business',state);
 assert.equal(outfit.items.length,1);assert.deepEqual(outfit.errors,[]);
 assert.ok(outfit.missing.includes('Bottom'));assert.ok(outfit.warnings.some(w=>w.includes('excluded tags')));
});
test('saved drafts support empty outfits and drop removed clothing without importing foreign IDs',()=>{
 const state=wardrobe();
 assert.equal(restoreOutfitDraft({mode:'Business',method:'manual',itemIds:[]},state).items.length,0);
 const draft=restoreOutfitDraft({mode:'Business',itemIds:['shirt','shirt','foreign'],locked:['foreign','pants']},state);
 assert.deepEqual(draft.items.map(i=>i.id),['shirt']);assert.deepEqual(draft.locked,['pants']);
 assert.equal(restoreOutfitDraft({mode:'Invalid',itemIds:[]},state),null);
});
test('preview matching checks all garments, colors, corrections, edits and occasion',()=>{
 const state=wardrobe(),ids=state.items.map(i=>i.id);
 const preview={status:'complete',imageSrc:'/image',spec:buildPreviewSpec(state,ids,{mode:'Business'})};
 assert.ok(previewMatchesOutfit(preview,state,[...ids].reverse(),'Business'));
 for(const field of ['color','stylistNotes','description']){
  const changed=structuredClone(state);changed.items[0][field]=field==='color'?'White':'A correction';
  assert.equal(previewMatchesOutfit(preview,changed,ids,'Business'),false);
 }
 assert.equal(previewMatchesOutfit(preview,state,ids.slice(0,-1),'Business'),false);
 assert.equal(previewMatchesOutfit(preview,state,ids,'Casual'),false);
});
test('an older async preview cannot appear after the outfit or account changes',async()=>{
 const state=wardrobe(),ids=state.items.map(i=>i.id);
 let finish;
 const detail={id:'preview',mode:'Business',status:'complete',imageSrc:'/image',spec:buildPreviewSpec(state,ids,{mode:'Business'})};
 const api=async url=>url==='/api/mannequin'?{previews:[{...detail,itemIds:ids}]}:new Promise(resolve=>{finish=()=>resolve(detail);});
 const controller=createOutfitPreview({api,escape:s=>s,onChange:()=>{}});
 await controller.load('account-one');
 const pending=controller.update(state,state.items,'Business');
 await controller.update(state,[],'Business');finish();await pending;
 assert.ok(!controller.markup(false).includes('<img'));
 const pendingAgain=controller.update(state,state.items,'Business');controller.reset('account-two');finish();await pendingAgain;
 assert.ok(!controller.markup(false).includes('<img'));
});
