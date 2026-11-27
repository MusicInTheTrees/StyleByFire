// Retrying play() does not bypass browser permissions. Trusted app interactions
// provide a second opportunity when page/focus autoplay was blocked.
export function installMusicAutoplay({pageWindow,pageDocument,shouldResume,resume}){
 const attempt=returning=>{
  const reason={returning};
  if(!pageDocument.hidden&&shouldResume(reason))resume(reason);
 };
 const returned=()=>attempt(true);
 const interaction=event=>{
  if(!event.isTrusted||event.defaultPrevented)return;
  if(event.type==='keydown'&&(event.repeat||event.ctrlKey||event.metaKey||event.altKey||['Shift','Control','Alt','Meta','Escape'].includes(event.key)))return;
  // Let playback controls, autoplay preferences, and sign-out finish themselves.
  if(event.target?.closest?.('[data-music-action], [data-action="audio-settings"], [data-action="sign-out"], #music-volume-panel, #settings-audio-content'))return;
  attempt(false);
 };
 pageWindow.addEventListener('focus',returned);
 pageWindow.addEventListener('pageshow',returned);
 pageDocument.addEventListener('visibilitychange',returned);
 pageDocument.addEventListener('click',interaction);
 pageDocument.addEventListener('keydown',interaction);
 return ()=>{
  pageWindow.removeEventListener('focus',returned);
  pageWindow.removeEventListener('pageshow',returned);
  pageDocument.removeEventListener('visibilitychange',returned);
  pageDocument.removeEventListener('click',interaction);
  pageDocument.removeEventListener('keydown',interaction);
 };
}
