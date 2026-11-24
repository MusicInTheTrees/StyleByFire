import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PROFILE,DEFAULT_RULES,DEFAULT_ADJUSTMENTS,assessOutfit,generateOutfit,validateState,neutralColors,NEUTRAL_COLORS} from '../app/domain.js';
import {prepareBulkEdit,undoBulkEdit,needsReview} from '../app/wardrobe-tools.js';
const item=(id,category='Top',extra={})=>({id,name:id,category,role:'base',color:'Black',colorVerified:true,pattern:'Solid',formality:2,warmth:1,tags:['Keep','Remove'],modes:['Casual'],favorite:false,subcategory:'Shirts',src:'/media/seed-test.jpg',notes:'Existing note',stylistNotes:'Existing correction',adjustments:{...DEFAULT_ADJUSTMENTS},...extra});
const state=()=>({version:1,items:[item('a'),item('b','Bottom'),item('c','Shoes')],looks:[{id:'l',name:'Saved',mode:'Casual',itemIds:['a','b','c']}],subcategories:[],profile:structuredClone(DEFAULT_PROFILE),rules:structuredClone(DEFAULT_RULES)});
test('custom neutral lists affect assessments, support no neutrals, and retain legacy defaults',()=>{
 const s=state(),p={...s.profile,ignoreNeutralColors:true,neutralColors:['Blue']},rules={...s.rules.Casual,maxColors:1};s.items[0].secondaryColor='Blue';s.items[1].color='White';
 assert.deepEqual(neutralColors(s.profile),NEUTRAL_COLORS);
 assert.ok(assessOutfit(s.items,'Casual',rules,p).warnings.some(w=>w.includes('2 non-neutral')));
 assert.ok(assessOutfit(s.items,'Casual',rules,{...p,neutralColors:[]}).warnings.some(w=>w.includes('3 non-neutral')));
 for(const value of [[],['Blue','Black']]){s.profile.neutralColors=value;assert.equal(validateState(s),s);}
 for(const value of [null,'Blue',['Blue','Blue'],['fake'],['toString']]){s.profile.neutralColors=value;assert.throws(()=>validateState(s));}
});
test('custom neutral colors drive balanced recommendations',()=>{
 const s=state();s.items=[item('black'),item('blue','Top',{color:'Blue'}),...s.items.slice(1)];
 const out=generateOutfit(s.items,'Casual',s.rules.Casual,{...s.profile,neutralColors:['Blue'],adventure:0},[],42);
 assert.ok(out.items.some(i=>i.id==='blue'));
});
test('bulk edit preserves originals, unselected items and looks; appends notes and merges tags',()=>{
 const s=state(),snapshot=structuredClone(s);s.items[0].adjustments.rotation=270;snapshot.items[0].adjustments.rotation=270;
 const r=prepareBulkEdit(s,['a','b'],{color:'White',secondaryColor:'Black',colorVerified:false,availability:'laundry',rotation:90,addTags:['keep','New'],removeTags:['REMOVE'],notes:'Additional note',stylistNotes:'New correction'});
 assert.deepEqual(s,snapshot);assert.deepEqual(r.state.items[2],s.items[2]);assert.deepEqual(r.state.looks,s.looks);
 assert.deepEqual(r.state.items[0].tags,['Keep','New']);assert.equal(r.state.items[0].notes,'Existing note\nAdditional note');assert.equal(r.state.items[0].adjustments.rotation,0);assert.equal(r.state.items[0].src,s.items[0].src);
 assert.deepEqual(undoBulkEdit(r.state,r.undo),s);
 r.state.items[0].notes='Later edit';assert.throws(()=>undoBulkEdit(r.state,r.undo),/overwrite/);
});
test('invalid bulk changes and stale selections fail without mutation',()=>{
 const s=state(),snapshot=structuredClone(s);
 for(const patch of [{color:'fake'},{formality:9},{modes:['Unknown occasion']},{availability:'lost'},{rotation:45},{}])assert.throws(()=>prepareBulkEdit(s,['a'],patch));
 assert.throws(()=>prepareBulkEdit(s,['missing'],{favorite:true}));assert.throws(()=>prepareBulkEdit(s,[],{favorite:true}));assert.deepEqual(s,snapshot);
});
test('unavailable clothing is retained but excluded from suggestions and rejected when pinned',()=>{
 for(const status of ['laundry','repair','archived']){
 const s=state();s.items[0].availability=status;
 const out=generateOutfit(s.items,'Casual',s.rules.Casual,s.profile,[],42);assert.ok(out.missing.includes('Top'));
 assert.ok(generateOutfit(s.items,'Casual',s.rules.Casual,s.profile,['a'],42).errors.some(e=>e.includes('ready')));
 assert.equal(validateState(s),s);s.items[0].availability='ready';assert.ok(generateOutfit(s.items,'Casual',s.rules.Casual,s.profile,[],42).complete);
 }
});
test('review filters identify specific cleanup needs without changing labels',()=>{
 const i=item('a');assert.equal(needsReview(i,'unverified'),false);i.colorVerified=false;assert.equal(needsReview(i,'unverified'),true);
 assert.equal(needsReview(i,'notes'),true);assert.equal(needsReview(i,'uncategorized'),false);i.subcategory='';assert.equal(needsReview(i,'uncategorized'),true);i.modes=[];assert.equal(needsReview(i,'no-modes'),true);
});
