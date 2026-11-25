// Lighthouse mobile audit on an isolated local fixture server. No production traffic or bookings.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../web/',import.meta.url));
const out=process.env.UI_REPORT_DIR||'lighthouse-report';
const bin=process.env.LIGHTHOUSE_BIN;
if(!bin)throw Error('Set LIGHTHOUSE_BIN to a locally installed Lighthouse CLI');
await fs.mkdir(out,{recursive:true});
const fixtures={hotels:[{hotelId:'H1',name:'Hotel contoh',city:'Sleman'}],rooms:[{hotelId:'H1',roomId:'R1',roomType:'Standard',pricePerNight:250000,capacity:2,totalUnits:3}],destinations:[{id:1,name:'Wisata contoh',region:'Sleman',price:10000}],vehicles:[{id:'V1',name:'Kendaraan contoh',type:'mobil',dailyPrice:200000,totalPrice:600000,days:3,unitsAvailable:2,available:true}]};
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
 try{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname.startsWith('/api/')){
  res.setHeader('Content-Type','application/json');
  if(req.method!=='GET'){res.statusCode=403;res.end(JSON.stringify({error:'Read-only fixture'}));return}
  const key=u.pathname.split('/').pop();let items=fixtures[key];
  if(key==='vehicles')items=items.map(v=>({...v,startDate:u.searchParams.get('startDate'),endDate:u.searchParams.get('endDate'),withDriver:false}));
  res.end(JSON.stringify(items?{items,provider:key==='vehicles'?'transport':key}:key==='health'?{status:'ok',bookingEnabled:false,providers:{hotel:true,wisata:true,transport:true}}:key==='packages'?{packages:[]}:{}));return;
 }
 const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));
 if(!file.startsWith(root))throw Error('Invalid path');
 const body=await fs.readFile(file);
 res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(body);
 }catch{res.statusCode=404;res.end('Not found')}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
function run(args){return new Promise((resolve,reject)=>{const child=spawn(bin,args,{stdio:'inherit',env:{...process.env,CHROME_PATH:process.env.CHROME_PATH||'google-chrome'}});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error('Lighthouse exited '+code)))})}
const results=[];
try{
 for(const route of ['beranda','paket','pilihan','itinerary','pesanan']){
  const dest=path.resolve(out,route+'.json');
  try{
   await run([base+'/#/'+route,'--only-categories=accessibility,best-practices,performance','--form-factor=mobile','--output=json','--output-path='+dest,'--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage','--quiet']);
   const report=JSON.parse(await fs.readFile(dest,'utf8'));
   const a=report.categories.accessibility.score,b=report.categories['best-practices'].score,p=report.categories.performance.score,cls=report.audits['cumulative-layout-shift'].numericValue;
   const failures=[];
   for(const category of ['accessibility','best-practices'])for(const ref of report.categories[category].auditRefs){const audit=report.audits[ref.id];if(ref.weight>0&&audit?.score!==null&&audit?.score<1)failures.push({id:ref.id,score:audit.score,nodes:(audit.details?.items||[]).slice(0,12).map(x=>({selector:x.node?.selector,snippet:x.node?.snippet,summary:x.node?.explanation||x.description||x.url}))})}
   const passed=Number.isFinite(a)&&a>=.95&&Number.isFinite(b)&&b>=.95&&Number.isFinite(cls)&&cls<.1&&!report.runtimeError&&report.audits['errors-in-console']?.score===1;
   const shiftAudits=['layout-shift-elements','cls-culprits-insight','font-display-insight'];const shifts=Object.fromEntries(shiftAudits.filter(k=>report.audits[k]?.details).map(k=>[k,JSON.stringify(report.audits[k].details).slice(0,2400)]));
   const result={route,accessibility:a,bestPractices:b,performance:p,cls,passed,failures,shifts};results.push(result);
   console.log('LIGHTHOUSE '+JSON.stringify(result));
  }catch(e){results.push({route,passed:false,error:String(e)});console.error('LIGHTHOUSE ERROR '+route+' '+e.message)}
 }
 await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(results,null,2));
 if(results.length!==5||results.some(x=>!x.passed))process.exitCode=1;
}finally{server.close()}
