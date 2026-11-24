import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyWardrobe} from '../accounts.mjs';
import {validateState} from '../app/domain.js';
import {restoreOutfitDraft} from '../app/outfit-builder.js';
import {savedLookEditing,prepareLookSave} from '../app/saved-looks.js';

function fixture(){
 const state=emptyWardrobe();
 state.items=[['shirt','Top'],['pants','Bottom'],['tie','Accessories'],['belt','Accessories']].map(([id,category])=>({id,name:id,category,role:'base',color:'Blue',colorVerified:true,pattern:'Solid',formality:3,warmth:1,tags:[],modes:['Business','Casual'],favorite:false,subcategory:'',src:`/media/seed-${id}.jpg`}));
 state.looks=[{id:'original',name:'Business Pastel',mode:'Business',itemIds:['shirt','pants','tie','belt'],createdAt:'2026-11-20T10:00:00Z'},{id:'other',name:'Other look',mode:'Casual',itemIds:['shirt','pants'],createdAt:'2026-11-21T10:00:00Z'}];return state;
}
const meta={newId:()=> 'copy',now:()=> '2026-11-24T12:00:00Z'};
const input={intent:'update',lookId:'original',name:'Business Pastel',mode:'Business',itemIds:['shirt','pants','belt']};

test('updating a look removes just the selected accessory and preserves its identity, position and creation date',()=>{
 const state=fixture(),before=structuredClone(state),result=prepareLookSave(state,input,meta);
 assert.equal(result.state.looks.length,2);assert.equal(result.state.looks[0].id,'original');assert.equal(result.look.createdAt,before.looks[0].createdAt);assert.equal(result.look.updatedAt,meta.now());
 assert.deepEqual(result.look.itemIds,['shirt','pants','belt']);assert.deepEqual(result.state.looks[1],before.looks[1]);assert.deepEqual(state,before);
 assert.deepEqual(validateState(JSON.parse(JSON.stringify(result.state))).looks,result.state.looks);
});
test('save as new leaves the original untouched even with the same name and can be updated independently',()=>{
 const state=fixture(),before=structuredClone(state),result=prepareLookSave(state,{...input,intent:'new'},meta);
 assert.equal(result.state.looks.length,3);assert.deepEqual(result.state.looks.slice(0,2),before.looks);assert.equal(result.look.id,'copy');assert.equal(result.look.createdAt,meta.now());
 const updated=prepareLookSave(result.state,{...input,lookId:'copy',name:'No tie',mode:'Casual'},meta);
 assert.equal(updated.state.looks.length,3);assert.equal(updated.state.looks[2].mode,'Casual');assert.equal(updated.state.looks[2].name,'No tie');assert.deepEqual(updated.state.looks[0],before.looks[0]);
});
test('edit status compares occasion and every accessory but ignores piece order',()=>{
 const state=fixture();assert.equal(savedLookEditing(state,'original',['belt','tie','pants','shirt'],'Business').changed,false);
 assert.equal(savedLookEditing(state,'original',input.itemIds,'Business').changed,true);assert.equal(savedLookEditing(state,'original',state.looks[0].itemIds,'Casual').changed,true);
 assert.deepEqual(savedLookEditing(state,'missing',input.itemIds,'Business'),{look:null,changed:false});
});
test('browser drafts remember the editing identity only when it exists in this account',()=>{
 const state=fixture(),draft={editingLookId:'original',mode:'Business',method:'manual',itemIds:input.itemIds};
 assert.equal(restoreOutfitDraft(draft,state).editingLookId,'original');
 assert.equal(restoreOutfitDraft({...draft,editingLookId:'foreign'},state).editingLookId,null);
 assert.equal(restoreOutfitDraft({...draft,editingLookId:undefined},state).editingLookId,null);
 state.looks=[];assert.equal(restoreOutfitDraft(draft,state).editingLookId,null);
});
test('missing targets never silently become new looks or overwrite another entry',()=>{
 const state=fixture();assert.throws(()=>prepareLookSave(state,{...input,lookId:'deleted'},meta),/no longer exists/);
 assert.throws(()=>prepareLookSave(state,{...input,intent:'new'},{...meta,newId:()=> 'original'}),/unique/);assert.equal(state.looks.length,2);
});
test('invalid saves leave state untouched while partial outfits and renames can be saved',()=>{
 const state=fixture(),before=structuredClone(state);
 for(const update of [{name:'   '},{name:'x'.repeat(101)},{mode:'invalid'},{itemIds:[]},{itemIds:['shirt','shirt']},{itemIds:['foreign']},{intent:'invalid'}])assert.throws(()=>prepareLookSave(state,{...input,...update},meta));
 assert.deepEqual(state,before);
 const result=prepareLookSave(state,{...input,name:'  New name  ',itemIds:['shirt']},meta);assert.equal(result.look.name,'New name');assert.deepEqual(result.look.itemIds,['shirt']);
});
