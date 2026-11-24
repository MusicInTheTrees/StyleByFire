import {MODES,generateOutfit,outfitCandidates,slotFor,assessOutfit} from './domain.js';
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
function hash(value,seed){
  let n=seed>>>0;
  for(const ch of value)n=Math.imul(n^ch.charCodeAt(0),16777619)>>>0;
  n^=n>>>16;n=Math.imul(n,0x45d9f3b)>>>0;n^=n>>>16;
  return (n>>>0)/4294967296;
}

export function generateWeeklyPlan(state,settings,seed=Date.now()){
  validateWeeklySettings(settings,MODES);
  const days=settings.days.filter(day=>day.enabled);
  if(!days.length)throw Error('Turn on at least one day to generate a week.');
  const candidates=Object.fromEntries(MODES.map(mode=>[mode,outfitCandidates(state.items,mode,state.rules[mode],state.profile)]));
  const viable=MODES.filter(mode=>generateOutfit(candidates[mode],mode,state.rules[mode],state.profile,[],seed).complete);
  const randomModes=viable.length?viable:MODES;
  const resolved=days.map(day=>({...day,modes:day.mode==='Random'?[...randomModes].sort((a,b)=>hash(day.id+a,seed)-hash(day.id+b,seed)):[day.mode]}));
  let beam=[{days:[],uses:new Map(),cost:0}];
  for(let index=0;index<resolved.length;index++){
    const day=resolved[index],next=[];
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
    if(assessment.missing.length)assessment.warnings.unshift(`No eligible ${assessment.missing.join(', ').toLowerCase()} was selected within your weekly limits. Add suitable pieces, change this day's mode, or increase reuse and generate again.`);
    if(day.itemIds.length!==items.length)assessment.warnings.unshift('A piece in this outfit has been removed from your wardrobe.');
    return {...day,items,...assessment};
  });
  const reuseWarnings=[];
  for(const entry of usage.values())if(entry.days.length>reuseLimit(entry.item,plan.settings))reuseWarnings.push(`${entry.item.name} is used on ${entry.days.length} days, above its ${reuseLimit(entry.item,plan.settings)}-day limit. Its category may have changed; generate again.`);
  return {days,usage:[...usage.values()],reuseWarnings,completeDays:days.filter(day=>day.complete).length};
}

export function weeklyReuseText(entry){
  return entry.days.map(dayName).join(', ');
}
