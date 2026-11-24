export const WEEK_DAYS = Object.freeze([
  ['monday','Monday'],['tuesday','Tuesday'],['wednesday','Wednesday'],
  ['thursday','Thursday'],['friday','Friday'],['saturday','Saturday'],['sunday','Sunday']
]);
export const REUSE_GROUPS = Object.freeze([
  ['cap','Caps'],['top','Tops'],['layer','Outer layers'],['dress','Dresses'],
  ['pants','Pants & slacks'],['bottom','Other bottoms'],['leggings','Leggings'],
  ['socks','Socks'],['shoes','Shoes'],['accessories','Accessories']
]);

export function defaultWeeklySettings(){
  const modes=['Business','Business','Business','Red carpet','Random','Sport','Sport'];
  const defaults={cap:7,layer:2,pants:2,shoes:7,accessories:7};
  return {
    days:WEEK_DAYS.map(([id],index)=>({id,enabled:index<5,mode:modes[index]})),
    reuse:Object.fromEntries(REUSE_GROUPS.map(([id])=>[id,{enabled:!!defaults[id],maxDays:defaults[id]||1}])),
    preferConsecutive:true
  };
}

export function validateWeeklySettings(settings,modes){
  if(!settings||!Array.isArray(settings.days)||settings.days.length!==7||typeof settings.preferConsecutive!=='boolean'||!settings.reuse||typeof settings.reuse!=='object')throw Error('Invalid weekly planner settings.');
  settings.days.forEach((day,index)=>{
    if(!day||day.id!==WEEK_DAYS[index][0]||typeof day.enabled!=='boolean'||![...modes,'Random'].includes(day.mode))throw Error('Invalid weekly day or style mode.');
  });
  for(const [id] of REUSE_GROUPS){
    const rule=settings.reuse[id];
    if(!rule||typeof rule.enabled!=='boolean'||!Number.isInteger(rule.maxDays)||rule.maxDays<1||rule.maxDays>7)throw Error('Weekly reuse limits must be whole numbers from 1 to 7.');
  }
  return settings;
}

export function validateWeeklyPlanner(planner,modes,itemIds){
  if(planner===undefined)return;
  if(!planner||planner.version!==1)throw Error('Invalid weekly planner.');
  validateWeeklySettings(planner.settings,modes);
  if(planner.plan===null||planner.plan===undefined)return;
  const plan=planner.plan;
  validateWeeklySettings(plan.settings,modes);
  const enabled=plan.settings.days.filter(day=>day.enabled);
  if(typeof plan.generatedAt!=='string'||plan.generatedAt.length>40||!Number.isFinite(Date.parse(plan.generatedAt))||!Array.isArray(plan.days)||!enabled.length||plan.days.length!==enabled.length)throw Error('Invalid saved weekly plan.');
  plan.days.forEach((day,index)=>{
    if(!day||day.id!==enabled[index].id||!modes.includes(day.mode)||(enabled[index].mode!=='Random'&&day.mode!==enabled[index].mode)||!Array.isArray(day.itemIds)||day.itemIds.length>20||new Set(day.itemIds).size!==day.itemIds.length||!day.itemIds.every(id=>itemIds.has(id)))throw Error('A weekly outfit refers to an invalid day, mode, or clothing item.');
    for(const flag of ['locked','edited'])if(day[flag]!==undefined&&typeof day[flag]!=='boolean')throw Error('Invalid weekly outfit lock or editing preference.');
  });
}
