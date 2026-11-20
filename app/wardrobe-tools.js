import {validateState,DEFAULT_ADJUSTMENTS} from './domain.js';

export function needsReview(item,filter){
 if(filter==='unverified')return !item.colorVerified;
 if(filter==='notes')return Boolean(item.stylistNotes?.trim());
 if(filter==='uncategorized')return !item.subcategory.trim();
 if(filter==='no-modes')return !item.modes.length;
 return true;
}
export function prepareBulkEdit(state,ids,patch){
 const selected=new Set(ids);if(!selected.size)throw Error('Select at least one piece.');
 if([...selected].some(id=>!state.items.some(i=>i.id===id)))throw Error('A selected piece no longer exists.');
 const next=structuredClone(state),before=[],after=[];
 for(const item of next.items){
  if(!selected.has(item.id))continue;
  before.push(structuredClone(item));
  for(const field of ['color','secondaryColor','pattern','formality','warmth','favorite','colorVerified','availability','subcategory'])if(Object.hasOwn(patch,field))item[field]=patch[field];
  if(patch.modes!==undefined)item.modes=[...patch.modes];
  const remove=new Set((patch.removeTags||[]).map(t=>t.toLowerCase()));
  item.tags=item.tags.filter(t=>!remove.has(t.toLowerCase()));
  for(const tag of patch.addTags||[])if(!item.tags.some(t=>t.toLowerCase()===tag.toLowerCase()))item.tags.push(tag);
  for(const field of ['notes','stylistNotes'])if(patch[field]?.trim())item[field]=[item[field],patch[field].trim()].filter(Boolean).join('\n');
  if(patch.rotation){if(![90,180,270].includes(patch.rotation))throw Error('Invalid batch rotation.');item.adjustments={...DEFAULT_ADJUSTMENTS,...item.adjustments,rotation:((item.adjustments?.rotation||0)+patch.rotation)%360};}
  after.push(structuredClone(item));
 }
 validateState(next);
 if(JSON.stringify(before)===JSON.stringify(after))throw Error('Choose at least one change.');
 return {state:next,undo:{before,after}};
}
export function undoBulkEdit(state,entry){
 if(!entry)throw Error('No bulk edit to undo in this session.');
 for(const item of entry.after)if(JSON.stringify(state.items.find(i=>i.id===item.id))!==JSON.stringify(item))throw Error('One of these pieces changed after the bulk edit. Undo would overwrite that edit.');
 const next=structuredClone(state),originals=new Map(entry.before.map(i=>[i.id,i]));
 next.items=next.items.map(i=>originals.has(i.id)?structuredClone(originals.get(i.id)):i);
 return validateState(next);
}
