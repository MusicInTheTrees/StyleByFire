import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_RULES,DEFAULT_PROFILE,DEFAULT_ADJUSTMENTS,generateOutfit,validateState,assessOutfit} from '../app/domain.js';
import {golfCandidate,addGolfSuitability} from '../app/golf.js';
import {buildPreviewSpec} from '../app/mannequin.js';

const item=(id,category,name,extra={})=>({id,category,name,role:'base',subcategory:'',modes:['Golf'],color:'Navy',colorVerified:true,pattern:'Solid',tags:[],favorite:false,warmth:1,formality:2,src:'/media/seed-test.jpg',notes:'Keep personal note',stylistNotes:'Actually navy',adjustments:structuredClone(DEFAULT_ADJUSTMENTS),...extra});
const pieces=()=>[item('polo','Top','Navy polo'),item('bottom','Bottom','Tan chinos'),item('socks','Socks','Comfortable socks'),item('shoes','Shoes','Spikeless golf shoes')];
const wardrobe=()=>({version:1,items:pieces(),looks:[{id:'saved',name:'Weekend',mode:'Casual',itemIds:['polo','bottom']}],subcategories:[],profile:structuredClone(DEFAULT_PROFILE),rules:structuredClone(DEFAULT_RULES)});
const generate=(items,rules=DEFAULT_RULES.Golf,pins=[])=>generateOutfit(items,'Golf',rules,DEFAULT_PROFILE,pins,42);

test('older wardrobes acquire Golf once without losing corrections, looks or custom rules',()=>{
 const state=wardrobe();delete state.rules.Golf;
 state.rules.Business.maxColors=6;state.profile.ignoreSockPatterns=true;
 state.items.forEach(i=>i.modes=['Casual']);state.items[0].adjustments.rotation=90;state.items[0].favorite=true;
 const before=structuredClone(state);validateState(state);
 assert.deepEqual(state.rules.Golf,DEFAULT_RULES.Golf);
 assert.deepEqual(state.items.map(i=>({...i,modes:['Casual']})),before.items);
 assert.ok(state.items.every(i=>i.modes.includes('Golf')));
 assert.deepEqual(state.looks,before.looks);assert.deepEqual(state.profile,before.profile);assert.deepEqual(state.rules.Business,before.rules.Business);
 state.items[0].modes=['Casual'];state.rules.Golf.maxColors=5;
 validateState(state);assert.deepEqual(state.items[0].modes,['Casual']);assert.equal(state.rules.Golf.maxColors,5);
});

test('Golf makes a complete outfit from marked golf clothing and supports mannequin snapshots',()=>{
 const state=wardrobe(),result=generate(state.items);assert.equal(result.complete,true);assert.equal(result.items.length,4);
 assert.ok(result.reasons.some(s=>s.includes('polo')));
 const spec=buildPreviewSpec(state,result.items.map(i=>i.id),{mode:'Golf'});assert.equal(spec.mode,'Golf');
});

test('Golf reports missing footwear instead of filling with dress shoes or unapproved trainers',()=>{
 const items=pieces().filter(i=>i.id!=='shoes');items.push(item('dress','Shoes','Leather dress shoes'),item('trainer','Shoes','Running shoes'));
 const strict=generate(items);assert.deepEqual(strict.missing,['Shoes']);assert.equal(strict.complete,false);
 assert.ok(strict.warnings.some(s=>s.includes('Add golf shoes')));
 const relaxed=generate(items,{...DEFAULT_RULES.Golf,golfAllowTrainers:true});assert.equal(relaxed.complete,true);assert.ok(relaxed.items.some(i=>i.id==='trainer'));assert.ok(!relaxed.items.some(i=>i.id==='dress'));
 assert.ok(relaxed.warnings.some(s=>s.includes('accepts these trainers')));
});

test('collar and tailored-bottom controls affect suggestions; pinned exceptions remain with warnings',()=>{
 const items=pieces();items[0].name='Crewneck golf top';items[1].name='Cargo shorts';
 assert.deepEqual(generate(items).missing,['Top','Bottom']);
 assert.equal(generate(items,{...DEFAULT_RULES.Golf,golfCollaredTop:false,golfTailoredBottoms:false}).complete,true);
 const pinned=generate(items,DEFAULT_RULES.Golf,['polo','bottom']);assert.ok(pinned.items.some(i=>i.id==='polo'));assert.ok(pinned.warnings.some(s=>s.includes('collar')));assert.ok(pinned.warnings.some(s=>s.includes('tailored')));
});

test('collared golf dress fills top and bottom; availability and pattern preferences still apply',()=>{
 const items=[item('dress','Top','Collared golf dress',{role:'dress',pattern:'Floral'}),item('socks','Socks','Golf socks',{pattern:'Stripes'}),item('shoes','Shoes','Golf shoes')];
 const result=generate(items);assert.equal(result.complete,true);assert.ok(result.items.some(i=>i.role==='dress'));
 assert.ok(result.warnings.some(s=>s.includes('2 patterned pieces')));
 assert.ok(!assessOutfit(items,'Golf',DEFAULT_RULES.Golf,{...DEFAULT_PROFILE,ignoreSockPatterns:true}).warnings.some(s=>s.includes('patterned pieces')));
 items[2].availability='laundry';assert.deepEqual(generate(items).missing,['Shoes']);
});

test('initial suitability recognizes polos and practical pieces without promoting ties, blazers or dress shoes',()=>{
 for(const i of [item('p','Top','Polo'),item('s','Bottom','Golf skort'),item('b','Accessories','Woven belt',{subcategory:'Belts / Woven'}),item('l','Top','Quarter-zip sweater',{role:'outerwear'})])assert.equal(golfCandidate(i),true,i.name);
 for(const i of [item('p','Bottom','Denim jeans'),item('p','Bottom','Cargo golf shorts'),item('t','Accessories','Navy tie',{subcategory:'Ties'}),item('s','Shoes','Dress shoes'),item('c','Top','Sport coat',{role:'outerwear'})])assert.equal(golfCandidate(i),false,i.name);
 const polo=item('p','Top','Polo',{modes:['Casual']});addGolfSuitability(polo);addGolfSuitability(polo);assert.deepEqual(polo.modes,['Casual','Golf']);
});

test('Golf controls reject malformed restores and keep custom choices',()=>{
 const state=wardrobe();state.rules.Golf.golfAllowTrainers=true;validateState(state);assert.equal(state.rules.Golf.golfAllowTrainers,true);
 for(const key of ['golfCollaredTop','golfTailoredBottoms','golfAllowTrainers']){const invalid=structuredClone(state);invalid.rules.Golf[key]='false';assert.throws(()=>validateState(invalid),/Invalid Golf/);}
});
