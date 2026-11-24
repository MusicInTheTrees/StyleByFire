import {CATEGORIES,slotFor,accessoryType,ACCESSORY_LABELS,outfitCandidates} from './domain.js';
import {manualOutfit} from './outfit-builder.js';
import {WEEK_DAYS} from './weekly-settings.js';
import {changeWeeklySelection,replaceWeeklyDay,reuseLimit} from './weekly-planner.js';

export function weeklyEditorMarkup(state,editor,{escape,photo,modalHead}){
  const plan=state.weeklyPlanner.plan,day=plan.days.find(day=>day.id===editor.dayId);
  const name=WEEK_DAYS.find(([id])=>id===day.id)[1];
  const items=editor.itemIds.map(id=>state.items.find(item=>item.id===id)).filter(Boolean);
  const target=items.find(item=>item.id===editor.replaceId);
  const assessment=manualOutfit(items,day.mode,state);
  let saveError='';try{replaceWeeklyDay(state,plan,day.id,editor.itemIds);}catch(error){saveError=error.message;}
  return `<section class="week-editor">${modalHead('EDIT YOUR WEEK',`Edit ${name}'s outfit`)}
    <div class="week-editor-body"><p class="week-editor-intro">${escape(day.mode)} · Changes apply to ${name} only.${day.locked?' This day is locked; your saved edits will stay locked.':' Lock the day afterward to keep it when regenerating.'}</p>
    <details class="week-current-pieces" ${editor.showCurrent?'open':''}><summary>${items.length} pieces selected · change or remove a piece</summary><div class="week-current-grid">${items.map(item=>`<div class="week-current-piece ${target?.id===item.id?'is-changing':''}">${photo(item)}<div><small>${escape(slotFor(item)==='accessory'?ACCESSORY_LABELS[accessoryType(item)]:slotFor(item))}</small><strong>${escape(item.name)}</strong><div class="button-row"><button class="text-button" data-week-change="${escape(item.id)}" aria-label="Replace ${escape(item.name)}">Change</button><button class="text-button" data-week-remove="${escape(item.id)}" aria-label="Remove ${escape(item.name)} from ${name}">Remove</button></div></div></div>`).join('')||'<p>No pieces selected yet. Choose pieces below.</p>'}</div></details>
    ${target?`<div class="week-swap-target">${photo(target)}<div><strong>Replace ${escape(target.name)}</strong><p>Choose its replacement below. Other pieces stay, except when a dress replaces a separate top and bottom.</p></div><button class="text-button" data-action="week-stop-swap">Cancel swap</button></div>`:'<p class="week-editor-help">Choose a piece to add it. A new piece replaces its clothing slot; accessories can be combined. Select a chosen piece again to remove it.</p>'}
    <div class="week-editor-filters"><label>Find a piece<input id="week-piece-search" value="${escape(editor.query)}" type="search" placeholder="Name, color, tag, or category"></label><label>Category<select id="week-piece-category">${['All',...CATEGORIES].map(category=>`<option value="${category}" ${editor.category===category?'selected':''}>${category==='All'?'All pieces':category}</option>`).join('')}</select></label></div>
    <p class="week-editor-help">Reuse counts use this saved plan's limits. Pieces outside ${escape(day.mode)} guidelines can be chosen manually; their style notes explain the tradeoffs.</p>
    <div id="week-piece-options" class="week-piece-options">${weeklyEditorOptions(state,editor,{escape,photo})}</div>
    <div class="week-edit-review"><strong>${assessment.complete?'All essential slots filled':'Missing: '+escape(assessment.missing.join(', '))}</strong>${saveError?`<p class="week-edit-error" role="alert">${escape(saveError)}</p>`:''}${assessment.warnings.length?`<details><summary>${assessment.warnings.length} style notes to review</summary><ul>${assessment.warnings.map(warning=>`<li>${escape(warning)}</li>`).join('')}</ul></details>`:''}</div></div>
    <div class="week-editor-footer"><p>Only Save changes updates the weekly plan.</p><div class="button-row"><button class="btn secondary" data-action="close-modal">Cancel</button><button class="btn primary" data-action="week-save-pieces" ${saveError?'disabled':''}>Save changes</button></div></div>
  </section>`;
}

export function weeklyEditorOptions(state,editor,{escape,photo}){
  const plan=state.weeklyPlanner.plan,day=plan.days.find(day=>day.id===editor.dayId);
  const items=editor.itemIds.map(id=>state.items.find(item=>item.id===id)).filter(Boolean);
  const eligible=new Set(outfitCandidates(state.items,day.mode,state.rules[day.mode],state.profile).map(item=>item.id));
  const others=new Map();
  for(const other of plan.days)if(other.id!==day.id)for(const id of other.itemIds)others.set(id,(others.get(id)||0)+1);
  const query=editor.query.trim().toLowerCase();
  const candidates=state.items.filter(item=>(editor.category==='All'||item.category===editor.category)&&[item.name,item.subcategory,item.color,item.secondaryColor,...item.tags].join(' ').toLowerCase().includes(query));
  return candidates.map(item=>{
    const selected=editor.itemIds.includes(item.id);
    let blocked='';
    try{
      const next=changeWeeklySelection(items,item,editor.replaceId);
      replaceWeeklyDay(state,plan,day.id,next.map(piece=>piece.id));
    }catch(error){blocked=error.message;}
    return `<button class="week-piece-choice ${selected?'is-selected':''}" data-week-pick="${escape(item.id)}" aria-pressed="${selected}" aria-label="${editor.replaceId?'Replace with':selected?'Remove':'Choose'} ${escape(item.name)}" ${blocked?'disabled':''}>
      ${photo(item)}<strong>${escape(item.name)}</strong><span>${selected?'Selected · ':''}${escape(item.category)} · ${escape(item.color)}</span><span>Other days: ${others.get(item.id)||0} · limit ${reuseLimit(item,plan.settings)}</span>
      ${blocked?`<small class="week-choice-blocked">${escape(blocked)}</small>`:!eligible.has(item.id)?'<small>Outside current styling guidelines</small>':''}
    </button>`;
  }).join('')||'<p class="week-editor-help">No pieces match. Try another category or search.</p>';
}
