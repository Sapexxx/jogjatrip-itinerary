// Browser evidence without a frontend build dependency. All data is synthetic.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../web/',import.meta.url));
const out=process.env.UI_REPORT_DIR||'ui-report';
await fs.mkdir(out,{recursive:true});
const fixtures={hotels:[{hotelId:'H1',name:'Hotel contoh (fixture)',city:'Sleman'}],rooms:[{hotelId:'H1',roomId:'R1',roomType:'Standard',pricePerNight:250000,capacity:2,totalUnits:3}],destinations:[{id:1,name:'Wisata contoh (fixture)',region:'kabupaten-sleman',price:10000}],vehicles:[{id:'V1',name:'Kendaraan contoh (fixture)',type:'mobil',dailyPrice:200000,totalPrice:600000,days:3,unitsAvailable:2,available:true}]};
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')){
  const key=url.pathname.split('/').pop();
  let items=fixtures[key];
  if(key==='vehicles')items=items.map(x=>({...x,startDate:url.searchParams.get('startDate'),endDate:url.searchParams.get('endDate'),withDriver:false}));
  res.setHeader('Content-Type','application/json');
  if(req.method!=='GET'){res.statusCode=403;res.end(JSON.stringify({error:'Fixture server is read-only'}));return}
  res.end(JSON.stringify(items?{items,provider:key==='vehicles'?'transport':key}:key==='health'?{status:'ok',bookingEnabled:false,providers:{hotel:true,wisata:true,transport:true}}:[]));return;
 }
 try{
  const name=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!name.startsWith(root))throw Error('bad path');
  const data=await fs.readFile(name);
  res.setHeader('Content-Type',types[path.extname(name)]||'application/octet-stream');res.end(data);
 }catch{res.statusCode=404;res.end('Not found')}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'itinerary-ui-'));
const chrome=spawn(process.env.CHROME_BIN||'google-chrome',['--headless','--no-sandbox','--disable-dev-shm-usage','--remote-debugging-port=0','--remote-allow-origins=*','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let ws;const report=[];
try{
 let port;
 for(let i=0;i<100;i++){try{port=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await wait(100)}}
 if(!port)throw Error('Chrome did not start');
 const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 const target=pages.find(x=>x.type==='page');
 ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
 let id=0;const pending=new Map(),errors=[];
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const [resolve,reject]=pending.get(m.id);pending.delete(m.id);m.error?reject(Error(m.error.message)):resolve(m.result)}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text)});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,[resolve,reject]);ws.send(JSON.stringify({id:n,method,params}))});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
 await call('Page.enable');await call('Runtime.enable');
 for(const width of [375,768,1024,1440]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:base});
  for(let i=0;i<80;i++){if(await evaluate("document.readyState==='complete'&&typeof page==='function'").catch(()=>false))break;await wait(100)}
  await wait(300);
  for(const name of ['explore','packages','planner','journey','orders']){
   await evaluate("page("+JSON.stringify(name)+");window.scrollTo(0,0);");
   await wait(200);
   const info=await evaluate("({active:document.querySelector('.page.active')?.id,width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,title:document.title})");
   const image=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   await fs.writeFile(path.join(out,width+'-'+name+'.png'),Buffer.from(image.data,'base64'));
   report.push({viewport:width,page:name,...info,overflow:info.scrollWidth>info.width});
  }
 }
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({fixture:true,report,errors},null,2));
 console.log(JSON.stringify({screenshots:report.length,overflow:report.filter(x=>x.overflow),runtimeErrors:errors},null,2));
 if(errors.length||report.some(x=>x.active!==x.page))process.exitCode=1;
}finally{ws?.close();chrome.kill();server.close()}
