import {validateState} from './domain.js';
import {defaultWeeklySettings} from './weekly-settings.js';

export function activeSavedWeek(state){return (state.savedWeeks||[]).find(w=>w.id===state.weeklyPlanner?.savedWeekId)||null;}
export function weekHasChanges(state,draft){
 const saved=activeSavedWeek(state);
 return !!saved&&(JSON.stringify(saved.settings)!==JSON.stringify(draft||state.weeklyPlanner.settings)||JSON.stringify(saved.plan)!==JSON.stringify(state.weeklyPlanner.plan));
}
export function changeSavedWeek(state,action,{id,name,newId,now=new Date().toISOString(),settings}={}){
 const next=structuredClone(state);next.savedWeeks??=[];
 const saved=next.savedWeeks.find(w=>w.id===id);
 if(['update','open','rename','delete'].includes(action)&&!saved)throw Error('This saved week is no longer available in your account.');
 if(['new','update','rename'].includes(action)){
  name=typeof name==='string'?name.trim():'';
  if(!name||name.length>100)throw Error('Give your week a name of 1–100 characters.');
 }
 if(action==='new'||action==='update'){
  if(!next.weeklyPlanner?.plan)throw Error('Generate a week before saving it.');
  if(action==='new'&&(!newId||next.savedWeeks.some(w=>w.id===newId)))throw Error('Choose a unique saved week ID.');
  const entry={id:action==='new'?newId:id,name,createdAt:saved?.createdAt||now,updatedAt:now,settings:structuredClone(settings||next.weeklyPlanner.settings),plan:structuredClone(next.weeklyPlanner.plan)};
  if(action==='new')next.savedWeeks.unshift(entry);else next.savedWeeks[next.savedWeeks.indexOf(saved)]=entry;
  next.weeklyPlanner.settings=structuredClone(entry.settings);next.weeklyPlanner.savedWeekId=entry.id;
 }else if(action==='open')next.weeklyPlanner={version:1,settings:structuredClone(saved.settings),plan:structuredClone(saved.plan),savedWeekId:saved.id};
 else if(action==='rename'){saved.name=name;saved.updatedAt=now;}
 else if(action==='delete'){
  next.savedWeeks=next.savedWeeks.filter(w=>w.id!==id);
  if(next.weeklyPlanner?.savedWeekId===id)delete next.weeklyPlanner.savedWeekId;
 }else if(action==='clear')next.weeklyPlanner={version:1,settings:defaultWeeklySettings(),plan:null};
 else throw Error('Unknown saved week action.');
 return validateState(next);
}

export function savedWeeksMarkup(state,draft,{escape}){
 const active=activeSavedWeek(state),plan=state.weeklyPlanner?.plan,weeks=state.savedWeeks||[];
 return `<section class="saved-weeks" aria-label="Saved weeks"><div class="saved-week-heading"><div><p class="eyebrow">YOUR WEEK LIBRARY</p><h2>${active?escape(active.name):'Keep a week you love.'}</h2><p>${active?(weekHasChanges(state,draft)?'Working changes are saved automatically. Choose Update saved week to replace this named copy.':'Viewing your saved week. Edit any day below, then update it or save a new copy.'):'Your current outfits autosave to this account. Save a named week to keep it when you generate another.'}</p></div><div class="button-row">${plan?`${active?'<button class="btn primary" data-action="week-update">Update saved week</button>':''}<button class="btn ${active?'secondary':'primary'}" data-action="week-save-new">${active?'Save as new week':'Save week'}</button><button class="btn secondary" data-action="week-new">Start new week</button>`:''}</div></div>
 <p class="field-note">Close the app and return anytime: the current week, day locks, and named weeks stay with your account on this computer.</p>
 ${weeks.length?`<div class="saved-week-grid">${weeks.map(w=>`<article class="saved-week-card ${w.id===active?.id?'active':''}"><h3>${escape(w.name)}</h3><p>${w.plan.days.length} days · ${escape([...new Set(w.plan.days.map(d=>d.mode))].join(', '))}</p><small>Updated ${escape(new Date(w.updatedAt).toLocaleDateString())}${w.id===active?.id?' · Open in planner':''}</small><div class="button-row"><button class="btn secondary" data-saved-week-open="${escape(w.id)}">Open / edit</button><button class="btn secondary" data-saved-week-rename="${escape(w.id)}">Rename</button><button class="btn secondary danger" data-saved-week-delete="${escape(w.id)}">Delete</button></div></article>`).join('')}</div>`:'<p class="saved-week-empty">No named weeks yet. Generate a week, then choose Save week.</p>'}</section>`;
}
