import test from 'node:test';
import assert from 'node:assert/strict';
import {shuffledRound} from '../app/music-shuffle.js';
import {audioRange,validateAudioCatalog,audioFile} from '../audio-library.mjs';
import {imageSyncPath} from '../image-sync.mjs';
import {mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const tracks=Array.from({length:16},(_,i)=>({id:'track-'+i,pairId:'pair-'+Math.floor(i/2)}));
test('shuffle plays each track once per round and separates pairs across round boundaries',()=>{
 let seed=38;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);let history=[];const firsts=new Set();
 for(let round=0;round<100;round++){const queue=shuffledRound(tracks,history,random);assert.equal(queue.length,16);assert.equal(new Set(queue.map(t=>t.id)).size,16);firsts.add(queue[0].id);for(const track of queue){assert(!history.slice(-2).some(t=>t.pairId===track.pairId));history.push(track);}history=history.slice(-2);}
 assert(firsts.size>8);
});
test('small libraries and changed filters never bypass the pair cooldown',()=>{
 assert.deepEqual(shuffledRound(tracks.slice(0,2),[tracks[0]]),[]);
 const history=[tracks[0],tracks[2]],queue=shuffledRound(tracks.slice(0,6),history);for(const t of queue){assert(!history.slice(-2).some(h=>h.pairId===t.pairId));history.push(t);}
});
test('audio ranges support seeking, suffix requests, and reject invalid ranges',()=>{
 assert.deepEqual(audioRange('bytes=5-12',20),{start:5,end:12});assert.deepEqual(audioRange('bytes=10-',20),{start:10,end:19});assert.deepEqual(audioRange('bytes=-5',20),{start:15,end:19});assert.deepEqual(audioRange('bytes=10-100',20),{start:10,end:19});
 for(const range of ['bytes=20-','bytes=9-3','bytes=-0','bytes=0-1,3-4','garbage'])assert.throws(()=>audioRange(range,20),{status:416});
});
test('audio catalog rejects traversal, metadata, duplicate IDs, and non-audio files',()=>{
 const track={id:'song',title:'Song',pairId:'pair',mood:'Slow',file:'Music/Jazz/song.mp3'};
 assert.equal(validateAudioCatalog({version:1,tracks:[track]}).tracks.length,1);
 for(const key of ['id','pairId']){const missing={...track};delete missing[key];assert.throws(()=>validateAudioCatalog({version:1,tracks:[missing]}));}
 for(const file of ['../private.mp3','/song.mp3','C:/song.mp3','Music/.secret.mp3','Music/song.json','Music\\song.mp3'])assert.throws(()=>validateAudioCatalog({version:1,tracks:[{...track,file}]}));
 assert.throws(()=>validateAudioCatalog({version:1,tracks:[track,track]}));assert.throws(()=>validateAudioCatalog({version:1,tracks:[{...track,password:'secret'}]}));
 assert(imageSyncPath('Audio/Music/Jazz/song.mp3','owner'));assert(imageSyncPath('Audio/library.json','owner'));assert(!imageSyncPath('Audio/accounts.json','owner'));assert(!imageSyncPath('accounts/other/song.mp3','owner'));
});
test('audio resolution rejects a linked directory outside the library',async t=>{
 const temporary=await mkdtemp(path.join(tmpdir(),'sbf-audio-'));t.after(async()=>{assert(path.resolve(temporary).startsWith(path.resolve(tmpdir())+path.sep));await rm(temporary,{recursive:true,force:true});});
 const base=path.join(temporary,'Audio'),outside=path.join(temporary,'outside');await mkdir(base);await mkdir(outside);await writeFile(path.join(outside,'song.mp3'),'test');await symlink(outside,path.join(base,'linked'),'junction');
 await assert.rejects(()=>audioFile(base,{file:'linked/song.mp3'}),/inside/);
});
