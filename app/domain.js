export const CATEGORIES = Object.freeze(['Cap', 'Top', 'Bottom', 'Socks', 'Shoes', 'Accessories']);
export const MODES = Object.freeze(['Casual', 'Sport', 'Business', 'Red carpet']);
export const DEFAULT_SUBCATEGORIES = [
  ...['Bucket hats','Durags','Beanies','Baseball caps'].map(path=>({category:'Cap',path})),
  ...['Shirts / Button-down','Blouses','Dresses / Casual','Dresses / Evening','Outerwear'].map(path=>({category:'Top',path})),
  ...['Pants / Slacks','Skirts','Leggings'].map(path=>({category:'Bottom',path})),
  ...['Dress socks','Athletic socks'].map(path=>({category:'Socks',path})),
  ...['Sneakers','Dress shoes','Boots','Sandals'].map(path=>({category:'Shoes',path})),
  ...['Ties / Neckties','Ties / Bow ties','Ties / Ascots','Belts','Glasses','Jewelry / Earrings','Jewelry / Necklaces','Jewelry / Brooches','Jewelry / Rings','Watches','Wristbands'].map(path=>({category:'Accessories',path}))
];
export const PALETTE = { Black:'#292929', White:'#ece8df', Gray:'#777974', 'Light gray':'#d5d7d4', Navy:'#343e5c', Blue:'#526c8f', Turquoise:'#40b5b0', Brown:'#745642', Tan:'#b19c78', Olive:'#737860', Green:'#426256', Burgundy:'#854a4b', Red:'#b64b40', Pink:'#ce929f', Purple:'#776081', Yellow:'#c5ab53', Orange:'#ce804f' };
export const DEFAULT_RULES = {
  Casual: { minFormality:1, maxFormality:3, maxPatterns:2, maxColors:3, requireSocks:false, includeLayer:false, includeAccessory:true, note:'Comfortable everyday pieces. Adjust for the place, weather, and how you want to feel.' },
  Sport: { minFormality:1, maxFormality:2, maxPatterns:2, maxColors:3, requireSocks:true, includeLayer:false, includeAccessory:false, note:'Choose activity-appropriate footwear and clothing. Confirm stretch, breathability, and moisture management yourself.' },
  Business: { minFormality:2, maxFormality:3, maxPatterns:1, maxColors:3, requireSocks:true, includeLayer:true, includeAccessory:true, note:'Business casual by default. A sport coat with separate trousers is not automatically a matching business suit.' },
  'Red carpet': { minFormality:4, maxFormality:5, maxPatterns:1, maxColors:2, requireSocks:false, includeLayer:false, includeAccessory:true, note:'Formal eveningwear. Confirm the invitation: a generated combination does not certify black-tie or any event’s dress code.' }
};
export const DEFAULT_PROFILE = { name:'My personal stylist', palette:'balanced', favoriteBias:4, adventure:3, warmth:1, silhouette:'either', preferredTags:[], avoidTags:[], ignoreSockPatterns:false, ignoreNeutralColors:false, notes:'' };
export const DEFAULT_ADJUSTMENTS = { exposure:0, contrast:0, saturation:0, temperature:0, tint:0, rotation:0, crop:null };
export const ACCESSORY_LABELS = Object.freeze({tie:'Tie',belt:'Belt',glasses:'Glasses',earrings:'Earrings',necklace:'Necklace',brooch:'Brooch',watch:'Watch',wristband:'Wristband',ring:'Ring',other:'Accessory'});
const accessoryMatchers = [
  ['tie', /\b(?:ties?|neckties?|bow\s*ties?|ascots?|neckwear)\b/i],
  ['belt', /\bbelts?\b/i],
  ['glasses', /\b(?:glasses|sunglasses|eyewear)\b/i],
  ['earrings', /\bearrings?\b/i],
  ['necklace', /\bnecklaces?\b/i],
  ['brooch', /\b(?:brooch(?:es)?|broach(?:es)?)\b/i],
  ['watch', /\bwatch(?:es)?\b/i],
  ['wristband', /\b(?:wrist\s*bands?|bracelets?)\b/i],
  ['ring', /\brings?\b/i]
];
export function accessoryType(item) {
  if(item.category!=='Accessories')return null;
  // The category path takes precedence over descriptive names and tags.
  for(const text of [item.subcategory,item.name,...(item.tags||[])]) {
    const match=accessoryMatchers.find(([,pattern])=>pattern.test(text||''));
    if(match)return match[0];
  }
  return 'other';
}
export function slotFor(item) {
  if (item.category==='Top') return item.role==='dress'?'dress':item.role==='outerwear'?'layer':'top';
  if (item.category==='Bottom') return item.role==='leggings'?'leggings':'bottom';
  return {Cap:'cap',Socks:'socks',Shoes:'shoes',Accessories:'accessory'}[item.category];
}
export function validateLocks(items, avoidTags=[]) {
  const errors=[]; const counts={}; const slots=items.map(slotFor);
  for (const item of items) {
    const s=slotFor(item); counts[s]=(counts[s]||0)+1;
    if (s!=='accessory' && counts[s]>1) errors.push(`Choose only one required ${s} piece.`);
    if (item.tags.some(t=>avoidTags.map(x=>x.toLowerCase()).includes(t.toLowerCase()))) errors.push(`${item.name} has a tag your stylist excludes. Remove that exclusion or unpin this piece.`);
  }
  if(slots.includes('dress')&&(slots.includes('top')||slots.includes('bottom'))) errors.push('A dress occupies Top and Bottom. Unpin the separate top or bottom; leggings can still be layered.');
  return [...new Set(errors)];
}
export const NEUTRAL_COLORS = Object.freeze(['Black','White','Gray','Light gray','Navy','Brown','Tan']);
const neutral = new Set(NEUTRAL_COLORS);
const countedColors=(colors,profile)=>colors.filter(c=>!(profile.ignoreNeutralColors===true&&neutral.has(c)));
export const itemColors=item=>[...new Set([item.color,item.secondaryColor].filter(Boolean))];
const countsTowardPatternLimit=(item,profile)=>item.pattern!=='Solid'&&!(profile.ignoreSockPatterns===true&&item.category==='Socks');
export function assessOutfit(items, mode, rules, profile) {
  const warnings=[]; const slots=items.map(slotFor); const missing=[];
  if(!slots.includes('dress')) {
    if(!slots.includes('top')) missing.push('Top');
    if(!slots.includes('bottom')&&!slots.includes('leggings')) missing.push('Bottom');
  }
  if(!slots.includes('shoes')) missing.push('Shoes');
  if(rules.requireSocks&&!slots.includes('socks')) missing.push('Socks');
  for(const item of items) {
    if(!item.modes.includes(mode)) warnings.push(`${item.name} is not marked for ${mode.toLowerCase()} looks.`);
    if(item.formality<rules.minFormality||item.formality>rules.maxFormality) warnings.push(`${item.name} is outside this mode’s preferred formality range.`);
  }
  const patterns=items.filter(i=>countsTowardPatternLimit(i,profile)).length;
  if(patterns>rules.maxPatterns) warnings.push(`${patterns} patterned pieces exceeds your preference of ${rules.maxPatterns}.`);
  const colors=[...new Set(items.flatMap(itemColors))];
  const limitedColors=countedColors(colors,profile);
  if(limitedColors.length>rules.maxColors) warnings.push(`${limitedColors.length} ${profile.ignoreNeutralColors?'non-neutral ':''}color families exceed your preference of ${rules.maxColors}.`);
  if(items.some(i=>!i.colorVerified)) warnings.push('Some color labels are provisional. Check them in daylight or in the photo studio.');
  if(mode==='Red carpet') warnings.push('Check the event invitation. Eveningwear and black-tie requirements vary.');
  for(const type of ['tie','belt','glasses','watch']) {
    if(items.filter(i=>accessoryType(i)===type).length>1)warnings.push(`Multiple ${ACCESSORY_LABELS[type].toLowerCase()} pieces are pinned. Check that you intend to wear them together.`);
  }
  const reasons=[];
  if(items.some(i=>i.favorite)) reasons.push('Includes pieces you have favorited.');
  if(patterns<=rules.maxPatterns) reasons.push(`Keeps pattern mixing within your ${rules.maxPatterns}-piece preference.`);
  if(profile.ignoreSockPatterns===true&&items.some(i=>i.category==='Socks'&&i.pattern!=='Solid')) reasons.push(profile.ignoreNeutralColors?'Sock patterns are excluded from your pattern limit. Sock colors follow your color-limit preference.':'Sock patterns are excluded from your pattern limit. Their colors still count.');
  if(profile.ignoreNeutralColors&&colors.some(c=>neutral.has(c))) reasons.push(`Neutral colors are excluded: ${limitedColors.length} of your ${rules.maxColors} color allowance used. All colors remain in the color story.`);
  if(limitedColors.length&&limitedColors.length<=rules.maxColors) reasons.push(`Builds around ${limitedColors.join(', ').toLowerCase()} within your color limit.`);
  if(items.some(i=>i.tags.some(t=>profile.preferredTags.includes(t)))) reasons.push('Brings in your preferred style tags.');
  if(slots.includes('dress')) reasons.push('One dress covers both Top and Bottom; layers stay optional.');
  const accessories=items.filter(i=>i.category==='Accessories');
  if(accessories.length>1)reasons.push(`Combines ${accessories.length} accessories: ${[...new Set(accessories.map(i=>ACCESSORY_LABELS[accessoryType(i)].toLowerCase()))].join(', ')}.`);
  return {missing,warnings,reasons,complete:missing.length===0};
}
export function generateOutfit(allItems, mode, rules, profile, lockedIds=[], seed=1) {
  let n=seed>>>0; const random=()=>{n=(n*1664525+1013904223)>>>0;return n/4294967296;};
  const selected=[...new Set(lockedIds)].map(id=>allItems.find(i=>i.id===id)).filter(Boolean);
  const errors=validateLocks(selected,profile.avoidTags);
  if(errors.length) return {items:selected,errors,missing:[],warnings:[],reasons:[],complete:false};
  const excluded=profile.avoidTags.map(s=>s.toLowerCase());
  const eligible=allItems.filter(i=>i.modes.includes(mode)&&i.formality>=rules.minFormality&&i.formality<=rules.maxFormality&&!i.tags.some(t=>excluded.includes(t.toLowerCase())));
  const has=s=>selected.some(i=>slotFor(i)===s);
  function pick(slot,type=null) {
    const matches=i=>slotFor(i)===slot&&(type===null||accessoryType(i)===type);
    if(selected.some(matches))return;
    const options=eligible.filter(i=>matches(i)&&!selected.some(s=>s.id===i.id));
    const colors=new Set(selected.flatMap(itemColors)); const patterns=selected.filter(i=>countsTowardPatternLimit(i,profile)).length;
    const limitColors=countedColors([...colors],profile);
    const rank=i=>{const pieceColors=itemColors(i),newColors=pieceColors.filter(c=>!colors.has(c)).length,newCountedColors=countedColors(pieceColors,profile).filter(c=>!colors.has(c)).length;return (i.favorite?profile.favoriteBias:0)+i.tags.filter(t=>profile.preferredTags.includes(t)).length*3
      +(profile.palette==='tonal'?6*(pieceColors.length-newColors)/pieceColors.length:profile.palette==='balanced'?(pieceColors.every(c=>neutral.has(c))?2:0):3*newColors/pieceColors.length)
      -(countsTowardPatternLimit(i,profile)&&patterns>=rules.maxPatterns?12:0)
      -(newCountedColors>0&&limitColors.length+newCountedColors>rules.maxColors?8:0)
      -Math.abs((i.warmth??1)-profile.warmth)*2+random()*(2+profile.adventure*2);};
    const scored=options.map(item=>({item,score:rank(item)})).sort((a,b)=>b.score-a.score);
    if(scored[0])selected.push(scored[0].item);
  }
  if(!has('top')&&!has('bottom')&&!has('dress')) {
    const dresses=eligible.some(i=>slotFor(i)==='dress');
    const separates=eligible.some(i=>slotFor(i)==='top')&&eligible.some(i=>['bottom','leggings'].includes(slotFor(i)));
    if(dresses&&(profile.silhouette==='dress'||!separates||(profile.silhouette==='either'&&random()>.6)))pick('dress');
  }
  if(!has('dress')){pick('top');if(!has('leggings'))pick('bottom');if(!has('bottom'))pick('leggings');}
  if(rules.includeLayer)pick('layer');
  if(rules.requireSocks)pick('socks');
  pick('shoes');
  if(rules.includeAccessory)for(const type of Object.keys(ACCESSORY_LABELS))pick('accessory',type);
  return {items:selected,errors:[],...assessOutfit(selected,mode,rules,profile)};
}
export function validateState(state) {
  if(!state||state.version!==1||!Array.isArray(state.items)||!Array.isArray(state.looks)||!state.profile||!state.rules||!Array.isArray(state.subcategories)) throw Error('This is not a valid StyleByFire wardrobe.');
  if(state.items.length>10000||state.looks.length>10000)throw Error('This wardrobe exceeds the local app limit.');
  const ids=new Set();
  for(const i of state.items) {
    if(typeof i.id!=='string'||ids.has(i.id)||typeof i.name!=='string'||!i.name.trim()||i.name.length>200||!CATEGORIES.includes(i.category)||!Array.isArray(i.tags)||!i.tags.every(t=>typeof t==='string')||!Array.isArray(i.modes)||!i.modes.every(m=>MODES.includes(m))||!PALETTE[i.color]||typeof i.subcategory!=='string'||!['base','outerwear','dress','leggings'].includes(i.role)||typeof i.pattern!=='string'||!Number.isFinite(i.formality)||i.formality<1||i.formality>5||!Number.isFinite(i.warmth)||i.warmth<0||i.warmth>2||typeof i.favorite!=='boolean'||typeof i.colorVerified!=='boolean'||!validSource(i.src))throw Error('A clothing item contains invalid fields.');
    if((i.role==='dress'||i.role==='outerwear')&&i.category!=='Top'||i.role==='leggings'&&i.category!=='Bottom')throw Error('A clothing layer is assigned to an incompatible category.');
    if(i.secondaryColor!==undefined&&i.secondaryColor!==''&&(typeof i.secondaryColor!=='string'||!Object.hasOwn(PALETTE,i.secondaryColor)))throw Error('Invalid secondary clothing color.');
    if(i.adjustments)validateAdjustments(i.adjustments);
    if(i.notes!==undefined&&typeof i.notes!=='string'||i.stylistNotes!==undefined&&typeof i.stylistNotes!=='string')throw Error('Clothing notes must be text.');
    if(i.description!==undefined&&(typeof i.description!=='string'||i.description.length>2000))throw Error('Clothing descriptions must be text under 2,000 characters.');
    for(const key of ['sourceUrl','sourceImageUrl'])if(i[key]!==undefined){let url;try{url=new URL(i[key]);}catch{throw Error('Invalid clothing source link.');}if(typeof i[key]!=='string'||i[key].length>4096||url.protocol!=='https:'||url.username||url.password)throw Error('Invalid clothing source link.');}
    if(i.sourceName!==undefined&&(typeof i.sourceName!=='string'||i.sourceName.length>200))throw Error('Invalid clothing source name.');
    ids.add(i.id);
  }
  for(const look of state.looks) if(typeof look.id!=='string'||typeof look.name!=='string'||!MODES.includes(look.mode)||!Array.isArray(look.itemIds)||!look.itemIds.every(id=>ids.has(id)))throw Error('A saved look refers to an invalid item.');
  for(const cat of state.subcategories) if(!cat||!CATEGORIES.includes(cat.category)||typeof cat.path!=='string')throw Error('Invalid subcategory.');
  const p=state.profile;
  if(p.ignoreNeutralColors!==undefined&&typeof p.ignoreNeutralColors!=='boolean')throw Error('Invalid neutral color preference.');
  if(p.ignoreSockPatterns!==undefined&&typeof p.ignoreSockPatterns!=='boolean')throw Error('Invalid sock pattern preference.');
  if(typeof p.name!=='string'||!['balanced','tonal','expressive'].includes(p.palette)||!['either','dress','separates'].includes(p.silhouette)||!Array.isArray(p.preferredTags)||!Array.isArray(p.avoidTags)||![...p.preferredTags,...p.avoidTags].every(t=>typeof t==='string')||typeof p.notes!=='string'||!Number.isFinite(p.favoriteBias)||p.favoriteBias<0||p.favoriteBias>10||!Number.isFinite(p.adventure)||p.adventure<0||p.adventure>10||!Number.isFinite(p.warmth)||p.warmth<0||p.warmth>2)throw Error('Invalid stylist preferences.');
  for(const mode of MODES){const r=state.rules[mode]; if(!r||![r.minFormality,r.maxFormality,r.maxPatterns,r.maxColors].every(Number.isInteger)||r.minFormality<1||r.maxFormality>5||r.minFormality>r.maxFormality||r.maxPatterns<0||r.maxPatterns>8||r.maxColors<1||r.maxColors>8||!['requireSocks','includeLayer','includeAccessory'].every(k=>typeof r[k]==='boolean')||typeof r.note!=='string')throw Error('Invalid style guidelines.');}
  if(state.reference&&!validSource(state.reference))throw Error('Invalid background reference.');
  if(state.inventoryPaths!==undefined&&(!Array.isArray(state.inventoryPaths)||!state.inventoryPaths.every(p=>typeof p==='string')))throw Error('Invalid inventory history.');
  return state;
}
export function validSource(src){return typeof src==='string'&&/^\/media\/(?:seed-[a-zA-Z0-9_-]+\.(?:jpg|png|webp)|[a-f0-9-]+\.(?:jpg|png|webp))$/.test(src);}
export function validateAdjustments(a){
  for(const [key,min,max] of [['exposure',-100,100],['contrast',-100,100],['saturation',-100,100],['temperature',-100,100],['tint',-100,100]])if(!Number.isFinite(a[key])||a[key]<min||a[key]>max)throw Error('Invalid photo adjustment.');
  if(![0,90,180,270].includes(a.rotation))throw Error('Invalid photo rotation.');
  if(a.crop&&(!['x','y','w','h'].every(k=>Number.isFinite(a.crop[k]))||a.crop.x<0||a.crop.y<0||a.crop.w<=0||a.crop.h<=0||a.crop.x+a.crop.w>1.001||a.crop.y+a.crop.h>1.001))throw Error('Invalid photo crop.');
}
