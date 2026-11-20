import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {DEFAULT_ADJUSTMENTS,DEFAULT_PROFILE,DEFAULT_RULES,DEFAULT_SUBCATEGORIES} from './app/domain.js';

// Code-drawn PNG illustrations keep testing independent of personal photographs.
function illustration(kind,hex){
 const w=360,h=420,pixels=Buffer.alloc(w*h*4),color=hex.match(/[a-f0-9]{2}/gi).map(v=>parseInt(v,16));
 const put=(x,y,c)=>{x=Math.floor(x);y=Math.floor(y);if(x<0||y<0||x>=w||y>=h)return;const i=(y*w+x)*4;pixels[i]=c[0];pixels[i+1]=c[1];pixels[i+2]=c[2];pixels[i+3]=255;};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)put(x,y,[235-Math.floor(y/60),241-Math.floor(y/70),247-Math.floor(y/80)]);
 const polygon=(points,c=color)=>{const min=Math.max(0,Math.floor(Math.min(...points.map(p=>p[1])))),max=Math.min(h-1,Math.ceil(Math.max(...points.map(p=>p[1]))));for(let y=min;y<=max;y++){const crossings=[];for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y))crossings.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}crossings.sort((a,b)=>a-b);for(let n=0;n<crossings.length;n+=2)for(let x=Math.ceil(crossings[n]);x<crossings[n+1];x++)put(x,y,c);}};
 const rect=(x,y,width,height,c=color)=>polygon([[x,y],[x+width,y],[x+width,y+height],[x,y+height]],c);
 const circle=(cx,cy,r,c=color)=>{for(let y=Math.max(0,Math.floor(cy-r));y<=Math.min(h-1,cy+r);y++)for(let x=Math.max(0,Math.floor(cx-r));x<=Math.min(w-1,cx+r);x++)if((x-cx)**2+(y-cy)**2<=r*r)put(x,y,c);};
 const line=(x1,y1,x2,y2,width=4,c=[132,153,179])=>{const steps=Math.ceil(Math.hypot(x2-x1,y2-y1));for(let i=0;i<=steps;i++)circle(x1+(x2-x1)*i/steps,y1+(y2-y1)*i/steps,width/2,c);};
 const light=[235,241,247],metal=[169,186,208],dark=[35,53,78];
 if(['top','layer'].includes(kind)){polygon([[125,75],[90,89],[39,158],[83,193],[113,155],[113,335],[247,335],[247,155],[277,193],[321,158],[270,89],[235,75],[216,108],[144,108]]);polygon([[150,76],[180,114],[210,76]],light);if(kind==='layer'){line(180,116,180,334,5,light);polygon([[128,80],[177,147],[151,182],[180,252],[180,116]],metal);polygon([[232,80],[183,147],[209,182],[180,252],[180,116]],metal);}else{line(180,115,180,333,2,metal);for(const y of [145,185,225,265,305])circle(180,y,3,light);}}
 else if(kind==='bottom'||kind==='leggings'){polygon([[106,70],[254,70],[260,177],[232,355],[188,355],[180,187],[172,355],[128,355],[100,177]]);line(106,94,254,94,3,metal);line(180,96,180,178,3,metal);}
 else if(kind==='dress'){polygon([[139,64],[121,110],[142,177],[91,350],[269,350],[218,177],[239,110],[221,64],[201,95],[159,95]]);line(144,178,216,178,8,metal);}
 else if(kind==='shoes'){polygon([[50,230],[67,164],[113,158],[119,224],[154,245],[163,284],[45,284]]);polygon([[197,230],[214,164],[260,158],[266,224],[301,245],[310,284],[192,284]]);for(const x of [80,227])for(const y of [201,217,233])line(x,y,x+27,y-5,4,light);line(46,279,161,279,7,dark);line(193,279,308,279,7,dark);}
 else if(kind==='socks'){polygon([[85,100],[142,100],[142,245],[172,276],[163,307],[87,288],[66,268]]);polygon([[218,100],[275,100],[275,245],[305,276],[296,307],[220,288],[199,268]]);line(83,125,140,125,7,metal);line(216,125,273,125,7,metal);}
 else if(kind==='cap'){polygon([[87,204],[97,158],[125,124],[180,112],[235,124],[263,158],[273,204]]);polygon([[78,205],[281,205],[306,230],[284,246],[180,231],[75,228]],dark);line(180,114,180,201,3,metal);}
 else if(kind==='tie'){polygon([[151,82],[209,82],[198,121],[213,298],[180,338],[147,298],[162,121]]);line(156,158,205,189,10,metal);line(152,215,209,250,10,metal);}
 else if(kind==='bowtie'){polygon([[88,158],[162,193],[162,226],[88,262]]);polygon([[272,158],[198,193],[198,226],[272,262]]);rect(162,186,36,47,dark);}
 else if(kind==='belt'){rect(53,178,254,65);rect(151,169,66,83,metal);rect(162,181,42,57,dark);line(166,209,224,209,5,metal);for(const x of [242,266,290])circle(x,209,3,light);}
 else if(kind==='glasses'){for(const x of [112,248]){circle(x,209,57);circle(x,209,45,[211,225,238]);}line(165,202,195,202,8,color);line(57,192,40,169,8,color);line(303,192,320,169,8,color);}
 else if(kind==='earrings'){for(const x of [112,248]){circle(x,158,10,metal);line(x,169,x,187,5,metal);circle(x,226,44);circle(x,226,31,light);}}
 else if(kind==='necklace'){for(let a=0;a<=Math.PI;a+=.018)circle(180+100*Math.cos(a),135+133*Math.sin(a),4,color);polygon([[180,254],[201,283],[180,315],[159,283]],metal);}
 else if(kind==='brooch'){for(let n=0;n<6;n++){const a=n*Math.PI/3;circle(180+40*Math.cos(a),210+40*Math.sin(a),28,color);}circle(180,210,24,metal);circle(180,210,12,light);}
 else if(kind==='watch'){rect(151,78,58,262);circle(180,210,60,metal);circle(180,210,49,dark);line(180,210,180,178,4,light);line(180,210,204,227,4,light);rect(238,201,9,18,metal);}
 else if(kind==='wristband'){circle(180,211,94);circle(180,211,61,light);line(119,270,242,270,9,metal);}
 else if(kind==='ring'){circle(180,231,63);circle(180,231,44,light);polygon([[156,157],[170,138],[192,138],[205,157],[180,187]],metal);}
 const scanlines=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++)pixels.copy(scanlines,y*(w*4+1)+1,y*w*4,(y+1)*w*4);
 const crc=buffer=>{let value=0xffffffff;for(const byte of buffer){value^=byte;for(let n=0;n<8;n++)value=(value>>>1)^((value&1)?0xedb88320:0);}return (value^0xffffffff)>>>0;};
 const chunk=(type,content)=>{const typeBytes=Buffer.from(type),length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(content.length);checksum.writeUInt32BE(crc(Buffer.concat([typeBytes,content])));return Buffer.concat([length,typeBytes,content,checksum]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(w,0);header.writeUInt32BE(h,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(scanlines)),chunk('IEND',Buffer.alloc(0))]);
}

export async function createDemoWardrobe(folder){
 const definitions=[
  ['Navy everyday cap','Cap','Baseball caps','base','Navy','#263e66','cap',2],
  ['Powder blue Oxford shirt','Top','Shirts / Button-downs','base','Blue','#91b3d7','top',3],
  ['White relaxed tee','Top','Shirts / T-shirts','base','White','#e2e8ed','top',1],
  ['Steel blue training top','Top','Activewear','base','Blue','#47789f','top',1,'Sport'],
  ['Midnight tailored jacket','Top','Outerwear / Blazers','outerwear','Navy','#243959','layer',3],
  ['Charcoal tailored trousers','Bottom','Pants / Tailored','base','Gray','#637183','bottom',3],
  ['Slate blue chinos','Bottom','Pants / Chinos','base','Blue','#6483a0','bottom',2],
  ['Navy running leggings','Bottom','Leggings','leggings','Navy','#294767','leggings',1,'Sport'],
  ['Silver evening dress','Top','Dresses / Evening','dress','Light gray','#b9c8da','dress',4,'Red carpet'],
  ['Black formal trousers','Bottom','Pants / Formal','base','Black','#303c4d','bottom',4,'Red carpet'],
  ['White formal shirt','Top','Shirts / Formal','base','White','#e6ebf0','top',4,'Red carpet'],
  ['Navy ribbed socks','Socks','Crew socks','base','Navy','#2e4969','socks',2],
  ['White athletic socks','Socks','Athletic socks','base','White','#dce6ef','socks',1,'Sport'],
  ['Black leather loafers','Shoes','Dress shoes','base','Black','#334155','shoes',3],
  ['Blue running shoes','Shoes','Athletic shoes','base','Blue','#48799f','shoes',1,'Sport'],
  ['Black evening shoes','Shoes','Formal shoes','base','Black','#263345','shoes',4,'Red carpet'],
  ['Blue striped necktie','Accessories','Ties / Neckties','base','Blue','#426e9e','tie',3],
  ['Black evening bow tie','Accessories','Ties / Bow ties','base','Black','#28364d','bowtie',4,'Red carpet'],
  ['Black leather belt','Accessories','Belts','base','Black','#334155','belt',3],
  ['Navy frame glasses','Accessories','Glasses','base','Navy','#294568','glasses',2],
  ['Silver hoop earrings','Accessories','Jewelry / Earrings','base','Light gray','#91a6be','earrings',3],
  ['Silver pendant necklace','Accessories','Jewelry / Necklaces','base','Light gray','#91a6be','necklace',3],
  ['Blue floral brooch','Accessories','Jewelry / Brooches','base','Blue','#527eac','brooch',3],
  ['Navy strap watch','Accessories','Watches','base','Navy','#294568','watch',3],
  ['Blue woven wristband','Accessories','Wristbands','base','Blue','#527eac','wristband',2],
  ['Silver statement ring','Accessories','Jewelry / Rings','base','Light gray','#91a6be','ring',3]
 ];
 const items=[];
 for(const [name,category,subcategory,role,color,hex,kind,formality,specialMode] of definitions){const id=randomUUID(),filename=id+'.png';await writeFile(path.join(folder,'images',filename),illustration(kind,hex));items.push({id:'demo-'+id,name,category,subcategory,role,color,colorVerified:true,pattern:kind==='tie'?'Striped':'Solid',formality,warmth:role==='outerwear'?2:1,tags:['demo','blue-gray',...(formality>=3?['tailored']:[])],modes:specialMode?[specialMode,...(specialMode==='Sport'?['Casual']:[])]:['Casual','Business'],favorite:['top','watch','shoes'].includes(kind),src:'/media/'+filename,notes:'Fictional clothing for Jamie Demo. Safe to edit while testing.',stylistNotes:'Synthetic illustration; the color label is intentional.',description:`Fictional ${name.toLowerCase()} in Jamie Demo’s blue and gray test wardrobe.`,adjustments:structuredClone(DEFAULT_ADJUSTMENTS)});}
 return {version:1,items,looks:[],profile:{...structuredClone(DEFAULT_PROFILE),name:'Jamie’s personal stylist',palette:'tonal',preferredTags:['tailored'],notes:'Jamie Demo is a fictional person. Use this separate wardrobe to test outfits, accessories, notes, and photo adjustments.'},rules:structuredClone(DEFAULT_RULES),subcategories:[...new Map([...DEFAULT_SUBCATEGORIES,...items.map(i=>({category:i.category,path:i.subcategory}))].map(s=>[s.category+'|'+s.path,s])).values()],reference:null};
}
