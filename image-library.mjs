import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';

export const LOCAL_CONFIG='stylebyfire.local.json';
export async function imageLibrary({root,data,env=process.env}){
 let config={};
 try{config=JSON.parse(await readFile(path.join(root,LOCAL_CONFIG),'utf8'));}
 catch(error){if(error.code!=='ENOENT')throw Error('Cannot read '+LOCAL_CONFIG+': '+error.message);}
 const selected=env.STYLEBYFIRE_IMAGE_DIR||config.imageLibrary;
 if(selected!==undefined&&(typeof selected!=='string'||!selected.trim()))throw Error('imageLibrary must be a nonempty folder path.');
 const directory=selected?path.resolve(root,selected):null;
 if(directory===path.resolve(root)||directory===path.resolve(data))throw Error('Choose a separate image-library folder, not the application or account-data folder.');
 const library={
  directory,
  inventoryRoot:directory||root,
  thumbs:path.join(directory||path.join(root,'app'),'thumbs'),
  legacyImages:directory?path.join(directory,'legacy','images'):path.join(data,'images'),
  accountFolder(user){return path.join(directory&&!user.isDemo?directory:data,'accounts',user.id);},
  async initialize(){
   if(directory){await mkdir(directory,{recursive:true});for(const name of ['Cap','Top','Bottom','Socks','Shoes','Accessories'])await mkdir(path.join(directory,'ClothingImages',name),{recursive:true});}
  }
 };
 return library;
}
