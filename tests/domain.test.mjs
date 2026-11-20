import test from 'node:test';
import assert from 'node:assert/strict';
import {CATEGORIES,DEFAULT_RULES,DEFAULT_PROFILE,DEFAULT_ADJUSTMENTS,DEFAULT_SUBCATEGORIES,ACCESSORY_LABELS,accessoryType,itemColors,assessOutfit,generateOutfit,validateLocks,validateState,slotFor} from '../app/domain.js';
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

test('ignoring sock patterns removes only their pattern warning contribution, retaining color and accessory checks',()=>{
  const items=[...base(),make('patterned-socks','Socks',{pattern:'Argyle',color:'Blue'})];
  items[0].pattern='Geometric';
  const rules={...DEFAULT_RULES.Business,maxColors:1};
  const counted=assessOutfit(items,'Business',rules,profile);
  const ignored=assessOutfit(items,'Business',rules,{...profile,ignoreSockPatterns:true});
  assert.ok(counted.warnings.some(w=>w.includes('2 patterned pieces')));
  assert.ok(!ignored.warnings.some(w=>w.includes('patterned pieces')));
  assert.ok(ignored.reasons.some(r=>r.includes('Sock patterns are excluded')));
  assert.ok(ignored.warnings.some(w=>w.includes('2 color families')));
  assert.equal(items.at(-1).pattern,'Argyle');
  const withTie=assessOutfit([...items,make('patterned-tie','Accessories',{subcategory:'Ties',pattern:'Stripes'})],'Business',rules,{...profile,ignoreSockPatterns:true});
  assert.ok(withTie.warnings.some(w=>w.includes('2 patterned pieces')));
});

test('sock pattern preference changes recommendations for both candidate socks and patterns already pinned',()=>{
  const rules={...DEFAULT_RULES.Business,includeLayer:false,includeAccessory:false};
  const p={...profile,adventure:0};
  const items=[...base(),make('plain-socks','Socks'),make('favorite-patterned-socks','Socks',{pattern:'Argyle',favorite:true})];
  items[0].pattern='Geometric';
  const counted=generateOutfit(items,'Business',rules,p,['shirt'],42);
  const ignored=generateOutfit(items,'Business',rules,{...p,ignoreSockPatterns:true},['shirt'],42);
  assert.ok(counted.items.some(i=>i.id==='plain-socks'));
  assert.ok(ignored.items.some(i=>i.id==='favorite-patterned-socks'));
  const pinnedSocks=[...base(),make('favorite-patterned-shirt','Top',{pattern:'Geometric',favorite:true}),make('patterned-socks','Socks',{pattern:'Argyle'})];
  const countedPinned=generateOutfit(pinnedSocks,'Business',rules,p,['patterned-socks'],42);
  const ignoredPinned=generateOutfit(pinnedSocks,'Business',rules,{...p,ignoreSockPatterns:true},['patterned-socks'],42);
  assert.ok(countedPinned.items.some(i=>i.id==='shirt'));
  assert.ok(ignoredPinned.items.some(i=>i.id==='favorite-patterned-shirt'));
});

test('sock pattern preference accepts existing wardrobes and rejects non-boolean restores',()=>{
  assert.equal(DEFAULT_PROFILE.ignoreSockPatterns,false);
  const state={version:1,items:base(),looks:[],subcategories:[],profile:structuredClone(profile),rules:structuredClone(DEFAULT_RULES)};
  delete state.profile.ignoreSockPatterns;
  assert.equal(validateState(state),state);
  for(const value of [false,true]){state.profile.ignoreSockPatterns=value;assert.equal(validateState(state),state);}
  for(const value of ['false',1,null]){state.profile.ignoreSockPatterns=value;assert.throws(()=>validateState(state),/sock pattern preference/);}
});

test('a white and black geometric shirt contributes two colors but only one pattern',()=>{
  const items=base();items[0]={...items[0],color:'White',secondaryColor:'Black',pattern:'Geometric'};
  const result=assessOutfit(items,'Casual',{...DEFAULT_RULES.Casual,maxColors:1,maxPatterns:1},profile);
  assert.ok(result.warnings.some(w=>w.includes('2 color families')));
  assert.ok(!result.warnings.some(w=>w.includes('patterned pieces')));
  assert.deepEqual(itemColors(items[0]),['White','Black']);
  assert.deepEqual(itemColors({...items[0],secondaryColor:'White'}),['White']);
  assert.deepEqual(itemColors({...items[0],secondaryColor:''}),['White']);
});

test('balanced styling treats white and black as neutral while considering bold secondary colors',()=>{
  const items=[make('white-red-shirt','Top',{color:'White',secondaryColor:'Red'}),make('white-black-shirt','Top',{color:'White',secondaryColor:'Black',pattern:'Geometric'}),make('pants','Bottom'),make('shoes','Shoes')];
  const result=generateOutfit(items,'Casual',DEFAULT_RULES.Casual,{...profile,adventure:0},[],42);
  assert.ok(result.items.some(i=>i.id==='white-black-shirt'));
});

test('secondary colors affect tonal and expressive choices and can exceed the color limit in one piece',()=>{
  const items=[make('black-red-shirt','Top',{color:'Black',secondaryColor:'Red'}),make('black-white-shirt','Top',{color:'Black',secondaryColor:'White'}),make('pants','Bottom',{color:'White'}),make('shoes','Shoes')];
  for(const [palette,expected] of [['tonal','black-white-shirt'],['expressive','black-red-shirt']]){
    const result=generateOutfit(items,'Casual',DEFAULT_RULES.Casual,{...profile,palette,adventure:0},['pants','shoes'],42);
    assert.ok(result.items.some(i=>i.id===expected));
  }
  const limitItems=[make('favorite-two-new-colors','Top',{color:'White',secondaryColor:'Blue',favorite:true}),make('one-new-color','Top',{color:'White'}),make('pants','Bottom'),make('shoes','Shoes')];
  const limited=generateOutfit(limitItems,'Casual',{...DEFAULT_RULES.Casual,maxColors:2},{...profile,adventure:0},['pants'],42);
  assert.ok(limited.items.some(i=>i.id==='one-new-color'));
});

test('secondary colors are optional and only accept palette entries in restored wardrobes',()=>{
  const state={version:1,items:base(),looks:[],subcategories:[],profile:structuredClone(profile),rules:structuredClone(DEFAULT_RULES)};
  for(const value of [undefined,'','Black','White']){state.items[0].secondaryColor=value;assert.equal(validateState(state),state);}
  for(const value of ['chartreuse','toString','__proto__',null,42]){state.items[0].secondaryColor=value;assert.throws(()=>validateState(state),/secondary clothing color/);}
});
test('exclusion tags are case-insensitive and apply to locked garments',()=>{const items=base();items[0].tags=['ITCHY'];assert.ok(run(items,['shirt'],{avoidTags:['itchy']}).errors.length);assert.ok(run(items,[],{avoidTags:['itchy']}).missing.includes('Top'));});
test('preference range filters unpinned garments',()=>{const items=base();items[0].formality=5;assert.ok(run(items).missing.includes('Top'));});
test('required socks affect completeness',()=>{const result=generateOutfit(base(),'Business',DEFAULT_RULES.Business,profile,[],1);assert.deepEqual(result.missing,['Socks']);});
test('fixed seed yields reproducible explanations and choices',()=>{assert.deepEqual(run(seed.items),run(seed.items));});
test('wardrobe validator rejects malformed restores before persistence',()=>{const valid={version:1,items:seed.items,looks:[],subcategories:[],reference:seed.reference,profile,rules:DEFAULT_RULES};assert.equal(validateState(valid),valid);for(const patch of [{category:'Dress'},{src:'/media/../../server.mjs'},{src:'https://external.example/photo.jpg'},{role:'dress',category:'Bottom'},{modes:['anything']},{adjustments:{...DEFAULT_ADJUSTMENTS,crop:{x:.8,y:0,w:.5,h:1}}}]){const state=structuredClone(valid);Object.assign(state.items[0],patch);assert.throws(()=>validateState(state));}const stale=structuredClone(valid);stale.looks=[{id:'a',name:'Invalid',mode:'Casual',itemIds:['missing']}];assert.throws(()=>validateState(stale));});
