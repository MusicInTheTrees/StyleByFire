import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {BlockList,isIP} from 'node:net';
import {Readable,Transform,Writable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createUnzip,createBrotliDecompress} from 'node:zlib';

export const MAX_HTML_BYTES=2*1024*1024;
export const MAX_IMAGE_BYTES=20*1024*1024;
export const MAX_PREVIEW_IMAGES=6;
const REQUEST_TIMEOUT=15000;
const PREVIEW_TIMEOUT=45000;
const MAX_REDIRECTS=4;
const error=(message,status=400)=>Object.assign(Error(message),{status});
const fallback='Try the product’s direct JPEG, PNG, or WebP image URL, or download the photo and import it from your computer.';

// Restrict requests to ordinary globally routed addresses. Conservative exclusions
// include the IANA special-purpose blocks and IPv6 transition mechanisms.
const blockedIPv4=new BlockList();
for(const [network,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]])blockedIPv4.addSubnet(network,prefix,'ipv4');
const globalIPv6=new BlockList();globalIPv6.addSubnet('2000::',3,'ipv6');
const blockedIPv6=new BlockList();
for(const [network,prefix] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]])blockedIPv6.addSubnet(network,prefix,'ipv6');
export function isPublicAddress(address){const family=isIP(address);return family===4?!blockedIPv4.check(address,'ipv4'):family===6&&globalIPv6.check(address,'ipv6')&&!blockedIPv6.check(address,'ipv6');}

export function validateRemoteUrl(input){
 if(typeof input!=='string'||input.length>4096||/[\x00-\x20\\]/.test(input.trim()))throw error('Paste a public HTTPS product or image URL under 4,096 characters.');
 let url;try{url=new URL(input.trim());}catch{throw error('Paste a complete HTTPS product or image URL.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')throw error('Use a public HTTPS URL without a username, password, or custom port.');
 const hostname=url.hostname.replace(/^\[|\]$/g,'').replace(/\.$/,'').toLowerCase();
 if(isIP(hostname)){if(!isPublicAddress(hostname))throw error('Local, private, and reserved network addresses cannot be imported.');}
 else{
  const labels=hostname.split('.');
  if(hostname.length>253||labels.length<2||!/[a-z]/i.test(hostname)||labels.some(label=>!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))||/(^|\.)(localhost|local|internal|intranet|lan|home|arpa|test|example|invalid|onion)$/.test(hostname))throw error('Use a public website, not a local or special-use hostname.');
  url.hostname=hostname;
 }
 url.hash='';if(url.href.length>4096)throw error('Use a product or image URL under 4,096 characters.');return url;
}

function abortable(promise,signal){
 if(signal.aborted)return Promise.reject(signal.reason);
 return new Promise((resolve,reject)=>{const aborted=()=>reject(signal.reason);signal.addEventListener('abort',aborted,{once:true});Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',aborted));});
}
export async function resolvePublicTarget(url,{resolver=lookup,signal}={}){
 const hostname=url.hostname.replace(/^\[|\]$/g,'');
 const literal=isIP(hostname);
 let addresses;
 try{const pending=literal?[{address:hostname,family:literal}]:resolver(hostname,{all:true,verbatim:true});addresses=await (signal?abortable(pending,signal):pending);}catch(cause){if(signal?.aborted)throw signal.reason;throw error('The website address could not be resolved. Check the URL and your internet connection.',502);}
 if(!Array.isArray(addresses)||!addresses.length||addresses.some(record=>![4,6].includes(record.family)||isIP(record.address)!==record.family||!isPublicAddress(record.address)))throw error('This website resolves to a local, private, or reserved address and cannot be imported.');
 return addresses.find(record=>record.family===4)||addresses[0];
}

// DNS is resolved and checked before this call. The custom lookup pins the actual
// TLS connection to that checked address; redirects never use automatic following.
export function pinnedHttpsRequest(url,{address,signal}){
 return new Promise((resolve,reject)=>{
  const hostname=url.hostname.replace(/^\[|\]$/g,'');
  const request=https.request({protocol:'https:',hostname,port:443,path:url.pathname+url.search,method:'GET',agent:false,autoSelectFamily:false,family:address.family,servername:isIP(hostname)?'':hostname,rejectUnauthorized:true,signal,lookup:(_host,options,callback)=>options?.all?callback(null,[address]):callback(null,address.address,address.family),headers:{'User-Agent':'StyleByFire/0.1 (local wardrobe photo import)','Accept':'text/html,application/xhtml+xml,image/jpeg,image/png,image/webp;q=0.9,*/*;q=0.1','Accept-Encoding':'identity'}},response=>resolve({statusCode:response.statusCode,headers:response.headers,body:response}));
  request.once('error',reject);request.end();
 });
}

export function imageExtension(bytes){
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpg';
 if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png';
 if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'webp';
 return null;
}
const contentHeader=(headers,name)=>String(headers[name]||headers[name.toLowerCase()]||'').toLowerCase();
async function readResponse(response,{purpose,signal}){
 const encoding=contentHeader(response.headers,'content-encoding').trim();
 if(encoding&&!['identity','gzip','x-gzip','deflate','br'].includes(encoding)){response.body?.destroy?.();throw error('The website uses an unsupported response format. '+fallback,422);}
 const declaredLength=Number(response.headers['content-length']);
 const declaredHtml=/^(text\/html|application\/xhtml\+xml)/.test(contentHeader(response.headers,'content-type'));
 if(declaredLength>(declaredHtml?MAX_HTML_BYTES:MAX_IMAGE_BYTES)){response.body?.destroy?.();throw error(declaredHtml?'The product page is larger than the 2 MB import limit. '+fallback:'The image exceeds the 20 MB import limit.',413);}
 const raw=Buffer.isBuffer(response.body)?Readable.from([response.body]):Readable.from(response.body);
 let wireBytes=0,total=0,prefix=Buffer.alloc(0);const chunks=[];
 const wireLimit=new Transform({transform(chunk,_encoding,done){wireBytes+=chunk.length;done(wireBytes>MAX_IMAGE_BYTES?error('The download exceeds the 20 MB import limit.',413):null,chunk);}});
 const sink=new Writable({write(chunk,_encoding,done){
  total+=chunk.length;if(prefix.length<12)prefix=Buffer.concat([prefix,chunk.subarray(0,12-prefix.length)]);
  const limit=imageExtension(prefix)?MAX_IMAGE_BYTES:MAX_HTML_BYTES;
  if(total>limit)return done(error(limit===MAX_HTML_BYTES?'The product page is larger than the 2 MB import limit. '+fallback:'The image exceeds the 20 MB import limit.',413));
  chunks.push(chunk);done();
 }});
 const stages=[raw,wireLimit];if(encoding==='br')stages.push(createBrotliDecompress());else if(encoding&&encoding!=='identity')stages.push(createUnzip());stages.push(sink);
 await pipeline(stages,{signal});return Buffer.concat(chunks,total);
}

export function createSafeDownloader({resolver=lookup,transport=pinnedHttpsRequest,timeoutMs=REQUEST_TIMEOUT}={}){
 return async function download(input,{purpose='auto',deadline=Infinity}={}){
  let url=validateRemoteUrl(input);const controller=new AbortController();
  const remaining=Math.min(timeoutMs,deadline-Date.now());if(remaining<=0)throw error('The website import timed out. '+fallback,504);
  const timer=setTimeout(()=>controller.abort(error('The website import timed out. '+fallback,504)),remaining);
  try{
   for(let redirect=0;redirect<=MAX_REDIRECTS;redirect++){
    const address=await resolvePublicTarget(url,{resolver,signal:controller.signal});
    const response=await abortable(transport(url,{address,signal:controller.signal}),controller.signal);
    if([301,302,303,307,308].includes(response.statusCode)){
     response.body?.destroy?.();if(redirect===MAX_REDIRECTS)throw error('The website redirected too many times. '+fallback,422);
     const location=response.headers.location;if(typeof location!=='string'||!location)throw error('The website returned an incomplete redirect. '+fallback,422);
     url=validateRemoteUrl(new URL(location,url).href);continue;
    }
    if(response.statusCode<200||response.statusCode>=300){response.body?.destroy?.();throw error([401,403,429].includes(response.statusCode)?'This website requires access or blocks automatic imports. '+fallback:'The website could not provide that page or image. '+fallback,422);}
    const bytes=await readResponse(response,{purpose,signal:controller.signal});
    return {bytes,headers:response.headers,finalUrl:url.href};
   }
  }catch(cause){if(controller.signal.aborted)throw controller.signal.reason;if(cause.status)throw cause;throw error('The website could not be reached securely. Check the URL and your connection. '+fallback,502);}
  finally{clearTimeout(timer);controller.abort();}
 };
}
const safeDownload=createSafeDownloader();
export async function downloadImage(url,{download=safeDownload,deadline}={}){
 const result=await download(url,{purpose:'image',deadline});const extension=imageExtension(result.bytes);
 if(!extension)throw error('That URL did not return a JPEG, PNG, or WebP image. '+fallback,422);
 if(result.bytes.length>MAX_IMAGE_BYTES)throw error('The image exceeds the 20 MB import limit.',413);
 return {bytes:result.bytes,extension,mime:extension==='jpg'?'image/jpeg':'image/'+extension,finalUrl:result.finalUrl};
}

function decodeEntities(text){return String(text).replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,(match,entity)=>{if(entity[0]==='#'){const number=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):parseInt(entity.slice(1),10);return number>0&&number<=0x10ffff?String.fromCodePoint(number):'';}return ({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '})[entity.toLowerCase()]||match;});}
function plainText(value,limit){return typeof value==='string'?decodeEntities(value.replace(/<[^<>]*>/g,' ')).replace(/\s+/g,' ').trim().slice(0,limit):'';}
function attributes(tag){const values={};for(const match of tag.matchAll(/([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))values[match[1].toLowerCase()]=decodeEntities(match[2]??match[3]??match[4]);return values;}
function imageValues(input){const images=[];let visited=0;function visit(value,depth=0){if(depth>20||visited++>1000||images.length>=100)return;if(typeof value==='string')images.push(value);else if(Array.isArray(value)){for(const child of value){visit(child,depth+1);if(visited>1000||images.length>=100)break;}}else if(value&&typeof value==='object')visit(value.contentUrl||value.url||value['@id'],depth+1);}visit(input);return images;}
// A forward-only tag scan avoids quadratic regex retries on malformed pages.
function* htmlElements(html,name,paired=false){
 const lower=html.toLowerCase(),opening='<'+name,closing='</'+name;let position=0,count=0;
 const endOfTag=start=>{let quote='';for(let index=start;index<html.length;index++){const char=html[index];if(quote){if(char===quote)quote='';}else if(char==='"'||char==="'")quote=char;else if(char==='>')return index;}return -1;};
 while(count++<500){const start=lower.indexOf(opening,position);if(start<0)break;position=start+opening.length;if(!/[\s/>]/.test(lower[position]||''))continue;const end=endOfTag(position);if(end<0)break;position=end+1;if(!paired){yield {tag:html.slice(start,position),body:''};continue;}let close=lower.indexOf(closing,position);while(close>=0&&!/[\s/>]/.test(lower[close+closing.length]||''))close=lower.indexOf(closing,close+closing.length);if(close<0)break;const closeEnd=endOfTag(close+closing.length);if(closeEnd<0)break;yield {tag:html.slice(start,end+1),body:html.slice(position,close)};position=closeEnd+1;}
}
export function extractProductMetadata(html,sourceUrl){
 const meta=new Map();for(const element of htmlElements(html,'meta')){const attr=attributes(element.tag),key=(attr.property||attr.name||'').toLowerCase();if(key&&attr.content){if(!meta.has(key))meta.set(key,[]);meta.get(key).push(attr.content);}}
 const products=[];let visited=0;
 function visit(value,depth=0){if(!value||typeof value!=='object'||depth>30||visited++>10000)return;if(Array.isArray(value)){for(const child of value){visit(child,depth+1);if(visited>10000)break;}return;}const types=Array.isArray(value['@type'])?value['@type']:[value['@type']];if(types.some(type=>typeof type==='string'&&/(^|[\/#])Product(?:Group)?$/.test(type)))products.push(value);for(const child of Object.values(value))if(child&&typeof child==='object'){visit(child,depth+1);if(visited>10000)break;}}
 for(const element of htmlElements(html,'script',true)){if((attributes(element.tag).type||'').toLowerCase().split(';')[0].trim()!=='application/ld+json')continue;try{visit(JSON.parse(element.body.trim()));}catch{/* Invalid or script-generated JSON-LD is not executed. */}}
 const pageUrl=new URL(sourceUrl);pageUrl.hash='';
 function relevance(product){const offers=Array.isArray(product.offers)?product.offers.slice(0,1000):[product.offers];let score=0;for(const candidate of [product.url,product['@id'],...offers.map(offer=>offer?.url)]){if(typeof candidate!=='string')continue;try{const url=new URL(candidate,sourceUrl);url.hash='';if(url.href===pageUrl.href)score=Math.max(score,2);else if(url.origin===pageUrl.origin&&url.pathname.replace(/\/$/,'')===pageUrl.pathname.replace(/\/$/,''))score=Math.max(score,1);}catch{}}return score;}
 let product={},bestScore=-1;for(const candidate of products){const score=relevance(candidate);if(score>bestScore){product=candidate;bestScore=score;}}
 const title=plainText(product.name||meta.get('og:title')?.[0]||meta.get('twitter:title')?.[0]||htmlElements(html,'title',true).next().value?.body||'',200)||'Imported clothing';
 const description=plainText(product.description||meta.get('og:description')?.[0]||meta.get('twitter:description')?.[0]||meta.get('description')?.[0]||'',2000);
 const candidates=[...imageValues(product.image),...(meta.get('og:image:secure_url')||[]),...(meta.get('og:image')||[]),...(meta.get('og:image:url')||[]),...(meta.get('twitter:image')||[]),...(meta.get('twitter:image:src')||[])];
 const images=[];for(const candidate of candidates){try{const url=validateRemoteUrl(new URL(decodeEntities(candidate),sourceUrl).href).href;if(!images.includes(url))images.push(url);}catch{/* A bad metadata URL does not invalidate other candidates. */}if(images.length===12)break;}
 return {title,description,images};
}

export async function previewWebsiteImport({url,saveImage,download=safeDownload}){
 const deadline=Date.now()+PREVIEW_TIMEOUT;const page=await download(url,{deadline});
 const firstExtension=imageExtension(page.bytes);
 if(firstExtension){if(page.bytes.length>MAX_IMAGE_BYTES)throw error('The image exceeds the 20 MB import limit.',413);const src=await saveImage(page.bytes,firstExtension);let filename;try{filename=decodeURIComponent(new URL(page.finalUrl).pathname.split('/').pop()||'Imported clothing');}catch{filename='Imported clothing';}return {sourceUrl:page.finalUrl,title:plainText(filename.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' '),200)||'Imported clothing',description:'',images:[{src,originalUrl:page.finalUrl}]};}
 if(page.bytes.length>MAX_HTML_BYTES)throw error('The product page is larger than the 2 MB import limit. '+fallback,413);
 const html=page.bytes.toString('utf8');if(!/^(text\/html|application\/xhtml\+xml)/.test(contentHeader(page.headers,'content-type'))&&!/^\s*(?:<!doctype\s+html|<html|<head|<meta)/i.test(html))throw error('That URL did not return a product page or a supported image. '+fallback,422);
 const metadata=extractProductMetadata(html,page.finalUrl);if(!metadata.images.length)throw error('No product photos were available in this page’s metadata. Sites that load photos with scripts may need a direct image URL. '+fallback,422);
 const images=[];
 for(let index=0;index<metadata.images.length&&images.length<MAX_PREVIEW_IMAGES;index+=3){
  const candidates=metadata.images.slice(index,index+Math.min(3,MAX_PREVIEW_IMAGES-images.length));
  const results=await Promise.allSettled(candidates.map(async candidate=>{const image=await downloadImage(candidate,{download,deadline});return {bytes:image.bytes,extension:image.extension,originalUrl:image.finalUrl};}));
  for(const result of results)if(result.status==='fulfilled'&&!images.some(image=>image.originalUrl===result.value.originalUrl)){const image=result.value;const src=await saveImage(image.bytes,image.extension);images.push({src,originalUrl:image.originalUrl});}
  if(Date.now()>=deadline)break;
 }
 if(!images.length)throw error('The page was found, but its product photos could not be imported. '+fallback,422);
 return {sourceUrl:page.finalUrl,title:metadata.title,description:metadata.description,images};
}
