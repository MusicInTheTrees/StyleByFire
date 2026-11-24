import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PROFILE,DEFAULT_RULES,MODES,slotFor,validateState} from '../app/domain.js';
import {defaultWeeklySettings,REUSE_GROUPS,WEEK_DAYS} from '../app/weekly-settings.js';
import {generateWeeklyPlan,weeklyPlanDetails,reuseGroup,reuseLimit} from '../app/weekly-planner.js';
import {weeklySettingsFromForm,weeklyPage} from '../app/weekly-ui.js';

const piece=(id,category,extra={})=>({id,name:id,category,subcategory:'',role:'base',color:'Navy',colorVerified:true,pattern:'Solid',formality:2,warmth:1,tags:[],modes:['Casual','Business','Sport'],favorite:false,src:'/media/seed-test.jpg',...extra});
function wardrobe(){
  return {version:1,items:[...Array.from({length:7},(_,n)=>piece('shirt-'+n,'Top')),
    ...Array.from({length:5},(_,n)=>piece('pants-'+n,'Bottom',{subcategory:'Pants / Slacks'})),
    ...Array.from({length:7},(_,n)=>piece('socks-'+n,'Socks')),
    piece('shoes','Shoes'),piece('belt','Accessories',{subcategory:'Belts'}),piece('watch','Accessories',{subcategory:'Watches'})],
    looks:[],subcategories:[],rules:structuredClone(DEFAULT_RULES),profile:{...structuredClone(DEFAULT_PROFILE),silhouette:'separates'}};
}
function weekdays(mode='Business'){
  const settings=defaultWeeklySettings();settings.days.forEach(day=>day.mode=mode);return settings;
}
function assertCaps(state,plan){
  const details=weeklyPlanDetails(state,plan);
  for(const entry of details.usage)assert.ok(entry.days.length<=reuseLimit(entry.item,plan.settings),entry.item.name);
  for(const day of details.days){
    assert.equal(new Set(day.itemIds).size,day.itemIds.length);
    for(const item of day.items){assert.ok(item.modes.includes(day.mode));assert.ok(item.formality>=state.rules[day.mode].minFormality&&item.formality<=state.rules[day.mode].maxFormality);}
  }
  return details;
}

test('Monday–Friday uses three pairs of pants, including two consecutive two-day pairs',()=>{
  for(const seed of [1,2,17,42,583]){
    const state=wardrobe(),settings=weekdays();
    const plan=generateWeeklyPlan(state,settings,seed),details=assertCaps(state,plan);
    assert.equal(details.completeDays,5);
    assert.deepEqual(plan.days.map(day=>day.id),WEEK_DAYS.slice(0,5).map(([id])=>id));
    const pants=details.usage.filter(entry=>reuseGroup(entry.item)==='pants');
    assert.deepEqual(pants.map(entry=>entry.days.length).sort(),[1,2,2]);
    const ids=details.days.map(day=>day.items.find(item=>reuseGroup(item)==='pants').id);
    assert.equal(ids[0],ids[1]);assert.equal(ids[2],ids[3]);assert.notEqual(ids[1],ids[2]);assert.notEqual(ids[3],ids[4]);
    assert.equal(details.usage.find(entry=>entry.item.id==='shoes').days.length,5);
    assert.equal(details.usage.find(entry=>entry.item.id==='watch').days.length,5);
    assert.ok(details.usage.filter(entry=>entry.item.category==='Top').every(entry=>entry.days.length===1));
  }
});

test('limits apply to each accessory, and disabled reuse means one wear per item',()=>{
  const state=wardrobe(),settings=weekdays();settings.reuse.accessories={enabled:true,maxDays:2};
  state.items.push(piece('wallet','Accessories',{subcategory:'Wallets'}),piece('scarf','Accessories',{subcategory:'Scarves'}));
  const details=assertCaps(state,generateWeeklyPlan(state,settings,3));
  for(const id of ['belt','watch','wallet','scarf'])assert.equal(details.usage.find(entry=>entry.item.id===id).days.length,2);
  settings.reuse.pants.enabled=false;settings.reuse.pants.maxDays=7;
  const single=assertCaps(state,generateWeeklyPlan(state,settings,3));
  assert.equal(single.usage.filter(entry=>reuseGroup(entry.item)==='pants').length,5);
});

test('per-day styles, disabled days, and random mode survive in the saved snapshot',()=>{
  const state=wardrobe(),settings=defaultWeeklySettings();
  state.items.push(piece('formal-shirt','Top',{formality:4,modes:['Red carpet']}),piece('formal-pants','Bottom',{formality:4,modes:['Red carpet'],subcategory:'Pants'}),piece('formal-shoes','Shoes',{formality:4,modes:['Red carpet']}));
  settings.days[5].enabled=true;settings.days[6].enabled=true;
  const plan=generateWeeklyPlan(state,settings,9),details=assertCaps(state,plan);
  assert.deepEqual(plan.days.slice(0,4).map(day=>day.mode),['Business','Business','Business','Red carpet']);
  assert.ok(MODES.includes(plan.days[4].mode));assert.equal(plan.settings.days[4].mode,'Random');
  assert.deepEqual(plan.days.slice(5).map(day=>day.mode),['Sport','Sport']);
  assert.equal(details.completeDays,7);
  settings.days[3].enabled=false;assert.equal(plan.settings.days[3].enabled,true);
});

test('search reserves scarce versatile clothing for a later mode',()=>{
  const state=wardrobe(),settings=weekdays('Casual');settings.days.forEach((day,index)=>day.enabled=index<2);settings.days[1].mode='Business';
  state.items=state.items.filter(item=>item.category!=='Top');
  state.items.push(piece('casual-only','Top',{modes:['Casual']}),piece('versatile-favorite','Top',{modes:['Casual','Business'],favorite:true}));
  for(const seed of [1,10,30]){
    const details=assertCaps(state,generateWeeklyPlan(state,settings,seed));
    assert.equal(details.completeDays,2);assert.ok(details.days[0].itemIds.includes('casual-only'));assert.ok(details.days[1].itemIds.includes('versatile-favorite'));
  }
});

test('insufficient clothing leaves visible gaps without exceeding hard reuse limits',()=>{
  const state=wardrobe(),settings=weekdays();state.items=state.items.filter(item=>reuseGroup(item)!=='pants'||item.id==='pants-0');
  const details=assertCaps(state,generateWeeklyPlan(state,settings,5));
  assert.equal(details.completeDays,2);assert.equal(details.days.filter(day=>day.missing.includes('Bottom')).length,3);
  assert.ok(details.days.find(day=>!day.complete).warnings.some(warning=>warning.includes('weekly limits')));
});

test('unavailable pieces and excluded tags are never used to fill a shortage',()=>{
  const state=wardrobe(),settings=weekdays();state.items=state.items.filter(item=>item.category!=='Top');
  state.items.push(piece('laundry','Top',{availability:'laundry'}),piece('repair','Top',{availability:'repair'}),piece('archive','Top',{availability:'archived'}),piece('excluded','Top',{tags:['WOOL']}));state.profile.avoidTags=['wool'];
  const details=assertCaps(state,generateWeeklyPlan(state,settings,1));
  assert.equal(details.completeDays,0);assert.ok(details.days.every(day=>day.missing.includes('Top')));
});

test('dress, leggings, cap, outerwear, and category paths get independent limits',()=>{
  const settings=weekdays('Casual'),state=wardrobe();settings.days.forEach((day,index)=>day.enabled=index<3);settings.reuse.dress={enabled:true,maxDays:2};
  state.profile.silhouette='dress';state.items=state.items.filter(item=>!['Top','Bottom'].includes(item.category));
  state.items.push(piece('dress','Top',{role:'dress'}),piece('cap','Cap'),piece('leggings','Bottom',{role:'leggings'}));
  const details=assertCaps(state,generateWeeklyPlan(state,settings,1));
  assert.equal(details.completeDays,2);assert.equal(details.usage.find(entry=>entry.item.id==='dress').days.length,2);
  for(const day of details.days.filter(day=>day.itemIds.includes('dress')))assert.ok(day.items.every(item=>!['top','bottom'].includes(slotFor(item))));
  assert.equal(reuseGroup(piece('Pants print skirt','Bottom',{subcategory:'Skirts'})),'bottom');
  assert.equal(reuseGroup(piece('Denim','Bottom',{subcategory:'Jeans'})),'pants');
  assert.equal(reuseGroup(piece('layer','Top',{role:'outerwear'})),'layer');
  assert.equal(reuseGroup(piece('leggings','Bottom',{role:'leggings'})),'leggings');
  assert.equal(details.usage.find(entry=>entry.item.id==='cap').days.length,3);
});

test('sparse days do not count as consecutive and cannot reset the weekly cap',()=>{
  const settings=weekdays(),state=wardrobe();settings.days.forEach((day,index)=>day.enabled=[0,2,4].includes(index));
  const details=assertCaps(state,generateWeeklyPlan(state,settings,17));assert.equal(details.completeDays,3);
  assert.deepEqual(details.days.map(day=>day.id),['monday','wednesday','friday']);
  assert.equal(details.usage.filter(entry=>reuseGroup(entry.item)==='pants').length,2);
});

test('all days off is a valid saved preference, but generation explains what to enable',()=>{
  const state=wardrobe(),settings=weekdays();settings.days.forEach(day=>day.enabled=false);
  state.weeklyPlanner={version:1,settings,plan:null};assert.equal(validateState(state),state);
  assert.throws(()=>generateWeeklyPlan(state,settings,1),/Turn on at least one day/);
});

test('saved plans round-trip with backups, keep current assessments, and reject invalid state',()=>{
  const state=wardrobe(),settings=weekdays();const before=structuredClone(state);
  const plan=generateWeeklyPlan(state,settings,77);assert.deepEqual(state,before);
  state.weeklyPlanner={version:1,settings,plan};assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))),state);
  const id=plan.days[0].itemIds[0];state.items.find(item=>item.id===id).availability='laundry';
  assert.ok(weeklyPlanDetails(state,plan).days[0].warnings.some(warning=>warning.includes('laundry')));
  for(const mutate of [
    s=>s.weeklyPlanner.settings.reuse.pants.maxDays=8,
    s=>s.weeklyPlanner.settings.days[0].enabled='false',
    s=>s.weeklyPlanner.plan.days[0].itemIds.push('another-account-item'),
    s=>s.weeklyPlanner.plan.days[0].itemIds.push(s.weeklyPlanner.plan.days[0].itemIds[0]),
    s=>s.weeklyPlanner.plan.days[0].mode='Random',
    s=>s.weeklyPlanner.plan.days[0].mode='Red carpet',
    s=>s.weeklyPlanner.plan.days.push(s.weeklyPlanner.plan.days[0]),
    s=>s.weeklyPlanner.plan.generatedAt='yesterday'
  ]){const invalid=structuredClone(state);mutate(invalid);assert.throws(()=>validateState(invalid));}
});

test('weekly form preserves disabled choices and shows escaped clothing names and every accessory',()=>{
  const previous=defaultWeeklySettings(),data=new FormData();data.set('day-monday','on');data.set('mode-monday','Casual');data.set('reuse-pants','on');data.set('limit-pants','3');
  const settings=weeklySettingsFromForm(data,previous);assert.equal(settings.days[0].mode,'Casual');assert.equal(settings.days[1].mode,'Business');assert.equal(settings.days[1].enabled,false);assert.equal(settings.reuse.pants.maxDays,3);assert.equal(settings.reuse.shoes.maxDays,7);assert.equal(settings.reuse.shoes.enabled,false);
  const state=wardrobe();state.items.find(item=>item.id==='watch').name='<script>unsafe</script>';
  state.weeklyPlanner={version:1,settings,plan:generateWeeklyPlan(state,settings,3)};
  const escape=value=>String(value).replaceAll('<','&lt;').replaceAll('>','&gt;');
  const html=weeklyPage(state,null,{escape,photo:()=>'<img alt="fixture">',icon:()=>''});
  assert.ok(html.includes('&lt;script&gt;unsafe&lt;/script&gt;'));assert.ok(!html.includes('<script>unsafe'));
  assert.ok(html.includes('Watch'));assert.ok(html.includes('Belt'));assert.ok(html.includes('Open in outfit designer'));
  assert.equal(REUSE_GROUPS.length,Object.keys(settings.reuse).length);
});
