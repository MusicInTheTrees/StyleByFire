import http from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {validateState} from './app/domain.js';
import {refreshInventory} from './inventory.mjs';
import {LocalAccounts,atomicJSON} from './accounts.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const data=process.env.STYLEBYFIRE_DATA_DIR?path.resolve(process.env.STYLEBYFIRE_DATA_DIR):path.join(root,'.data');
let seed;try{seed=JSON.parse(await readFile(path.join(root,'seed.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;seed={items:[],media:{},reference:null};}
const accounts=new LocalAccounts({data,root,seed});await accounts.initialize();
const port=Number(process.env.PORT||4173);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.json':'application/json','.ico':'image/x-icon'};
function send(res,status,value,type='application/json'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(type==='application/json'?JSON.stringify(value):value);}
async function body(req,max){const chunks=[];let total=0;for await(const chunk of req){total+=chunk.length;if(total>max)throw Object.assign(Error('The request is too large.'),{status:413});chunks.push(chunk);}return Buffer.concat(chunks);}
const jsonBody=async req=>JSON.parse((await body(req,16*1024)).toString());
function imageType(bytes){if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpg';if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png';if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'webp';return null;}
let writes=Promise.resolve();
function queued(operation){const result=writes.then(operation);writes=result.catch(()=>{});return result;}
const server=http.createServer(async(req,res)=>{
 try{
  const host=req.headers.host;
  if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host))return send(res,403,{error:'Only local access is allowed.'});
  if(req.headers.origin&&req.headers.origin!=='http://'+host)return send(res,403,{error:'Cross-origin requests are not allowed.'});
  if(req.headers['sec-fetch-site']==='cross-site')return send(res,403,{error:'Cross-site requests are not allowed.'});
  const decoded=decodeURIComponent(new URL(req.url,'http://'+host).pathname);
  if(/[\\\x00-\x1f:]/.test(decoded))return send(res,403,{error:'Invalid path.'});
  const pathname=path.posix.normalize(decoded),route=pathname.toLowerCase();
  const privateMedia=route.startsWith('/media/'),privateThumb=route.startsWith('/thumbs/');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'");
  if(pathname==='/api/health'&&req.method==='GET')return send(res,200,{app:'StyleByFire',version:2,accounts:true});
  if(pathname==='/api/shutdown'&&req.method==='POST'){send(res,200,{ok:true});await writes;server.close();server.closeIdleConnections();return;}
  if(pathname==='/api/auth'&&req.method==='GET')return send(res,200,accounts.auth(accounts.current(req)));
  if(pathname==='/api/auth/register'&&req.method==='POST'){const input=await jsonBody(req);return send(res,201,await queued(()=>accounts.register(input,res)));}
  if(pathname==='/api/auth/login'&&req.method==='POST'){const input=await jsonBody(req);return send(res,200,await queued(()=>accounts.login(input,res)));}
  if(pathname==='/api/auth/demo'&&req.method==='POST')return send(res,200,await queued(()=>accounts.demo(res)));
  if(pathname==='/api/auth/logout'&&req.method==='POST')return send(res,200,await queued(()=>accounts.logout(req,res)));
  const user=accounts.current(req);
  if(route.startsWith('/api/')||privateMedia||privateThumb){
   if(!user)return send(res,401,{error:'Sign in to open your wardrobe.'});
   if(pathname.startsWith('/api/')&&req.headers['x-stylebyfire-account']!==user.id)return send(res,409,{error:'The active account changed in another tab. Reload this page before continuing.'});
  }
  if(pathname==='/api/state'&&req.method==='GET')return send(res,200,await accounts.state(user));
  if(pathname==='/api/inventory/refresh'&&req.method==='POST'){
   if(!user.ownsLegacy)return send(res,403,{error:'Folder refresh belongs to the original wardrobe account. Import photos into this account instead.'});
   const result=await queued(async()=>{const state=await accounts.state(user);let refreshed;try{refreshed=await refreshInventory({root,data:accounts.userFolder(user),state,seed});}catch(error){if(error.code==='ENOENT')return {state,added:0,skipped:[]};throw error;}validateState(refreshed.state);await accounts.validateSources(user,refreshed.state);await atomicJSON(accounts.stateFile(user),refreshed.state);return refreshed;});return send(res,200,result);
  }
  if(pathname==='/api/state'&&req.method==='PUT'){
   const next=validateState(JSON.parse((await body(req,12*1024*1024)).toString()));
   await queued(async()=>{await accounts.validateSources(user,next);await atomicJSON(accounts.stateFile(user),next);});return send(res,200,{ok:true});
  }
  if(pathname==='/api/images'&&req.method==='POST'){
   const bytes=await body(req,20*1024*1024),ext=imageType(bytes);if(!ext)return send(res,415,{error:'Please choose a JPEG, PNG, or WebP photo. Convert HEIC photos first.'});
   const filename=randomUUID()+'.'+ext;await queued(()=>writeFile(path.join(accounts.userFolder(user),'images',filename),bytes));return send(res,201,{src:'/media/'+filename});
  }
  if(pathname.startsWith('/api/'))return send(res,404,{error:'Endpoint not found.'});
  if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'Method not allowed.'});
  let file;
  if(privateMedia)file=await accounts.mediaFile(user,pathname);
  else if(privateThumb){
   if(!user.ownsLegacy||!/^\/thumbs\/seed-[a-z0-9_-]+\.(jpg|png|webp)$/i.test(pathname))return send(res,404,{error:'Photo not found.'});
   file=path.join(root,'app','thumbs',pathname.slice(8));
  }
  else{
   if(pathname!=='/'&&!/^\/[a-z0-9_-]+\.(html|js|css|svg|ico|woff2)$/i.test(pathname))return send(res,404,{error:'File not found.'});
   const base=path.join(root,'app');file=path.resolve(base,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(base+path.sep))return send(res,403,{error:'Invalid path.'});
  }
  const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':privateMedia||privateThumb?'no-store':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch(error){send(res,error.code==='ENOENT'?404:error.status||400,{error:error.code==='ENOENT'?'File not found.':error.message});}
});
server.listen(port,'127.0.0.1',()=>console.log(`StyleByFire is ready at http://127.0.0.1:${port}\nLocal account wardrobes are stored in .data/accounts/. Ctrl+C to stop.`));
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} is in use. If StyleByFire is already running, open http://127.0.0.1:${port}`:error.message);process.exitCode=1;});
