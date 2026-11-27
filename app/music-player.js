import {shuffledRound} from './music-shuffle.js';
import {installMusicAutoplay} from './music-autoplay.js';

export function createMusicPlayer({api,escape}){
 const audio=new Audio();audio.preload='metadata';audio.controls=false;audio.hidden=true;audio.volume=0.15;
 let accountId=null,tracks=[],queue=[],history=[],current=null,mood='All',error='',loading=false,revision=0,starting=false,autoplay=true,manuallyPaused=false;
 const host=document.createElement('aside');host.id='music-player';host.hidden=true;host.setAttribute('aria-label','Studio music player');
 const glyph=body=>`<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${body}</svg>`;
 const playGlyph=glyph('<path d="M7 4v16l13-8z"/>'),pauseGlyph=glyph('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>');
 host.innerHTML=`<div class="music-heading"><div class="music-info"><strong data-music-title>Studio jazz</strong><small data-music-detail></small></div><button type="button" class="btn primary" data-music-action="toggle" aria-label="Play" title="Play">${playGlyph}</button><button type="button" class="btn secondary" data-music-action="next" aria-label="Next track" title="Next track">${glyph('<path d="M5 4v16l12-8z"/><rect x="18" y="4" width="3" height="16" rx="1"/>')}</button><button type="button" class="btn secondary" data-music-action="volume" aria-label="Volume controls" title="Volume controls" aria-expanded="false" aria-controls="music-volume-panel"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/></svg></button><button type="button" class="btn secondary" data-action="audio-settings" aria-label="Audio settings" title="Audio settings">${glyph('<circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>')}</button></div><div id="music-volume-panel" hidden><label>Volume <output data-music-volume-label>15%</output><input aria-label="Player volume" data-music-volume type="range" min="0" max="100" step="1" value="15"></label><label class="check-row"><input type="checkbox" data-music-mute>Mute</label></div><p data-music-error role="status"></p>`;
 // Keep the audio element outside the rerendered app so navigation never interrupts playback.
 document.body.append(audio);
 const compact=window.matchMedia('(max-width:950px)');
 function mount(){const destination=document.querySelector(compact.matches?'.topbar':'.sidebar-bottom');if(destination)destination.prepend(host);}
 compact.addEventListener('change',mount);
 const key=()=>`stylebyfire-audio:${accountId}`;
 function save(){if(accountId)try{localStorage.setItem(key(),JSON.stringify({volume:audio.volume,muted:audio.muted,mood,autoplay,history:history.slice(-2).map(t=>t.id)}));}catch{}}
 const filtered=()=>tracks.filter(t=>mood==='All'||t.mood===mood);
 function update(){
  host.hidden=!accountId||!tracks.length;mount();
  host.querySelector('[data-music-title]').textContent=current?.title||'Studio jazz';
  host.querySelector('[data-music-detail]').textContent=current?`${current.mood} · ${audio.paused?'paused':'playing'}`:`${filtered().length} tracks · shuffled`;
  host.querySelector('[data-music-error]').textContent=error;
  host.querySelector('[data-music-action="next"]').disabled=starting||!tracks.length;
  const toggleButton=host.querySelector('[data-music-action="toggle"]');toggleButton.innerHTML=audio.paused?playGlyph:pauseGlyph;toggleButton.setAttribute('aria-label',audio.paused?'Play':'Pause');toggleButton.title=audio.paused?'Play':'Pause';host.querySelector('[data-music-action="toggle"]').disabled=starting||!tracks.length;
  const settings=document.querySelector('#settings-audio-content');if(settings)settings.innerHTML=markup();
 }
 function volumeLabels(){document.querySelectorAll('[data-music-volume]').forEach(el=>{el.value=Math.round(audio.volume*100);});document.querySelectorAll('[data-music-volume-label]').forEach(el=>{el.textContent=Math.round(audio.volume*100)+'%';});document.querySelectorAll('[data-music-mute]').forEach(el=>{el.checked=audio.muted;});}
 function markup(){
  const moods=[...new Set(tracks.map(t=>t.mood))];
  return `<section><h3>Studio music</h3><p>Instrumental jazz while you build outfits. Shuffle leaves at least two other tracks between paired versions, including across rounds. Playback continues when you change pages.</p><p class="music-status" role="status">${escape(error|| (loading?'Loading your music library…':current?`${audio.paused?'Paused':'Now playing'}: ${current.title}`:tracks.length?`${tracks.length} tracks ready. Press Play to begin.`:'No music library is linked yet. Add Audio/library.json and audio files to your linked media folder.'))}</p><div class="settings-actions music-settings-actions"><button type="button" class="btn primary" data-music-action="toggle" ${!tracks.length||starting?'disabled':''}>${audio.paused?'Play':'Pause'}</button><button type="button" class="btn secondary" data-music-action="next" ${!tracks.length||starting?'disabled':''}>Next track</button><button type="button" class="btn secondary" data-music-action="refresh">Refresh music library</button></div><label>Volume <output data-music-volume-label>${Math.round(audio.volume*100)}%</output><input aria-label="Music volume" data-music-volume type="range" min="0" max="100" step="1" value="${Math.round(audio.volume*100)}"></label><label class="check-row"><input type="checkbox" data-music-autoplay ${autoplay?'checked':''}>Autoplay when opening or returning to the app</label><label class="check-row"><input type="checkbox" data-music-mute ${audio.muted?'checked':''}>Mute music</label><label>Playlist<select data-music-mood><option value="All" ${mood==='All'?'selected':''}>All jazz</option>${moods.map(m=>`<option value="${escape(m)}" ${mood===m?'selected':''}>${escape(m)}</option>`).join('')}</select></label><p>First-use volume is 15%. Volume and playlist preferences are remembered for this account in this browser. Autoplay is on by default and resumes when you return to this tab or window. If the browser blocks it, your next app interaction retries playback. Pause lasts until you return; turn autoplay off to keep music paused. Signing out stops music.</p><details><summary>Tracks and pairings (${tracks.length})</summary><ul class="music-track-list">${tracks.map(t=>`<li><strong>${escape(t.title)}</strong><span>${escape(t.mood)} · pair: ${escape(t.pairId.replaceAll('-',' '))}</span></li>`).join('')}</ul></details></section>`;
 }
 async function next(play=true){
  if(starting)return;const selected=filtered();if(!selected.length){error='No tracks match this playlist.';update();return;}
  if(!queue.length)queue=shuffledRound(selected,history);
  if(!queue.length){audio.pause();error='Not enough different pairs to keep two tracks between versions. Choose a broader playlist or add more pairs.';update();return;}
  const track=queue.shift(),token=revision;current=track;error='';starting=true;audio.src=track.src;update();
  try{
   if(play)await audio.play();
   if(token!==revision)return;
   history.push(track);history=history.slice(-2);save();
  }catch(e){
   if(token!==revision)return;
   if(e.name==='NotAllowedError')queue.unshift(track);current=null;audio.pause();audio.removeAttribute('src');audio.load();
   error=e.name==='NotAllowedError'?'Click anywhere in the app to start music.':'This track could not play. Check that the audio file is available, then refresh the library.';
  }finally{if(token===revision){starting=false;update();}}
 }
 async function resume(){
  if(starting||!accountId)return;
  if(!current||!audio.getAttribute('src'))return next();
  if(!audio.paused)return;
  const token=revision;starting=true;
  try{await audio.play();if(token===revision)error='';}
  catch(e){if(token===revision)error=e.name==='NotAllowedError'?'Click anywhere in the app to start music.':'Press Play again, or refresh the music library.';}
  finally{if(token===revision){starting=false;update();}}
 }
 async function toggle(){if(starting)return;if(audio.paused){manuallyPaused=false;await resume();}else{manuallyPaused=true;audio.pause();update();}}
 function autoplayReady({returning=false}={}){return !!accountId&&autoplay&&!loading&&!starting&&tracks.length>0&&audio.paused&&(!manuallyPaused||returning);}
 function tryAutoplay(reason){if(!document.hidden&&autoplayReady(reason)){manuallyPaused=false;void resume();}}
 installMusicAutoplay({pageWindow:window,pageDocument:document,shouldResume:autoplayReady,resume:tryAutoplay});
 async function refresh(){
  if(!accountId)return;const token=revision;loading=true;error='';update();
  try{const result=await api('/api/audio');if(token!==revision)return;tracks=result.tracks;queue=[];if(!tracks.some(t=>t.mood===mood))mood='All';history=history.map(h=>tracks.find(t=>t.id===h.id)).filter(Boolean);if(current&&!tracks.some(t=>t.id===current.id)){audio.pause();audio.removeAttribute('src');audio.load();current=null;}save();}
  catch(e){if(token===revision)error='Music unavailable: '+e.message;}
  finally{if(token===revision){loading=false;update();}}
 }
 function reset(){host.querySelector('#music-volume-panel').hidden=true;host.querySelector('[data-music-action="volume"]').setAttribute('aria-expanded','false');revision++;accountId=null;manuallyPaused=false;audio.pause();audio.removeAttribute('src');audio.load();tracks=[];queue=[];history=[];current=null;error='';loading=false;starting=false;update();}
 async function load(id){
  reset();const token=revision;accountId=id;audio.volume=0.15;audio.muted=false;mood='All';autoplay=true;
  try{const saved=JSON.parse(localStorage.getItem(key())||'null');if(saved){if(Number.isFinite(saved.volume))audio.volume=Math.max(0,Math.min(1,saved.volume));audio.muted=saved.muted===true;autoplay=saved.autoplay!==false;mood=typeof saved.mood==='string'?saved.mood:'All';history=Array.isArray(saved.history)?saved.history.slice(-2).map(id=>({id})):[];}}catch{}
  await refresh();if(token===revision)tryAutoplay();
 }
 audio.addEventListener('ended',()=>{void next();});
 audio.addEventListener('play',update);audio.addEventListener('pause',update);
 audio.addEventListener('volumechange',()=>{save();volumeLabels();});
 audio.addEventListener('error',()=>{if(!accountId||!audio.getAttribute('src')||starting)return;error='Audio playback stopped. Check the file or choose Next track.';update();});
 document.addEventListener('click',event=>{const action=event.target.closest('[data-music-action]')?.dataset.musicAction;if(!action||!accountId)return;if(action==='volume'){const panel=host.querySelector('#music-volume-panel');panel.hidden=!panel.hidden;host.querySelector('[data-music-action="volume"]').setAttribute('aria-expanded',String(!panel.hidden));volumeLabels();if(!panel.hidden)panel.querySelector('input').focus();}if(action==='toggle')void toggle();if(action==='next')void next();if(action==='refresh')void refresh();});
 host.addEventListener('keydown',event=>{if(event.key==='Escape'&&!host.querySelector('#music-volume-panel').hidden){host.querySelector('#music-volume-panel').hidden=true;const button=host.querySelector('[data-music-action="volume"]');button.setAttribute('aria-expanded','false');button.focus();}});
 document.addEventListener('input',event=>{if(event.target.matches('[data-music-volume]')){audio.volume=Number(event.target.value)/100;save();volumeLabels();}});
 document.addEventListener('change',event=>{if(event.target.matches('[data-music-autoplay]')){autoplay=event.target.checked;save();if(autoplay)tryAutoplay({returning:true});}if(event.target.matches('[data-music-mute]')){audio.muted=event.target.checked;save();}if(event.target.matches('[data-music-mood]')){mood=event.target.value;queue=[];save();update();}});
 return {load,reset,markup,mount};
}
