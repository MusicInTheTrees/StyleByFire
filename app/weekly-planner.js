import {MODES,generateOutfit,outfitCandidates,slotFor,assessOutfit,validateLocks} from './domain.js';
import {toggleOutfitPiece} from './outfit-builder.js';
import {WEEK_DAYS,validateWeeklySettings} from './weekly-settings.js';

export function reuseGroup(item){
  const slot=slotFor(item);
  if(slot==='accessory')return 'accessories';
  if(slot==='bottom'){
    // An explicit category path is authoritative; names help uncategorized imports.
    const text=item.subcategory||item.name;
    return /\b(pants|slacks|trousers|jeans|chinos|joggers)\b/i.test(text)?'pants':'bottom';
  }
  return slot;
}
export function reuseLimit(item,settings){
  const rule=settings.reuse[reuseGroup(item)];
  return rule?.enabled?rule.maxDays:1;
}
const dayIndex=id=>WEEK_DAYS.findIndex(([key])=>key===id);
const dayName=id=>WEEK_DAYS.find(([key])=>key===id)?.[1]||id;

export function setWeeklyDayLock(planner,dayId,locked){
  if(typeof locked!=='boolean'||!planner?.plan?.days.some(day=>day.id===dayId))throw Error('Choose an outfit in your saved week first.');
  const next=structuredClone(planner),day=next.plan.days.find(day=>day.id===dayId);
  day.locked=locked;
  // Locking the currently displayed outfit also keeps its existing day/mode if
  // preferences were changed after this plan was generated.
  if(locked){
    const saved=next.plan.settings.days.find(day=>day.id===dayId);
    Object.assign(next.settings.days.find(day=>day.id===dayId),{enabled:true,mode:saved.mode});
  }
  return next;
}

export function changeWeeklySelection(items,piece,replaceId=null){
  if(replaceId){
    if(!items.some(item=>item.id===replaceId))throw Error('That piece is no longer in this outfit. Choose another piece to change.');
    if(piece.id===replaceId)return [...items];
    if(items.some(item=>item.id===piece.id))throw Error('That piece is already in this outfit. Choose another replacement.');
  }
  return toggleOutfitPiece(replaceId?items.filter(item=>item.id!==replaceId):items,piece);
}

export function replaceWeeklyDay(state,plan,dayId,itemIds){
  if(!plan?.days.some(day=>day.id===dayId))throw Error('This day is no longer in the saved plan. Reopen the weekly planner.');
  if(!Array.isArray(itemIds)||itemIds.length>20||new Set(itemIds).size!==itemIds.length)throw Error('Choose up to 20 different pieces for this outfit.');
  const items=itemIds.map(id=>state.items.find(item=>item.id===id));
  if(items.some(item=>!item))throw Error('A selected piece is no longer in your wardrobe.');
  const errors=validateLocks(items);
  if(errors.length)throw Error(errors.join(' '));
  const beforeUses=new Map(),otherUses=new Map();
  for(const day of plan.days)for(const id of day.itemIds){
    beforeUses.set(id,(beforeUses.get(id)||0)+1);
    if(day.id!==dayId)otherUses.set(id,(otherUses.get(id)||0)+1);
  }
  for(const item of items){
    const count=(otherUses.get(item.id)||0)+1,limit=reuseLimit(item,plan.settings);
    // Permit repairs to a plan whose categories changed, without adding a new
    // violation or making an existing overuse worse.
    if(count>limit&&count>(beforeUses.get(item.id)||0))throw Error(`${item.name} would be used on ${count} days; this saved week's limit is ${limit}. Choose another piece, or update reuse settings and regenerate.`);
  }
  const next=structuredClone(plan),day=next.days.find(day=>day.id===dayId);
  day.itemIds=[...itemIds];day.edited=true;
  return next;
}
function hash(value,seed){
  let n=seed>>>0;
  for(const ch of value)n=Math.imul(n^ch.charCodeAt(0),16777619)>>>0;
  n^=n>>>16;n=Math.imul(n,0x45d9f3b)>>>0;n^=n>>>16;
  return (n>>>0)/4294967296;
}

export function generateWeeklyPlan(state,settings,seed=Date.now(),previousPlan=state.weeklyPlanner?.plan){
  validateWeeklySettings(settings,MODES);
  const lockedDays=new Map((previousPlan?.days||[]).filter(day=>day.locked===true).map(day=>[day.id,day]));
  const reserved=new Map();
  for(const day of lockedDays.values()){
    const preference=settings.days.find(setting=>setting.id===day.id);
    if(!preference?.enabled||(preference.mode!=='Random'&&preference.mode!==day.mode))throw Error(`${dayName(day.id)} is locked. Unlock that day before turning it off or changing its style mode.`);
    for(const id of day.itemIds){
      if(!state.items.some(item=>item.id===id))throw Error(`A piece in locked ${dayName(day.id)} is missing. Edit that outfit before regenerating.`);
      reserved.set(id,(reserved.get(id)||0)+1);
    }
  }
  for(const [id,count] of reserved){
    const item=state.items.find(item=>item.id===id),limit=reuseLimit(item,settings);
    if(count>limit)throw Error(`${item.name} is already used on ${count} locked days, above your ${limit}-day limit. Increase its reuse limit or unlock/edit one of those days.`);
  }
  const days=settings.days.filter(day=>day.enabled);
  if(!days.length)throw Error('Turn on at least one day to generate a week.');
  const candidates=Object.fromEntries(MODES.map(mode=>[mode,outfitCandidates(state.items,mode,state.rules[mode],state.profile)]));
  const viable=MODES.filter(mode=>generateOutfit(candidates[mode],mode,state.rules[mode],state.profile,[],seed).complete);
  const randomModes=viable.length?viable:MODES;
  const resolved=days.map(day=>({...day,modes:day.mode==='Random'?[...randomModes].sort((a,b)=>hash(day.id+a,seed)-hash(day.id+b,seed)):[day.mode]}));
  // Reserve every locked day's pieces before choosing Monday, including locks
  // later in the week. Appending a locked day must not count its usage twice.
  let beam=[{days:[],uses:new Map(reserved),cost:0}];
  for(let index=0;index<resolved.length;index++){
    const day=resolved[index],next=[];
    if(lockedDays.has(day.id)){
      const locked=lockedDays.get(day.id);
      beam=beam.map(branch=>{
        const previous=branch.days.at(-1);
        const consecutive=settings.preferConsecutive&&previous&&dayIndex(day.id)-dayIndex(previous.id)===1;
        const bonus=consecutive?locked.itemIds.filter(id=>previous.itemIds.includes(id)).length*16:0;
        return {...branch,days:[...branch.days,structuredClone(locked)],cost:branch.cost-bonus};
      });
      continue;
    }
    for(const branch of beam){
     for(const [choice,mode] of day.modes.entries()){
      const rules=state.rules[mode];
      const available=candidates[mode].filter(item=>(branch.uses.get(item.id)||0)<reuseLimit(item,settings));
      const previous=branch.days.at(-1);
      const adjacent=previous&&dayIndex(day.id)-dayIndex(previous.id)===1;
      const previousIds=new Set(adjacent?previous.itemIds:[]);
      const seen=new Set();
      // A bounded search keeps alternative early outfits, so a versatile piece can
      // remain available for a later day that has fewer suitable choices.
      for(let variant=0;variant<10;variant++){
        const result=generateOutfit(available,mode,rules,state.profile,[],seed+index*137+variant*7919,{
          includeCap:true,
          rankBonus:item=>{
            const reused=branch.uses.has(item.id),consecutive=previousIds.has(item.id);
            const repeatBias=variant<5?(reused?45:0)+(settings.preferConsecutive&&consecutive?85:0):0;
            return repeatBias+(variant===0?0:hash(item.id,seed+variant*8191+index*17)*100);
          }
        });
        const itemIds=result.items.map(item=>item.id),key=[...itemIds].sort().join('|');
        if(seen.has(key))continue;
        seen.add(key);
        const uses=new Map(branch.uses);
        // Random tries a shuffled mode first, but a complete alternative wins over
        // that mode when its remaining clothing has already reached weekly limits.
        let cost=branch.cost+choice*1000+result.missing.length*100000+result.warnings.length*3;
        for(const item of result.items){
          const used=uses.get(item.id)||0;
          uses.set(item.id,used+1);
          if(settings.reuse[reuseGroup(item)].enabled){
            if(!used)cost+=12;
            if(settings.preferConsecutive&&previousIds.has(item.id))cost-=16;
          }
          if(item.favorite)cost-=state.profile.favoriteBias/10;
        }
        next.push({days:[...branch.days,{id:day.id,mode,itemIds}],uses,cost});
      }
     }
    }
    // Keep diverse resource allocations; histories with the same remaining pieces
    // and same last outfit have equivalent choices for subsequent days.
    const unique=new Map();
    for(const branch of next.sort((a,b)=>a.cost-b.cost)){
      const key=JSON.stringify([...branch.uses].sort())+'/'+[...branch.days.at(-1).itemIds].sort().join('|');
      if(!unique.has(key))unique.set(key,branch);
      if(unique.size===24)break;
    }
    beam=[...unique.values()];
  }
  return {generatedAt:new Date().toISOString(),settings:structuredClone(settings),days:beam[0].days};
}

export function weeklyPlanDetails(state,plan){
  const itemsById=new Map(state.items.map(item=>[item.id,item]));
  const usage=new Map();
  const days=plan.days.map(day=>{
    const items=day.itemIds.map(id=>itemsById.get(id)).filter(Boolean);
    for(const item of items){
      if(!usage.has(item.id))usage.set(item.id,{item,days:[]});
      usage.get(item.id).days.push(day.id);
    }
    const assessment=assessOutfit(items,day.mode,state.rules[day.mode],state.profile);
    if(assessment.missing.length)assessment.warnings.unshift(day.edited?`This edited outfit still needs ${assessment.missing.join(', ').toLowerCase()}. Use Edit pieces to finish it.`:`No eligible ${assessment.missing.join(', ').toLowerCase()} was selected within your weekly limits. Add suitable pieces, change this day's mode, or increase reuse and generate again.`);
    if(day.itemIds.length!==items.length)assessment.warnings.unshift('A piece in this outfit has been removed from your wardrobe.');
    const excluded=items.filter(item=>item.tags.some(tag=>state.profile.avoidTags.some(avoid=>avoid.toLowerCase()===tag.toLowerCase())));
    if(excluded.length)assessment.warnings.push(`Your stylist excludes tags on: ${excluded.map(item=>item.name).join(', ')}. Your saved choices are kept until you edit or unlock and regenerate.`);
    if(day.locked&&!assessment.complete)assessment.warnings.push('This day is locked. Regeneration will keep these pieces and will not fill its missing slots.');
    return {...day,items,...assessment};
  });
  const reuseWarnings=[];
  for(const entry of usage.values())if(entry.days.length>reuseLimit(entry.item,plan.settings))reuseWarnings.push(`${entry.item.name} is used on ${entry.days.length} days, above its ${reuseLimit(entry.item,plan.settings)}-day limit. Its category may have changed; generate again.`);
  return {days,usage:[...usage.values()],reuseWarnings,completeDays:days.filter(day=>day.complete).length};
}

export function weeklyReuseText(entry){
  return entry.days.map(dayName).join(', ');
}
