import {readFile,realpath,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';

const formats={'.mp3':'audio/mpeg','.m4a':'audio/mp4','.ogg':'audio/ogg','.wav':'audio/wav'};
const invalid=message=>Object.assign(Error(message),{status:422});
export function validateAudioCatalog(catalog){
 if(!catalog||catalog.version!==1||!Array.isArray(catalog.tracks)||catalog.tracks.length>2000||Object.keys(catalog).some(k=>!['version','tracks'].includes(k)))throw invalid('Invalid audio library catalog.');
 const ids=new Set(),files=new Set();
 for(const t of catalog.tracks){
  if(!t||typeof t.id!=='string'||typeof t.pairId!=='string')throw invalid('Audio tracks require an ID and pair ID.');
  if(!t||Object.keys(t).some(k=>!['id','title','pairId','mood','file'].includes(k))||!Object.entries(t).every(([,v])=>typeof v==='string')||!/^[-a-z0-9]{1,100}$/.test(t.id)||!/^[-a-z0-9]{1,100}$/.test(t.pairId)||!t.title?.trim()||t.title.length>200||!t.mood?.trim()||t.mood.length>60||!t.file||t.file.length>500||/[\\:\x00-\x1f]/.test(t.file)||t.file.split('/').some(p=>!p||p==='.'||p==='..'||p.startsWith('.'))||!formats[path.extname(t.file).toLowerCase()]||ids.has(t.id)||files.has(t.file.toLowerCase()))throw invalid('Invalid or duplicate audio track. Use relative audio paths and explicit pair IDs.');
  ids.add(t.id);files.add(t.file.toLowerCase());
 }
 return catalog;
}
export async function audioCatalog(directory){
 try{return validateAudioCatalog(JSON.parse(await readFile(path.join(directory,'library.json'),'utf8')));}
 catch(error){if(error.code==='ENOENT')return {version:1,tracks:[]};throw error;}
}
export async function audioFile(directory,track){
 const base=await realpath(directory),file=await realpath(path.join(base,track.file));
 if(!file.startsWith(base+path.sep))throw invalid('Audio files must stay inside the linked Audio folder.');
 const info=await stat(file);if(!info.isFile())throw invalid('Audio track is not a file.');
 if(!formats[path.extname(file).toLowerCase()])throw invalid('Audio track must resolve to an audio file.');
 return {file,size:info.size,mime:formats[path.extname(file).toLowerCase()]};
}
export function audioRange(header,size){
 if(!header)return null;
 const match=/^bytes=(\d*)-(\d*)$/.exec(header);
 if(!match||(!match[1]&&!match[2])||size<=0)throw Object.assign(Error('Invalid audio byte range.'),{status:416});
 let start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
 let end=match[1]?(match[2]?Math.min(Number(match[2]),size-1):size-1):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start||(!match[1]&&Number(match[2])===0))throw Object.assign(Error('Invalid audio byte range.'),{status:416});
 return {start,end};
}
export async function streamAudio(req,res,directory,id){
 const track=(await audioCatalog(directory)).tracks.find(t=>t.id===id);
 if(!track)throw Object.assign(Error('Audio track not found.'),{status:404});
 const info=await audioFile(directory,track);let range;
 try{range=audioRange(req.headers.range,info.size);}catch(error){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;}
 const headers={'Content-Type':info.mime,'Accept-Ranges':'bytes','Content-Length':range?range.end-range.start+1:info.size,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
 if(range)headers['Content-Range']=`bytes ${range.start}-${range.end}/${info.size}`;
 res.writeHead(range?206:200,headers);if(req.method==='HEAD'){res.end();return;}
 const stream=createReadStream(info.file,range||{});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
}
