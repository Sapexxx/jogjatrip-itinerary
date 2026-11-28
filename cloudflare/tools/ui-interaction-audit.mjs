// Same scripted user actions on two checkouts. Read-only fixtures; no production.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import {spawn} from 'node:child_process';
const [site,output,label]=process.argv.slice(2);
if(!site||!output||!label)throw Error('Usage: ui-interaction-audit.mjs WEB_DIR OUTPUT_JSON LABEL');
const root=path.resolve(site),out=path.resolve(output);
const examples={hotels:[{hotelId:'H1',name:'Hotel contoh',city:'Sleman'}],rooms:[{hotelId:'H1',roomId:'R1',roomType:'Standar',pricePerNight:250000,capacity:4,totalUnits:5}],destinations:[{id:1,name:'Wisata contoh',region:'Sleman',price:15000}],vehicles:[{id:'V1',name:'Mobil contoh',type:'mobil',category:'mpv',dailyPrice:200000,totalPrice:600000,days:3,unitsAvailable:3,available:true}]};
let mutations=0;const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');
 if(url.pathname.startsWith('/api/')){
  res.setHeader('Content-Type','application/json');
  if(req.method!=='GET'){mutations++;res.statusCode=403;res.end(JSON.stringify({error:'read-only fixture'}));return}
  if(url.pathname==='/api/recommendations'){res.end(JSON.stringify({destinations:examples.destinations,reason:'Fixture Sleman'}));return}
  const key=url.pathname.split('/').pop();
  if(key==='health'){res.end(JSON.stringify({status:'ok',bookingEnabled:false,interopPreparationEnabled:false}));return}
  if(examples[key]){const items=key==='vehicles'?examples[key].map(v=>({...v,startDate:url.searchParams.get('startDate'),endDate:url.searchParams.get('endDate')})):examples[key];res.end(JSON.stringify({items,provider:key==='vehicles'?'transport':key}));return}
  res.end(JSON.stringify({packages:[]}));return;
 }
 const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(root+path.sep)){res.statusCode=403;res.end();return}
 try{res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file))}
 catch{res.statusCode=404;res.end('missing')}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+server.address().port;
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'jt-benchmark-'));
const chrome=spawn(process.env.CHROME_BIN||'google-chrome',['--headless','--no-sandbox','--disable-dev-shm-usage','--remote-debugging-port=0','--remote-allow-origins=*','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
let log='';chrome.stderr.on('data',b=>log=(log+b.toString()).slice(-3000));
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));let ws,errors=[];
const report={label,protocol:'jogjatrip-ux-scenarios-v1',fixture:'H1 R1 D1 V1 read-only',measurement:'scripted discrete user operations (not physical clicks/time)',scenarios:[],mutations:0,errors:[]};
try{
 let port;
 for(let i=0;i<300;i++){try{port=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await sleep(100)}}
 if(!port)throw Error('Chrome startup failed: '+log);
 const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 ws=new WebSocket(tabs.find(x=>x.type==='page').webSocketDebuggerUrl);
 await new Promise((ok,bad)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',bad,{once:true})});
 let seq=0;const pending=new Map();
 ws.addEventListener('message',e=>{const v=JSON.parse(e.data);if(v.id&&pending.has(v.id)){const [ok,bad]=pending.get(v.id);pending.delete(v.id);v.error?bad(Error(v.error.message)):ok(v.result)}if(v.method==='Runtime.exceptionThrown')errors.push(v.params.exceptionDetails.exception?.description||v.params.exceptionDetails.text)});
 const call=(method,params={})=>new Promise((ok,bad)=>{const id=++seq;pending.set(id,[ok,bad]);ws.send(JSON.stringify({id,method,params}))});
 const evaluate=async expr=>{const r=await call('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
 await call('Page.enable');await call('Runtime.enable');await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 async function until(expr){for(let i=0;i<100;i++){const condition=/^[#.\[]/.test(expr)?'!!document.querySelector('+JSON.stringify(expr)+')':expr;if(await evaluate(condition).catch(()=>false))return;await sleep(100)}const debug=await evaluate("(()=>({page:document.querySelector('.page.active')?.id,hotels:state.hotels.length,rooms:state.rooms.length,destinations:state.destinations.length,loading:state.catalogLoading,tab:state.tab,candidates:typeof v4Candidates!=='undefined'?v4Candidates.length:null,htmlCatalog:document.querySelector('#catalog')?.innerText.slice(0,250),htmlHotel:document.querySelector('#ibHotelOptions')?.innerText.slice(0,250),errors:state.catalogResults}))()").catch(()=>null);throw Error('TIMEOUT '+expr+' '+JSON.stringify(debug))}
 async function reset(){await call('Page.navigate',{url:base+'/?scenario='+Math.random()+'#/beranda'});await until("document.readyState==='complete'&&typeof page==='function'&&typeof integratedRender==='function'");await until("!state.catalogLoading&&state.hotels.length>0&&state.destinations.length>0");await sleep(200)}
 async function run(name,steps,goal){
  const trace=[];
  try{
   await reset();
   async function action(type,selector,value){
    let expression;
    if(type==='click')expression='(()=>{const e=document.querySelector('+JSON.stringify(selector)+');if(!e||e.disabled||e.closest("[hidden]"))return false;e.click();return true})()';
    if(type==='field')expression='(()=>{const e=document.querySelector('+JSON.stringify(selector)+');if(!e)return false;e.value='+JSON.stringify(value)+';e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));return e.value==='+JSON.stringify(value)+'})()';
    if(!expression||await evaluate(expression)!==true)throw Error('ACTION_FAILED '+type+' '+selector+' '+String(value??''));
    trace.push({type,selector,value:value??null});await sleep(100);
   }
   for(const [type,selector,value] of steps){
    if(type==='wait'){await until(selector);continue}
    if(type==='schedule'){
     const hours=selector==='hotel'?['14:00','15:00']:selector==='transport'?['10:00','11:00']:['09:00','10:00'];
     const fast=await evaluate('!!document.querySelector(".jt-schedule-dialog[open] [data-suggested-time]")');
     if(fast)await action('click','.jt-schedule-dialog [data-suggested-time]');
     else{await action('field','.jt-schedule-dialog [name="start"]',hours[0]);await action('field','.jt-schedule-dialog [name="end"]',hours[1]);await action('click','.jt-schedule-dialog [type="submit"]')}
     continue;
    }
    if(type==='packageTimes'){
     const fast=await evaluate('!!document.querySelector("#v4QuickFillTimes")');
     if(fast)await action('click','#v4QuickFillTimes');
     else{
      await action('field','#v4FeaturedDetail [data-v4-start="hotel:0"]','14:00');
      await action('field','#v4FeaturedDetail [data-v4-end="hotel:0"]','15:00');
      await action('field','#v4FeaturedDetail [data-v4-start="visit:0"]','09:00');
      await action('field','#v4FeaturedDetail [data-v4-end="visit:0"]','10:00');
     }
     continue;
    }
    if(type==='detail'){
     const fast=await evaluate('!!document.querySelector("#detailDialog[open] #addItemSuggested")');
     const hours=selector==='hotel'?['14:00','15:00']:['09:00','10:00'];
     if(fast)await action('click','#addItemSuggested');
     else{await action('field','#mStartTime',hours[0]);await action('field','#mEndTime',hours[1]);await action('click','#addItem')}
     continue;
    }
    await action(type,selector,value);
   }
   const observed=await evaluate(goal);if(!observed||!observed.passed)throw Error('GOAL_NOT_REACHED '+JSON.stringify(observed));
   report.scenarios.push({name,valid:true,actions:trace.length,trace,observed});
  }catch(e){report.scenarios.push({name,valid:false,actions:null,trace,error:String(e)})}
 }
 await run('S-A',[
 ['click','[data-page="journey"]'],['wait','#ibHotelOptions [data-ib-hotel]'],['click','#ibHotelOptions [data-ib-hotel]'],['wait','.jt-schedule-dialog[open]'],['schedule','hotel'],
 ['wait','#ibWisataOptions [data-ib-wisata]'],['click','#ibWisataOptions [data-ib-wisata]'],['wait','.jt-schedule-dialog[open]'],['schedule','wisata'],
 ['click','[data-ib-tab="transport"]'],['wait','#ibTransportOptions [data-ib-vehicle]:not([disabled])'],['click','#ibTransportOptions [data-ib-vehicle]:not([disabled])'],['wait','.jt-schedule-dialog[open]'],['schedule','transport']
 ],'(()=>({passed:document.querySelector("#journey.page.active")!==null&&["hotel","wisata","transport"].every(t=>planState.activities.some(a=>a.sourceItem?.type===t))&&planState.activities.every(a=>{const t=a.sourceItem?.type;const times=t==="hotel"?["14:00","15:00"]:t==="transport"?["10:00","11:00"]:["09:00","10:00"];return a.startTime===times[0]&&a.endTime===times[1]}),items:planState.activities.map(a=>({type:a.sourceItem?.type,start:a.startTime,end:a.endTime,id:a.sourceItem?.hotelId||a.sourceItem?.destinationId||a.sourceItem?.vehicleId}))}))()');
 await run('S-B',[
 ['click','[data-page="packages"]'],['wait','#allSmartPackages [data-v4-package]'],['click','[data-v4-theme="Alam"]'],['wait','#allSmartPackages [data-v4-package]'],
 ['click','#allSmartPackages [data-v4-package]'],['wait','#v4FeaturedDetail:not([hidden]) [data-v4-start]'],
 ['packageTimes'],['click','#v4ToPlan']
 ],'(()=>({passed:document.querySelector("#journey.page.active")!==null&&planState.activities.length===2&&planState.activities.some(a=>a.sourceItem?.type==="hotel"&&a.startTime==="14:00"&&a.endTime==="15:00")&&planState.activities.some(a=>a.sourceItem?.type==="wisata"&&a.startTime==="09:00"&&a.endTime==="10:00"),items:planState.activities.map(a=>({type:a.sourceItem?.type,start:a.startTime,end:a.endTime,id:a.sourceItem?.hotelId||a.sourceItem?.destinationId}))}))()');
 await run('S-C',[
 ['click','[data-tab="hotel"]'],['wait','#catalog [data-view]'],['click','#catalog [data-view]'],['wait','#detailDialog[open]'],['detail','hotel'],['wait','#planner.page.active'],
 ['click','[data-page="explore"]'],['click','[data-tab="wisata"]'],['wait','#catalog [data-view]'],['click','#catalog [data-view]'],['wait','#detailDialog[open]'],['detail','wisata']
 ],'(()=>({passed:document.querySelector("#planner.page.active")!==null&&state.cart.length===2&&state.cart.some(c=>c.item.type==="hotel"&&c.item.plannedStartTime==="14:00"&&c.item.plannedEndTime==="15:00")&&state.cart.some(c=>c.item.type==="wisata"&&c.item.plannedStartTime==="09:00"&&c.item.plannedEndTime==="10:00"),items:state.cart.map(c=>({type:c.item.type,start:c.item.plannedStartTime,end:c.item.plannedEndTime,id:c.item.hotelId||c.item.destinationId}))}))()');
 report.mutations=mutations;report.errors=errors;
}finally{ws?.close();chrome.kill();server.close();await new Promise(resolve=>{if(chrome.exitCode!==null||chrome.signalCode!==null)return resolve();chrome.once('exit',resolve);setTimeout(resolve,1500)});await fs.rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:300}).catch(e=>console.error('Chrome profile cleanup warning:',e.message))}
await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2));
console.log(JSON.stringify({label,scenarios:report.scenarios.map(s=>({name:s.name,valid:s.valid,actions:s.actions,error:s.error,observed:s.observed})),mutations,errors},null,2));
if(report.scenarios.some(s=>!s.valid)||mutations||errors.length)process.exitCode=1;
