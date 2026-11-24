import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,cp} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {imageLibrary} from '../image-library.mjs';
import {migrateImageLibrary} from '../image-library-migration.mjs';
import {LocalAccounts,emptyWardrobe} from '../accounts.mjs';
import {createPreview,completePreview,previewImage} from '../mannequin-store.mjs';
import {DEFAULT_ADJUSTMENTS} from '../app/domain.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=','base64');
const owner={id:'11111111-1111-4111-8111-111111111111',ownsLegacy:true,isDemo:false},demo={id:'22222222-2222-4222-8222-222222222222',isDemo:true};
async function fixture(t){
 const dir=await mkdtemp(path.join(tmpdir(),'stylebyfire-library-')),root=path.join(dir,'app'),data=path.join(root,'.data'),directory=path.join(dir,'photos');
 t.after(async()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));await rm(dir,{recursive:true,force:true});});
 await mkdir(data,{recursive:true});
 const userFolder=path.join(data,'accounts',owner.id),state=emptyWardrobe();
 state.items=[{id:'shirt',name:'White geometric shirt',category:'Top',role:'dress',subcategory:'Shirts',color:'White',secondaryColor:'Black',colorVerified:true,pattern:'Geometric',formality:2,warmth:1,tags:[],modes:['Casual'],favorite:false,src:'/media/seed-photo.png',notes:'Private note',stylistNotes:'White with black pattern',adjustments:structuredClone(DEFAULT_ADJUSTMENTS)}];
 const seed={items:[],media:{'seed.png':'ClothingImages/Top/shirt.png'}};
 for(const file of ['ClothingImages/Top/shirt.png','app/thumbs/seed.png','.data/images/legacy.png',`.data/accounts/${owner.id}/images/seed-photo.png`,`.data/accounts/${demo.id}/images/demo.png`]){await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),png);}
 await writeFile(path.join(data,'accounts.json'),JSON.stringify({version:1,users:[owner,demo],sessions:[]}));
 const stateBytes=JSON.stringify(state);await writeFile(path.join(userFolder,'wardrobe.json'),stateBytes);
 const preview=await createPreview({userFolder,state,itemIds:['shirt'],resolveSource:()=>path.join(userFolder,'images','seed-photo.png')});await completePreview(userFolder,preview.id,png);
 return {dir,root,data,directory,userFolder,stateBytes,preview,seed};
}
test('migration preserves account data and URLs, separates demo, moves all preview versions, and is repeatable',async t=>{
 const f=await fixture(t),recordBefore=await readFile(path.join(f.userFolder,'mannequin',f.preview.id,'request.json'));
 const result=await migrateImageLibrary({...f,move:true,env:{}});assert.equal(result.images,6);assert.equal(result.config,'../photos');
 const library=await imageLibrary({...f,env:{}}),accounts=new LocalAccounts({...f,library});await accounts.initialize();
 assert.equal(await accounts.mediaFile(owner,'/media/seed-photo.png'),path.join(f.directory,'accounts',owner.id,'images','seed-photo.png'));
 assert.deepEqual(await readFile(await accounts.mediaFile(owner,'/media/seed.png')),png);
 await assert.rejects(()=>accounts.mediaFile(demo,'/media/seed-photo.png'));
 await assert.rejects(()=>accounts.mediaFile(demo,'/media/seed.png'));
 assert.deepEqual(await readFile(await accounts.mediaFile(demo,'/media/demo.png')),png);
 assert.deepEqual((await previewImage(f.userFolder,f.preview.id,undefined,{imageFolder:library.accountFolder(owner)})).bytes,png);
 assert.deepEqual((await previewImage(f.userFolder,f.preview.id,0,{imageFolder:library.accountFolder(owner)})).bytes,png);
 assert.equal(await readFile(path.join(f.userFolder,'wardrobe.json'),'utf8'),f.stateBytes);
 assert.deepEqual(await readFile(path.join(f.userFolder,'mannequin',f.preview.id,'request.json')),recordBefore);
 await assert.rejects(()=>readFile(path.join(f.directory,'accounts.json')),{code:'ENOENT'});
 await assert.rejects(()=>readFile(path.join(library.accountFolder(owner),'wardrobe.json')),{code:'ENOENT'});
 await assert.rejects(()=>readFile(path.join(f.userFolder,'images','seed-photo.png')),{code:'ENOENT'});
 assert.equal((await migrateImageLibrary({...f,move:true,env:{}})).images,0);
 const second=await completePreview(f.userFolder,f.preview.id,png,undefined,{imageFolder:library.accountFolder(owner)});assert.equal(second.imageVersions,2);
 // The same relative link works when the app and library are moved together.
 const relocated=path.join(f.dir,'relocated');await mkdir(relocated);await cp(f.root,path.join(relocated,'app'),{recursive:true});await cp(f.directory,path.join(relocated,'photos'),{recursive:true});
 const portable=await imageLibrary({root:path.join(relocated,'app'),data:path.join(relocated,'app','.data'),env:{}});
 assert.deepEqual(await readFile(path.join(portable.accountFolder(owner),'images','seed-photo.png')),png);
});
test('migration rejects conflicting images without deleting originals or changing configuration',async t=>{
 const f=await fixture(t),target=path.join(f.directory,'ClothingImages','Top','shirt.png');await mkdir(path.dirname(target),{recursive:true});await writeFile(target,'different');
 await assert.rejects(()=>migrateImageLibrary({...f,move:true,env:{}}),/different image/);
 assert.deepEqual(await readFile(path.join(f.root,'ClothingImages','Top','shirt.png')),png);
 await assert.rejects(()=>readFile(path.join(f.root,'stylebyfire.local.json')),{code:'ENOENT'});
});
test('configuration supports environment overrides and legacy defaults; migration refuses app/data destinations',async t=>{
 const f=await fixture(t),defaults=await imageLibrary({...f,env:{}});assert.equal(defaults.directory,null);assert.equal(defaults.accountFolder(owner),f.userFolder);
 await writeFile(path.join(f.root,'stylebyfire.local.json'),JSON.stringify({imageLibrary:'../photos'}));
 const override=await imageLibrary({...f,env:{STYLEBYFIRE_IMAGE_DIR:'../override'}});assert.equal(override.directory,path.join(f.dir,'override'));assert.equal(override.accountFolder(demo),path.join(f.data,'accounts',demo.id));
 for(const directory of [f.root,f.data,path.join(f.root,'library')])await assert.rejects(()=>migrateImageLibrary({...f,directory,env:{}}),/separate folder/);
 await writeFile(path.join(f.root,'stylebyfire.local.json'),'invalid');await assert.rejects(()=>imageLibrary({...f,env:{}}),/Cannot read/);
});
