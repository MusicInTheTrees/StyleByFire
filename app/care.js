export const CARE_METHODS={label:'Follow care label',machine:'Machine wash',hand:'Hand wash',dry:'Professional dry cleaning',spot:'Specialist / spot care'};
export const CARE_SOURCES=[
 ['Washing frequency · Whirlpool','https://www.whirlpool.com/blog/washers-and-dryers/how-often-should-you-wash-your-clothes.html'],
 ['Sorting and care labels · Whirlpool','https://www.whirlpool.com/blog/washers-and-dryers/how-to-sort-separate-laundry.html'],
 ['Dry-clean-only garments · Whirlpool','https://www.whirlpool.com/blog/washers-and-dryers/wash-dry-clean-only.html']
];
export function localDate(now=new Date()){return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;}
export function validCareDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function careDefaults(item){
 const description=[item.name,item.subcategory].join(' ').toLowerCase();let wears=0,months=0,reason='As needed; set a schedule that matches the material and care label.';
 if(item.category==='Socks'||/activewear|workout|athletic|running|training/.test(description)&&['Top','Bottom'].includes(item.category)){wears=1;reason='Socks and workout clothing: a fresh clean after each wear.';}
 else if(item.role==='outerwear'){wears=6;months=3;reason='Jackets: review after 6 wears. The optional 3-month check-in is an app starting point, not a universal dry-cleaning interval.';}
 else if(item.category==='Top'&&/sweater|knitwear|cardigan/.test(description)){wears=2;reason='Knitwear: start with 2 wears; an undershirt may allow a longer interval.';}
 else if(item.category==='Top'&&item.role!=='dress'){wears=/\b(?:t[- ]?shirts?|tank(?: tops?)?|undershirts?)\b/.test(description)?1:2;reason='Everyday shirts: 1–2 wears, sooner after sweat or visible soil.';}
 else if(item.category==='Bottom'){wears=/jeans|denim/.test(description)?5:3;reason=wears===5?'Jeans: start with 5 wears.':'Trousers: start with 3 wears; shorten for heavy or sweaty use.';}
 return {enabled:true,method:'label',wearLimit:wears,monthLimit:months,instructions:['Accessories','Shoes'].includes(item.category)?'Follow the maker’s care instructions for the material and finish. Record approved cleaning products and water restrictions here.':'Check the garment label first. If machine washing is permitted, separate colors and consider a cold wash. Use the label’s drying instructions. Dry-clean-only items need professional care.',labelVerified:false,wearsSinceClean:0,lastCleaned:null,lastWorn:null,trackingSince:null,reason};
}
export function careFor(item){return {...careDefaults(item),...item.care};}
export function validateCare(care){
 if(care===undefined)return;
 if(!care||typeof care!=='object'||Array.isArray(care))throw Error('Invalid clothing-care settings.');
 if(typeof care.enabled!=='boolean'||typeof care.labelVerified!=='boolean'||!Object.hasOwn(CARE_METHODS,care.method)||!Number.isInteger(care.wearLimit)||care.wearLimit<0||care.wearLimit>365||!Number.isInteger(care.monthLimit)||care.monthLimit<0||care.monthLimit>120||!Number.isInteger(care.wearsSinceClean)||care.wearsSinceClean<0||care.wearsSinceClean>10000||typeof care.instructions!=='string'||care.instructions.length>2000)throw Error('Invalid clothing-care settings.');
 for(const key of ['lastCleaned','lastWorn','trackingSince'])if(care[key]!==null&&!validCareDate(care[key]))throw Error('Invalid clothing-care date.');
}
export function addMonths(date,months){
 const [y,m,d]=date.split('-').map(Number),target=new Date(Date.UTC(y,m-1+months,1)),last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
 return `${target.getUTCFullYear()}-${String(target.getUTCMonth()+1).padStart(2,'0')}-${String(Math.min(d,last)).padStart(2,'0')}`;
}
export function careStatus(item,today=localDate()){
 const c=careFor(item),since=c.lastCleaned||c.trackingSince,dueDate=since&&c.monthLimit?addMonths(since,c.monthLimit):null;
 const wearDue=c.wearLimit>0&&c.wearsSinceClean>=c.wearLimit,dateDue=!!dueDate&&dueDate<=today;
 const due=c.enabled&&item.availability!=='archived'&&(wearDue||dateDue),inCare=item.availability==='laundry';
 return {care:c,due,dueDate,inCare,wearDue,dateDue,label:inCare?'In cleaning':!c.enabled?'Reminders paused':due?(c.method==='dry'?'Dry cleaning due':'Care due'):!since&&!c.lastWorn?'History not set':dueDate?`Check by ${dueDate}`:'On track'};
}
export function careAction(item,action,today=localDate()){
 if(!validCareDate(today))throw Error('Choose a valid care date.');
 const next=structuredClone(item),c=careFor(next);delete c.reason;
 if(action==='wear'){
  if(c.lastWorn===today)return {item:next,changed:false};
  if(next.availability&&next.availability!=='ready')throw Error('Make this piece ready before marking it worn.');
  c.wearsSinceClean++;c.lastWorn=today;c.trackingSince||=today;
 }else if(action==='clean'){c.wearsSinceClean=0;c.lastCleaned=today;c.trackingSince=today;if(next.availability==='laundry')next.availability='ready';}
 else if(action==='laundry'){if(next.availability==='archived')throw Error('Unarchive this piece first.');next.availability='laundry';}
 else throw Error('Unknown clothing-care action.');
 validateCare(c);next.care=c;return {item:next,changed:true};
}
export const dueCareItems=(items,today=localDate())=>items.filter(item=>careStatus(item,today).due);
const careFields=item=>({care:item.care,availability:item.availability});
export function careUndoRecord(before,after){return before.filter((item,n)=>JSON.stringify(careFields(item))!==JSON.stringify(careFields(after[n]))).map(item=>({id:item.id,before:structuredClone(careFields(item)),after:structuredClone(careFields(after.find(i=>i.id===item.id)))}));}
export function undoCare(items,record){
 for(const change of record){const item=items.find(i=>i.id===change.id);if(!item||JSON.stringify(careFields(item))!==JSON.stringify(change.after))throw Error('This piece’s care or availability changed again. Review its care settings instead of undoing.');}
 return items.map(item=>{const change=record.find(c=>c.id===item.id);if(!change)return item;const next={...item};for(const key of ['care','availability']){if(change.before[key]===undefined)delete next[key];else next[key]=structuredClone(change.before[key]);}return next;});
}
