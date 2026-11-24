import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {migrateImageLibrary} from '../image-library-migration.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
try{
 const args=process.argv.slice(2),directory=args[0];
 if(!directory||args.slice(1).some(a=>a!=='--move'))throw Error('Usage: node scripts/image-library.mjs <folder> [--move]\nStop the app first. Copies and verifies images, creates the category tree, and saves the local folder link. --move removes verified source copies.');
 let running=false;
 try{const response=await fetch(`http://127.0.0.1:${process.env.PORT||4173}/api/health`,{signal:AbortSignal.timeout(1000)});running=response.ok&&(await response.json()).app==='StyleByFire';}catch{}
 if(running)throw Error('Stop StyleByFire before changing its image-library folder.');
 const data=path.resolve(process.env.STYLEBYFIRE_DATA_DIR||path.join(root,'.data'));
 console.log(JSON.stringify(await migrateImageLibrary({root,data,directory,move:args.includes('--move')}),null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
