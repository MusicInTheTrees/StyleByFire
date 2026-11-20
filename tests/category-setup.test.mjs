import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyWardrobe} from '../accounts.mjs';
import {CATEGORIES,validateState} from '../app/domain.js';
import {STARTER_SUBCATEGORIES,categorySetupPlan,installCategoryTree,categoryTreeMarkup} from '../app/category-setup.js';

test('setup adds a complete tree under the six immutable roots and is idempotent',()=>{
 const state=emptyWardrobe(),result=installCategoryTree(state);
 assert.ok(result.added>40);assert.deepEqual([...new Set(STARTER_SUBCATEGORIES.map(s=>s.category))],CATEGORIES);
 assert.equal(result.state.categorySetup.status,'installed');assert.equal(state.categorySetup,undefined);
 assert.equal(installCategoryTree(result.state).added,0);assert.equal(categorySetupPlan(result.state).additions.length,0);
 for(const entry of STARTER_SUBCATEGORIES){const parts=entry.path.split(' / ');while(parts.length>1){parts.pop();assert.ok(result.state.subcategories.some(s=>s.category===entry.category&&s.path===parts.join(' / ')));}}
});
test('setup preserves custom paths, clothing notes, corrected colors and saved looks',()=>{
 const state=emptyWardrobe();state.subcategories.push({category:'Accessories',path:'My keepsakes / Family'});
 state.items=[{id:'example',color:'White',secondaryColor:'Black',notes:'Personal',stylistNotes:'True colors',src:'/media/seed-example.jpg'}];state.looks=[{id:'look',itemIds:['example']}];
 const result=installCategoryTree(state);
 assert.deepEqual(result.state.items,state.items);assert.deepEqual(result.state.looks,state.looks);
 assert.deepEqual(result.state.subcategories.slice(0,state.subcategories.length),state.subcategories);
 const mixed=emptyWardrobe();mixed.subcategories.push({category:'Accessories',path:' wallets / bifold '});
 assert.equal(categorySetupPlan(mixed).additions.some(s=>s.category==='Accessories'&&s.path==='Wallets / Bifold'),false);
});
test('required clothing types are represented under the correct roots',()=>{
 const has=(category,path)=>STARTER_SUBCATEGORIES.some(s=>s.category===category&&s.path===path);
 for(const path of ['Ties','Wallets','Wristbands','Jewelry / Necklaces','Jewelry / Earrings','Watches','Eyewear','Scarves'])assert.ok(has('Accessories',path),path);
 assert.ok(has('Top','Dresses'));assert.ok(has('Bottom','Leggings'));assert.ok(has('Top','Outerwear'));
});
test('account setup state persists through validation and rejects malformed values',()=>{
 for(const status of ['installed','dismissed']){const state=emptyWardrobe();state.categorySetup={version:1,status};assert.equal(validateState(state).categorySetup.status,status);}
 for(const categorySetup of [null,[],{version:2,status:'installed'},{version:1,status:'unknown'}])assert.throws(()=>validateState({...emptyWardrobe(),categorySetup}));
 assert.ok(validateState(emptyWardrobe()));
});
test('folder tree renders real nested branches and escapes custom names',()=>{
 const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
 const html=categoryTreeMarkup([{category:'Accessories',path:'Jewelry / Rings / Silver'},{category:'Top',path:'<custom>'}],{escape});
 assert.match(html,/<ul><li><details><summary><span>Jewelry/);assert.match(html,/<span>Silver<\/span>/);assert.ok(html.includes('&lt;custom>'));assert.ok(!html.includes('<custom>'));
});
