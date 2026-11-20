import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {providerStatus,generatePreview} from '../mannequin-providers.mjs';

const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lVEAAAAASUVORK5CYII=','base64');
const reference={bytes,mime:'image/png'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const preview={provider:'openai',prompt:'Dress a faceless mannequin in these garments.',references:[reference]};
async function withWorkflow(t,count=2){
 const dir=await mkdtemp(path.join(os.tmpdir(),'stylebyfire-providers-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const workflow={'1':{class_type:'CLIPTextEncode',inputs:{text:'{{prompt}}'}},'2':{class_type:'SaveImage',inputs:{images:['3',0]}}};
 for(let n=1;n<=count;n++)workflow[String(n+2)]={class_type:'LoadImage',inputs:{image:`{{image_${n}}}`}};
 const file=path.join(dir,'workflow.json');await writeFile(file,JSON.stringify(workflow));
 return {STYLEBYFIRE_COMFYUI_WORKFLOW:file};
}

test('readiness never sends a billed API request or exposes secrets and file paths',async t=>{
 const env={...await withWorkflow(t),OPENAI_API_KEY:'private-server-key'};
 const calls=[];
 const state=await providerStatus({env,fetchImpl:async(url,init)=>{calls.push([url,init]);return json({devices:[]});}});
 assert.equal(state.providers.find(p=>p.id==='openai').ready,true);
 assert.equal(state.providers.find(p=>p.id==='local').ready,true);
 assert.deepEqual(calls.map(c=>c[0]),['http://127.0.0.1:8188/system_stats']);
 assert(!JSON.stringify(state).includes('private-server-key'));
 assert(!JSON.stringify(state).includes(env.STYLEBYFIRE_COMFYUI_WORKFLOW));
 const disabled=await providerStatus({env:{},fetchImpl:()=>assert.fail('Unconfigured providers should not make requests')});
 assert.equal(disabled.providers.find(p=>p.id==='openai').ready,false);
 assert.equal(disabled.providers.find(p=>p.id==='local').ready,false);
 assert.equal(disabled.providers.find(p=>p.id==='assisted').ready,true);
});

test('OpenAI edits sends all ordered references in multipart and returns image bytes',async()=>{
 let count=0;
 const result=await generatePreview({...preview,references:[reference,reference]},{env:{OPENAI_API_KEY:'test-only-key'},fetchImpl:async(url,init)=>{
  count++;assert.equal(url,'https://api.openai.com/v1/images/edits');assert.equal(init.redirect,'error');
  assert.equal(init.headers.Authorization,'Bearer test-only-key');
  assert.equal(init.body.get('model'),'gpt-image-2.6-sunburst');
  assert.equal(init.body.get('prompt'),preview.prompt);
  assert.deepEqual(init.body.getAll('image[]').map(file=>file.name),['garment-1.png','garment-2.png']);
  assert.equal(init.body.get('n'),'1');assert.equal(init.body.get('output_format'),'png');
  return json({data:[{b64_json:bytes.toString('base64')}]});
 }});
 assert.equal(count,1);assert.deepEqual(result.bytes,bytes);assert.equal(result.mime,'image/png');
});

test('OpenAI fails safely on limits, missing credentials, provider errors and invalid output',async()=>{
 const never=()=>assert.fail('Invalid configuration must not upload images');
 await assert.rejects(generatePreview(preview,{env:{},fetchImpl:never}),/not configured/);
 await assert.rejects(generatePreview({...preview,references:Array(17).fill(reference)},{env:{OPENAI_API_KEY:'fake'},fetchImpl:never}),/up to 16/);
 await assert.rejects(generatePreview({...preview,prompt:'x'.repeat(32001)},{env:{},fetchImpl:never}),/32,000/);
 for(const status of [401,429,500]){
  await assert.rejects(generatePreview(preview,{env:{OPENAI_API_KEY:'fake'},fetchImpl:async()=>json({error:{message:'secret fake /private/wardrobe'}},status)}),error=>error.status===502&&!error.message.includes('secret')&&!error.message.includes('/private'));
 }
 await assert.rejects(generatePreview(preview,{env:{OPENAI_API_KEY:'fake'},fetchImpl:async()=>json({data:[{url:'https://untrusted.example/image'}]})}),/usable image/);
 await assert.rejects(generatePreview(preview,{env:{OPENAI_API_KEY:'fake'},fetchImpl:async()=>{throw Error('Authorization Bearer fake');}}),error=>!error.message.includes('fake')&&/connect/.test(error.message));
});

test('ComfyUI uploads references, safely fills template, queues and downloads only output',async t=>{
 const env={...await withWorkflow(t),STYLEBYFIRE_COMFYUI_URL:'http://localhost:8188'};
 let uploads=0,polled=0,submitted;
 const prompt='White shirt; user data contains "quotes" and {{image_1}}.';
 const fetchImpl=async(url,init)=>{
  assert.equal(init.redirect,'error');assert(url.startsWith('http://127.0.0.1:8188/'));
  if(url.endsWith('/upload/image')){uploads++;assert.equal(init.body.get('overwrite'),'false');return json({name:`image-${uploads}.png`,subfolder:'outfit',type:'input'});}
  if(url.endsWith('/prompt')){submitted=JSON.parse(init.body);return json({prompt_id:'job-1',node_errors:{}});}
  if(url.endsWith('/history/job-1')){polled++;return polled===1?json({}):json({'job-1':{status:{completed:true},outputs:{'2':{images:[{filename:'done.png',subfolder:'',type:'output'}]}}}});}
  assert(url.includes('/view?filename=done.png&subfolder=&type=output'));return new Response(bytes,{headers:{'Content-Type':'image/png'}});
 };
 const result=await generatePreview({provider:'local',prompt,references:[reference,reference]},{env,fetchImpl,pollMs:1});
 assert.equal(uploads,2);assert.equal(polled,2);assert.equal(submitted.prompt['1'].inputs.text,prompt);
 assert.equal(submitted.prompt['3'].inputs.image,'outfit/image-1.png');assert.equal(submitted.prompt['4'].inputs.image,'outfit/image-2.png');
 assert.deepEqual(result.bytes,bytes);assert.equal(result.provider,'local');
});

test('local validates loopback, workflow and every reference before uploading',async t=>{
 const env=await withWorkflow(t),never=()=>assert.fail('Rejected local configuration must not make requests');
 for(const url of ['https://example.com','http://192.168.0.2:8188','http://localhost:8188/x','http://user:pass@127.0.0.1:8188','http://127.0.0.1:8188/?key=secret']){
  await assert.rejects(generatePreview({...preview,provider:'local',references:[reference,reference]},{env:{...env,STYLEBYFIRE_COMFYUI_URL:url},fetchImpl:never}),/loopback/);
 }
 await assert.rejects(generatePreview({...preview,provider:'local'},{env,fetchImpl:never}),/all 1 selected/);
 await writeFile(env.STYLEBYFIRE_COMFYUI_WORKFLOW,JSON.stringify({nodes:[]}));
 await assert.rejects(generatePreview({...preview,provider:'local'},{env,fetchImpl:never}),/API format/);
 const readiness=await providerStatus({env:{...env,STYLEBYFIRE_COMFYUI_WORKFLOW:'C:/private/missing-secret.json'},fetchImpl:never});
 assert.equal(readiness.providers.find(p=>p.id==='local').ready,false);assert(!JSON.stringify(readiness).includes('missing-secret'));
});

test('local reports execution failure, traversal, missing outputs and bounded cancellation',async t=>{
 const env=await withWorkflow(t,1);
 const local={...preview,provider:'local'};
 const service=entry=>async url=>url.endsWith('/upload/image')?json({name:'input.png'}):url.endsWith('/prompt')?json({prompt_id:'job-1'}):json({'job-1':entry});
 await assert.rejects(generatePreview(local,{env,fetchImpl:service({status:{status_str:'error',messages:[['execution_error',{secret:'private'}]]}})}),error=>/local model/.test(error.message)&&!error.message.includes('private'));
 await assert.rejects(generatePreview(local,{env,fetchImpl:service({status:{completed:true},outputs:{}})}),/SaveImage/);
 await assert.rejects(generatePreview(local,{env,fetchImpl:service({outputs:{a:{images:[{filename:'../private.png',subfolder:'',type:'output'}]}}})}),/invalid output image/);
 await assert.rejects(generatePreview(local,{env,fetchImpl:async()=>json({name:'../private.png'} )}),/invalid uploaded image/);
 await assert.rejects(generatePreview(local,{env,fetchImpl:service(undefined),timeoutMs:20,pollMs:2}),error=>error.status===504&&/timed out/.test(error.message));
 const controller=new AbortController();controller.abort();
 await assert.rejects(generatePreview({...local,signal:controller.signal},{env,fetchImpl:()=>assert.fail('Already cancelled')}),/cancelled/);
});
