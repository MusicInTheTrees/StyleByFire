import {readFile,writeFile,mkdir,readdir,rename,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {buildPreviewSpec,buildMannequinPrompt,previewKey} from './app/mannequin.js';

const MAX_IMAGE=20*1024*1024,MAX_REFERENCES=80*1024*1024;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const failure=(message,status=400)=>Object.assign(Error(message),{status});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const folder=(userFolder,id)=>{if(!uuid.test(id))throw failure('Preview not found.',404);return path.join(userFolder,'mannequin',id);};
const imageTypes={png:'image/png',jpg:'image/jpeg',webp:'image/webp'};
export function previewImageType(bytes){
 if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>MAX_IMAGE)throw failure('Choose an image under 20 MB.',413);
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpg';
 if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png';
 if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'webp';
 throw failure('Choose a JPEG, PNG, or WebP image.',415);
}
async function atomicJSON(file,value){const tmp=file+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(value,null,2));await rename(tmp,file);}
function summary(record){return {id:record.id,status:record.status,createdAt:record.createdAt,completedAt:record.completedAt||null,mode:record.spec.mode,bodyShape:record.spec.bodyShape,itemIds:record.spec.items.map(i=>i.id),itemNames:record.spec.items.map(i=>i.name),key:record.key,imageVersions:record.results?.length||0,imageSrc:record.status==='complete'?`/api/mannequin/${record.id}/image`:null};}
async function readRecord(userFolder,id){
 let record;try{record=JSON.parse(await readFile(path.join(folder(userFolder,id),'request.json'),'utf8'));}catch(error){if(error.code==='ENOENT')throw failure('Preview not found.',404);throw error;}
 if(record.id!==id||record.version!==1||!['prepared','complete'].includes(record.status)||!Array.isArray(record.references)||!Array.isArray(record.spec?.items))throw failure('This preview record is invalid.');
 return record;
}
async function records(userFolder){
 let entries;try{entries=await readdir(path.join(userFolder,'mannequin'),{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return [];throw error;}
 const result=[];for(const entry of entries){if(entry.isDirectory()&&uuid.test(entry.name)){try{result.push(await readRecord(userFolder,entry.name));}catch(error){if(error.status!==404)throw error;}}}return result;
}
export async function listPreviews(userFolder){return (await records(userFolder)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(summary);}
export async function getPreview(userFolder,id){
 const record=await readRecord(userFolder,id);
 return {...summary(record),spec:record.spec,prompt:record.prompt,references:record.spec.items.map((item,n)=>({...item,originalSrc:item.src,src:`/api/mannequin/${id}/references/${n}`}))};
}
export async function createPreview({userFolder,state,itemIds,mode,bodyShape,pose,resolveSource}){
 const spec=buildPreviewSpec(state,itemIds,{mode,bodyShape,pose});
 const refs=[];let total=0;
 for(const item of spec.items){
  const source=await resolveSource(item.src),info=await stat(source);if(info.size>MAX_IMAGE)throw failure('A reference image exceeds 20 MB.',413);
  const bytes=await readFile(source),extension=previewImageType(bytes);total+=bytes.length;if(total>MAX_REFERENCES)throw failure('The selected reference images exceed 80 MB. Choose fewer pieces.',413);
  refs.push({bytes,extension,sha256:digest(bytes)});
 }
 const key=digest(previewKey(spec)+'\n'+refs.map(r=>r.sha256).join('\n'));
 const existing=await records(userFolder),matching=existing.find(record=>record.key===key);
 if(matching)return {...await getPreview(userFolder,matching.id),reused:true};
 if(existing.length>=100)throw failure('This account has reached the limit of 100 mannequin previews. Reopen an existing preview.');
 const id=randomUUID(),target=folder(userFolder,id);await mkdir(target,{recursive:true});
 const references=[];
 for(let n=0;n<refs.length;n++){const ref=refs[n],file=`reference-${n}.${ref.extension}`;await writeFile(path.join(target,file),ref.bytes,{flag:'wx'});references.push({file,sha256:ref.sha256,mime:imageTypes[ref.extension]});}
 const record={version:1,id,key,status:'prepared',createdAt:new Date().toISOString(),spec,prompt:buildMannequinPrompt(spec),references};
 await atomicJSON(path.join(target,'request.json'),record);
 return {...await getPreview(userFolder,id),reused:false};
}
export async function completePreview(userFolder,id,bytes,mime){
 const extension=previewImageType(bytes),actualMime=imageTypes[extension];if(mime&&mime!==actualMime)throw failure('The image type does not match its contents.',415);
 const record=await readRecord(userFolder,id),target=folder(userFolder,id);
 const versions=record.results||[];if(versions.length>=10)throw failure('This preview already has 10 saved image versions.');
 const file=`result-${randomUUID()}.${extension}`;await writeFile(path.join(target,file),bytes,{flag:'wx'});
 const result={file,mime:actualMime,sha256:digest(bytes),createdAt:new Date().toISOString()};
 record.results=[...versions,result];record.result=result;record.status='complete';record.completedAt=result.createdAt;
 await atomicJSON(path.join(target,'request.json'),record);return getPreview(userFolder,id);
}
export async function previewImage(userFolder,id,referenceIndex){
 const record=await readRecord(userFolder,id);let selected;
 if(referenceIndex!==undefined){if(!Number.isInteger(referenceIndex)||referenceIndex<0||referenceIndex>=record.references.length)throw failure('Reference image not found.',404);selected=record.references[referenceIndex];if(!/^reference-\d+\.(png|jpg|webp)$/.test(selected.file))throw failure('Invalid reference file.');}
 else{if(record.status!=='complete'||!record.result)throw failure('This preview has not been generated yet.',404);selected=record.result;if(!/^result-[a-f0-9-]+\.(png|jpg|webp)$/.test(selected.file))throw failure('Invalid preview file.');}
 if(!Object.values(imageTypes).includes(selected.mime))throw failure('Invalid image type.');
 return {bytes:await readFile(path.join(folder(userFolder,id),selected.file)),mime:selected.mime};
}
