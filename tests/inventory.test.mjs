import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {inferLabels,refreshInventory} from '../inventory.mjs';
import {DEFAULT_PROFILE,DEFAULT_RULES,validateState} from '../app/domain.js';
test('folder taxonomy handles ties, flat caps, dress shoes, and sport coats',()=>{
 assert.equal(inferLabels('ClothingImages/Accessories/Ties/tie.jpg').category,'Accessories');
 for(const folder of ['Wallets','Scarves','Scarfs','WristBands','Necklaces','Earrings','Earings','Watches','Eyewear','Eye Wear'])assert.equal(inferLabels(`ClothingImages/${folder}/piece.jpg`).category,'Accessories',folder);
 assert.equal(inferLabels('ClothingImages/Caps/Scally/cap.jpg').category,'Cap');
 assert.equal(inferLabels('ClothingImages/Shoes/Dress/shoe.jpg').category,'Shoes');
 assert.equal(inferLabels('ClothingImages/Jackets/SportsJackets/coat.jpg').role,'outerwear');
 assert.ok(!inferLabels('ClothingImages/Jackets/SportsJackets/coat.jpg').modes.includes('Sport'));
});
test('inventory refresh is additive and idempotent and preserves notes, colors, and rotation',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'stylebyfire-inventory-')),data=path.join(root,'data');
 try{
  await mkdir(path.join(root,'ClothingImages','Accessories','Ties'),{recursive:true});await mkdir(path.join(data,'images'),{recursive:true});
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=','base64');
  const folder=path.join(root,'ClothingImages','Accessories','Ties');await writeFile(path.join(folder,'first.png'),png);await writeFile(path.join(folder,'.gitkeep'),'');
  const seed={items:[],media:{}};const empty={version:1,items:[],looks:[],subcategories:[],reference:'',profile:DEFAULT_PROFILE,rules:DEFAULT_RULES};
  const first=await refreshInventory({root,data,state:empty,seed});assert.equal(first.added,1);assert.deepEqual(first.skipped,[]);validateState(first.state);
  Object.assign(first.state.items[0],{notes:'Personal reminder',stylistNotes:'Actually forest green',color:'Green',colorVerified:true,adjustments:{...first.state.items[0].adjustments,rotation:90}});
  await writeFile(path.join(folder,'second.png'),png);const second=await refreshInventory({root,data,state:first.state,seed});assert.equal(second.added,1);assert.deepEqual(second.state.items[0],first.state.items[0]);validateState(second.state);
  assert.equal((await refreshInventory({root,data,state:second.state,seed})).added,0);
  const removed=structuredClone(second.state);removed.items.shift();assert.equal((await refreshInventory({root,data,state:removed,seed})).added,0,'intentionally removed files are not re-added');
 }finally{const resolved=path.resolve(root);assert.ok(resolved.startsWith(path.resolve(tmpdir())+path.sep)&&path.basename(resolved).startsWith('stylebyfire-inventory-'));await rm(resolved,{recursive:true,force:true});}
});

test('the external library category tree maps subcategories and clothing layers correctly',()=>{
 assert.equal(inferLabels('ClothingImages/Top/Shirts/T-shirts/photo.jpg').subcategory,'Shirts / T shirts');
 assert.equal(inferLabels('ClothingImages/Bottom/Pants/Jeans/photo.jpg').subcategory,'Pants / Jeans');
 assert.equal(inferLabels('ClothingImages/Top/Dresses/Evening/photo.jpg').role,'dress');
 assert.equal(inferLabels('ClothingImages/Top/Outerwear/Blazers/photo.jpg').role,'outerwear');
 assert.equal(inferLabels('ClothingImages/Bottom/Leggings/Athletic/photo.jpg').role,'leggings');
});
