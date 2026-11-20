import {readFile,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {previewImageType} from './mannequin-store.mjs';

const MAX_IMAGE=20*1024*1024,MAX_JSON=30*1024*1024;
const DEFAULT_MODEL='gpt-image-2.6-sunburst';
const fail=(message,status=400)=>Object.assign(Error(message),{status,providerSafe:true});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const mimeFor={png:'image/png',jpg:'image/jpeg',webp:'image/webp'};

function localURL(env){
 let url;try{url=new URL(env.STYLEBYFIRE_COMFYUI_URL||'http://127.0.0.1:8188');}catch{throw fail('Set the ComfyUI URL to a local HTTP address.');}
 if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw fail('ComfyUI must use a loopback HTTP address without a path or credentials.');
 // Avoid DNS resolution for localhost; only this computer receives wardrobe images.
 if(url.hostname==='localhost')url.hostname='127.0.0.1';
 return url.origin;
}
function imageModel(env){
 const model=env.STYLEBYFIRE_OPENAI_IMAGE_MODEL||DEFAULT_MODEL;
 if(!/^gpt-image-[a-z0-9.-]{1,80}$/.test(model))throw fail('Set a supported GPT Image model for the optional API.');
 return model;
}
function validateWorkflow(value){
 if(!object(value)||!Object.keys(value).length||Object.keys(value).length>500||Object.values(value).some(node=>!object(node)||typeof node.class_type!=='string'||!node.class_type||!object(node.inputs)))throw fail('Export the ComfyUI workflow in API format, with node IDs, class_type, and inputs.');
 const serialized=JSON.stringify(value);
 if(!serialized.includes('{{prompt}}'))throw fail('Add {{prompt}} to the local workflow text input.');
 if(!/\{\{image_[1-9]\d*\}\}/.test(serialized))throw fail('Add {{image_1}} and the other garment image placeholders to the local workflow.');
 return value;
}
async function loadWorkflow(env){
 if(!env.STYLEBYFIRE_COMFYUI_WORKFLOW)throw fail('Set up ComfyUI and choose an API-format garment editing workflow first.',503);
 try{
  const file=env.STYLEBYFIRE_COMFYUI_WORKFLOW,info=await stat(file);
  if(!info.isFile()||info.size>1024*1024)throw fail('Choose a ComfyUI workflow JSON file under 1 MB.');
  return validateWorkflow(JSON.parse(await readFile(file,'utf8')));
 }catch(error){if(error.providerSafe)throw error;throw fail('The configured ComfyUI workflow cannot be read as JSON.');}
}
function workflowInputs(workflow,count){
 const text=JSON.stringify(workflow),indexes=new Set([...text.matchAll(/\{\{image_(\d+)\}\}/g)].map(match=>Number(match[1])));
 if([...indexes].some(index=>index<1||index>count)||indexes.size!==count)throw fail(`This local workflow must include all ${count} selected garment references. Use image placeholders numbered 1 through ${count}.`);
 const unknown=[...text.matchAll(/\{\{([^{}]+)\}\}/g)].some(match=>match[1]!=='prompt'&&!/^image_[1-9]\d*$/.test(match[1]));
 if(unknown)throw fail('The local workflow contains an unsupported placeholder. Use {{prompt}} and {{image_1}}, {{image_2}}, and so on.');
}
function fillWorkflow(value,prompt,images){
 if(typeof value==='string')return value.replace(/\{\{(prompt|image_([1-9]\d*))\}\}/g,(_,token,n)=>token==='prompt'?prompt:images[Number(n)-1]);
 if(Array.isArray(value))return value.map(child=>fillWorkflow(child,prompt,images));
 if(object(value))return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,fillWorkflow(child,prompt,images)]));
 return value;
}
async function responseBytes(response,limit){
 if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw fail('The image service returned a response that is too large.',502);}
 if(!response.body)throw fail('The image service returned an empty response.',502);
 const reader=response.body.getReader(),chunks=[];let total=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>limit)throw fail('The image service returned a response that is too large.',502);chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
 return Buffer.concat(chunks,total);
}
async function requestJSON(fetchImpl,url,init,label){
 const response=await fetchImpl(url,{...init,redirect:'error'});
 if(!response.ok){await response.body?.cancel();const status=response.status;throw fail(label==='OpenAI'?(status===401||status===403?'OpenAI rejected the API credentials or model access. Check the server API key and project access.':status===429?'OpenAI is rate-limited or the API project needs billing credit. Please check the project before trying again.':`OpenAI could not generate this preview (HTTP ${status}).`):`ComfyUI could not complete this request (HTTP ${status}).`,502);}
 try{return JSON.parse((await responseBytes(response,MAX_JSON)).toString('utf8'));}catch(error){if(error.providerSafe)throw error;throw fail(`${label} returned an unreadable response.`,502);}
}
function validImage(bytes){
 try{const type=previewImageType(bytes);return {bytes,mime:mimeFor[type]};}
 catch(error){throw fail(error.message,error.status||415);}
}

// This is readiness, not a billed API health check. Secrets and local file paths never leave the server.
export async function providerStatus({env=process.env,fetchImpl=fetch}={}){
 const assisted={id:'assisted',label:'Codex-assisted',configured:true,ready:true,message:'Prepare the outfit here, then ask Codex to generate it. No API key required.'};
 const openai={id:'openai',label:'OpenAI API · optional',configured:Boolean(env.OPENAI_API_KEY?.trim()),ready:false,message:'Optional, separately billed. Set OPENAI_API_KEY on the app server to enable it.'};
 try{openai.model=imageModel(env);openai.ready=openai.configured;if(openai.ready)openai.message='API key configured. Selected photos and styling corrections go to OpenAI only when you choose Generate. API access and billing are checked when generating.';}catch(error){openai.message=error.message;}
 const local={id:'local',label:'Local ComfyUI',configured:Boolean(env.STYLEBYFIRE_COMFYUI_WORKFLOW),ready:false,message:'Connect a local ComfyUI installation and garment editing workflow.'};
 try{
  const base=localURL(env);await loadWorkflow(env);
  await requestJSON(fetchImpl,base+'/system_stats',{signal:AbortSignal.timeout(2000)},'ComfyUI');
  local.ready=true;local.message='ComfyUI is running on this computer. The chosen workflow must support every selected garment image.';
 }catch(error){local.message=error.providerSafe?error.message:'ComfyUI is not responding. Start the local engine and check its URL.';}
 return {providers:[assisted,local,openai]};
}

async function generateOpenAI(prompt,references,{env,fetchImpl,signal}){
 if(!env.OPENAI_API_KEY?.trim())throw fail('The optional OpenAI API is not configured. Set OPENAI_API_KEY on the app server.',503);
 if(references.length>16)throw fail('The OpenAI route supports up to 16 reference images. Choose fewer pieces or use another route.');
 const model=imageModel(env),body=new FormData();
 for(const [index,reference] of references.entries())body.append('image[]',new Blob([reference.bytes],{type:reference.mime}),`garment-${index+1}.${previewImageType(reference.bytes)}`);
 for(const [key,value] of Object.entries({model,prompt,n:'1',size:'1024x1536',quality:'high',output_format:'png'}))body.append(key,value);
 const result=await requestJSON(fetchImpl,'https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY.trim()}`},body,signal},'OpenAI');
 const encoded=result?.data?.[0]?.b64_json;
 if(typeof encoded!=='string'||!encoded.length||encoded.length>Math.ceil(MAX_IMAGE/3)*4||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw fail('OpenAI did not return a usable image.',502);
 return {...validImage(Buffer.from(encoded,'base64')),provider:'openai',model};
}
function safeImageName(name){return typeof name==='string'&&name.length>0&&name.length<256&&!/[\\/\x00-\x1f]/.test(name)&&name!=='.'&&name!=='..';}
function safeSubfolder(name){return typeof name==='string'&&name.length<512&&!/[\\\x00-\x1f]/.test(name)&&!name.startsWith('/')&&name.split('/').every(part=>part!=='.'&&part!=='..');}
async function generateLocal(prompt,references,{env,fetchImpl,signal,pollMs}){
 const base=localURL(env),workflow=await loadWorkflow(env);workflowInputs(workflow,references.length);
 const uploaded=[];
 for(const [index,reference] of references.entries()){
  const name=`stylebyfire-${randomUUID()}-${index+1}.${previewImageType(reference.bytes)}`,body=new FormData();
  body.append('image',new Blob([reference.bytes],{type:reference.mime}),name);body.append('type','input');body.append('overwrite','false');
  const result=await requestJSON(fetchImpl,base+'/upload/image',{method:'POST',body,signal},'ComfyUI');
  if(!safeImageName(result?.name)||!safeSubfolder(result.subfolder||'')||(result.type&&result.type!=='input'))throw fail('ComfyUI returned an invalid uploaded image name.',502);
  uploaded.push([result.subfolder,result.name].filter(Boolean).join('/'));
 }
 const result=await requestJSON(fetchImpl,base+'/prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:fillWorkflow(workflow,prompt,uploaded),client_id:randomUUID()}),signal},'ComfyUI');
 if(typeof result?.prompt_id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(result.prompt_id)||result.error||Object.keys(result.node_errors||{}).length)throw fail('ComfyUI rejected this workflow. Check its models, image inputs, and output node.',502);
 while(true){
  signal.throwIfAborted();
  const history=await requestJSON(fetchImpl,base+'/history/'+encodeURIComponent(result.prompt_id),{signal},'ComfyUI'),entry=history?.[result.prompt_id];
  if(entry?.status?.status_str==='error'||entry?.status?.messages?.some(message=>Array.isArray(message)&&message[0]==='execution_error'))throw fail('The local model could not finish this preview. Check ComfyUI for missing models, unsupported nodes, or GPU memory limits.',502);
  const output=Object.values(entry?.outputs||{}).flatMap(node=>Array.isArray(node?.images)?node.images:[]).find(image=>image.type==='output');
  if(output){
   if(!safeImageName(output.filename)||!safeSubfolder(output.subfolder||''))throw fail('ComfyUI returned an invalid output image name.',502);
   const query=new URLSearchParams({filename:output.filename,subfolder:output.subfolder||'',type:'output'}),response=await fetchImpl(base+'/view?'+query,{signal,redirect:'error'});
   if(!response.ok){await response.body?.cancel();throw fail('The generated local image could not be downloaded.',502);}
   return {...validImage(await responseBytes(response,MAX_IMAGE)),provider:'local'};
  }
  if(entry?.status?.completed)throw fail('The local workflow finished without an output image. Add a SaveImage node.',502);
  await sleep(pollMs,undefined,{signal});
 }
}

export async function generatePreview({provider,prompt,references,signal:callerSignal},{env=process.env,fetchImpl=fetch,timeoutMs=10*60*1000,pollMs=1000}={}){
 if(!['openai','local'].includes(provider))throw fail('Choose the local or optional OpenAI engine to generate automatically. Codex-assisted requests are generated in chat.');
 if(typeof prompt!=='string'||!prompt.trim()||prompt.length>32000)throw fail('The preview instructions must be between 1 and 32,000 characters. Shorten garment descriptions or styling notes.');
 if(!Array.isArray(references)||references.length<1||references.length>20)throw fail('Choose between 1 and 20 garment reference images.');
 let total=0;for(const ref of references){const actual=validImage(ref?.bytes);if(ref.mime!==actual.mime)throw fail('A garment image has an invalid content type.');total+=ref.bytes.length;}if(total>80*1024*1024)throw fail('The selected reference images exceed 80 MB.',413);
 const signal=AbortSignal.any([AbortSignal.timeout(timeoutMs),...(callerSignal?[callerSignal]:[])]),options={env,fetchImpl,signal,pollMs};
 try{signal.throwIfAborted();return await (provider==='openai'?generateOpenAI(prompt,references,options):generateLocal(prompt,references,options));}
 catch(error){
  if(error.providerSafe)throw error;
  if(signal.aborted)throw fail(callerSignal?.aborted?'Preview generation was cancelled. The image service may still finish its request.':'Preview generation timed out. Check the image service before retrying; the original request may still finish.',504);
  throw fail(provider==='openai'?'Could not connect to OpenAI. Check the server connection before trying again.':'Could not connect to ComfyUI. Start the local engine and check its workflow.',502);
 }
}
