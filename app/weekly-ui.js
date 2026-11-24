import {MODES,slotFor,accessoryType,ACCESSORY_LABELS} from './domain.js';
import {WEEK_DAYS,REUSE_GROUPS,defaultWeeklySettings} from './weekly-settings.js';
import {weeklyPlanDetails,weeklyReuseText,reuseGroup} from './weekly-planner.js';

export function weeklySettingsFromForm(data,previous,plan){
  const locked=new Set((plan?.days||[]).filter(day=>day.locked).map(day=>day.id));
  return {
    days:WEEK_DAYS.map(([id],index)=>locked.has(id)?{id,enabled:true,mode:plan.settings.days[index].mode}:{id,enabled:data.has('day-'+id),mode:data.get('mode-'+id)||previous.days[index].mode}),
    reuse:Object.fromEntries(REUSE_GROUPS.map(([id])=>[id,{enabled:data.has('reuse-'+id),maxDays:Number(data.get('limit-'+id)||previous.reuse[id].maxDays)}])),
    preferConsecutive:data.has('preferConsecutive')
  };
}
const modeName=mode=>mode==='Sport'?'Sport / athletic':mode;

export function weeklyPage(state,draft,{escape,photo,icon}){
  const settings=draft||state.weeklyPlanner?.settings||defaultWeeklySettings();
  const plan=state.weeklyPlanner?.plan;
  const details=plan?weeklyPlanDetails(state,plan):null;
  const lockedDays=new Set((plan?.days||[]).filter(day=>day.locked).map(day=>day.id));
  const enabled=settings.days.filter(day=>day.enabled).length;
  const dirty=JSON.stringify(settings)!==JSON.stringify(state.weeklyPlanner?.settings||defaultWeeklySettings());
  const stale=plan&&JSON.stringify(settings)!==JSON.stringify(plan.settings);
  const reused=details?.usage.filter(entry=>entry.days.length>1)||[];
  const pants=details?.usage.filter(entry=>reuseGroup(entry.item)==='pants').length||0;
  function dayCard([id,name]){
    const day=details.days.find(day=>day.id===id);
    if(!day)return `<article class="week-outfit week-off"><p class="eyebrow">${name}</p><h3>A day off.</h3><p>No outfit planned.</p></article>`;
    const mainOrder=['dress','top','bottom','leggings','shoes'];
    const main=day.items.filter(item=>mainOrder.includes(slotFor(item))).sort((a,b)=>mainOrder.indexOf(slotFor(a))-mainOrder.indexOf(slotFor(b)));
    return `<article class="week-outfit ${day.locked?'week-is-locked':''}" id="week-${id}" aria-label="${name} outfit">
      <header><div><p class="eyebrow">${name}</p><h2>${escape(modeName(day.mode))}</h2>${plan.settings.days.find(d=>d.id===id).mode==='Random'?'<span class="week-random">Random pick</span>':''}</div><span class="week-status ${day.complete?'':'incomplete'}">${day.complete?'Slots filled':'Needs pieces'}</span></header>
      <div class="week-card-actions"><button class="btn secondary" data-week-edit="${id}" aria-label="Edit ${name} pieces">Edit pieces</button><button class="btn ${day.locked?'primary':'secondary'}" data-week-lock="${id}" aria-pressed="${!!day.locked}" aria-label="${day.locked?'Unlock':'Lock'} ${name} outfit">${icon('lock',14)} ${day.locked?'Locked':'Lock day'}</button></div>
      ${day.locked?'<p class="week-lock-note">Kept when you regenerate.</p>':day.edited?'<p class="week-lock-note">Hand-picked · lock to keep during regeneration.</p>':''}
      <div id="week-preview-${id}"></div>
      <div class="week-collage">${main.map(item=>`<div><button class="week-photo-edit" data-week-edit="${id}" data-week-replace="${escape(item.id)}" aria-label="Change ${escape(item.name)} for ${name}">${photo(item)}</button><span>${escape(item.name)}</span></div>`).join('')||'<p>No suitable pieces for this day.</p>'}</div>
      ${day.missing.length?`<p class="week-missing">Missing: ${escape(day.missing.join(', '))}</p>`:''}
      <details class="week-pieces"><summary>All ${day.items.length} pieces & style notes</summary><ul>${day.items.map(item=>{
        const entry=details.usage.find(entry=>entry.item.id===item.id);
        const label=slotFor(item)==='accessory'?ACCESSORY_LABELS[accessoryType(item)]:item.category;
        return `<li>${photo(item)}<div><small>${escape(label)}</small><strong>${escape(item.name)}</strong>${entry.days.length>1?`<span class="week-repeat" title="${escape(weeklyReuseText(entry))}">Worn ${entry.days.length} days this week</span>`:''}</div><button class="text-button week-change-piece" data-week-edit="${id}" data-week-replace="${escape(item.id)}" aria-label="Change ${escape(item.name)} for ${name}">Change</button></li>`;
      }).join('')}</ul>${day.reasons.length?`<h3>Style notes</h3><ul class="week-notes">${day.reasons.map(reason=>`<li>${escape(reason)}</li>`).join('')}</ul>`:''}${day.warnings.length?`<h3>Things to consider</h3><ul class="week-notes">${day.warnings.map(warning=>`<li>${escape(warning)}</li>`).join('')}</ul>`:''}</details>
      <button class="btn secondary full" data-week-open="${id}" ${day.items.length?'':'disabled'}>Open in outfit designer ${icon('arrow',16)}</button>
    </article>`;
  }
  return `<section class="weekly-page">
    <div class="page-heading"><div><p class="eyebrow">THE WEEKLY EDIT</p><h1>Your week,<br><em>well dressed.</em></h1><p class="subtitle">A look for every kind of day. Repeat the pieces you love, on your terms.</p></div><span class="week-heading-mark" aria-hidden="true">${icon('calendar',42)}</span></div>
    <form id="weekly-form" class="weekly-controls">
      <details id="weekly-settings" ${plan?'':'open'}><summary><span><strong>Week settings</strong><span id="weekly-settings-summary">${enabled} days on · choose modes & reuse limits</span></span>${icon('sliders',20)}</summary>
        <div class="weekly-settings-body"><fieldset><legend>01 / Choose your days & styles</legend><p>Turn off any day. Random shuffles the available modes and looks for an outfit within your weekly reuse limits. Unlock a saved day before turning it off or changing its style.</p>
          <div class="week-day-settings">${settings.days.map((day,index)=>`<div class="week-day-setting ${day.enabled?'':'is-off'}" data-week-day="${day.id}"><label class="week-day-toggle"><input type="checkbox" name="day-${day.id}" ${day.enabled?'checked':''} ${lockedDays.has(day.id)?'disabled':''}>${WEEK_DAYS[index][1]}</label><label class="week-mode-label">Style<select name="mode-${day.id}" aria-label="${WEEK_DAYS[index][1]} style" ${day.enabled&&!lockedDays.has(day.id)?'':'disabled'}>${[...MODES,'Random'].map(mode=>`<option value="${mode}" ${day.mode===mode?'selected':''}>${modeName(mode)}</option>`).join('')}</select></label>${lockedDays.has(day.id)?'<span class="week-setting-lock">Outfit locked</span>':''}</div>`).join('')}</div>
        </fieldset><fieldset class="week-reuse-settings"><legend>02 / Rewear your favorites</legend><p>Allow reuse by type, then set the maximum days <strong>each individual item</strong> can appear during this week. Unchecked means wear once. Other bottoms includes shorts, skirts and skorts.</p>
          <div class="week-reuse-grid">${REUSE_GROUPS.map(([id,label])=>{const rule=settings.reuse[id];return `<div class="week-reuse-row"><label class="week-day-toggle"><input type="checkbox" name="reuse-${id}" ${rule.enabled?'checked':''}>${label}</label><label class="week-limit-label">Max days<select name="limit-${id}" aria-label="${label} maximum days" ${rule.enabled?'':'disabled'}>${Array.from({length:7},(_,n)=>n+1).map(n=>`<option value="${n}" ${rule.maxDays===n?'selected':''}>${n}</option>`).join('')}</select></label></div>`;}).join('')}</div>
          <label class="week-day-toggle week-consecutive"><input type="checkbox" name="preferConsecutive" ${settings.preferConsecutive?'checked':''}>Prefer consecutive days for reused pieces</label><p class="week-example">For five compatible days, pants reused at most twice can give you three pairs: Mon/Tue, Wed/Thu, then Fri. Mode suitability and your wardrobe determine what fits.</p>
        </fieldset></div>
      </details>
      <div class="week-controls-footer"><p id="weekly-save-note" role="status">${dirty?'Unsaved settings. Regenerating also saves them.':lockedDays.size?`${lockedDays.size} ${lockedDays.size===1?'day is':'days are'} locked. Only unlocked outfits will change.`:plan?'Saved to your account. Generate again to replace unlocked outfits.':'Your stylist preferences and style playbook guide every outfit.'}</p><div class="button-row"><button class="btn secondary" type="submit" name="intent" value="save">Save settings</button><button class="btn primary" type="submit" name="intent" value="generate">${icon('spark',17)} ${lockedDays.size?'Regenerate unlocked days':plan?'Regenerate week':'Generate week'}</button></div></div>
    </form>
    ${plan?`<section class="week-results" aria-label="Saved weekly outfits"><div class="week-overview"><div><p class="eyebrow">YOUR SAVED PLAN</p><h2>${details.completeDays} of ${plan.days.length} outfits have all essential pieces.</h2><p>${details.usage.length} different pieces${pants?` · ${pants} ${pants===1?'pair':'pairs'} of pants`:''} · ${reused.length} ${reused.length===1?'piece repeats':'pieces repeat'}</p></div><span>Generated ${escape(new Date(plan.generatedAt).toLocaleDateString())}</span></div>
      <p class="week-stale" id="weekly-stale" ${stale?'':'hidden'}>Settings have changed. The outfits below still use the saved plan's days and limits. Generate again to apply your changes.</p>
      ${details.completeDays<plan.days.length?'<p class="week-callout">Some days need more clothing. Expand their pieces and notes to see what is missing. Reuse limits stay enforced even when a complete outfit is not possible.</p>':''}
      ${details.reuseWarnings.map(warning=>`<p class="week-callout">${escape(warning)}</p>`).join('')}
      <section class="week-preview-controls" id="week-preview-controls" aria-label="Weekly mannequin previews"></section>
      <div class="week-outfit-grid">${WEEK_DAYS.map(dayCard).join('')}</div>
      <section class="week-reuse-report"><p class="eyebrow">THE REWEAR PLAN</p><h2>Good pieces, more than once.</h2><p>Each line shows one item and the days it is planned. Limits reset when you generate a new week.</p>${reused.length?`<ul>${reused.map(entry=>`<li>${photo(entry.item)}<div><strong>${escape(entry.item.name)}</strong><span>${escape(weeklyReuseText(entry))}</span></div><b>${entry.days.length} days</b></li>`).join('')}</ul>`:'<p>No pieces repeat in this plan.</p>'}</section>
    </section>`:`<div class="week-empty">${icon('calendar',38)}<h2>A little planning. A lighter morning.</h2><p>Choose your days above, then generate your week. Your outfits and settings stay with this account.</p></div>`}
  </section>`;
}
