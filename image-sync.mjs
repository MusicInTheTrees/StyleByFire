import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {realpath,lstat,mkdir} from 'node:fs/promises';
import path from 'node:path';
const exec=promisify(execFile);
const fail=message=>Object.assign(Error(message),{status:422});
const images=/\.(png|jpe?g|webp|heic|heif|avif|gif|bmp|tiff?)$/i;
export function imageSyncPath(file,userId){
 if(typeof file!=='string'||/[\\\x00-\x1f]/.test(file)||file.split('/').some(p=>!p||p==='.'||p==='..'||p.startsWith('.')&&p!=='.gitkeep'))return false;
 return (file.startsWith('ClothingImages/')||file.startsWith('thumbs/')||file.startsWith('legacy/images/')||file.startsWith(`accounts/${userId}/images/`)||file.startsWith(`accounts/${userId}/mannequin/`))&&(images.test(file)||path.posix.basename(file)==='.gitkeep');
}
export function githubRepository(remote){
 const match=remote.trim().match(/^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
 if(!match)throw fail('The image folder needs an origin remote on github.com using HTTPS or SSH, without embedded credentials.');
 return `${match[1]}/${match[2]}`;
}
export function changedImagePaths(status,userId){
 const entries=status.split('\0').filter(Boolean).map(row=>({code:row.slice(0,2),file:row.slice(3)}));
 for(const {code,file} of entries)if(code[0]!==' '&&code[0]!=='?'&&(!imageSyncPath(file,userId)||/[DU]/.test(code)))throw fail('The image repository has other staged changes or deletions. Finish those in Git before syncing from the app.');
 if(entries.some(({code})=>/U/.test(code)||code==='AA'))throw fail('Resolve the image repository’s merge conflict before syncing.');
 return entries.filter(({code,file})=>!code.includes('D')&&imageSyncPath(file,userId)).map(e=>e.file);
}
export function createImageSync({directory,data,root,run=exec}){
 let pending=null;
 const options={cwd:directory,windowsHide:true,timeout:120000,maxBuffer:8*1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never',GIT_SSH_COMMAND:'ssh -o BatchMode=yes'}};
 const hooks=path.join(data,'image-sync-no-hooks');
 async function command(program,args,message){try{return (await run(program,args,options)).stdout;}catch{throw fail(message);}}
 const git=(args,message='Git could not complete the image sync. Check the image repository and retry.')=>command('git',['--literal-pathspecs','-c',`core.hooksPath=${hooks}`,'-c','commit.gpgSign=false','-c','status.renames=false',...args],message);
 async function inspect(user){
  if(!user?.ownsLegacy||user.isDemo)throw Object.assign(Error('Only the original personal account can sync the shared image library.'),{status:403});
  if(!directory)throw fail('Link an external image folder first. See README → Optional separate image library.');
  const actual=await realpath(directory),app=await realpath(root);
  const top=(await git(['rev-parse','--show-toplevel'],'The linked image folder is not a Git repository. Clone your private image repository there first.')).trim();
  if(await realpath(top)!==actual||actual===app)throw fail('Sync requires a separate Git repository rooted at the linked image folder.');
  const gitDirectory=path.resolve(directory,(await git(['rev-parse','--git-dir'])).trim());
  for(const marker of ['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply','sequencer']){
   const exists=await lstat(path.join(gitDirectory,marker)).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
   if(exists)throw fail('Finish the image repository’s merge, rebase, or cherry-pick in Git before syncing.');
  }
  const repository=githubRepository(await git(['remote','get-url','origin']));
  const pushes=(await git(['remote','get-url','--push','--all','origin'])).trim().split(/\r?\n/);
  if(pushes.length!==1||githubRepository(pushes[0])!==repository)throw fail('The origin push destination must match the image repository.');
  const branch=(await git(['symbolic-ref','--short','HEAD'],'Check out a branch in the image repository before syncing.')).trim();
  if(!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch))throw fail('The image repository branch name is not supported for app sync.');
  const account=JSON.parse(await command('gh',['api','user'],'Sign in with GitHub CLI (gh auth login) on this computer before syncing.'));
  if(account.login.toLowerCase()!==repository.split('/')[0].toLowerCase())throw fail('GitHub CLI must be signed in as the owner of the linked image repository. No files were pushed.');
  const repo=JSON.parse(await command('gh',['api',`repos/${repository}`],'GitHub could not read the image repository. Check authentication and internet access.'));
  if(!repo.private)throw fail('App image sync requires a private GitHub repository. Your personal photos were not uploaded.');
  if(!repo.permissions?.push)throw fail('The signed-in GitHub account cannot push to this image repository.');
  const email=`${account.id}+${account.login}@users.noreply.github.com`;
  for(const kind of ['GIT_AUTHOR_IDENT','GIT_COMMITTER_IDENT'])if(!(await git(['var',kind])).includes(`<${email}>`))throw fail(`Set the image repository’s local Git email to ${email} before syncing. The app never changes your global Git identity.`);
  const status=await git(['status','--porcelain=v1','-z','--untracked-files=all']),files=changedImagePaths(status,user.id);
  for(const file of files){const full=path.join(actual,file),info=await lstat(full),resolved=await realpath(full);if(!info.isFile()||info.isSymbolicLink()||!resolved.startsWith(actual+path.sep))throw fail('Sync does not follow image links outside the library.');if(info.size>95*1024*1024)throw fail('An image is too large for GitHub. Keep each file below 95 MB.');}
  return {repository,visibility:'private',branch,account:account.login,changed:files.length,files};
 }
 async function sync(user){
  const info=await inspect(user);await mkdir(hooks,{recursive:true});
  const remoteLine=(await git(['ls-remote','--heads','origin',`refs/heads/${info.branch}`],'Cannot reach GitHub. Your local images are safe; check the connection and retry.')).trim();
  if(!remoteLine)throw fail('Push this image repository’s initial branch once from Git before using app sync.');
  const remoteHead=remoteLine.split(/\s/)[0];
  await git(['merge-base','--is-ancestor',remoteHead,'HEAD'],'The GitHub image branch has changes missing locally. Pull and resolve them in the image repository, then retry. App sync never overwrites remote work.');
  const outgoing=(await git(['diff','--name-only','-z',`${remoteHead}..HEAD`])).split('\0').filter(Boolean);
  if(outgoing.some(file=>!imageSyncPath(file,user.id)))throw fail('Existing unpushed commits include files outside this account’s image library. Review and push those commits in Git first.');
  const deleted=(await git(['diff','--name-only','--diff-filter=D','-z',`${remoteHead}..HEAD`])).split('\0').filter(Boolean);
  if(deleted.length)throw fail('Existing unpushed commits delete images. Review and push those commits in Git first.');
  const commits=(await git(['rev-list',`${remoteHead}..HEAD`])).trim().split(/\s+/).filter(Boolean);
  for(const commit of commits){
   if((await git(['rev-list','--parents','-n','1',commit])).trim().split(/\s+/).length>2)throw fail('An unpushed merge commit needs review and a manual push in Git before app sync can continue.');
   const files=(await git(['diff-tree','--root','--no-commit-id','--name-only','-r','-z',commit])).split('\0').filter(Boolean);
   const authors=(await git(['show','-s','--format=%ae%n%ce',commit])).trim().split(/\r?\n/);
   const expected=JSON.parse(await command('gh',['api','user'],'Cannot verify the GitHub identity.'));
   if(files.some(file=>!imageSyncPath(file,user.id))||authors.some(email=>email!==`${expected.id}+${expected.login}@users.noreply.github.com`))throw fail('An unpushed commit includes other files or a different Git identity. Review and push it in Git first.');
  }
  if(info.files.length){
   // Batch literal path arguments; never stage the repository wholesale.
   for(let n=0;n<info.files.length;n+=40)await git(['add','--',...info.files.slice(n,n+40)]);
   await inspect(user); // Recheck authentication and effective identity immediately before commit.
   const staged=(await git(['diff','--cached','--name-only','-z'])).split('\0').filter(Boolean);
   if(staged.some(file=>!imageSyncPath(file,user.id)))throw fail('The staged files changed during sync. Review them in Git before retrying.');
   if(staged.length)await git(['commit','-m','Back up StyleByFire clothing and mannequin images'],'Could not commit the image backup. Review the repository and retry.');
  }
  await inspect(user); // Identity is verified before every push, including retries.
  const head=(await git(['rev-parse','HEAD'])).trim();
  if(head!==remoteHead)await git(['push','origin',`HEAD:refs/heads/${info.branch}`],'The image backup could not be pushed. Its local commit is saved. Check the connection or remote changes and retry.');
  return {ok:true,repository:info.repository,commit:head,message:head===remoteHead?'Your images are already backed up to GitHub.':'Your image backup is saved on GitHub.'};
 }
 return {async status(user){const {files,...info}=await inspect(user);return info;},sync(user){if(pending)throw fail('An image sync is already running. Please wait.');pending=sync(user).finally(()=>{pending=null;});return pending;}};
}
