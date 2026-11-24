import {readFile,writeFile,mkdir,readdir,copyFile,unlink,realpath,rename} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {imageLibrary,LOCAL_CONFIG} from './image-library.mjs';
import {STARTER_SUBCATEGORIES} from './app/category-setup.js';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const image=/\.(jpe?g|png|webp|heic|heif|avif|gif|tiff?|bmp)$/i;
const contained=(base,file)=>{const relative=path.relative(base,file);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);};
async function files(directory){
 let entries;try{entries=await readdir(directory,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return [];throw error;}
 const result=[];
 for(const entry of entries){
  if(entry.isSymbolicLink())throw Error('Image migration does not follow symbolic links: '+entry.name);
  const full=path.join(directory,entry.name);
  if(entry.isDirectory())result.push(...await files(full));else if(entry.isFile()&&image.test(entry.name))result.push(full);
 }
 return result;
}
async function json(file,fallback){try{return JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}}
export async function scaffoldImageLibrary(directory,subcategories=STARTER_SUBCATEGORIES){
 for(const {category,path:sub} of subcategories){
  const parts=[category,...sub.split('/').map(s=>s.trim()).filter(Boolean)];
  if(parts.some(p=>!p||p==='.'||p==='..'||/[<>:"\\|?*\x00-\x1f]/.test(p)||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))continue;
  const folder=path.join(directory,'ClothingImages',...parts);await mkdir(folder,{recursive:true});
  await writeFile(path.join(folder,'.gitkeep'),'',{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});
 }
}
export async function migrateImageLibrary({root,data,directory,move=false,env=process.env}){
 root=await realpath(root);data=path.resolve(data);directory=path.resolve(root,directory);
 // A sibling or independent directory avoids accidentally committing the library with app code.
 await mkdir(directory,{recursive:true});directory=await realpath(directory);
 if(directory===root||contained(root,directory)||contained(directory,root)||directory===data||contained(data,directory)||contained(directory,data))throw Error('Choose a separate folder outside the application and account-data folders.');
 if(env.STYLEBYFIRE_IMAGE_DIR)throw Error('Unset STYLEBYFIRE_IMAGE_DIR while migrating; the command saves a portable local configuration.');
 const current=await imageLibrary({root,data,env}),registry=await json(path.join(data,'accounts.json'),{users:[]});
 const sourceRoot=current.directory===directory?root:current.inventoryRoot;
 const groups=[['ClothingImages',path.join(sourceRoot,'ClothingImages')],['thumbs',current.directory===directory?path.join(root,'app','thumbs'):current.thumbs],['legacy/images',current.directory===directory?path.join(data,'images'):current.legacyImages]];
 const subcategories=[...STARTER_SUBCATEGORIES];
 for(const user of registry.users.filter(u=>!u.isDemo)){
  if(!/^[a-f0-9-]{36}$/.test(user.id))throw Error('Invalid account ID.');
  const local=path.join(data,'accounts',user.id),source=current.directory===directory?local:current.accountFolder(user);
  groups.push([`accounts/${user.id}/images`,path.join(source,'images')],[`accounts/${user.id}/mannequin`,path.join(source,'mannequin')]);
  const state=await json(path.join(local,'wardrobe.json'),{});subcategories.push(...state.subcategories||[]);
 }
 const entries=[];
 for(const [prefix,base] of groups)for(const source of await files(base)){
  const target=path.join(directory,prefix,path.relative(base,source));
  if(!contained(directory,target))throw Error('Image path escapes the selected library.');
  entries.push({source,target,sha256:hash(await readFile(source))});
 }
 // Preflight all collisions before changing or removing any source file.
 for(const entry of entries){try{if(hash(await readFile(entry.target))!==entry.sha256)throw Error('Destination contains a different image: '+entry.target);}catch(error){if(error.code!=='ENOENT')throw error;}}
 for(const entry of entries){
  await mkdir(path.dirname(entry.target),{recursive:true});
  if(!contained(directory,await realpath(path.dirname(entry.target))))throw Error('Destination traverses a symbolic link.');
  await copyFile(entry.source,entry.target,constants.COPYFILE_EXCL).catch(error=>{if(error.code!=='EEXIST')throw error;});
  if(hash(await readFile(entry.target))!==entry.sha256)throw Error('Image verification failed: '+entry.target);
 }
 await scaffoldImageLibrary(directory,subcategories);
 const configFile=path.join(root,LOCAL_CONFIG),previous=await json(configFile,{});
 const config={...previous,imageLibrary:path.relative(root,directory).split(path.sep).join('/')||directory};
 // On different Windows drives path.relative returns an absolute path, which is also supported.
 await mkdir(data,{recursive:true});
 const record={version:1,createdAt:new Date().toISOString(),directory,previousConfig:previous,entries};
 await writeFile(path.join(data,'image-library-migration-'+randomUUID()+'.json'),JSON.stringify(record,null,2));
 const tmp=configFile+'.tmp';await writeFile(tmp,JSON.stringify(config,null,2)+'\n');await rename(tmp,configFile);
 if(move)for(const entry of entries){
  const source=await realpath(entry.source);
  if(!groups.some(([,base])=>contained(path.resolve(base),source)))throw Error('Source path changed during migration; no more originals were removed.');
  if(hash(await readFile(source))!==entry.sha256||hash(await readFile(entry.target))!==entry.sha256)throw Error('An image changed during migration; no more originals were removed.');
  await unlink(source);
 }
 return {directory,images:entries.length,moved:move,config:config.imageLibrary};
}
