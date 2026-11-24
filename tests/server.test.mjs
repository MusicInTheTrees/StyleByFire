import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,copyFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {DEFAULT_ADJUSTMENTS,DEFAULT_PROFILE,DEFAULT_RULES,DEFAULT_SUBCATEGORIES,accessoryType} from '../app/domain.js';
import {DEMO_CATALOG,demoCacheName} from '../demo.mjs';
import {defaultWeeklySettings} from '../app/weekly-settings.js';
import {generateWeeklyPlan} from '../app/weekly-planner.js';
const root=fileURLToPath(new URL('..',import.meta.url));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=','base64');
const empty=()=>({version:1,items:[],looks:[],profile:structuredClone(DEFAULT_PROFILE),rules:structuredClone(DEFAULT_RULES),subcategories:structuredClone(DEFAULT_SUBCATEGORIES),reference:null});
const fixtureItem=(src,id='fixture')=>({id,name:'Corrected blue shirt',category:'Top',subcategory:'Shirts',role:'base',color:'Blue',colorVerified:true,pattern:'Solid',formality:3,warmth:1,tags:['tailored'],modes:['Business'],favorite:true,src,description:'Synthetic fixture with a corrected blue color.',notes:'Keep this personal note.',stylistNotes:'Camera made it gray; actually blue.',adjustments:{...DEFAULT_ADJUSTMENTS,rotation:90}});

async function fixture(t,{port,legacy=false}={}){
 const dir=await mkdtemp(path.join(tmpdir(),'stylebyfire-test-')),project=path.join(dir,'project'),data=path.join(dir,'data');
 await mkdir(path.join(project,'app','thumbs'),{recursive:true});await mkdir(path.join(data,'images'),{recursive:true});
 for(const name of ['server.mjs','accounts.mjs','demo.mjs','demo-catalog.mjs','web-import.mjs','inventory.mjs','mannequin-store.mjs','mannequin-providers.mjs'])await copyFile(path.join(root,name),path.join(project,name));
 await mkdir(path.join(data,'demo-photos'),{recursive:true});for(const entry of DEMO_CATALOG)await writeFile(path.join(data,'demo-photos',demoCacheName(entry)),png);
 await copyFile(path.join(root,'app','domain.js'),path.join(project,'app','domain.js'));
  await copyFile(path.join(root,'app','golf.js'),path.join(project,'app','golf.js'));
 await copyFile(path.join(root,'app','weekly-settings.js'),path.join(project,'app','weekly-settings.js'));
 await copyFile(path.join(root,'app','mannequin.js'),path.join(project,'app','mannequin.js'));
 await writeFile(path.join(project,'package.json'),' {"type":"module"}');await writeFile(path.join(project,'app','index.html'),'<!doctype html><title>Test fixture</title>');
 for(const filename of ['ambient-diamond.png','ambient-geometric.png','ambient-lattice.png','ambient-dots.png','sidebar-pinstripe.png','private-fixture.png'])await writeFile(path.join(project,'app',filename),png);
 let legacyBytes;
 if(legacy){
  const state=empty();state.items=[fixtureItem('/media/seed-fixture.png'),fixtureItem('/media/11111111-1111-1111-1111-111111111111.png','uploaded')];state.reference=state.items[1].src;state.looks=[{id:'look',name:'Original look',mode:'Business',itemIds:['fixture','uploaded']}];
  legacyBytes=Buffer.from(JSON.stringify(state,null,4)+'\n');await writeFile(path.join(data,'wardrobe.json'),legacyBytes);
  await writeFile(path.join(data,'images','11111111-1111-1111-1111-111111111111.png'),png);
  await writeFile(path.join(project,'seed-photo.png'),png);await writeFile(path.join(project,'app','thumbs','seed-fixture.png'),png);
  await writeFile(path.join(project,'seed.json'),JSON.stringify({items:[],reference:null,media:{'seed-fixture.png':'seed-photo.png'}}));
 }
 let child;const url=`http://127.0.0.1:${port}`;
 const start=async()=>{child=spawn(process.execPath,['server.mjs'],{cwd:project,env:{...process.env,PORT:String(port),STYLEBYFIRE_DATA_DIR:data},stdio:['ignore','pipe','pipe'],windowsHide:true});let output='';child.stderr.on('data',chunk=>output+=chunk);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Test server did not start. '+output)),10000);child.stdout.on('data',chunk=>{if(chunk.toString().includes('is ready')){clearTimeout(timer);resolve();}});child.on('exit',()=>{clearTimeout(timer);reject(Error(output));});child.on('error',error=>{clearTimeout(timer);reject(error);});});};
 const stop=async()=>{if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill();await exited;}};
 t.after(async()=>{await stop();const resolved=path.resolve(dir);assert.ok(resolved.startsWith(path.resolve(tmpdir())+path.sep)&&path.basename(resolved).startsWith('stylebyfire-test-'));await rm(resolved,{recursive:true,force:true});});
 const request=async(route,{identity,method='GET',json,body,headers={}}={})=>fetch(url+route,{method,headers:{...(identity?{Cookie:identity.cookie,'X-StyleByFire-Account':identity.user.id}:{}),...(json?{'Content-Type':'application/json'}:{}),...headers},body:json?JSON.stringify(json):body});
 const authenticate=async(route,json)=>{const response=await request(route,{method:'POST',json});assert.ok(response.ok,await response.clone().text());const auth=await response.json();return {...auth,cookie:response.headers.get('set-cookie').split(';')[0],cookieHeader:response.headers.get('set-cookie')};};
 await start();return {project,data,legacyBytes,request,authenticate,start,stop};
}

test('accounts preserve legacy corrections, isolate wardrobes and photos, and survive restart',async t=>{
 const f=await fixture(t,{port:4187,legacy:true}),{request,authenticate}=f;
 assert.equal((await request('/')).status,200);assert.equal((await (await request('/api/health')).json()).app,'StyleByFire');
 for(const filename of ['ambient-diamond.png','ambient-geometric.png','ambient-lattice.png','ambient-dots.png','sidebar-pinstripe.png'])assert.equal((await request('/'+filename)).status,200);
 assert.equal((await request('/private-fixture.png')).status,404);
 assert.deepEqual(await (await request('/api/auth')).json(),{user:null,needsSetup:true});
 assert.equal((await request('/api/web-import/preview',{method:'POST',json:{url:'https://127.0.0.1/private'}})).status,401);
 for(const route of ['/api/state','/media/seed-fixture.png','/thumbs/seed-fixture.png','/THUMBS/seed-fixture.png','/x%2f..%2fthumbs/seed-fixture.png'])assert.equal((await request(route)).status,401,route);
 for(const route of ['/thumbs%5cseed-fixture.png','/thumbs./seed-fixture.png','/thumbs%20/seed-fixture.png'])assert.notEqual((await request(route)).status,200,route);
 assert.equal((await request('/api/auth',{headers:{Origin:'https://external.example'}})).status,403);
 const demo=await authenticate('/api/auth/demo');assert.equal(demo.user.displayName,'Jamie Demo');assert.equal(demo.user.isDemo,true);assert.equal(demo.needsSetup,true);assert.equal(demo.user.canRefreshInventory,false);
 assert.match(demo.cookieHeader,/HttpOnly/);assert.match(demo.cookieHeader,/SameSite=Strict/);
 const demoState=await (await request('/api/state',{identity:demo})).json();assert.equal(demoState.items.length,28);assert.deepEqual(new Set(demoState.items.filter(i=>i.category==='Accessories').map(accessoryType)),new Set(['tie','belt','glasses','earrings','necklace','brooch','watch','wristband','ring','wallet','scarf']));
 const demoPhoto=await request(demoState.items[0].src,{identity:demo});assert.equal(demoPhoto.status,200);assert.equal(demoPhoto.headers.get('cache-control'),'no-store');const demoBytes=Buffer.from(await demoPhoto.arrayBuffer());assert.deepEqual(demoBytes,png);
 for(const route of ['/media/seed-fixture.png','/thumbs/seed-fixture.png','/THUMBS/seed-fixture.png','/x%2f..%2fthumbs/seed-fixture.png'])assert.equal((await request(route,{identity:demo})).status,404,route);
 assert.equal((await request('/api/inventory/refresh',{identity:demo,method:'POST'})).status,403);
 const owner=await authenticate('/api/auth/register',{displayName:'Fixture Owner',username:'fixture.owner',password:'test-password-owner'});assert.equal(owner.user.canRefreshInventory,true);assert.equal(owner.needsSetup,false);
 const state=await (await request('/api/state',{identity:owner})).json();assert.equal(state.items.length,2);assert.equal(state.items[0].notes,'Keep this personal note.');assert.equal(state.items[0].color,'Blue');assert.equal(state.items[0].adjustments.rotation,90);assert.equal(state.looks.length,1);
 assert.deepEqual(await readFile(path.join(f.data,'wardrobe.json')),f.legacyBytes);const backups=await readdir(path.join(f.data,'backups'));assert.equal(backups.length,1);assert.deepEqual(await readFile(path.join(f.data,'backups',backups[0])),f.legacyBytes);
 for(const item of state.items){assert.equal((await request(item.src,{identity:owner})).status,200);assert.equal((await request(item.src,{identity:demo})).status,404);}
 assert.equal((await request('/thumbs/seed-fixture.png',{identity:owner})).headers.get('cache-control'),'no-store');
 const other=await authenticate('/api/auth/register',{displayName:'Another Fixture',username:'other.fixture',password:'test-password-other'});const otherState=await (await request('/api/state',{identity:other})).json();assert.equal(otherState.items.length,0);assert.equal(otherState.reference,null);assert.equal(other.user.canRefreshInventory,false);
 assert.equal((await request('/api/state',{identity:other,headers:{'X-StyleByFire-Account':owner.user.id}})).status,409);
 assert.equal((await request('/api/web-import/preview',{identity:other,method:'POST',json:{url:'https://127.0.0.1/private'},headers:{'X-StyleByFire-Account':owner.user.id}})).status,409);
 assert.equal((await request('/api/web-import/preview',{identity:other,method:'POST',json:{url:'https://127.0.0.1/private'}})).status,400);
 assert.equal((await request('/api/web-import/preview',{identity:owner,method:'POST',json:{url:'http://shop.clothing.com/item'}})).status,400);
 assert.equal((await request('/api/state',{headers:{Cookie:owner.cookie}})).status,409);
 const forged=structuredClone(otherState);forged.items=[state.items[0]];assert.equal((await request('/api/state',{identity:other,method:'PUT',json:forged})).status,400);
 forged.items=[state.items[1]];assert.equal((await request('/api/state',{identity:other,method:'PUT',json:forged})).status,400);
 assert.equal((await request('/api/images',{identity:other,method:'POST',body:'not an image'})).status,415);
 const upload=await request('/api/images',{identity:other,method:'POST',body:png});assert.equal(upload.status,201);const {src}=await upload.json();assert.equal((await request(src,{identity:other})).status,200);assert.equal((await request(src,{identity:owner})).status,404);
 otherState.items=[fixtureItem(src,'other-shirt')];otherState.items[0].name='Only in second account';assert.equal((await request('/api/state',{identity:other,method:'PUT',json:otherState})).status,200);
 const weekSettings=defaultWeeklySettings();state.weeklyPlanner={version:1,settings:weekSettings,plan:generateWeeklyPlan(state,weekSettings,14)};
 state.items[0].description='Updated owner description';assert.equal((await request('/api/state',{identity:owner,method:'PUT',json:state})).status,200);
 assert.equal((await (await request('/api/state',{identity:other})).json()).weeklyPlanner,undefined);
 const invalidWeek=structuredClone(state);invalidWeek.weeklyPlanner.plan.days[0].itemIds.push('other-shirt');assert.equal((await request('/api/state',{identity:owner,method:'PUT',json:invalidWeek})).status,400);
 assert.equal((await request('/.data/accounts.json',{identity:owner})).status,404);
 assert.equal((await request('/api/auth/login',{method:'POST',json:{username:'fixture.owner',password:'wrong-password'}})).status,401);
 const registry=JSON.parse(await readFile(path.join(f.data,'accounts.json'),'utf8'));assert.equal(JSON.stringify(registry).includes('test-password'),false);assert.equal(registry.users.find(u=>u.id===owner.user.id).passwordHash.length,128);assert.equal(JSON.stringify(registry).includes(owner.cookie.split('=')[1]),false);
 await f.stop();await f.start();const restored=await (await request('/api/state',{identity:owner})).json();assert.equal(restored.items[0].description,'Updated owner description');assert.equal(restored.items[0].stylistNotes,'Camera made it gray; actually blue.');assert.equal((await (await request('/api/state',{identity:other})).json()).items[0].name,'Only in second account');
 assert.deepEqual(restored.weeklyPlanner,state.weeklyPlanner);
 const loggedIn=await authenticate('/api/auth/login',{username:'FIXTURE.OWNER',password:'test-password-owner'});assert.equal(loggedIn.user.id,owner.user.id);
 assert.equal((await request('/api/auth/logout',{identity:loggedIn,method:'POST'})).status,200);assert.equal((await request('/api/state',{identity:loggedIn})).status,401);assert.equal((await request(restored.items[0].src,{identity:loggedIn})).status,401);
 assert.deepEqual(await readFile(path.join(f.data,'wardrobe.json')),f.legacyBytes);
});

test('a clean checkout without private seed files can register and use the demo',async t=>{
 const {request,authenticate}=await fixture(t,{port:4188});
 const owner=await authenticate('/api/auth/register',{displayName:'Fresh Owner',username:'fresh.owner',password:'fresh-test-password'});
 const ownState=await (await request('/api/state',{identity:owner})).json();assert.equal(ownState.items.length,0);assert.equal(ownState.rules.Golf.golfAllowTrainers,false);
 const uploaded=await (await request('/api/images',{identity:owner,method:'POST',body:png})).json();
 ownState.items=[{...fixtureItem(uploaded.src),name:'Navy polo',modes:['Casual','Golf']}];
 ownState.looks=[{id:'golf-look',name:'Practice round',mode:'Golf',itemIds:['fixture']}];ownState.rules.Golf.golfAllowTrainers=true;
 const settings=defaultWeeklySettings();ownState.weeklyPlanner={version:1,settings,plan:generateWeeklyPlan(ownState,settings,12)};
 assert.equal((await request('/api/state',{identity:owner,method:'PUT',json:ownState})).status,200);
 const golfSaved=await (await request('/api/state',{identity:owner})).json();assert.deepEqual(golfSaved,ownState);
 const oldBackup=structuredClone(ownState);delete oldBackup.rules.Golf;oldBackup.items[0].modes=['Casual'];
 assert.equal((await request('/api/state',{identity:owner,method:'PUT',json:oldBackup})).status,200);
 const upgraded=await (await request('/api/state',{identity:owner})).json();assert.ok(upgraded.items[0].modes.includes('Golf'));assert.equal(upgraded.items[0].stylistNotes,ownState.items[0].stylistNotes);assert.equal(upgraded.rules.Golf.golfAllowTrainers,false);
 const refreshed=await request('/api/inventory/refresh',{identity:owner,method:'POST'});assert.equal(refreshed.status,200);assert.equal((await refreshed.json()).added,0);
 const demo=await authenticate('/api/auth/demo');const state=await (await request('/api/state',{identity:demo})).json();assert.equal(state.items.length,28);assert.equal((await request(state.items[0].src,{identity:demo})).status,200);assert.equal((await request(state.items[0].src,{identity:owner})).status,404);
 const again=await authenticate('/api/auth/demo');assert.equal(again.user.id,demo.user.id);
});
