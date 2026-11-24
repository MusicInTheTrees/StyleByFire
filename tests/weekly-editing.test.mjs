import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PROFILE,DEFAULT_RULES,validateState,slotFor} from '../app/domain.js';
import {defaultWeeklySettings} from '../app/weekly-settings.js';
import {generateWeeklyPlan,setWeeklyDayLock,changeWeeklySelection,replaceWeeklyDay,weeklyPlanDetails,reuseLimit} from '../app/weekly-planner.js';
import {weeklySettingsFromForm,weeklyPage} from '../app/weekly-ui.js';
import {weeklyEditorMarkup,weeklyEditorOptions} from '../app/weekly-editor.js';

const piece=(id,category,extra={})=>({id,name:id,category,subcategory:category==='Bottom'?'Pants':'',role:'base',color:'Blue',colorVerified:true,pattern:'Solid',formality:2,warmth:1,tags:[],modes:['Business','Casual'],favorite:false,src:'/media/seed-test.jpg',...extra});
function fixture(){
  const state={version:1,items:[...Array.from({length:8},(_,n)=>piece('shirt-'+n,'Top')),
    ...Array.from({length:5},(_,n)=>piece('pants-'+n,'Bottom')),
    ...Array.from({length:8},(_,n)=>piece('socks-'+n,'Socks')),
    piece('shoes','Shoes'),piece('watch','Accessories',{subcategory:'Watches'}),piece('belt','Accessories',{subcategory:'Belts'}),piece('necktie','Accessories',{subcategory:'Ties'})],
    looks:[],subcategories:[],profile:{...structuredClone(DEFAULT_PROFILE),silhouette:'separates'},rules:structuredClone(DEFAULT_RULES)};
  const settings=defaultWeeklySettings();settings.days.forEach(day=>day.mode='Business');
  state.weeklyPlanner={version:1,settings,plan:generateWeeklyPlan(state,settings,7)};
  return state;
}
const pieces=(state,day)=>day.itemIds.map(id=>state.items.find(item=>item.id===id));
const assertLimits=(state,plan)=>{for(const entry of weeklyPlanDetails(state,plan).usage)assert.ok(entry.days.length<=reuseLimit(entry.item,plan.settings),entry.item.id);};
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const helpers={escape,photo:()=>'<img alt="fixture">',icon:()=>'',modalHead:(_,title)=>`<h2>${title}</h2>`};

test('locked Friday resources are reserved before Monday and never counted twice',()=>{
  const state=fixture();state.weeklyPlanner=setWeeklyDayLock(state.weeklyPlanner,'friday',true);
  const friday=structuredClone(state.weeklyPlanner.plan.days[4]);
  const shirt=pieces(state,friday).find(item=>item.category==='Top');
  const alternatives=new Set();
  for(const seed of [11,33,72]){
    const plan=generateWeeklyPlan(state,state.weeklyPlanner.settings,seed);
    assert.deepEqual(plan.days[4],friday);assertLimits(state,plan);
    assert.equal(plan.days.filter(day=>day.itemIds.includes(shirt.id)).length,1);
    assert.equal(weeklyPlanDetails(state,plan).completeDays,5);
    alternatives.add(JSON.stringify(plan.days.slice(0,4)));
  }
  assert.ok(alternatives.size>1);
});

test('multiple locked days reserve a repeated pair of pants and all locks survive regeneration',()=>{
  const state=fixture();
  for(const id of ['monday','tuesday','friday'])state.weeklyPlanner=setWeeklyDayLock(state.weeklyPlanner,id,true);
  const before=structuredClone(state.weeklyPlanner.plan);
  const result=generateWeeklyPlan(state,state.weeklyPlanner.settings,22);
  for(const day of before.days.filter(day=>day.locked))assert.deepEqual(result.days.find(next=>next.id===day.id),day);
  assertLimits(state,result);assert.equal(weeklyPlanDetails(state,result).completeDays,5);
  for(const day of state.weeklyPlanner.plan.days)day.locked=true;
  assert.deepEqual(generateWeeklyPlan(state,state.weeklyPlanner.settings,999).days,state.weeklyPlanner.plan.days);
});

test('a locked Random day keeps its resolved mode and manually edited pieces',()=>{
  const state=fixture();state.weeklyPlanner.settings.days[4].mode='Random';
  state.weeklyPlanner.plan=generateWeeklyPlan(state,state.weeklyPlanner.settings,3);
  state.weeklyPlanner.plan.days[4].edited=true;
  state.weeklyPlanner=setWeeklyDayLock(state.weeklyPlanner,'friday',true);
  const friday=structuredClone(state.weeklyPlanner.plan.days[4]);
  for(const seed of [1,2,3,4])assert.deepEqual(generateWeeklyPlan(state,state.weeklyPlanner.settings,seed).days[4],friday);
});

test('conflicting limits or day settings explain the problem without changing a locked plan',()=>{
  const state=fixture();for(const id of ['monday','tuesday'])state.weeklyPlanner=setWeeklyDayLock(state.weeklyPlanner,id,true);
  const before=structuredClone(state);
  const limits=structuredClone(state.weeklyPlanner.settings);limits.reuse.pants.maxDays=1;
  assert.throws(()=>generateWeeklyPlan(state,limits,42),/2 locked days.*1-day limit/);
  const off=structuredClone(state.weeklyPlanner.settings);off.days[0].enabled=false;
  assert.throws(()=>generateWeeklyPlan(state,off,42),/Monday is locked/);
  const mode=structuredClone(state.weeklyPlanner.settings);mode.days[0].mode='Casual';
  assert.throws(()=>generateWeeklyPlan(state,mode,42),/Monday is locked/);
  assert.deepEqual(state,before);
});

test('locking aligns only that day to the displayed plan and disabled form controls keep their values',()=>{
  const state=fixture(),planner=state.weeklyPlanner;planner.settings.days[0]={id:'monday',enabled:false,mode:'Red carpet'};planner.settings.days[1].mode='Casual';
  const locked=setWeeklyDayLock(planner,'monday',true);
  assert.deepEqual(locked.settings.days[0],{id:'monday',enabled:true,mode:'Business'});assert.equal(locked.settings.days[1].mode,'Casual');assert.equal(planner.settings.days[0].enabled,false);
  const parsed=weeklySettingsFromForm(new FormData(),locked.settings,locked.plan);
  assert.equal(parsed.days[0].enabled,true);assert.equal(parsed.days[0].mode,'Business');assert.equal(parsed.days[1].enabled,false);
  const unlocked=setWeeklyDayLock(locked,'monday',false);assert.equal(unlocked.plan.days[0].locked,false);assert.deepEqual(unlocked.plan.days[0].itemIds,locked.plan.days[0].itemIds);
});

test('manual shirt replacement changes only one day and keeps its existing lock',()=>{
  const state=fixture();state.weeklyPlanner=setWeeklyDayLock(state.weeklyPlanner,'monday',true);
  const plan=state.weeklyPlanner.plan,before=structuredClone(plan),day=plan.days[0];
  const unused=state.items.find(item=>item.category==='Top'&&!plan.days.some(day=>day.itemIds.includes(item.id)));
  const original=pieces(state,day).find(item=>item.category==='Top');
  const nextItems=changeWeeklySelection(pieces(state,day),unused,original.id);
  const next=replaceWeeklyDay(state,plan,'monday',nextItems.map(item=>item.id));
  assert.ok(next.days[0].itemIds.includes(unused.id));assert.ok(!next.days[0].itemIds.includes(original.id));assert.equal(next.days[0].locked,true);assert.equal(next.days[0].edited,true);
  assert.deepEqual(next.days.slice(1),plan.days.slice(1));assert.deepEqual(plan,before);assertLimits(state,next);
  state.weeklyPlanner.plan=next;
  assert.deepEqual(generateWeeklyPlan(state,state.weeklyPlanner.settings,100).days[0],next.days[0]);
});

test('accessory swaps preserve other accessories; dresses replace separates while retaining leggings',()=>{
  const watch=piece('new-watch','Accessories',{subcategory:'Watches'}),oldWatch=piece('old-watch','Accessories',{subcategory:'Watches'}),belt=piece('belt','Accessories',{subcategory:'Belts'}),tie=piece('tie','Accessories',{subcategory:'Ties'});
  assert.deepEqual(changeWeeklySelection([oldWatch,belt,tie],watch,oldWatch.id).map(item=>item.id),['belt','tie','new-watch']);
  assert.throws(()=>changeWeeklySelection([oldWatch,belt],belt,oldWatch.id),/already in this outfit/);
  assert.deepEqual(changeWeeklySelection([oldWatch,belt],oldWatch,oldWatch.id),[oldWatch,belt]);
  const top=piece('top','Top'),bottom=piece('bottom','Bottom'),leggings=piece('leggings','Bottom',{role:'leggings'}),dress=piece('dress','Top',{role:'dress'});
  const replaced=changeWeeklySelection([top,bottom,leggings,belt],dress,top.id);
  assert.deepEqual(replaced.map(slotFor),['leggings','accessory','dress']);
});

test('manual changes reject additional overuse, foreign items, unavailable pieces, and slot conflicts',()=>{
  const state=fixture(),plan=state.weeklyPlanner.plan,day=plan.days[0],before=structuredClone(plan);
  const mondayTop=pieces(state,day).find(item=>item.category==='Top');
  const fridayTop=pieces(state,plan.days[4]).find(item=>item.category==='Top');
  const overused=changeWeeklySelection(pieces(state,day),fridayTop,mondayTop.id);
  assert.throws(()=>replaceWeeklyDay(state,plan,day.id,overused.map(item=>item.id)),/used on 2 days.*limit is 1/);
  assert.throws(()=>replaceWeeklyDay(state,plan,day.id,[...day.itemIds,'foreign']),/no longer in your wardrobe/);
  assert.throws(()=>replaceWeeklyDay(state,plan,day.id,[...day.itemIds,day.itemIds[0]]),/different pieces/);
  const unavailable=piece('unavailable','Top',{availability:'laundry'});state.items.push(unavailable);
  assert.throws(()=>replaceWeeklyDay(state,plan,day.id,[...day.itemIds.filter(id=>id!==mondayTop.id),unavailable.id]),/laundry/);
  assert.throws(()=>replaceWeeklyDay(state,plan,day.id,[...day.itemIds,fridayTop.id]),/only one required top/);
  assert.deepEqual(plan,before);
});

test('manual outfits can be incomplete or outside the style rules and keep clear warnings',()=>{
  const state=fixture(),plan=state.weeklyPlanner.plan,day=plan.days[0];
  const manual=piece('manual','Top',{modes:['Casual'],tags:['itchy']});state.items.push(manual);state.profile.avoidTags=['itchy'];
  const original=pieces(state,day).find(item=>item.category==='Top');
  const next=replaceWeeklyDay(state,plan,day.id,changeWeeklySelection(pieces(state,day),manual,original.id).map(item=>item.id));
  let details=weeklyPlanDetails(state,next).days[0];assert.ok(details.warnings.some(warning=>warning.includes('not marked')));assert.ok(details.warnings.some(warning=>warning.includes('excludes tags')));
  next.days[0].locked=true;const partial=replaceWeeklyDay(state,next,day.id,[]);details=weeklyPlanDetails(state,partial).days[0];
  assert.equal(details.complete,false);assert.ok(details.warnings.some(warning=>warning.includes('edited outfit')));assert.ok(details.warnings.some(warning=>warning.includes('will not fill')));
});

test('locks preserve unavailable pieces with warnings rather than silently replacing them',()=>{
  const state=fixture();state.weeklyPlanner=setWeeklyDayLock(state.weeklyPlanner,'friday',true);
  const day=state.weeklyPlanner.plan.days[4],top=pieces(state,day).find(item=>item.category==='Top');top.availability='laundry';
  const plan=generateWeeklyPlan(state,state.weeklyPlanner.settings,60);assert.deepEqual(plan.days[4],day);
  assert.ok(weeklyPlanDetails(state,plan).days[4].warnings.some(warning=>warning.includes('laundry')));
});

test('editing and lock flags round-trip through validation and malformed flags are rejected',()=>{
  const state=fixture();state.weeklyPlanner.plan.days[0].edited=true;state.weeklyPlanner=setWeeklyDayLock(state.weeklyPlanner,'monday',true);
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))),state);
  for(const key of ['locked','edited'])for(const value of ['true',1,null]){const invalid=structuredClone(state);invalid.weeklyPlanner.plan.days[0][key]=value;assert.throws(()=>validateState(invalid),/lock or editing preference/);}
});

test('weekly editor exposes swapping, usage limits and escaped labels; locked cards expose unlock',()=>{
  const state=fixture();state.weeklyPlanner=setWeeklyDayLock(state.weeklyPlanner,'monday',true);
  const day=state.weeklyPlanner.plan.days[0],top=pieces(state,day).find(item=>item.category==='Top');top.name='<script>bad</script>';
  const editor={dayId:'monday',itemIds:[...day.itemIds],replaceId:top.id,category:'Top',query:'',showCurrent:false};
  const markup=weeklyEditorMarkup(state,editor,helpers);assert.ok(markup.includes('&lt;script&gt;bad&lt;/script&gt;'));assert.ok(!markup.includes('<script>'));assert.ok(markup.includes('saved edits will stay locked'));assert.ok(markup.includes('Save changes'));
  const options=weeklyEditorOptions(state,editor,helpers);assert.ok(options.includes('disabled'));assert.ok(options.includes('Other days:'));assert.ok(options.includes('limit is 1'));
  const page=weeklyPage(state,null,helpers);assert.ok(page.includes('Unlock Monday outfit'));assert.ok(page.includes('Edit Monday pieces'));assert.ok(page.includes('Regenerate unlocked days'));
});
