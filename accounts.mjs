import {addWorkSuitability} from './app/work.js';
import {readFile,writeFile,mkdir,rename,copyFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {DEFAULT_PROFILE,DEFAULT_RULES,DEFAULT_SUBCATEGORIES,validateState} from './app/domain.js';
import {createDemoWardrobe,upgradeDemoWardrobe} from './demo.mjs';
import {addGolfSuitability} from './app/golf.js';

const scrypt=promisify(scryptCallback);
const SESSION_AGE=30*24*60*60*1000;
const COOKIE='stylebyfire_session';
const tokenHash=token=>createHash('sha256').update(token).digest('hex');
const failure=(message,status=400)=>Object.assign(Error(message),{status});
export const emptyWardrobe=()=>({version:1,items:[],looks:[],profile:structuredClone(DEFAULT_PROFILE),rules:structuredClone(DEFAULT_RULES),subcategories:structuredClone(DEFAULT_SUBCATEGORIES),reference:null});
export async function atomicJSON(file,value){await mkdir(path.dirname(file),{recursive:true});const temporary=file+'.tmp';await writeFile(temporary,JSON.stringify(value,null,2));await rename(temporary,file);}

export class LocalAccounts{
 constructor({data,root,seed,library}){this.data=data;this.root=root;this.seed=seed;this.library=library;this.registryFile=path.join(data,'accounts.json');this.registry={version:1,users:[],sessions:[]};this.failures=new Map();}
 async initialize(){
  await mkdir(this.data,{recursive:true});
  try{this.registry=JSON.parse(await readFile(this.registryFile,'utf8'));if(this.registry.version!==1||!Array.isArray(this.registry.users)||!Array.isArray(this.registry.sessions))throw Error('Invalid account registry.');}catch(error){if(error.code!=='ENOENT')throw Error('Your local accounts could not be read. No data has been overwritten. '+error.message);}
  for(const user of this.registry.users)await mkdir(path.join(this.mediaFolder(user),'images'),{recursive:true});
 }
 async saveRegistry(){await atomicJSON(this.registryFile,this.registry);}
 mediaFolder(user){return this.library?.accountFolder(user)||this.userFolder(user);}
 userFolder(user){return path.join(this.data,'accounts',user.id);}
 stateFile(user){return path.join(this.userFolder(user),'wardrobe.json');}
 publicUser(user){return user?{id:user.id,displayName:user.displayName,username:user.username,isDemo:!!user.isDemo,canRefreshInventory:!!user.ownsLegacy}:null;}
 auth(user){return {user:this.publicUser(user),needsSetup:!this.registry.users.some(u=>!u.isDemo)};}
 token(req){const match=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='));return match?match.slice(COOKIE.length+1):'';}
 current(req){const token=this.token(req);if(!/^[a-f0-9]{64}$/.test(token))return null;const session=this.registry.sessions.find(s=>s.hash===tokenHash(token)&&s.expires>Date.now());return session?this.registry.users.find(u=>u.id===session.userId)||null:null;}
 async session(user,res){
  const token=randomBytes(32).toString('hex');const now=Date.now();
  this.registry.sessions=this.registry.sessions.filter(s=>s.expires>now).slice(-100);
  this.registry.sessions.push({hash:tokenHash(token),userId:user.id,expires:now+SESSION_AGE});await this.saveRegistry();
  res.setHeader('Set-Cookie',`${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_AGE/1000}`);
  return this.auth(user);
 }
 async logout(req,res){const hash=tokenHash(this.token(req));this.registry.sessions=this.registry.sessions.filter(s=>s.hash!==hash);await this.saveRegistry();res.setHeader('Set-Cookie',`${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);return this.auth(null);}
 async register(input,res){
  const displayName=typeof input.displayName==='string'?input.displayName.trim():'';
  const username=typeof input.username==='string'?input.username.trim().toLowerCase():'';
  const password=input.password;
  if(!displayName||displayName.length>60)throw failure('Choose a display name between 1 and 60 characters.');
  if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)||username==='jamie-demo')throw failure('Use 3–32 letters, numbers, dots, underscores, or hyphens for your username.');
  if(typeof password!=='string'||password.length<8||password.length>256)throw failure('Use a password between 8 and 256 characters.');
  if(this.registry.users.some(u=>u.username===username))throw failure('That username is already in use.',409);
  const salt=randomBytes(16).toString('hex');const passwordHash=(await scrypt(password,salt,64)).toString('hex');
  const user={id:randomUUID(),username,displayName,salt,passwordHash,isDemo:false,ownsLegacy:!this.registry.users.some(u=>!u.isDemo),createdAt:new Date().toISOString()};
  let wardrobe=emptyWardrobe();
  await mkdir(path.join(this.mediaFolder(user),'images'),{recursive:true});
  if(user.ownsLegacy){
   const legacyFile=path.join(this.data,'wardrobe.json');let legacyBytes;
   try{legacyBytes=await readFile(legacyFile);}catch(error){if(error.code!=='ENOENT')throw error;}
   if(legacyBytes){
    try{wardrobe=validateState(JSON.parse(legacyBytes.toString()));}catch(error){throw failure('Your existing wardrobe needs repair before account setup. It has not been changed. '+error.message);}
    const backups=path.join(this.data,'backups');await mkdir(backups,{recursive:true});await writeFile(path.join(backups,`before-accounts-${Date.now()}.json`),legacyBytes,{flag:'wx'});
   }else{wardrobe={...wardrobe,items:structuredClone(this.seed.items).map(addGolfSuitability).map(addWorkSuitability),reference:this.seed.reference||null};wardrobe.subcategories=[...new Map([...wardrobe.subcategories,...wardrobe.items.map(i=>({category:i.category,path:i.subcategory}))].map(s=>[s.category+'|'+s.path,s])).values()];}
   for(const source of new Set([...wardrobe.items.map(i=>i.src),wardrobe.reference].filter(Boolean))){const name=source.slice(7);if(!this.seed.media[name])await copyFile(path.join(this.library?.legacyImages||path.join(this.data,'images'),name),path.join(this.mediaFolder(user),'images',name));}
  }
  validateState(wardrobe);await atomicJSON(this.stateFile(user),wardrobe);this.registry.users.push(user);return this.session(user,res);
 }
 async login(input,res){
  const username=typeof input.username==='string'?input.username.trim().toLowerCase():'';const password=typeof input.password==='string'?input.password:'';
  const now=Date.now();const failureKey=username.slice(0,64);const recent=(this.failures.get(failureKey)||[]).filter(time=>time>now-15*60*1000);
  if(recent.length>=10)throw failure('Too many sign-in attempts. Try again in 15 minutes.',429);
  const user=this.registry.users.find(u=>!u.isDemo&&u.username===username);
  const attempt=await scrypt(password.slice(0,256),user?.salt||'stylebyfire-unregistered',64);
  if(!user||password.length>256||!timingSafeEqual(attempt,Buffer.from(user.passwordHash,'hex'))){this.failures.set(failureKey,[...recent,now]);throw failure('The username or password is incorrect.',401);}
  this.failures.delete(failureKey);return this.session(user,res);
 }
 async demo(res){
  let user=this.registry.users.find(u=>u.isDemo);
  if(!user){user={id:randomUUID(),username:'jamie-demo',displayName:'Jamie Demo',isDemo:true,ownsLegacy:false,createdAt:new Date().toISOString()};await mkdir(path.join(this.mediaFolder(user),'images'),{recursive:true});const wardrobe=await createDemoWardrobe(this.mediaFolder(user));validateState(wardrobe);await atomicJSON(this.stateFile(user),wardrobe);this.registry.users.push(user);}
  else{
   const previous=await readFile(this.stateFile(user));const state=validateState(JSON.parse(previous.toString()));
   const upgraded=await upgradeDemoWardrobe(this.mediaFolder(user),state);
   if(upgraded.changed){validateState(upgraded.state);const backups=path.join(this.data,'backups');await mkdir(backups,{recursive:true});await writeFile(path.join(backups,`demo-before-product-photos-${Date.now()}.json`),previous,{flag:'wx'});await atomicJSON(this.stateFile(user),upgraded.state);}
  }
  return this.session(user,res);
 }
 async state(user){return validateState(JSON.parse(await readFile(this.stateFile(user),'utf8')));}
 async mediaFile(user,source){
  if(!/^\/media\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(source))throw failure('Photo not found.',404);
  const name=source.slice(7);const seeded=this.seed.media[name];
  if(seeded&&!user.ownsLegacy)throw failure('Photo not found.',404);
  const file=seeded?path.join(this.library?.inventoryRoot||this.root,seeded):path.join(this.mediaFolder(user),'images',name);
  await stat(file);return file;
 }
 async validateSources(user,state){for(const source of new Set([...state.items.map(i=>i.src),state.reference].filter(Boolean))){try{await this.mediaFile(user,source);}catch{throw failure('A photo is missing from this account. Import the photo or restore a complete backup.');}}}
}
