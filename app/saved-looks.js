import {MODES,validateLocks} from './domain.js';

export function savedLookEditing(state,lookId,itemIds,mode){
 const look=state.looks.find(look=>look.id===lookId)||null;
 const changed=!!look&&(look.mode!==mode||look.itemIds.length!==itemIds.length||look.itemIds.some(id=>!itemIds.includes(id)));
 return {look,changed};
}

// Prepare an immutable save; callers only adopt the saved identity after persistence.
export function prepareLookSave(state,{intent,lookId,name,mode,itemIds},{newId=()=>crypto.randomUUID(),now=()=>new Date().toISOString()}={}){
 if(!['update','new'].includes(intent))throw Error('Choose update or save as new look.');
 const existing=intent==='update'?state.looks.find(look=>look.id===lookId):null;
 if(intent==='update'&&!existing)throw Error('This saved look no longer exists. Save it as a new look instead.');
 const title=typeof name==='string'?name.trim():'';
 if(!title||title.length>100)throw Error('Give this look a name between 1 and 100 characters.');
 if(!MODES.includes(mode))throw Error('Choose a supported occasion.');
 if(!Array.isArray(itemIds)||!itemIds.length||new Set(itemIds).size!==itemIds.length)throw Error('Choose at least one piece, without duplicates.');
 const pieces=itemIds.map(id=>state.items.find(item=>item.id===id));
 if(pieces.some(item=>!item))throw Error('A selected piece no longer exists in this wardrobe.');
 const errors=validateLocks(pieces);if(errors.length)throw Error(errors.join(' '));
 const stamp=now(),look=existing?{...existing,name:title,mode,itemIds:[...itemIds],updatedAt:stamp}:{id:newId(),name:title,mode,itemIds:[...itemIds],createdAt:stamp};
 if(!existing&&state.looks.some(saved=>saved.id===look.id))throw Error('Could not assign a unique saved look. Try again.');
 const looks=existing?state.looks.map(saved=>saved.id===existing.id?look:saved):[...state.looks,look];
 return {state:{...state,looks},look};
}
