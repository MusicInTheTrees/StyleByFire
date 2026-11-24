import test from 'node:test';
import assert from 'node:assert/strict';
import {careDefaults,careAction,careStatus,careFor,validateCare,addMonths,careUndoRecord,undoCare,dueCareItems} from '../app/care.js';
import {carePage,careEditor} from '../app/care-ui.js';
import {emptyWardrobe} from '../accounts.mjs';
import {validateState,DEFAULT_ADJUSTMENTS} from '../app/domain.js';
const shirt={id:'shirt',name:'Business shirt',category:'Top',role:'base',subcategory:'Shirts / Button-down',src:'/media/seed-shirt.png',modes:['Business','Sport'],tags:[],color:'White',colorVerified:true,pattern:'Solid',formality:3,warmth:1,favorite:false,adjustments:structuredClone(DEFAULT_ADJUSTMENTS)};
test('care defaults distinguish athletic construction from style eligibility and remain unverified',()=>{
 assert.equal(careDefaults(shirt).wearLimit,2);
 assert.equal(careDefaults({...shirt,name:'T-shirt'}).wearLimit,1);
 assert.equal(careDefaults({...shirt,category:'Socks'}).wearLimit,1);
 assert.equal(careDefaults({...shirt,category:'Bottom',name:'Jeans'}).wearLimit,5);
 assert.equal(careDefaults({...shirt,category:'Bottom',name:'Slacks'}).wearLimit,3);
 assert.equal(careDefaults({...shirt,subcategory:'Activewear / Running'}).wearLimit,1);
 const jacket=careDefaults({...shirt,role:'outerwear'});assert.equal(jacket.monthLimit,3);assert.equal(jacket.method,'label');assert.equal(jacket.labelVerified,false);
 assert.equal(careDefaults({...shirt,category:'Accessories',name:'Watch'}).wearLimit,0);
});
test('wears are explicit and deduplicated by day; cleaning resets reminders and only restores laundry availability',()=>{
 let item=careAction(shirt,'wear','2026-11-23').item;assert.equal(item.care.wearsSinceClean,1);
 assert.equal(careAction(item,'wear','2026-11-23').changed,false);
 item=careAction(item,'wear','2026-11-24').item;assert.equal(careStatus(item,'2026-11-24').due,true);
 item=careAction(item,'laundry','2026-11-24').item;assert.equal(item.availability,'laundry');
 assert.throws(()=>careAction(item,'wear','2026-11-25'),/ready/);
 item=careAction(item,'clean','2026-11-24').item;assert.equal(item.availability,'ready');assert.equal(item.care.wearsSinceClean,0);assert.equal(careStatus(item,'2026-11-24').due,false);
 assert.equal(careAction({...item,availability:'archived'},'clean','2026-11-24').item.availability,'archived');
});
test('calendar reminders clamp month ends, require a baseline, and respect pause/archive',()=>{
 assert.equal(addMonths('2024-01-31',1),'2024-02-29');assert.equal(addMonths('2026-01-31',1),'2026-02-28');
 let item={...shirt,role:'outerwear'};assert.equal(careStatus(item,'2026-11-24').due,false);
 item.care={...careDefaults(item),trackingSince:'2026-08-24',method:'dry'};
 assert.equal(careStatus(item,'2026-11-23').due,false);assert.equal(careStatus(item,'2026-11-24').label,'Dry cleaning due');
 item.care.enabled=false;assert.equal(careStatus(item,'2026-11-24').due,false);item.care.enabled=true;item.availability='archived';assert.equal(dueCareItems([item],'2026-11-24').length,0);
});
test('care settings survive wardrobe validation and malformed backups are rejected',()=>{
 const state=emptyWardrobe();state.items=[careAction(shirt,'wear','2026-11-24').item];validateState(state);assert.equal(validateState(JSON.parse(JSON.stringify(state))).items[0].care.wearsSinceClean,1);
 for(const patch of [{wearLimit:-1},{monthLimit:1.5},{lastCleaned:'2026-02-30'},{wearsSinceClean:Infinity},{method:'boil'},{instructions:'x'.repeat(2001)},{enabled:'yes'}])assert.throws(()=>validateCare({...careFor(shirt),...patch}));
});
test('undo touches only care fields and refuses to overwrite subsequent care/availability changes',()=>{
 const before=[shirt],after=[careAction(shirt,'wear','2026-11-24').item],record=careUndoRecord(before,after);
 after[0].notes='New personal note';const restored=undoCare(after,record);assert.equal(restored[0].notes,'New personal note');assert.equal(restored[0].care,undefined);
 after[0].availability='laundry';assert.throws(()=>undoCare(after,record),/changed again/);
});
test('care views escape personal content and expose settings, sources, and reminder actions',()=>{
 const escape=s=>String(s??'').replaceAll('<','&lt;').replaceAll('"','&quot;'),item={...shirt,name:'<script>',care:{...careDefaults(shirt),instructions:'<img onerror=x>'}};
 const html=carePage({items:[item]},{escape,photo:()=>'<img alt="fixture">'}),editor=careEditor(item,{escape});
 assert.ok(html.includes('&lt;script>'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('data-care-action="wear"'));assert.ok(html.includes('Sources and care-label guidance'));assert.ok(editor.includes('monthLimit'));assert.ok(editor.includes('labelVerified'));
});
