import {MODES,slotFor,validateLocks,assessOutfit} from './domain.js';
import {buildPreviewSpec,previewKey} from './mannequin.js';

// Manual choices replace the occupied clothing slot; accessories can be combined.
export function toggleOutfitPiece(items,piece){
 if(items.some(item=>item.id===piece.id))return items.filter(item=>item.id!==piece.id);
 const errors=validateLocks([piece]);
 if(errors.length)throw Error(errors.join(' '));
 const slot=slotFor(piece);
 const next=items.filter(item=>{
  const existing=slotFor(item);
  if(slot!=='accessory'&&existing===slot)return false;
  if(slot==='dress'&&['top','bottom'].includes(existing))return false;
  if(['top','bottom'].includes(slot)&&existing==='dress')return false;
  return true;
 });
 if(next.length>=20)throw Error('An outfit can contain up to 20 pieces for its mannequin preview.');
 return [...next,piece];
}

export function manualOutfit(items,mode,state){
 // Personal stylist exclusions guide suggestions; explicit manual choices remain possible.
 const result={items,errors:validateLocks(items),...assessOutfit(items,mode,state.rules[mode],state.profile)};
 const excluded=items.filter(item=>item.tags.some(tag=>state.profile.avoidTags.some(avoid=>avoid.toLowerCase()===tag.toLowerCase())));
 if(excluded.length)result.warnings.push(`Manually selected despite excluded tags: ${excluded.map(item=>item.name).join(', ')}.`);
 return result;
}

export function restoreOutfitDraft(value,state){
 if(!value||!MODES.includes(value.mode)||!Array.isArray(value.itemIds)||value.itemIds.length>20||!value.itemIds.every(id=>typeof id==='string'))return null;
 const items=[...new Set(value.itemIds)].map(id=>state.items.find(item=>item.id===id)).filter(Boolean);
 const editingLookId=typeof value.editingLookId==='string'&&state.looks.some(look=>look.id===value.editingLookId)?value.editingLookId:null;
 return {mode:value.mode,method:value.method==='manual'?'manual':'stylist',items,editingLookId,locked:Array.isArray(value.locked)?value.locked.filter(id=>state.items.some(item=>item.id===id)):[]};
}

export function previewMatchesOutfit(detail,state,itemIds,mode){
 if(detail?.status!=='complete'||!detail.imageSrc)return false;
 try{return previewKey(detail.spec)===previewKey(buildPreviewSpec(state,itemIds,{mode,bodyShape:detail.spec.bodyShape,pose:detail.spec.pose}));}
 catch{return false;}
}
