import {addGolfSuitability} from './app/golf.js';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DEFAULT_ADJUSTMENTS,DEFAULT_PROFILE,DEFAULT_RULES,DEFAULT_SUBCATEGORIES} from './app/domain.js';
import {DEMO_CATALOG} from './demo-catalog.mjs';
export {DEMO_CATALOG} from './demo-catalog.mjs';
export const DEMO_PHOTO_VERSION=2;
export const DEMO_CATALOG_VERSION=2;
export const demoCacheName=entry=>`v${DEMO_PHOTO_VERSION}-${entry.key}.image`;
const imageExtension=bytes=>bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'jpg':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'webp':null;
const cacheFor=(folder,options)=>options.cacheDirectory||path.join(path.dirname(path.dirname(folder)),'demo-photos');

export async function prepareDemoPhotos(folder,options={},entries=DEMO_CATALOG){
 const directory=cacheFor(folder,options);await mkdir(directory,{recursive:true});const photos=new Map();
 const download=options.downloadImage||(async url=>(await import('./web-import.mjs')).downloadImage(url));
 let cursor=0;
 async function worker(){
  while(cursor<entries.length){
   const entry=entries[cursor++],file=path.join(directory,demoCacheName(entry));let bytes;
   try{bytes=await readFile(file);}catch(error){if(error.code!=='ENOENT')throw error;}
   if(!bytes||!imageExtension(bytes)){
    try{const result=await download(entry.sourceImageUrl);bytes=Buffer.from(result.bytes);if(!imageExtension(bytes)||bytes.length>20*1024*1024)throw Error('The retailer did not return a supported product photo.');const temporary=file+'.'+randomUUID()+'.tmp';await writeFile(temporary,bytes);await rename(temporary,file);}
    catch(error){throw Error(`Jamie’s real-photo demo needs an internet connection for its first download. Could not download ${entry.name} from ${entry.sourceName}: ${error.message}`);}
   }
   photos.set(entry.key,{bytes,extension:imageExtension(bytes)});
  }
 }
 const results=await Promise.allSettled(Array.from({length:4},worker));const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;return photos;
}
function sampleItem(entry,id,src){
 return addGolfSuitability({id,name:entry.name,category:entry.category,subcategory:entry.subcategory,role:entry.role,color:entry.color,colorVerified:true,pattern:entry.pattern||'Solid',formality:entry.formality,warmth:entry.role==='outerwear'?2:1,tags:['demo','blue-gray',...(entry.formality>=3?['tailored']:[])],modes:entry.mode?[entry.mode,...(entry.mode==='Sport'?['Casual']:[])]:['Casual','Business'],favorite:['oxford-shirt','watch','loafers'].includes(entry.key),src,notes:'Sample clothing for Jamie Demo. Safe to edit while testing.',stylistNotes:'Real retailer product photograph. Color family follows the product listing; screen colors may vary.',description:`${entry.name}. Product photograph from ${entry.sourceName}, used in Jamie Demo’s sample wardrobe.`,adjustments:structuredClone(DEFAULT_ADJUSTMENTS),demoKey:entry.key,sourceName:entry.sourceName,sourceUrl:entry.sourceUrl,sourceImageUrl:entry.sourceImageUrl});
}
async function writePhoto(folder,photo){const filename=randomUUID()+'.'+photo.extension;await writeFile(path.join(folder,'images',filename),photo.bytes);return '/media/'+filename;}
export async function createDemoWardrobe(folder,options={}){
 const photos=await prepareDemoPhotos(folder,options);await mkdir(path.join(folder,'images'),{recursive:true});const items=[];
 for(const entry of DEMO_CATALOG)items.push(sampleItem(entry,'demo-'+randomUUID(),await writePhoto(folder,photos.get(entry.key))));
 return {version:1,demoPhotoVersion:DEMO_PHOTO_VERSION,demoCatalogVersion:DEMO_CATALOG_VERSION,items,looks:[],profile:{...structuredClone(DEFAULT_PROFILE),name:'Jamie’s personal stylist',palette:'tonal',preferredTags:['tailored'],notes:'Jamie Demo is a fictional person using real retailer product photos. Use this separate wardrobe to test outfits, accessories, notes, and photo adjustments.'},rules:structuredClone(DEFAULT_RULES),subcategories:[...new Map([...DEFAULT_SUBCATEGORIES,...items.map(i=>({category:i.category,path:i.subcategory}))].map(s=>[s.category+'|'+s.path,s])).values()],reference:null};
}
// Use only for the explicitly selected demo account. Saved look IDs stay intact.
export async function upgradeDemoWardrobe(folder,state,options={}){
 const replacePhotos=state.demoPhotoVersion!==DEMO_PHOTO_VERSION,catalogVersion=state.demoCatalogVersion||1;
 if(!replacePhotos&&catalogVersion>=DEMO_CATALOG_VERSION)return {state,changed:false};
 const matches=(entry,item)=>entry.key===item.demoKey||entry.legacyName===item.name||entry.sourceUrl===item.sourceUrl||item.description===`Fictional ${entry.legacyName.toLowerCase()} in Jamie Demo’s blue and gray test wardrobe.`;
 const additions=DEMO_CATALOG.filter(entry=>(entry.catalogVersion||1)>catalogVersion&&!state.items.some(item=>matches(entry,item)));
 const photos=await prepareDemoPhotos(folder,options,replacePhotos?DEMO_CATALOG:additions),next=structuredClone(state);
 await mkdir(path.join(folder,'images'),{recursive:true});
 const originalNotes='Fictional clothing for Jamie Demo. Safe to edit while testing.';
 for(const item of replacePhotos?next.items:[]){
  const entry=DEMO_CATALOG.find(entry=>matches(entry,item));
  if(!entry)continue;
  const replacement=sampleItem(entry,item.id,await writePhoto(folder,photos.get(entry.key)));
  const notes=item.notes===originalNotes?replacement.notes:item.notes;
  const stylistNotes=item.stylistNotes==='Synthetic illustration; the color label is intentional.'?replacement.stylistNotes:item.stylistNotes;
  const favorite=item.favorite;
  Object.assign(item,replacement,{notes,stylistNotes,favorite});
 }
 for(const entry of additions)next.items.push(sampleItem(entry,'demo-'+randomUUID(),await writePhoto(folder,photos.get(entry.key))));
 next.demoPhotoVersion=DEMO_PHOTO_VERSION;
 next.demoCatalogVersion=DEMO_CATALOG_VERSION;
 next.subcategories=[...new Map([...next.subcategories,...next.items.map(i=>({category:i.category,path:i.subcategory}))].map(s=>[s.category+'|'+s.path,s])).values()];
 if(next.profile.notes==='Jamie Demo is a fictional person. Use this separate wardrobe to test outfits, accessories, notes, and photo adjustments.')next.profile.notes='Jamie Demo is a fictional person using real retailer product photos. Use this separate wardrobe to test outfits, accessories, notes, and photo adjustments.';
 return {state:next,changed:true};
}
