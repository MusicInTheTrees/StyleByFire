// Local assistant handoff: inspect a prepared request or attach its generated image.
// This uses filesystem access, not a browser session, and never calls a model API.
import {readFile} from 'node:fs/promises';
import {imageLibrary} from '../image-library.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getPreview,completePreview} from '../mannequin-store.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const args=process.argv.slice(2),[username,id,imageFile]=args;
try{
 if(args.length<2||args.length>3)throw Error('Usage: node scripts/mannequin.mjs <username> <preview-id> [generated-image-file]');
 const data=path.resolve(process.env.STYLEBYFIRE_DATA_DIR||path.join(root,'.data'));
 const registry=JSON.parse(await readFile(path.join(data,'accounts.json'),'utf8'));
 const user=registry.users.find(user=>user.username.toLowerCase()===username.toLowerCase());
 if(!user||!/^[a-f0-9-]{36}$/.test(user.id))throw Error('Local account not found.');
 const userFolder=path.join(data,'accounts',user.id);
 const library=await imageLibrary({root,data}),imageFolder=library.accountFolder(user);
 let preview=await getPreview(userFolder,id);
 if(imageFile){preview=await completePreview(userFolder,id,await readFile(path.resolve(imageFile)),undefined,{imageFolder});console.log(JSON.stringify({id:preview.id,status:preview.status,imageSrc:preview.imageSrc}));}
 else{
  const requestFolder=path.join(userFolder,'mannequin',preview.id);
  const record=JSON.parse(await readFile(path.join(requestFolder,'request.json'),'utf8'));
  console.log(JSON.stringify({id:preview.id,status:preview.status,prompt:preview.prompt,items:preview.spec.items,references:record.references.map(ref=>path.join(imageFolder,'mannequin',preview.id,ref.file))},null,2));
 }
}catch(error){console.error(error.message);process.exitCode=1;}
