const choices=[
 {name:'Blue diamonds',src:'/ambient-diamond.png'},
 {name:'Knitted geometry',src:'/ambient-geometric.png'},
 {name:'Navy lattice',src:'/ambient-lattice.png'},
 {name:'Blue dotted knit',src:'/ambient-dots.png'}
];
const backdrop=document.querySelector('#ambient-backdrop');
const controls=document.querySelector('#ambient-controls');
const motion=matchMedia('(prefers-reduced-motion: reduce)');
let mode='fade',index=0,timer,available=choices.map((_,i)=>i);
try{const saved=JSON.parse(localStorage.getItem('stylebyfire-background')||'null');if(saved&&['fade','still','off'].includes(saved.mode))mode=saved.mode;if(Number.isInteger(saved?.index)&&saved.index>=0&&saved.index<choices.length)index=saved.index;}catch{}
backdrop.innerHTML=choices.map((choice,i)=>`<div class="ambient-pattern${i===index?' visible':''}" style="background-image:url('${choice.src}')"></div>`).join('')+'<div class="ambient-wash"></div>';
controls.innerHTML='<summary>Background</summary><div class="ambient-settings"><label>Pattern display<select id="background-mode"><option value="fade">Slowly fade between patterns</option><option value="still">Keep one pattern</option><option value="off">Solid blue background</option></select></label><p id="background-name"></p><button type="button" id="background-next">Next pattern</button><p class="background-motion-note" id="background-motion-note"></p></div>';
const layers=[...backdrop.querySelectorAll('.ambient-pattern')];
const selector=controls.querySelector('#background-mode');
const next=controls.querySelector('#background-next');
function save(){try{localStorage.setItem('stylebyfire-background',JSON.stringify({mode,index}));}catch{}}
function paint(){
 document.documentElement.dataset.background=mode;
 layers.forEach((layer,i)=>layer.classList.toggle('visible',i===index));
 selector.value=mode;next.disabled=mode==='off';
 controls.querySelector('#background-name').textContent=mode==='off'?'A quiet blue canvas':choices[index].name;
 controls.querySelector('#background-motion-note').textContent=motion.matches?'Reduced motion is on. Your background stays still.':mode==='fade'?'Changes every 18 seconds with a gentle 6-second fade.':'Your background stays fixed as you scroll.';
}
function advance(){const position=available.indexOf(index);index=available[(position+1)%available.length];paint();}
function schedule(){clearInterval(timer);if(mode==='fade'&&!motion.matches&&!document.hidden&&available.length>1)timer=setInterval(advance,18000);}
selector.addEventListener('change',()=>{mode=selector.value;paint();save();schedule();});
next.addEventListener('click',()=>{advance();save();schedule();});
motion.addEventListener('change',()=>{paint();schedule();});
document.addEventListener('visibilitychange',schedule);
paint();
// Decode all four layers before starting transitions, avoiding a blank first fade.
Promise.allSettled(choices.map(choice=>new Promise((resolve,reject)=>{const img=new Image();img.onload=resolve;img.onerror=reject;img.src=choice.src;}))).then(results=>{
 available=results.flatMap((result,i)=>result.status==='fulfilled'?[i]:[]);
 if(!available.length){mode='off';available=[0];}else if(!available.includes(index))index=available[0];
 paint();schedule();
});
