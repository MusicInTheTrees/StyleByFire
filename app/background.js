import {applyTheme,savedTheme,themePatterns} from './theme-packs.js';
let theme=applyTheme(savedTheme());
const originalBlue=[
 {name:'Blue diamonds',image:"url('/ambient-diamond.png')"},
 {name:'Knitted geometry',image:"url('/ambient-geometric.png')"},
 {name:'Navy lattice',image:"url('/ambient-lattice.png')"},
 {name:'Blue dotted knit',image:"url('/ambient-dots.png')"}
];
function choicesFor(selected){return selected.id==='designer-blue'?originalBlue:themePatterns(selected).main.map((image,i)=>({name:i?'Alternate weave':'Woven detail',image}));}
const backdrop=document.querySelector('#ambient-backdrop');
const controls=document.querySelector('#ambient-controls');
const motion=matchMedia('(prefers-reduced-motion: reduce)');
let mode='fade',index=0,timer,choices=choicesFor(theme),indices={};
try{const saved=JSON.parse(localStorage.getItem('stylebyfire-background')||'null');if(saved&&['fade','still','off'].includes(saved.mode))mode=saved.mode;if(saved?.indices&&typeof saved.indices==='object')indices=saved.indices;if(Number.isInteger(saved?.index)&&saved.index>=0&&!Number.isInteger(indices[theme.id]))indices[theme.id]=saved.index;index=indices[theme.id]||0;}catch{}
index%=choices.length;
backdrop.innerHTML=Array.from({length:4},()=>'<div class="ambient-pattern"></div>').join('')+'<div class="ambient-wash"></div>';
controls.innerHTML='<div class="ambient-settings"><label>Pattern display<select id="background-mode"><option value="fade">Slowly fade between patterns</option><option value="still">Keep one pattern</option><option value="off">Solid theme background</option></select></label><p id="background-name"></p><button type="button" id="background-next">Next pattern</button><p class="background-motion-note" id="background-motion-note"></p></div>';
const layers=[...backdrop.querySelectorAll('.ambient-pattern')];
const selector=controls.querySelector('#background-mode');
const next=controls.querySelector('#background-next');
function save(){indices[theme.id]=index;try{localStorage.setItem('stylebyfire-background',JSON.stringify({mode,index,indices}));}catch{}}
function paint(){
 document.documentElement.dataset.background=mode;
 layers.forEach((layer,i)=>{layer.style.backgroundImage=choices[i]?.image||'none';layer.classList.toggle('visible',i===index);});
 selector.value=mode;next.disabled=mode==='off';
 controls.querySelector('#background-name').textContent=mode==='off'?`${theme.name} · solid canvas`:`${theme.name} · ${choices[index].name}`;
 controls.querySelector('#background-motion-note').textContent=motion.matches?'Reduced motion is on. Your background stays still.':mode==='fade'?'Changes every 18 seconds with a gentle 6-second fade.':'Your background stays fixed as you scroll.';
}
function advance(){index=(index+1)%choices.length;paint();}
function schedule(){clearInterval(timer);if(mode==='fade'&&!motion.matches&&!document.hidden&&choices.length>1)timer=setInterval(advance,18000);}
selector.addEventListener('change',()=>{mode=selector.value;paint();save();schedule();});
next.addEventListener('click',()=>{advance();save();schedule();});
motion.addEventListener('change',()=>{paint();schedule();});
document.addEventListener('visibilitychange',schedule);
document.documentElement.addEventListener('stylebyfire-themechange',event=>{indices[theme.id]=index;theme=event.detail.theme;choices=choicesFor(theme);index=Number.isInteger(indices[theme.id])?indices[theme.id]%choices.length:0;paint();save();schedule();});
paint();
schedule();

export function mountBackgroundControls(host){host.append(controls);controls.hidden=false;paint();}
