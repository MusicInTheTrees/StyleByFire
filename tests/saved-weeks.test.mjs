import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PROFILE,DEFAULT_RULES,validateState} from '../app/domain.js';
import {defaultWeeklySettings} from '../app/weekly-settings.js';
import {generateWeeklyPlan,setWeeklyDayLock} from '../app/weekly-planner.js';
import {changeSavedWeek,weekHasChanges,savedWeeksMarkup} from '../app/saved-weeks.js';
const now='2026-11-24T12:00:00Z';
function fixture(){const state={version:1,items:[],looks:[],subcategories:[],profile:structuredClone(DEFAULT_PROFILE),rules:structuredClone(DEFAULT_RULES)};const settings=defaultWeeklySettings();state.weeklyPlanner={version:1,settings,plan:generateWeeklyPlan(state,settings,42)};return state;}
const save=s=>changeSavedWeek(s,'new',{newId:'week-a',name:'First week',now});
test('named weeks survive JSON reload and keep isolated copies of days, modes, settings and locks',()=>{
 const original=fixture();original.weeklyPlanner=setWeeklyDayLock(original.weeklyPlanner,'monday',true);
 const saved=save(original),reloaded=validateState(JSON.parse(JSON.stringify(saved)));
 assert.equal(reloaded.savedWeeks.length,1);assert.equal(reloaded.weeklyPlanner.savedWeekId,'week-a');
 reloaded.weeklyPlanner.plan.days[0].locked=false;assert.equal(reloaded.savedWeeks[0].plan.days[0].locked,true);
 assert.equal(original.savedWeeks,undefined);assert.equal(weekHasChanges(reloaded),true);
 const opened=changeSavedWeek(reloaded,'open',{id:'week-a'});assert.equal(opened.weeklyPlanner.plan.days[0].locked,true);assert.equal(weekHasChanges(opened),false);
});
test('overwrite preserves identity and creation date; save as new preserves the original',()=>{
 let s=save(fixture());const first=structuredClone(s.savedWeeks[0]);s.weeklyPlanner.plan.days[0].edited=true;
 const copy=changeSavedWeek(s,'new',{newId:'week-b',name:'Second week',now:'2026-11-25T12:00:00Z'});
 assert.deepEqual(copy.savedWeeks.find(w=>w.id==='week-a'),first);assert.equal(copy.weeklyPlanner.savedWeekId,'week-b');
 const updated=changeSavedWeek(s,'update',{id:'week-a',name:'Revised week',now:'2026-11-26T12:00:00Z'});
 assert.equal(updated.savedWeeks.length,1);assert.equal(updated.savedWeeks[0].createdAt,now);assert.equal(updated.savedWeeks[0].plan.days[0].edited,true);assert.equal(weekHasChanges(updated),false);
});
test('rename, delete and new week have distinct effects without losing library copies',()=>{
 const s=save(fixture()),renamed=changeSavedWeek(s,'rename',{id:'week-a',name:'Travel week',now});
 assert.deepEqual(renamed.weeklyPlanner,s.weeklyPlanner);assert.equal(renamed.savedWeeks[0].name,'Travel week');
 const deleted=changeSavedWeek(renamed,'delete',{id:'week-a'});assert.equal(deleted.savedWeeks.length,0);assert.deepEqual(deleted.weeklyPlanner.plan,s.weeklyPlanner.plan);assert.equal(deleted.weeklyPlanner.savedWeekId,undefined);
 const cleared=changeSavedWeek(s,'clear');assert.equal(cleared.weeklyPlanner.plan,null);assert.deepEqual(cleared.savedWeeks,s.savedWeeks);
});
test('saved weeks reject invalid, cross-account and stale references without mutating inputs',()=>{
 const s=save(fixture()),before=structuredClone(s);
 for(const action of ['update','open','rename','delete'])assert.throws(()=>changeSavedWeek(s,action,{id:'other-account',name:'Test'}));
 assert.throws(()=>changeSavedWeek(s,'new',{newId:'week-a',name:'Copy'}));assert.throws(()=>changeSavedWeek(s,'update',{id:'week-a',name:' '}));assert.deepEqual(s,before);
 for(const mutate of [x=>x.savedWeeks.push(structuredClone(x.savedWeeks[0])),x=>x.savedWeeks[0].plan.days[0].itemIds.push('missing'),x=>x.savedWeeks[0].createdAt='never',x=>x.weeklyPlanner.savedWeekId='absent',x=>x.savedWeeks[0].plan=null]){const invalid=structuredClone(s);mutate(invalid);assert.throws(()=>validateState(invalid));}
});
test('library displays escaped names and separate update, copy, open, rename and delete controls',()=>{
 const s=save(fixture());s.savedWeeks[0].name='<script>';
 const html=savedWeeksMarkup(s,null,{escape:v=>String(v).replaceAll('<','&lt;').replaceAll('>','&gt;')});
 assert.ok(!html.includes('<script>'));for(const label of ['Update saved week','Save as new week','Open / edit','Rename','Delete'])assert.ok(html.includes(label));
});
