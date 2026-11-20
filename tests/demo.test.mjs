import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DEMO_CATALOG,DEMO_PHOTO_VERSION,demoCacheName,createDemoWardrobe,upgradeDemoWardrobe} from '../demo.mjs';
import {validateState,accessoryType,generateOutfit} from '../app/domain.js';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=','base64');
async function fixture(t){const directory=await mkdtemp(path.join(tmpdir(),'stylebyfire-demo-')),folder=path.join(directory,'accounts','demo'),cacheDirectory=path.join(directory,'demo-photos');await mkdir(cacheDirectory,{recursive:true});t.after(async()=>{const resolved=path.resolve(directory);assert.ok(resolved.startsWith(path.resolve(tmpdir())+path.sep)&&path.basename(resolved).startsWith('stylebyfire-demo-'));await rm(resolved,{recursive:true,force:true});});return{directory,folder,cacheDirectory};}
test('real-photo demo works offline from local cache and covers every accessory type',async t=>{
 const {folder,cacheDirectory}=await fixture(t);for(const entry of DEMO_CATALOG)await writeFile(path.join(cacheDirectory,demoCacheName(entry)),png);
 const state=validateState(await createDemoWardrobe(folder,{downloadImage:()=>{throw Error('Network must not be used for cached photos.');}}));
 assert.equal(state.items.length,26);assert.equal(state.demoPhotoVersion,DEMO_PHOTO_VERSION);
 assert.deepEqual(new Set(state.items.filter(i=>i.category==='Accessories').map(accessoryType)),new Set(['tie','belt','glasses','earrings','necklace','brooch','watch','wristband','ring']));
 for(const item of state.items){assert.ok(item.sourceUrl.startsWith('https://'));assert.ok(item.sourceImageUrl.startsWith('https://'));assert.ok(item.sourceName);assert.deepEqual(await readFile(path.join(folder,'images',item.src.slice(7))),png);}
 const outfit=generateOutfit(state.items,'Business',state.rules.Business,state.profile,[],42);assert.equal(outfit.items.filter(i=>i.category==='Accessories').length,9);
});
test('uncached demo reports unavailable downloads instead of generating illustrations',async t=>{
 const {folder}=await fixture(t);await assert.rejects(createDemoWardrobe(folder,{downloadImage:async()=>{throw Error('offline');}}),/internet connection.*first download/);
});
test('upgrading old sample images preserves IDs, saved looks, and custom notes',async t=>{
 const {folder,cacheDirectory}=await fixture(t);for(const entry of DEMO_CATALOG)await writeFile(path.join(cacheDirectory,demoCacheName(entry)),png);
 const old=await createDemoWardrobe(folder);delete old.demoPhotoVersion;
 for(let i=0;i<old.items.length;i++){const item=old.items[i],entry=DEMO_CATALOG[i];delete item.demoKey;item.name=entry.legacyName;item.description=`Fictional ${entry.legacyName.toLowerCase()} in Jamie Demo’s blue and gray test wardrobe.`;item.notes='Fictional clothing for Jamie Demo. Safe to edit while testing.';item.stylistNotes='Synthetic illustration; the color label is intentional.';}
 old.items[0].notes='Keep my test note.';old.items[0].stylistNotes='Keep my styling note.';old.items[0].favorite=true;old.looks=[{id:'saved-demo',name:'Test look',mode:'Business',itemIds:[old.items[0].id,old.items[1].id]}];
 const before=structuredClone(old);const upgraded=await upgradeDemoWardrobe(folder,old);validateState(upgraded.state);
 assert.equal(upgraded.changed,true);assert.deepEqual(old,before);assert.deepEqual(upgraded.state.items.map(i=>i.id),old.items.map(i=>i.id));assert.deepEqual(upgraded.state.looks,old.looks);
 assert.equal(upgraded.state.items[0].notes,'Keep my test note.');assert.equal(upgraded.state.items[0].stylistNotes,'Keep my styling note.');assert.equal(upgraded.state.items[0].favorite,true);
 assert.ok(upgraded.state.items.every((item,index)=>item.src!==old.items[index].src));assert.equal((await upgradeDemoWardrobe(folder,upgraded.state)).changed,false);
});
