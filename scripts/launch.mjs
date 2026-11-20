import {spawn} from 'node:child_process';
import {appendFile,access,mkdir,open,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('..',import.meta.url));
const url='http://127.0.0.1:4173';
const data=path.join(root,'.data');
const launcherLog=path.join(data,'launcher.log');
const serverLog=path.join(data,'server.log');
await mkdir(data,{recursive:true});
const log=message=>appendFile(launcherLog,`${new Date().toISOString()} ${message}\n`);

async function health(){
 try{
  const response=await fetch(url+'/api/health',{signal:AbortSignal.timeout(1000)});
  return response.ok&&(await response.json()).app==='StyleByFire';
 }catch{return false;}
}

async function launchDetached(executable,args,options={}){
 const child=spawn(executable,args,{cwd:root,windowsHide:true,detached:true,stdio:'ignore',...options});
 await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
 child.unref();
 return child;
}

async function ensureServer(){
 if(await health())return;
 const output=await open(serverLog,'a');
 let child;
 try{
  child=await launchDetached(process.execPath,['server.mjs'],{
   stdio:['ignore',output.fd,output.fd],
   env:{...process.env,PORT:'4173',STYLEBYFIRE_DATA_DIR:''}
  });
 }finally{await output.close();}
 const deadline=Date.now()+12000;
 while(Date.now()<deadline){
  if(await health())return;
  if(child.exitCode!==null)break;
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 const details=(await readFile(serverLog,'utf8').catch(()=>'')).trim().split(/\r?\n/).slice(-6).join('\n');
 throw Error(`StyleByFire could not start.\n${details}\nStartup log: ${serverLog}`);
}

async function findBrave(){
 const candidates=[
  process.env.PROGRAMFILES&&path.join(process.env.PROGRAMFILES,'BraveSoftware','Brave-Browser','Application','brave.exe'),
  process.env['PROGRAMFILES(X86)']&&path.join(process.env['PROGRAMFILES(X86)'],'BraveSoftware','Brave-Browser','Application','brave.exe'),
  process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'BraveSoftware','Brave-Browser','Application','brave.exe')
 ].filter(Boolean);
 for(const candidate of candidates){try{await access(candidate);return candidate;}catch{}}
 return null;
}

async function openBrowser(){
 const brave=await findBrave();
 if(brave){
  await launchDetached(brave,['--new-tab',url]);
  await log('Opened local wardrobe in Brave.');
  return;
 }
 // Use the registered Windows URL handler if Brave is later uninstalled.
 const powershell=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 const child=spawn(powershell,['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; Start-Process -FilePath 'http://127.0.0.1:4173'"],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 let error='';child.stderr.on('data',chunk=>error+=chunk.toString());
 await new Promise((resolve,reject)=>{
  child.once('error',reject);
  child.once('exit',code=>code===0?resolve():reject(Error(error.trim()||'Windows could not open your browser.')));
 });
 await log('Opened local wardrobe in the default browser.');
}

try{
 if(process.argv.includes('--stop')){
  if(await health()){
   const response=await fetch(url+'/api/shutdown',{method:'POST',signal:AbortSignal.timeout(5000)});
   if(!response.ok)throw Error('StyleByFire could not be stopped.');
   console.log('StyleByFire stopped. Your wardrobe is saved.');
  }else console.log('StyleByFire is not running.');
 }else{
  await ensureServer();
  console.log('StyleByFire is running at '+url);
  if(!process.argv.includes('--no-browser'))await openBrowser();
 }
}catch(error){
 await log('Launch failed: '+error.message).catch(()=>{});
 console.error(`\n${error.message}\n\nIf the app is already running, open ${url} in Brave.\nDiagnostic log: ${launcherLog}`);
 process.exitCode=1;
}
