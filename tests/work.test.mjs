import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_RULES,DEFAULT_PROFILE,DEFAULT_ADJUSTMENTS,validateState,generateOutfit,MODES,CATEGORIES} from '../app/domain.js';
import {workCandidate} from '../app/work.js';
import {inferLabels} from '../inventory.mjs';
import {buildPreviewSpec} from '../app/mannequin.js';
import {defaultWeeklySettings,validateWeeklySettings} from '../app/weekly-settings.js';
import {STARTER_SUBCATEGORIES} from '../app/category-setup.js';
const item=(id,category,name,extra={})=>({id,category,name,role:'base',subcategory:'',modes:['Casual'],color:'Navy',colorVerified:true,pattern:'Solid',tags:[],favorite:false,warmth:1,formality:2,src:'/media/seed-test.jpg',notes:'My reminder',stylistNotes:'Actually navy',adjustments:structuredClone(DEFAULT_ADJUSTMENTS),...extra});
const wardrobe=()=>({version:1,items:[item('shirt','Top','Work shirt'),item('pants','Bottom','Utility work pants'),item('socks','Socks','Crew socks'),item('shoes','Shoes','Work boots')],looks:[],subcategories:[],profile:structuredClone(DEFAULT_PROFILE),rules:structuredClone(DEFAULT_RULES)});
test('Work migration preserves corrections and existing occasions, and respects subsequent edits',()=>{
 const s=wardrobe();delete s.rules.Work;s.rules.Business.maxColors=7;const before=structuredClone(s);
 validateState(s);assert.ok(s.items.every(i=>i.modes.includes('Work')));
 assert.deepEqual(s.items.map(i=>({...i,modes:['Casual']})),before.items);assert.equal(s.rules.Business.maxColors,7);
 s.items[0].modes=['Casual'];s.rules.Work.maxColors=6;validateState(s);
 assert.deepEqual(s.items[0].modes,['Casual']);assert.equal(s.rules.Work.maxColors,6);
 assert.equal(CATEGORIES.length,6);
});
test('Work supports complete outfits, saved previews and weekly day selection',()=>{
 const s=wardrobe();delete s.rules.Work;validateState(s);
 const result=generateOutfit(s.items,'Work',s.rules.Work,s.profile,[],42);assert.equal(result.complete,true);
 assert.equal(buildPreviewSpec(s,result.items.map(i=>i.id),{mode:'Work'}).mode,'Work');
 const settings=defaultWeeklySettings();settings.days[0].mode='Work';validateWeeklySettings(settings,MODES);
});
test('workwear suitability avoids adding ties, sport coats or evening wear',()=>{
 assert.equal(workCandidate(item('t','Accessories','Tie',{subcategory:'Ties / Neckties'})),false);
 assert.equal(workCandidate(item('c','Top','Sport coat',{role:'outerwear'})),false);
 assert.equal(workCandidate(item('e','Top','Evening shirt',{formality:5})),false);
 assert.equal(workCandidate(item('b','Accessories','Leather belt',{subcategory:'Belts / Leather'})),true);
});
test('work and sport folders stay distinct from tailoring and offer editable category paths',()=>{
 const work=inferLabels('ClothingImages/Pants/HeavyDuty/pants.jpg');assert.equal(work.subcategory,'Pants / Work / Utility');assert.ok(work.modes.includes('Work'));assert.ok(!work.modes.includes('Business'));
 const sport=inferLabels('ClothingImages/Pants/Sport/pants.jpg');assert.ok(sport.modes.includes('Sport'));assert.equal(sport.formality,2);
 assert.ok(!inferLabels('ClothingImages/Jackets/SportsJackets/coat.jpg').modes.includes('Sport'));
 assert.ok(STARTER_SUBCATEGORIES.some(s=>s.category==='Bottom'&&s.path==='Pants / Work / Utility'));
});
