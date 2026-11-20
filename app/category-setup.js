import {CATEGORIES,DEFAULT_SUBCATEGORIES} from './domain.js';

const paths={
 Cap:['Bucket hats','Durags','Beanies','Baseball caps','Flat caps','Visors','Head wraps','Sun hats','Formal hats'],
 Top:['Shirts / T-shirts','Shirts / Tank tops','Shirts / Button-down / Long sleeve','Shirts / Button-down / Short sleeve','Shirts / Button-down / Untucked','Shirts / Polo / Short sleeve','Shirts / Polo / Long sleeve','Blouses / Long sleeve','Blouses / Short sleeve','Knitwear / Sweaters','Knitwear / Cardigans','Sweatshirts / Hoodies','Sweatshirts / Crewneck','Outerwear / Sport coats','Outerwear / Blazers','Outerwear / Jackets','Outerwear / Coats','Outerwear / Vests','Outerwear / Golf layers','Dresses / Casual','Dresses / Business','Dresses / Evening','Dresses / Golf','Activewear / Tops'],
 Bottom:['Pants / Jeans','Pants / Chinos','Pants / Slacks','Pants / Cargo','Pants / Golf','Shorts / Casual','Shorts / Athletic','Shorts / Golf','Skirts / Mini','Skirts / Midi','Skirts / Maxi','Skorts / Casual','Skorts / Golf','Leggings / Everyday','Leggings / Athletic','Joggers','Sweatpants'],
 Socks:['Dress socks','Athletic socks','Ankle socks','No-show socks','Crew socks','Knee-high socks','Compression socks'],
 Shoes:['Sneakers / Casual','Sneakers / Running','Sneakers / Training','Golf shoes / Spiked','Golf shoes / Spikeless','Dress shoes / Oxfords','Dress shoes / Derbies','Dress shoes / Loafers','Dress shoes / Monk straps','Flats','Heels','Boots / Ankle','Boots / Dress','Boots / Outdoor','Sandals','Slides'],
 Accessories:['Ties / Neckties','Ties / Bow ties','Ties / Ascots','Belts / Leather','Belts / Woven','Eyewear / Glasses','Eyewear / Sunglasses','Jewelry / Earrings / Studs','Jewelry / Earrings / Hoops','Jewelry / Earrings / Drop','Jewelry / Necklaces / Chains','Jewelry / Necklaces / Pendants','Jewelry / Brooches','Jewelry / Rings','Watches / Dress','Watches / Sport','Wristbands / Bracelets','Wristbands / Sport','Wallets / Bifold','Wallets / Trifold','Wallets / Card holders','Scarves / Lightweight','Scarves / Winter','Pocket squares','Gloves']
};
const key=({category,path})=>category+'|'+path.toLowerCase().split('/').map(s=>s.trim()).filter(Boolean).join('/');
export const STARTER_SUBCATEGORIES=Object.freeze([...new Map([...DEFAULT_SUBCATEGORIES,...Object.entries(paths).flatMap(([category,entries])=>entries.map(path=>({category,path})))].flatMap(({category,path})=>{
 const parts=path.split(' / ');return parts.map((_,index)=>({category,path:parts.slice(0,index+1).join(' / ')}));
}).map(entry=>[key(entry),entry])).values()].map(Object.freeze));

export function categorySetupPlan(state){
 const existing=new Set(state.subcategories.map(key));
 const additions=STARTER_SUBCATEGORIES.filter(entry=>!existing.has(key(entry)));
 return {additions,subcategories:[...state.subcategories,...additions]};
}
export function installCategoryTree(state){
 const next=structuredClone(state),plan=categorySetupPlan(next);
 next.subcategories=plan.subcategories;next.categorySetup={version:1,status:'installed'};
 return {state:next,added:plan.additions.length};
}

export function categoryTreeMarkup(subcategories,{escape,items=[],removable=false}={}){
 const e=escape;
 function childrenHTML(nodes,category){return [...nodes.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(node=>{
  const remove=removable?`<button type="button" class="text-button category-remove" data-remove-sub="${e(category+'|'+node.path)}" aria-label="Remove empty subcategory ${e(node.path)}">×</button>`:'';
  return node.children.size?`<li><details><summary><span>${e(node.name)}</span>${remove}</summary><ul>${childrenHTML(node.children,category)}</ul></details></li>`:`<li class="category-leaf"><span>${e(node.name)}</span>${remove}</li>`;
 }).join('');}
 return `<div class="category-tree nested-category-tree">${CATEGORIES.map(category=>{
  const nodes=new Map();
  for(const entry of subcategories.filter(s=>s.category===category)){
   let current=nodes;const parts=entry.path.split('/').map(s=>s.trim()).filter(Boolean);
   parts.forEach((name,index)=>{const id=name.toLowerCase();if(!current.has(id))current.set(id,{name,path:parts.slice(0,index+1).join(' / '),children:new Map()});current=current.get(id).children;});
  }
  return `<details class="category-root" ${category==='Top'?'open':''}><summary>${e(category)} <span>${items.filter(i=>i.category===category).length} pieces</span></summary>${nodes.size?`<ul>${childrenHTML(nodes,category)}</ul>`:'<p class="muted">No subcategories yet.</p>'}</details>`;
 }).join('')}</div>`;
}
