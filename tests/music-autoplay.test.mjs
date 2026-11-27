import test from 'node:test';
import assert from 'node:assert/strict';
import {installMusicAutoplay} from '../app/music-autoplay.js';

function fixture(){
 const pageWindow=new EventTarget(),pageDocument=new EventTarget();pageDocument.hidden=false;
 const state={enabled:true,signedIn:true,playing:false,busy:false,pausedByUser:false,calls:[]};
 const dispose=installMusicAutoplay({pageWindow,pageDocument,
  shouldResume:({returning})=>state.enabled&&state.signedIn&&!state.playing&&!state.busy&&(!state.pausedByUser||returning),
  resume:reason=>state.calls.push(reason)});
 return {pageWindow,pageDocument,state,dispose};
}
test('returning to a visible tab or window retries paused playback',()=>{
 const f=fixture();f.state.pausedByUser=true;
 f.pageWindow.dispatchEvent(new Event('focus'));f.pageWindow.dispatchEvent(new Event('pageshow'));f.pageDocument.dispatchEvent(new Event('visibilitychange'));
 assert.deepEqual(f.state.calls,[{returning:true},{returning:true},{returning:true}]);
 f.pageDocument.hidden=true;f.pageWindow.dispatchEvent(new Event('focus'));f.pageDocument.dispatchEvent(new Event('visibilitychange'));assert.equal(f.state.calls.length,3);
 f.dispose();f.pageWindow.dispatchEvent(new Event('focus'));assert.equal(f.state.calls.length,3);
});
test('disabled autoplay, signed-out accounts, active playback, and pending play do not restart music',()=>{
 for(const [key,value] of [['enabled',false],['signedIn',false],['playing',true],['busy',true]]){
  const f=fixture();f.state[key]=value;f.pageWindow.dispatchEvent(new Event('focus'));assert.equal(f.state.calls.length,0);f.dispose();
 }
});
test('trusted ordinary interaction retries blocked autoplay but not playback controls or shortcuts',()=>{
 const listeners={},pageDocument={hidden:false,addEventListener:(type,fn)=>listeners[type]=fn,removeEventListener:()=>{}},pageWindow=new EventTarget();
 let attempts=0,pausedByUser=false;
 installMusicAutoplay({pageDocument,pageWindow,shouldResume:()=>!pausedByUser,resume:()=>attempts++});
 const click={type:'click',isTrusted:true,target:{closest:()=>null}};
 listeners.click(click);listeners.keydown({...click,type:'keydown',key:'Enter'});assert.equal(attempts,2);
 for(const event of [{...click,isTrusted:false},{...click,defaultPrevented:true},{...click,target:{closest:()=>({})}},{...click,type:'keydown',key:'Escape'},{...click,type:'keydown',key:'r',ctrlKey:true},{...click,type:'keydown',key:'Enter',repeat:true}])listeners[event.type](event);
 pausedByUser=true;listeners.click(click);assert.equal(attempts,2);
});
