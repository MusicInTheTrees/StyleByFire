import test from 'node:test';
import assert from 'node:assert/strict';
import {CATEGORIES,DEFAULT_RULES,DEFAULT_PROFILE,DEFAULT_ADJUSTMENTS,DEFAULT_SUBCATEGORIES,ACCESSORY_LABELS,accessoryType,generateOutfit,validateLocks,validateState,slotFor} from '../app/domain.js';
const profile=structuredClone(DEFAULT_PROFILE);
const make=(id,category,extra={})=>({id,name:id,category,role:'base',color:'Black',colorVerified:true,pattern:'Solid',formality:2,warmth:1,tags:[],modes:['Casual','Business'],favorite:false,subcategory:'',src:'/media/seed-test.jpg',adjustments:structuredClone(DEFAULT_ADJUSTMENTS),...extra});
const base=()=>[make('shirt','Top'),make('pants','Bottom'),make('shoes','Shoes')];
const run=(items,locks=[],overrides={})=>generateOutfit(items,'Casual',DEFAULT_RULES.Casual,{...profile,...overrides},locks,42);
// Synthetic fixtures keep the test suite independent of anyone's private photos.
const seed={items:[...base(),make('sport-coat','Top',{role:'outerwear',color:'Gray'}),make('socks','Socks'),make('necktie','Accessories',{subcategory:'Ties / Neckties',color:'Navy'}),make('belt','Accessories',{subcategory:'Belts'})],reference:'/media/seed-reference.jpg'};

test('website source links preserve attribution and reject executable or credential-bearing links',()=>{
 const wardrobe=()=>({version:1,items:[make('import','Top',{sourceUrl:'https://example.com/shirt',sourceImageUrl:'https://images.example.com/shirt.jpg',sourceName:'Example store'})],looks:[],profile:structuredClone(DEFAULT_PROFILE),rules:structuredClone(DEFAULT_RULES),subcategories:[]});
 assert.equal(validateState(wardrobe()).items[0].sourceName,'Example store');
 for(const value of ['javascript:alert(1)','data:text/html,test','https://user:secret@example.com/photo.jpg',42])for(const field of ['sourceUrl','sourceImageUrl']){const state=wardrobe();state.items[0][field]=value;assert.throws(()=>validateState(state),/source link/);}
});
test('six fixed top-level categories preserve the outerwear layer',()=>{assert.deepEqual(CATEGORIES,['Cap','Top','Bottom','Socks','Shoes','Accessories']);assert.equal(slotFor(seed.items.find(i=>i.id==='sport-coat')),'layer');});
test('business generator reports absent footwear rather than claiming completeness',()=>{const result=generateOutfit(seed.items.filter(i=>i.category!=='Shoes'),'Business',DEFAULT_RULES.Business,profile,[],72);assert.deepEqual(result.missing,['Shoes']);assert.equal(result.complete,false);assert.ok(result.items.some(i=>slotFor(i)==='top'));assert.ok(result.items.some(i=>slotFor(i)==='bottom'));});
test('sport coats are not suggested as athletic or red-carpet clothes',()=>{for(const mode of ['Sport','Red carpet']){const result=generateOutfit(seed.items,mode,DEFAULT_RULES[mode],profile,[],1);assert.equal(result.items.length,0);assert.equal(result.complete,false);}});
test('locked piece remains present across remixes even outside selected mode',()=>{const items=base();items[0].modes=['Business'];for(let s=0;s<20;s++){const r=generateOutfit(items,'Casual',DEFAULT_RULES.Casual,profile,['shirt'],s);assert.ok(r.items.some(i=>i.id==='shirt'));assert.ok(r.warnings.some(w=>w.includes('not marked')));}});
test('dress fills top and bottom without adding separate garments',()=>{const items=[...base(),make('dress','Top',{role:'dress'})];const r=run(items,['dress']);assert.equal(r.complete,true);assert.equal(r.items.filter(i=>['top','bottom'].includes(slotFor(i))).length,0);});
test('dress conflicts with pinned separate top or bottom',()=>{for(const category of ['Top','Bottom'])assert.ok(validateLocks([make('dress','Top',{role:'dress'}),make('separate',category)]).some(e=>e.includes('dress occupies')));});
test('dress supports leggings and outer layer; accessories can be multiple',()=>{const items=[make('dress','Top',{role:'dress'}),make('tights','Bottom',{role:'leggings'}),make('coat','Top',{role:'outerwear'}),make('ring','Accessories'),make('watch','Accessories'),make('shoes','Shoes')];assert.deepEqual(validateLocks(items),[]);assert.equal(run(items,items.map(i=>i.id)).complete,true);});
test('leggings alone can fill bottom slot',()=>{const items=[make('shirt','Top'),make('leggings','Bottom',{role:'leggings'}),make('shoes','Shoes')];assert.equal(run(items).complete,true);});
test('duplicate pinned base tops are rejected',()=>assert.ok(validateLocks([make('a','Top'),make('b','Top')]).length));
test('ties remain Accessories and can be pinned alongside belts and watches',()=>{assert.ok(DEFAULT_SUBCATEGORIES.some(s=>s.category==='Accessories'&&s.path==='Ties / Neckties'));const accessories=[make('tie','Accessories',{subcategory:'Ties / Neckties'}),make('belt','Accessories',{subcategory:'Belts'}),make('watch','Accessories',{subcategory:'Watches'})];const result=run([...base(),...accessories],accessories.map(i=>i.id));assert.equal(result.complete,true);assert.deepEqual(result.errors,[]);for(const piece of accessories)assert.ok(result.items.some(i=>i.id===piece.id));});

const accessoryPaths={tie:'Ties / Neckties',belt:'Belts',glasses:'Glasses',earrings:'Jewelry / Earrings',necklace:'Jewelry / Necklaces',brooch:'Jewelry / Brooches',watch:'Watches',wristband:'Wristbands',ring:'Jewelry / Rings'};
const fullAccessories=()=>Object.entries(accessoryPaths).map(([id,subcategory])=>make(id,'Accessories',{subcategory}));
test('all nine accessory types can join a look, including when the tie is pinned',()=>{
  const accessories=fullAccessories();
  for(const locks of [[],['tie']]){
    const result=run([...base(),...accessories],locks);
    assert.deepEqual(result.items.filter(i=>i.category==='Accessories').map(accessoryType).sort(),Object.keys(accessoryPaths).sort());
    assert.equal(result.items.filter(i=>i.id==='tie').length,1);
    assert.ok(result.reasons.some(r=>r.includes('9 accessories')));
  }
});
test('automatic neckwear chooses one of ties, bow ties, and ascots while retaining other accessory groups',()=>{
  const items=[...base(),...fullAccessories(),make('bow-tie','Accessories',{subcategory:'Ties / Bow ties'}),make('ascot','Accessories',{subcategory:'Ties / Ascots'})];
  for(let s=0;s<15;s++){
    const result=generateOutfit(items,'Casual',DEFAULT_RULES.Casual,profile,[],s);
    assert.equal(result.items.filter(i=>accessoryType(i)==='tie').length,1);
    assert.equal(result.items.filter(i=>i.category==='Accessories').length,9);
  }
});
test('accessory categorization prefers subcategories and supports familiar labels and spelling',()=>{
  for(const [type,subcategory] of Object.entries(accessoryPaths)){
    assert.equal(accessoryType(make('generic item','Accessories',{subcategory})),type);
    assert.ok(ACCESSORY_LABELS[type]);
  }
  assert.equal(accessoryType(make('Ring motif silk tie','Accessories',{subcategory:'Ties / Neckties'})),'tie');
  assert.equal(accessoryType(make('Silver watch','Accessories')),'watch');
  assert.equal(accessoryType(make('Broach','Accessories')),'brooch');
  assert.equal(accessoryType(make('Leather bracelet','Accessories')),'wristband');
  assert.equal(accessoryType(make('Ring pattern shirt','Top')),null);
});
test('accessories respect mode, exclusions, and the automatic accessories toggle without dropping pins',()=>{
  const accessories=fullAccessories();
  accessories.find(i=>i.id==='tie').modes=['Business'];
  accessories.find(i=>i.id==='watch').tags=['ITCHY'];
  const result=run([...base(),...accessories],[],{avoidTags:['itchy']});
  assert.ok(!result.items.some(i=>['tie','watch'].includes(i.id)));
  assert.ok(result.items.some(i=>i.id==='belt'));
  const off=generateOutfit([...base(),...accessories],'Casual',{...DEFAULT_RULES.Casual,includeAccessory:false},profile,['ring'],1);
  assert.deepEqual(off.items.filter(i=>i.category==='Accessories').map(i=>i.id),['ring']);
});
test('multiple explicit neckwear and rings remain pinned with a useful neckwear warning',()=>{
  const items=[...base(),...fullAccessories(),make('second-tie','Accessories',{subcategory:'Ties / Bow ties'}),make('second-ring','Accessories',{subcategory:'Jewelry / Rings'})];
  const pins=['tie','second-tie','ring','second-ring','tie'];
  const result=run(items,pins);
  assert.equal(result.errors.length,0);
  for(const id of new Set(pins))assert.equal(result.items.filter(i=>i.id===id).length,1);
  assert.ok(result.warnings.some(w=>w.includes('Multiple tie')));
});
test('accessory colors and patterns still count toward transparent styling warnings',()=>{
  const result=generateOutfit([...base(),make('red-tie','Accessories',{subcategory:'Ties',color:'Red',pattern:'Stripe'}),make('blue-belt','Accessories',{subcategory:'Belts',color:'Blue',pattern:'Check'})],'Casual',{...DEFAULT_RULES.Casual,maxColors:1,maxPatterns:0},profile,[],1);
  assert.equal(result.items.filter(i=>i.category==='Accessories').length,2);
  assert.ok(result.warnings.some(w=>w.includes('3 color families')));
  assert.ok(result.warnings.some(w=>w.includes('2 patterned pieces')));
});
test('exclusion tags are case-insensitive and apply to locked garments',()=>{const items=base();items[0].tags=['ITCHY'];assert.ok(run(items,['shirt'],{avoidTags:['itchy']}).errors.length);assert.ok(run(items,[],{avoidTags:['itchy']}).missing.includes('Top'));});
test('preference range filters unpinned garments',()=>{const items=base();items[0].formality=5;assert.ok(run(items).missing.includes('Top'));});
test('required socks affect completeness',()=>{const result=generateOutfit(base(),'Business',DEFAULT_RULES.Business,profile,[],1);assert.deepEqual(result.missing,['Socks']);});
test('fixed seed yields reproducible explanations and choices',()=>{assert.deepEqual(run(seed.items),run(seed.items));});
test('wardrobe validator rejects malformed restores before persistence',()=>{const valid={version:1,items:seed.items,looks:[],subcategories:[],reference:seed.reference,profile,rules:DEFAULT_RULES};assert.equal(validateState(valid),valid);for(const patch of [{category:'Dress'},{src:'/media/../../server.mjs'},{src:'https://external.example/photo.jpg'},{role:'dress',category:'Bottom'},{modes:['anything']},{adjustments:{...DEFAULT_ADJUSTMENTS,crop:{x:.8,y:0,w:.5,h:1}}}]){const state=structuredClone(valid);Object.assign(state.items[0],patch);assert.throws(()=>validateState(state));}const stale=structuredClone(valid);stale.looks=[{id:'a',name:'Invalid',mode:'Casual',itemIds:['missing']}];assert.throws(()=>validateState(stale));});
