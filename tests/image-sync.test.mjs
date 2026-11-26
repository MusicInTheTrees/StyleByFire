import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createImageSync,imageSyncPath,githubRepository,changedImagePaths} from '../image-sync.mjs';
const exec=promisify(execFile),user={id:'11111111-1111-4111-8111-111111111111',ownsLegacy:true};
const email='132178109+MusicInTheTrees@users.noreply.github.com';
async function fixture(t){
 const temporary=await mkdtemp(path.join(tmpdir(),'stylebyfire-sync-')),root=path.join(temporary,'app'),directory=path.join(temporary,'images'),remote=path.join(temporary,'remote.git'),data=path.join(root,'.data');
 t.after(async()=>{assert.ok(path.resolve(temporary).startsWith(path.resolve(tmpdir())+path.sep));await rm(temporary,{recursive:true,force:true});});
 await mkdir(data,{recursive:true});await mkdir(directory);const git=args=>exec('git',args,{cwd:directory,windowsHide:true});
 await git(['init','-b','main']);await git(['config','user.name','Max Ruiz']);await git(['config','user.email',email]);await git(['config','commit.gpgSign','false']);
 await writeFile(path.join(directory,'README.md'),'Image fixture');await git(['add','README.md']);await git(['commit','-m','Initial fixture']);await git(['init','--bare',remote]);await git(['push',remote,'HEAD:main']);await git(['remote','add','origin','https://github.com/MusicInTheTrees/fixture-images.git']);
 let wrongAccount=false,failPush=false,pushes=0;
 const run=async(program,args,options)=>{
  if(program==='gh')return {stdout:JSON.stringify(args[1]==='user'?{id:132178109,login:wrongAccount?'WrongAccount':'MusicInTheTrees'}:{private:true,permissions:{push:true}})};
  if(args.includes('ls-remote'))return git(['ls-remote','--heads',remote,'refs/heads/main']);
  if(args.includes('push')){pushes++;if(failPush)throw Error('Synthetic offline');return git(['push',remote,'HEAD:main']);}
  return exec(program,args,options);
 };
 return {directory,root,data,git,remote,run,sync:createImageSync({directory,root,data,run}),setWrong:v=>wrongAccount=v,setFailure:v=>failPush=v,pushes:()=>pushes,async add(file,bytes='fixture photo'){await mkdir(path.dirname(path.join(directory,file)),{recursive:true});await writeFile(path.join(directory,file),bytes);}};
}
test('sync only stages this account and shared images; retries retain a failed-push commit',async t=>{
 const f=await fixture(t);await f.add('ClothingImages/Top/Blue shirt.png');await f.add(`accounts/${user.id}/mannequin/request/result.png`);await f.add('accounts/other/images/private.png');await f.add('accounts.json','private registry');
 assert.equal((await f.sync.status(user)).changed,2);f.setFailure(true);await assert.rejects(()=>f.sync.sync(user),/local commit is saved/);
 assert.equal((await f.git(['status','--porcelain'])).stdout.includes('Blue shirt.png'),false);
 f.setFailure(false);assert.equal((await f.sync.sync(user)).ok,true);const remoteFiles=(await exec('git',['--git-dir',f.remote,'ls-tree','-r','--name-only','main'])).stdout;
 assert.ok(remoteFiles.includes('Blue shirt.png'));assert.ok(!remoteFiles.includes('private.png'));assert.ok(!remoteFiles.includes('accounts.json'));
 assert.match((await f.sync.sync(user)).message,/already backed up/);assert.equal(f.pushes(),2);
});
test('wrong identity, demo accounts, staged metadata and non-image outgoing commits block sync',async t=>{
 const f=await fixture(t);await f.add('ClothingImages/Top/new.png');f.setWrong(true);await assert.rejects(()=>f.sync.sync(user),/signed in as the owner/);f.setWrong(false);
 await assert.rejects(()=>f.sync.sync({...user,isDemo:true}),e=>e.status===403);
 await f.add('secret.json','secret');await f.git(['add','secret.json']);await assert.rejects(()=>f.sync.sync(user),/other staged/);
 await f.git(['commit','-m','Unexpected metadata']);await assert.rejects(()=>f.sync.sync(user),/outside this account/);assert.equal(f.pushes(),0);
 await f.git(['rm','secret.json']);await f.git(['commit','-m','Remove unexpected metadata']);await assert.rejects(()=>f.sync.sync(user),/unpushed commit/);assert.equal(f.pushes(),0);
});
test('public repositories and remote divergence do not upload images',async t=>{
 const f=await fixture(t);await f.add('ClothingImages/Top/new.png');
 const publicSync=createImageSync({...f,run:async(p,a,o)=>p==='gh'&&a[1]!=='user'?{stdout:JSON.stringify({private:false,permissions:{push:true}})}:f.run(p,a,o)});
 await assert.rejects(()=>publicSync.sync(user),/private GitHub/);
 const behind=createImageSync({...f,run:async(p,a,o)=>a.includes('ls-remote')?{stdout:'ffffffffffffffffffffffffffffffffffffffff\trefs/heads/main\n'}:f.run(p,a,o)});
 await assert.rejects(()=>behind.sync(user),/missing locally/);assert.equal(f.pushes(),0);
});
test('sync paths and remotes reject credentials, traversal, other accounts and deletion staging',()=>{
 assert.equal(githubRepository('git@github.com:MusicInTheTrees/StyleByFire-Images.git'),'MusicInTheTrees/StyleByFire-Images');assert.throws(()=>githubRepository('https://token@github.com/owner/repo.git'));
 for(const file of ['.data/accounts.json','ClothingImages/../secret.png','accounts/other/images/photo.png','accounts/'+user.id+'/mannequin/id/request.json'])assert.equal(imageSyncPath(file,user.id),false);
 assert.throws(()=>changedImagePaths('D  ClothingImages/photo.png\0',user.id),/staged/);
 assert.throws(()=>changedImagePaths('AA ClothingImages/photo.png\0',user.id),/merge conflict/);
 assert.deepEqual(changedImagePaths('?? ClothingImages/Top/a b.png\0 D ClothingImages/deleted.png\0',user.id),['ClothingImages/Top/a b.png']);
});

test('concurrent sync requests cannot create competing commits',async t=>{const f=await fixture(t);const first=f.sync.sync(user);assert.throws(()=>f.sync.sync(user),/already running/);assert.equal((await first).ok,true);});
test('sync leaves an unfinished merge for the user to resolve',async t=>{const f=await fixture(t);await writeFile(path.join(f.directory,'.git','MERGE_HEAD'),'ffffffffffffffffffffffffffffffffffffffff\n');await assert.rejects(()=>f.sync.sync(user),/Finish.*merge/);assert.equal(f.pushes(),0);});

test('media sync includes audio and a validated catalog but rejects arbitrary audio metadata',async t=>{
 const f=await fixture(t);await f.add('Audio/Music/jazz.mp3','ID3 fixture');await f.add('Audio/library.json',JSON.stringify({version:1,tracks:[{id:'jazz',title:'Jazz',pairId:'jazz-pair',mood:'Slow',file:'Music/jazz.mp3'}]}));await f.add('Audio/private.json','private');
 assert.equal((await f.sync.status(user)).changed,2);assert.equal((await f.sync.sync(user)).ok,true);
 const files=(await exec('git',['--git-dir',f.remote,'ls-tree','-r','--name-only','main'])).stdout;assert(files.includes('Audio/Music/jazz.mp3'));assert(files.includes('Audio/library.json'));assert(!files.includes('private.json'));
 await f.add('Audio/library.json',JSON.stringify({version:1,tracks:[],secret:'not a catalog'}));await assert.rejects(()=>f.sync.status(user),/Invalid audio library catalog/);
});
