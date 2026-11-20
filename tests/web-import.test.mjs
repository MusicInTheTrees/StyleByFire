import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {gzipSync} from 'node:zlib';
import {isPublicAddress,validateRemoteUrl,createSafeDownloader,pinnedHttpsRequest,extractProductMetadata,downloadImage,previewWebsiteImport,MAX_HTML_BYTES,MAX_IMAGE_BYTES} from '../web-import.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=','base64');
const publicAddress={address:'93.184.216.34',family:4};
const resolver=async()=>[publicAddress];
const response=(body,headers={},statusCode=200)=>({body:Buffer.isBuffer(body)?body:Buffer.from(body),headers,statusCode});
const fixtureDownloader=routes=>createSafeDownloader({resolver,transport:async(url,options)=>{assert.deepEqual(options.address,publicAddress);const item=routes[url.href];assert.ok(item,'Unexpected fixture URL '+url.href);return typeof item==='function'?item(options):item;}});

test('public address checks reject IPv4 and IPv6 private, reserved, and transition ranges',()=>{
 for(const address of ['0.0.0.0','10.1.2.3','100.64.0.1','127.1.2.3','169.254.169.254','172.16.0.1','172.31.255.255','192.0.0.9','192.0.2.1','192.88.99.1','192.168.1.1','198.18.0.1','198.51.100.1','203.0.113.1','224.0.0.1','255.255.255.255','::','::1','::ffff:127.0.0.1','::ffff:8.8.8.8','64:ff9b::a00:1','fc00::1','fe80::1','fec0::1','ff02::1','2001::1','2001:db8::1','2002:7f00:1::','3fff::1','not-an-ip'])assert.equal(isPublicAddress(address),false,address);
 for(const address of ['1.1.1.1','8.8.8.8','93.184.216.34','172.15.255.255','172.32.0.1','2606:4700:4700::1111','2001:4860:4860::8888'])assert.equal(isPublicAddress(address),true,address);
});
test('URL validation rejects credentials, private literals, special hosts, and alternate protocols',()=>{
 for(const input of ['http://shop.clothing.com/item','file:///wardrobe','data:image/png;base64,x','https://user:password@shop.clothing.com/item','https://shop.clothing.com:8443/item','https://127.0.0.1/','https://2130706433/','https://0x7f000001/','https://0177.0.0.1/','https://[::1]/','https://[::ffff:127.0.0.1]/','https://localhost/','https://localhost./','https://shop.local/','https://private.internal/','https://metadata.google.internal/','https://service.home.arpa/','https://shop.onion/','https://only-a-host/','https://shop.clothing.com\\@127.0.0.1/'])assert.throws(()=>validateRemoteUrl(input),undefined,input);
 assert.equal(validateRemoteUrl(' https://SHOP.CLOTHING.COM./item#details ').href,'https://shop.clothing.com/item');
});
test('DNS addresses are checked together and pinned into each transport call',async()=>{
 let transports=0;
 const mixed=createSafeDownloader({resolver:async()=>[publicAddress,{address:'10.0.0.1',family:4}],transport:async()=>{transports++;return response(png);}});
 await assert.rejects(mixed('https://shop.clothing.com/item'),/private/);assert.equal(transports,0);
 let resolutions=0;
 const rebound=createSafeDownloader({resolver:async()=>{resolutions++;return resolutions===1?[publicAddress]:[{address:'127.0.0.1',family:4}];},transport:async(url,{address})=>{transports++;assert.deepEqual(address,publicAddress);return response('',{location:'/other'},302);}});
 await assert.rejects(rebound('https://shop.clothing.com/item'),/private/);assert.equal(transports,1);assert.equal(resolutions,2);
});
test('TLS request pins lookup without forwarding cookies, credentials, or custom headers',async t=>{
 let captured;
 t.mock.method(https,'request',(options,callback)=>{captured=options;const request=new EventEmitter();request.end=()=>callback({statusCode:200,headers:{},[Symbol.asyncIterator]:async function*(){yield png;}});return request;});
 const result=await pinnedHttpsRequest(new URL('https://shop.clothing.com/item?color=blue'),{address:publicAddress,signal:new AbortController().signal});
 assert.equal(result.statusCode,200);assert.equal(captured.hostname,'shop.clothing.com');assert.equal(captured.servername,'shop.clothing.com');assert.equal(captured.rejectUnauthorized,true);assert.equal(captured.agent,false);assert.equal(captured.autoSelectFamily,false);assert.equal(captured.path,'/item?color=blue');assert.equal(captured.headers.Cookie,undefined);assert.equal(captured.headers.Authorization,undefined);
 captured.lookup('ignored-domain',{all:true},(err,records)=>{assert.equal(err,null);assert.deepEqual(records,[publicAddress]);});
 captured.lookup('ignored-domain',{},(err,address,family)=>{assert.equal(err,null);assert.equal(address,publicAddress.address);assert.equal(family,4);});
});
test('each redirect is validated and redirect chains are bounded',async()=>{
 for(const location of ['http://shop.clothing.com/image','https://127.0.0.1/photo','https://user:secret@shop.clothing.com/photo','https://shop.local/photo']){
  let calls=0;const download=createSafeDownloader({resolver,transport:async()=>{calls++;return response('',{location},302);}});await assert.rejects(download('https://shop.clothing.com/item'));assert.equal(calls,1);
 }
 let calls=0;const endless=createSafeDownloader({resolver,transport:async()=>{calls++;return response('',{location:'/again'},302);}});await assert.rejects(endless('https://shop.clothing.com/item'),/too many/);assert.equal(calls,5);
 const good=fixtureDownloader({'https://shop.clothing.com/item':response('',{location:'https://cdn.clothing.com/image.png'},302),'https://cdn.clothing.com/image.png':response(png,{'content-type':'image/png'})});assert.equal((await good('https://shop.clothing.com/item')).finalUrl,'https://cdn.clothing.com/image.png');
});
test('downloads enforce body limits, including decompressed HTML and incorrect content lengths',async()=>{
 const largeHtml=Buffer.alloc(MAX_HTML_BYTES+1,32);const largeImage=Buffer.alloc(MAX_IMAGE_BYTES+1,0);png.copy(largeImage);
 for(const item of [response(largeHtml,{'content-type':'text/html'}),response(gzipSync(largeHtml),{'content-type':'text/html','content-encoding':'gzip'}),response(largeImage,{'content-type':'image/png','content-length':'1'})]){
  const download=createSafeDownloader({resolver,transport:async()=>item});await assert.rejects(download('https://shop.clothing.com/item'),error=>error.status===413);
 }
 const compressed=fixtureDownloader({'https://shop.clothing.com/item':response(gzipSync('<html><title>Fine</title></html>'),{'content-type':'text/html','content-encoding':'gzip'})});assert.match((await compressed('https://shop.clothing.com/item')).bytes.toString(),/Fine/);
});
test('DNS and stalled responses respect the request deadline',async()=>{
 const stalledDns=createSafeDownloader({timeoutMs:20,resolver:()=>new Promise(()=>{}),transport:async()=>{throw Error('Transport must not run.');}});await assert.rejects(stalledDns('https://shop.clothing.com/item'),error=>error.status===504);
 const stalledHeaders=createSafeDownloader({timeoutMs:20,resolver,transport:()=>new Promise(()=>{})});await assert.rejects(stalledHeaders('https://shop.clothing.com/item'),error=>error.status===504);
});
test('metadata prioritizes Product JSON-LD, supports Shopify-style objects, and skips unsafe candidates',()=>{
 const metadata=extractProductMetadata(`<html><title>Fallback</title><meta property="og:image" content="https://cdn.clothing.com/small.jpg"><meta property="og:title" content="Fallback title"><meta name='twitter:image' content='/twitter.png'><script type="application/ld+json">{"@graph":[{"@type":"BreadcrumbList"},{"@type":["Thing","Product"],"name":"Navy &amp; gray shirt","description":"<p>Soft cotton.</p>","image":[{"@type":"ImageObject","url":"//cdn.clothing.com/large.jpg?a=1&amp;b=2"},"/second.png","javascript:alert(1)","https://127.0.0.1/private"]}]}</script><script type="application/ld+json">invalid json</script></html>`,'https://shop.clothing.com/products/shirt');
 assert.equal(metadata.title,'Navy & gray shirt');assert.equal(metadata.description,'Soft cotton.');assert.deepEqual(metadata.images,['https://cdn.clothing.com/large.jpg?a=1&b=2','https://shop.clothing.com/second.png','https://cdn.clothing.com/small.jpg','https://shop.clothing.com/twitter.png']);
 const og=extractProductMetadata('<meta content="Blue &quot;Oxford&quot;" property="og:title"><meta content="https://cdn.clothing.com/photo.png?a=1&amp;b=2" property="og:image"><meta name="description" content="Cotton &amp; linen">','https://shop.clothing.com/item');assert.equal(og.title,'Blue "Oxford"');assert.equal(og.description,'Cotton & linen');assert.equal(og.images[0],'https://cdn.clothing.com/photo.png?a=1&b=2');
});
test('malformed script markup and deeply nested image fields retain safe metadata fallbacks',()=>{
 const source='https://shop.clothing.com/item';
 const opening='<script type="application/ld+json">';
 const malformed='<meta property="og:image" content="/photo.png">'+opening.repeat(25000);
 const started=performance.now();assert.deepEqual(extractProductMetadata(malformed,source).images,['https://shop.clothing.com/photo.png']);assert.ok(performance.now()-started<1500,'Unclosed scripts must be scanned without quadratic retries.');
 const deep='<meta property="og:image" content="/photo.png">'+opening+'{"@type":"Product","image":'+'['.repeat(10000)+'"https://cdn.clothing.com/image.png"'+']'.repeat(10000)+'}</script>';
 assert.deepEqual(extractProductMetadata(deep,source).images,['https://shop.clothing.com/photo.png']);
 const multiple=opening+JSON.stringify([{'@type':'Product',name:'Main shirt',image:'/main.png'},{'@type':'Product',name:'Related shoes',image:'/related.png'}])+'</script>';
 assert.deepEqual(extractProductMetadata(multiple,source).images,['https://shop.clothing.com/main.png']);assert.equal(extractProductMetadata('',source).title,'Imported clothing');
 const group=opening+JSON.stringify({'@type':'ProductGroup',name:'Oxford shirt',url:source,image:'/blue.png',hasVariant:[{'@type':'Product',name:'White variant',url:'/white',image:'/white.png'}]})+'</script>';
 assert.deepEqual(extractProductMetadata(group,source).images,['https://shop.clothing.com/blue.png']);
 const requested=opening+JSON.stringify([{'@type':'Product',name:'Related shoes',url:'/related',image:'/related.png'},{'@type':'Product',name:'Requested shirt',url:source,image:'/requested.png'}])+'</script>';
 assert.equal(extractProductMetadata(requested,source).title,'Requested shirt');
});
test('product preview stores at most six verified images through the account-scoped writer',async()=>{
 const urls=Array.from({length:9},(_,index)=>`https://cdn.clothing.com/${index}.png`);const html=`<html><script type="application/ld+json">${JSON.stringify({'@type':'Product',name:'Blue Oxford',description:'Cotton shirt',image:urls})}</script></html>`;
 const routes={'https://shop.clothing.com/item':response(html,{'content-type':'text/html'})};for(const url of urls)routes[url]=response(png,{'content-type':'image/png'});
 const writes=[];const result=await previewWebsiteImport({url:'https://shop.clothing.com/item',download:fixtureDownloader(routes),saveImage:async(bytes,extension)=>{assert.deepEqual(bytes,png);assert.equal(extension,'png');writes.push(bytes);return `/media/${writes.length}.png`;}});
 assert.equal(result.sourceUrl,'https://shop.clothing.com/item');assert.equal(result.title,'Blue Oxford');assert.equal(result.description,'Cotton shirt');assert.equal(result.images.length,6);assert.equal(writes.length,6);assert.deepEqual(result.images.map(image=>image.originalUrl),urls.slice(0,6));
});
test('direct-image import keeps its final source and unsupported sites explain the manual fallback',async()=>{
 const writes=[];const saveImage=async(bytes,extension)=>{writes.push({bytes,extension});return '/media/abc.png';};
 const direct=fixtureDownloader({'https://cdn.clothing.com/navy-shirt.png':response(png,{'content-type':'application/octet-stream'})});const result=await previewWebsiteImport({url:'https://cdn.clothing.com/navy-shirt.png',download:direct,saveImage});assert.equal(result.title,'navy shirt');assert.equal(result.images[0].originalUrl,'https://cdn.clothing.com/navy-shirt.png');assert.equal(writes.length,1);
 const bad=fixtureDownloader({'https://shop.clothing.com/item':response('<html><script>loadPhotos()</script></html>',{'content-type':'text/html'}),'https://shop.clothing.com/blocked':response('Access denied',{},403),'https://cdn.clothing.com/not-image':response('<html>Login</html>',{'content-type':'text/html'})});
 await assert.rejects(previewWebsiteImport({url:'https://shop.clothing.com/item',download:bad,saveImage}),/direct.*image URL/);
 await assert.rejects(previewWebsiteImport({url:'https://shop.clothing.com/blocked',download:bad,saveImage}),/blocks automatic imports/);
 await assert.rejects(downloadImage('https://cdn.clothing.com/not-image',{download:bad}),/did not return a JPEG/);
});
