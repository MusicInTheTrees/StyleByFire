import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {DEFAULT_PROFILE,DEFAULT_RULES,DEFAULT_ADJUSTMENTS} from '../app/domain.js';
import {createPreview,getPreview,listPreviews,completePreview,previewImage,previewImageType} from '../mannequin-store.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=','base64');
const item=(id,category,extra={})=>({id,name:id,category,role:'base',color:'Black',colorVerified:true,pattern:'Solid',formality:2,warmth:1,tags:[],modes:['Casual','Business'],favorite:false,subcategory:'',src:'/media/seed-'+id+'.png',notes:'Personal note stays private',stylistNotes:'',adjustments:structuredClone(DEFAULT_ADJUSTMENTS),...extra});
const wardrobe=()=>({version:1,items:[item('shirt','Top',{color:'White',secondaryColor:'Black',pattern:'Geometric',description:'White shirt with black geometry.',stylistNotes:'White base, not charcoal.'}),item('pants','Bottom'),item('tie','Accessories',{subcategory:'Ties / Neckties'})],looks:[],subcategories:[],profile:structuredClone(DEFAULT_PROFILE),rules:structuredClone(DEFAULT_RULES)});
async function temporary(t,beforeCleanup=async()=>{}){const dir=await mkdtemp(path.join(tmpdir(),'stylebyfire-mannequin-'));t.after(async()=>{await beforeCleanup();const resolved=path.resolve(dir);assert.ok(resolved.startsWith(path.resolve(tmpdir())+path.sep)&&path.basename(resolved).startsWith('stylebyfire-mannequin-'));await rm(resolved,{recursive:true,force:true});});return dir;}
async function storedFixture(t){const dir=await temporary(t),source=path.join(dir,'reference.png'),userFolder=path.join(dir,'account-a'),state=wardrobe();await writeFile(source,png);const input={userFolder,state,itemIds:state.items.map(i=>i.id),mode:'Business',bodyShape:'broad',resolveSource:()=>source};return {dir,source,userFolder,state,input};}

test('preview requests snapshot corrections, preserve private reference photos and reuse identical content',async t=>{
 const f=await storedFixture(t),preview=await createPreview(f.input);
 assert.equal(preview.status,'prepared');assert.equal(preview.reused,false);assert.equal(preview.imageSrc,null);assert.equal(preview.references.length,3);
 assert.equal(preview.spec.items[0].color,'White');assert.equal(preview.spec.items[0].secondaryColor,'Black');assert.equal(preview.spec.items[0].stylistNotes,'White base, not charcoal.');
 assert.equal(preview.spec.items.find(i=>i.id==='tie').accessoryType,'tie');assert.ok(!JSON.stringify(preview).includes('Personal note stays private'));assert.ok(!JSON.stringify(preview).includes(f.dir));
 assert.equal(preview.references[0].src,`/api/mannequin/${preview.id}/references/0`);
 const duplicate=await createPreview({...f.input,itemIds:[...f.input.itemIds].reverse()});assert.equal(duplicate.id,preview.id);assert.equal(duplicate.reused,true);
 const changedBytes=Buffer.concat([png,Buffer.from('changed photo')]);await writeFile(f.source,changedBytes);
 assert.deepEqual((await previewImage(f.userFolder,preview.id,0)).bytes,png);
 const changed=await createPreview(f.input);assert.notEqual(changed.id,preview.id);assert.notEqual(changed.key,preview.key);
 f.state.items[0].color='Cream';assert.equal((await getPreview(f.userFolder,preview.id)).spec.items[0].color,'White');
 const manifest=JSON.parse(await readFile(path.join(f.userFolder,'mannequin',preview.id,'request.json'),'utf8'));assert.match(manifest.references[0].file,/^reference-0\.png$/);assert.ok(!JSON.stringify(manifest).includes(f.dir));
 assert.equal((await listPreviews(f.userFolder)).length,2);assert.deepEqual(await listPreviews(path.join(f.dir,'empty-account')),[]);
});

test('completed previews retain their snapshot, validate bytes and isolate account folders',async t=>{
 const f=await storedFixture(t),preview=await createPreview(f.input);
 await assert.rejects(()=>previewImage(f.userFolder,preview.id),error=>error.status===404);
 await assert.rejects(()=>completePreview(f.userFolder,preview.id,Buffer.from('<svg></svg>')),error=>error.status===415);
 await assert.rejects(()=>completePreview(f.userFolder,preview.id,png,'image/jpeg'),error=>error.status===415);
 assert.equal((await getPreview(f.userFolder,preview.id)).status,'prepared');
 const completed=await completePreview(f.userFolder,preview.id,png,'image/png');assert.equal(completed.status,'complete');assert.ok(completed.completedAt);assert.equal(completed.key,preview.key);assert.equal(completed.imageSrc,`/api/mannequin/${preview.id}/image`);
 assert.deepEqual(await previewImage(f.userFolder,preview.id),{bytes:png,mime:'image/png'});
 assert.equal((await listPreviews(f.userFolder))[0].status,'complete');
 for(const id of ['../account-a','../../request.json','not-a-preview'])await assert.rejects(()=>getPreview(f.userFolder,id),error=>error.status===404);
 await assert.rejects(()=>getPreview(path.join(f.dir,'account-b'),preview.id),error=>error.status===404);
 await assert.rejects(()=>previewImage(path.join(f.dir,'account-b'),preview.id),error=>error.status===404);
 for(const index of [-1,3,0.5])await assert.rejects(()=>previewImage(f.userFolder,preview.id,index),error=>error.status===404);
 for(let n=1;n<10;n++)await completePreview(f.userFolder,preview.id,png);
 assert.equal((await getPreview(f.userFolder,preview.id)).imageVersions,10);await assert.rejects(()=>completePreview(f.userFolder,preview.id,png),/10 saved image versions/);
});

test('preview image sizes and image signatures are constrained',()=>{
 assert.equal(previewImageType(png),'png');assert.equal(previewImageType(Buffer.from([255,216,255,224])),'jpg');assert.equal(previewImageType(Buffer.from('RIFF1234WEBP')),'webp');
 for(const bytes of [Buffer.alloc(0),Buffer.alloc(20*1024*1024+1)])assert.throws(()=>previewImageType(bytes),error=>error.status===413);
 for(const bytes of [Buffer.from('<script>'),Buffer.from('RIFF1234WAVE'),Buffer.from([137,80])])assert.throws(()=>previewImageType(bytes),error=>error.status===415);
});

test('account preview limits allow reopening existing requests but reject new ones',async t=>{
 const f=await storedFixture(t);let first;
 for(let n=0;n<100;n++){f.state.items[0].description=`Preview variation ${n}`;const created=await createPreview(f.input);if(n===0)first=created;}
 f.state.items[0].description='Preview variation 0';assert.equal((await createPreview(f.input)).id,first.id);
 f.state.items[0].description='One too many';await assert.rejects(()=>createPreview(f.input),/100 mannequin previews/);
 assert.equal((await listPreviews(f.userFolder)).length,100);
});

async function serverFixture(t,{fakeProvider=false}={}){
 let child;const dir=await temporary(t,async()=>{if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill();await exited;}}),project=path.join(dir,'project'),data=path.join(dir,'data');await mkdir(path.join(project,'app'),{recursive:true});
 for(const name of ['server.mjs','accounts.mjs','demo.mjs','demo-catalog.mjs','web-import.mjs','inventory.mjs','mannequin-store.mjs'])await copyFile(path.join(root,name),path.join(project,name));
 if(fakeProvider)await writeFile(path.join(project,'mannequin-providers.mjs'),`let calls=0;export async function providerStatus(){return {providers:[{id:'openai',ready:true,configured:true,label:'Synthetic provider'}],calls};}export async function generatePreview({provider}){calls++;if(provider==='local')throw Object.assign(Error('Synthetic provider unavailable'),{status:503});await new Promise(resolve=>setTimeout(resolve,100));return {bytes:Buffer.from('${png.toString('base64')}','base64'),mime:'image/png',provider};}`);
 else await copyFile(path.join(root,'mannequin-providers.mjs'),path.join(project,'mannequin-providers.mjs'));
 for(const name of ['domain.js','golf.js','mannequin.js'])await copyFile(path.join(root,'app',name),path.join(project,'app',name));
 await writeFile(path.join(project,'package.json'),'{"type":"module"}');
 const port=4191,url=`http://127.0.0.1:${port}`;child=spawn(process.execPath,['server.mjs'],{cwd:project,env:{...process.env,PORT:String(port),STYLEBYFIRE_DATA_DIR:data},stdio:['ignore','pipe','pipe'],windowsHide:true});
 let output='';child.stderr.on('data',chunk=>output+=chunk);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Test server did not start. '+output)),10000);child.stdout.on('data',chunk=>{if(chunk.toString().includes('is ready')){clearTimeout(timer);resolve();}});child.on('exit',()=>{clearTimeout(timer);reject(Error(output));});child.on('error',error=>{clearTimeout(timer);reject(error);});});
 const request=(route,{identity,method='GET',json,body,headers={}}={})=>fetch(url+route,{method,headers:{...(identity?{Cookie:identity.cookie,'X-StyleByFire-Account':identity.user.id}:{}),...(json?{'Content-Type':'application/json'}:{}),...headers},body:json?JSON.stringify(json):body});
 const register=async username=>{const response=await request('/api/auth/register',{method:'POST',json:{displayName:username,username,password:'synthetic-test-password'}});assert.equal(response.status,201,await response.clone().text());return {...await response.json(),cookie:response.headers.get('set-cookie').split(';')[0]};};
 return {request,register,dir,data};
}

test('mannequin HTTP routes authenticate snapshots and images and survive wardrobe edits',async t=>{
 const {request,register,dir}=await serverFixture(t),owner=await register('preview.owner'),other=await register('preview.other');
 assert.equal((await request('/api/mannequin')).status,401);assert.equal((await request('/api/mannequin',{headers:{Cookie:owner.cookie}})).status,409);
 assert.equal((await request('/api/mannequin',{identity:other,headers:{'X-StyleByFire-Account':owner.user.id}})).status,409);
 const uploaded=await (await request('/api/images',{identity:owner,method:'POST',body:png})).json(),state=wardrobe();for(const item of state.items)item.src=uploaded.src;
 assert.equal((await request('/api/state',{identity:owner,method:'PUT',json:state})).status,200);
 const create=await request('/api/mannequin',{identity:owner,method:'POST',json:{itemIds:['shirt','pants','tie'],mode:'Business',bodyShape:'straight'}});assert.equal(create.status,201,await create.clone().text());const preview=await create.json();assert.equal(preview.status,'prepared');assert.ok(!JSON.stringify(preview).includes(dir));
 assert.equal((await request('/api/mannequin',{identity:owner,method:'POST',json:{itemIds:['pants','shirt','tie'],mode:'Business',bodyShape:'straight'}})).status,200);
 const detail=`/api/mannequin/${preview.id}`,image=detail+'/image',ref=preview.references[0].src;
 for(const route of [detail,image,ref]){assert.equal((await request(route)).status,401);assert.equal((await request(route,{identity:other})).status,404);}
 assert.equal((await request(ref,{headers:{Cookie:owner.cookie,'Sec-Fetch-Site':'cross-site'}})).status,403);
 const reference=await request(ref,{headers:{Cookie:owner.cookie}});assert.equal(reference.status,200);assert.equal(reference.headers.get('cache-control'),'no-store');assert.deepEqual(Buffer.from(await reference.arrayBuffer()),png);
 assert.equal((await request(ref,{method:'HEAD',headers:{Cookie:owner.cookie}})).status,200);
 assert.equal((await request(detail+'/references/100',{headers:{Cookie:owner.cookie}})).status,404);
 assert.equal((await request(image,{headers:{Cookie:owner.cookie}})).status,404);
 assert.equal((await request(image,{method:'POST',headers:{Cookie:owner.cookie},body:png})).status,409);
 assert.equal((await request(image,{identity:other,method:'POST',body:png})).status,404);
 assert.equal((await request(image,{identity:owner,method:'POST',body:'<svg/>'})).status,415);
 const complete=await request(image,{identity:owner,method:'POST',body:png});assert.equal(complete.status,200);assert.equal((await complete.json()).status,'complete');
 const rendered=await request(image,{headers:{Cookie:owner.cookie}});assert.equal(rendered.status,200);assert.equal(rendered.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await rendered.arrayBuffer()),png);
 state.items=[];assert.equal((await request('/api/state',{identity:owner,method:'PUT',json:state})).status,200);
 const preserved=await (await request(detail,{identity:owner})).json();assert.equal(preserved.spec.items.length,3);assert.equal(preserved.spec.items[0].color,'White');assert.equal((await request(ref,{headers:{Cookie:owner.cookie}})).status,200);
 assert.equal((await (await request('/api/mannequin',{identity:owner})).json()).previews.length,1);assert.deepEqual(await (await request('/api/mannequin',{identity:other})).json(),{previews:[]});
 assert.equal((await request(`/mannequin/${preview.id}/request.json`,{identity:owner})).status,404);
});

test('generation reuses concurrent calls, unlocks failed jobs for retry and saves only completed images',async t=>{
 const {request,register}=await serverFixture(t,{fakeProvider:true}),owner=await register('generation.owner'),other=await register('generation.other');
 const uploaded=await (await request('/api/images',{identity:owner,method:'POST',body:png})).json(),state=wardrobe();for(const item of state.items)item.src=uploaded.src;
 assert.equal((await request('/api/state',{identity:owner,method:'PUT',json:state})).status,200);
 const preview=await (await request('/api/mannequin',{identity:owner,method:'POST',json:{itemIds:['shirt','pants']}})).json(),detail='/api/mannequin/'+preview.id,route=detail+'/generate';
 assert.equal((await request('/api/mannequin/providers')).status,401);assert.equal((await request('/api/mannequin/providers',{identity:owner})).status,200);
 assert.equal((await request(route,{identity:other,method:'POST',json:{provider:'openai'}})).status,404);
 assert.equal((await request(route,{identity:owner,method:'POST',json:{provider:'unsupported'}})).status,400);
 for(let n=0;n<2;n++)assert.equal((await request(route,{identity:owner,method:'POST',json:{provider:'local'}})).status,503);
 assert.equal((await (await request(detail,{identity:owner})).json()).status,'prepared');
 const first=request(route,{identity:owner,method:'POST',json:{provider:'openai'}});
 let started=false;for(let n=0;n<20;n++){if((await (await request('/api/mannequin/providers',{identity:owner})).json()).calls===3){started=true;break;}}assert.equal(started,true);
 assert.equal((await request(route,{identity:owner,method:'POST',json:{provider:'local'}})).status,423);
 assert.equal((await request(detail+'/image',{identity:owner,method:'POST',body:png})).status,423);
 const completions=await Promise.all([first,request(route,{identity:owner,method:'POST',json:{provider:'openai'}})]);
 for(const completion of completions){assert.equal(completion.status,200);assert.equal((await completion.json()).status,'complete');}
 assert.equal((await (await request('/api/mannequin/providers',{identity:owner})).json()).calls,3);
 const saved=await (await request(detail,{identity:owner})).json();assert.equal(saved.status,'complete');
 assert.equal(saved.imageVersions,1);
 assert.equal((await request(route,{identity:owner,method:'POST',json:{provider:'local'}})).status,503);assert.equal((await (await request(detail,{identity:owner})).json()).completedAt,saved.completedAt);
 assert.equal((await request(route,{identity:owner,method:'POST',json:{provider:'openai'}})).status,200);
 assert.equal((await (await request('/api/mannequin/providers',{identity:owner})).json()).calls,5);
 for(let n=2;n<10;n++)assert.equal((await request(detail+'/image',{identity:owner,method:'POST',body:png})).status,200);
 assert.equal((await request(route,{identity:owner,method:'POST',json:{provider:'openai'}})).status,400);
 assert.equal((await (await request('/api/mannequin/providers',{identity:owner})).json()).calls,5);
});
