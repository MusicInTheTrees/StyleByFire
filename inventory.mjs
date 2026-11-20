import {readdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DEFAULT_ADJUSTMENTS} from './app/domain.js';

const pretty=value=>value.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]/g,' ');
export function inferLabels(relative){
 const folders=relative.replaceAll('\\','/').split('/').slice(1,-1);const root=(folders[0]||'').toLowerCase();const rest=folders.slice(1).map(pretty);
 const labels={category:'Top',role:'base',subcategory:folders.map(pretty).join(' / '),modes:['Casual'],formality:2};
 if(['caps','cap','hats'].includes(root)){labels.category='Cap';labels.subcategory=rest.join(' / ');}
 else if(['shoes','footwear'].includes(root)){labels.category='Shoes';labels.subcategory=rest.join(' / ');if(rest.some(s=>/dress/i.test(s))){labels.formality=3;labels.modes=['Casual','Business'];}}
 else if(['accessories','belts','ties'].includes(root)){labels.category='Accessories';labels.subcategory=(root==='accessories'?rest:folders.map(pretty)).join(' / ');if(/tie/i.test(labels.subcategory)){labels.formality=3;labels.modes=['Casual','Business'];}}
 else if(root==='socks'){labels.category='Socks';labels.subcategory=rest.join(' / ');labels.modes=['Casual','Business'];}
 else if(['pants','bottom','bottoms','skirts','leggings'].includes(root)){labels.category='Bottom';labels.role=root==='leggings'?'leggings':'base';labels.modes=['Casual','Business'];}
 else if(['jackets','outerwear'].includes(root)){labels.role='outerwear';labels.subcategory=['Outerwear',...rest].join(' / ');labels.modes=['Casual','Business'];}
 else if(['dresses','dress'].includes(root)){labels.role='dress';labels.subcategory=['Dresses',...rest].join(' / ');}
 else if(['shirts','tops','top','blouses'].includes(root)){labels.modes=['Casual','Business'];}
 if(/athletic|activewear|sportswear|running/i.test(relative)){labels.modes=['Sport','Casual'];labels.formality=1;}
 return labels;
}
export async function refreshInventory({root,data,state,seed}){
 const next=structuredClone(state);const known=new Set([...(next.inventoryPaths||[]),...next.items.map(i=>i.sourcePath||seed.media[i.src.slice(7)]).filter(Boolean)]);let added=0;const skipped=[];
 async function walk(dir){const results=[];for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.isSymbolicLink())continue;const full=path.join(dir,entry.name);if(entry.isDirectory())results.push(...await walk(full));else if(entry.isFile())results.push(full);}return results;}
 for(const file of await walk(path.join(root,'ClothingImages'))){
  const relative=path.relative(root,file).split(path.sep).join('/');if(known.has(relative)||relative.toLowerCase().includes('/imagebackgrounds/'))continue;
  const ext=path.extname(file).toLowerCase();if(!['.jpg','.jpeg','.png','.webp'].includes(ext)){skipped.push(path.basename(file));continue;}
  const existingSeed=seed.items.find(i=>i.sourcePath===relative||seed.media[i.src.slice(7)]===relative);
  let item;
  if(existingSeed)item=structuredClone(existingSeed);
  else{
   const bytes=await readFile(file);if(bytes.length>20*1024*1024){skipped.push(path.basename(file));continue;}
   const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255,png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
   if(!jpg&&!png&&!webp){skipped.push(path.basename(file));continue;}
   const hash=createHash('sha256').update(relative).digest('hex').slice(0,32),filename=hash+(jpg?'.jpg':png?'.png':'.webp');await writeFile(path.join(data,'images',filename),bytes);
   item={id:'folder-'+hash,name:pretty(path.basename(file,ext)),...inferLabels(relative),src:'/media/'+filename,sourcePath:relative,color:'Gray',colorVerified:false,pattern:'Solid',warmth:1,tags:[],favorite:false,notes:'Imported from your clothing folder. Review the name, color, pattern, formality, and occasion labels.',stylistNotes:'',adjustments:structuredClone(DEFAULT_ADJUSTMENTS)};
  }
  next.items.push(item);known.add(relative);added++;
  if(item.subcategory&&!next.subcategories.some(s=>s.category===item.category&&s.path===item.subcategory))next.subcategories.push({category:item.category,path:item.subcategory});
 }
 next.inventoryPaths=[...known];return {state:next,added,skipped};
}
