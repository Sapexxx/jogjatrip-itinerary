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
let mutationRequests=0;
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')){
  const key=url.pathname.split('/').pop();
  let items=fixtures[key];
  if(key==='vehicles')items=items.map(x=>({...x,startDate:url.searchParams.get('startDate'),endDate:url.searchParams.get('endDate'),withDriver:false}));
  res.setHeader('Content-Type','application/json');
  if(req.method!=='GET'){mutationRequests++;res.statusCode=403;res.end(JSON.stringify({error:'Fixture server is read-only'}));return}
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
const chrome=spawn(process.env.CHROME_BIN||'google-chrome',['--headless','--no-sandbox','--disable-dev-shm-usage','--remote-debugging-port=0','--remote-allow-origins=*','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
let chromeLog='';chrome.stderr?.on('data',chunk=>{chromeLog=(chromeLog+chunk.toString()).slice(-6000)});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let ws;const report=[],checks=[];
try{
 let port;
 for(let i=0;i<300;i++){try{port=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await wait(100)}}
 if(!port)throw Error('Chrome did not start: '+chromeLog);
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
  // Assert the actual browser loaded every CSS module and rendered local SVG.
  const sheetExpr="(()=>{const root=[...document.styleSheets].find(s=>s.href?.endsWith('/style.css'));if(!root)return [];return [...root.cssRules].filter(r=>r.type===3).map(r=>({href:r.href,loaded:!!r.styleSheet?.cssRules?.length}))})()";
  const sheets=await evaluate(sheetExpr);
  const expectedSheets=['base.css','layout.css','components.css','pages/explore.css','pages/itinerary.css','pages/orders.css','accessibility.css'];
  const iconExpr="(()=>{const e=document.querySelector('.v4-service-icon svg use');try{const b=e?.getBBox();return !!b&&b.width>0&&b.height>0}catch{return false}})()";
  let svg=false;for(let i=0;i<30&&!svg;i++){svg=await evaluate(iconExpr);if(!svg)await wait(100)}
  checks.push({viewport:width,check:'CSS modules loaded',passed:expectedSheets.every(p=>sheets.some(s=>s.href?.endsWith(p)&&s.loaded)),sheets});
  checks.push({viewport:width,check:'Local SVG visible',passed:svg});
  const uxCheck=await evaluate("(()=>{const people=document.getElementById('ibPeople'),home=document.getElementById('guests'),nights=document.getElementById('ibNights');const before=Number(people.value),beforeHome=Number(home.value),beforeNight=nights.value;const plus=people.previousElementSibling?.querySelector('.ux-stepper-btn:last-of-type'),homePlus=home.previousElementSibling?.querySelector('.ux-stepper-btn:last-of-type'),nightFour=nights.previousElementSibling?.querySelector('[data-value=\"4\"]');if(!plus||!homePlus||!nightFour)return {ready:false,hasPlus:!!plus,hasHome:!!homePlus,hasNights:!!nightFour};page('journey');integrated.quote={total:1000,available:true};plus.click();const valueChanged=Number(people.value)===before+1,quoteReset=integrated.quote===null;nightFour.click();const nightChanged=nights.value==='4',buttonSize=Math.round(plus.getBoundingClientRect().height);people.value=String(before);people.dispatchEvent(new Event('change',{bubbles:true}));JTUXControls.sync('ibPeople');nights.value=beforeNight;nights.dispatchEvent(new Event('change',{bubbles:true}));JTUXControls.sync('ibNights');page('explore');homePlus.click();const homeChanged=Number(home.value)===beforeHome+1,homeSize=Math.round(homePlus.getBoundingClientRect().height);home.value=String(beforeHome);home.dispatchEvent(new Event('change',{bubbles:true}));JTUXControls.sync('guests');return {ready:true,valueChanged,quoteReset,homeChanged,nightChanged,buttonSize,homeSize}})()");
  checks.push({viewport:width,check:'UX controls preserve native values, quote reset and touch targets',passed:uxCheck.ready&&uxCheck.valueChanged&&uxCheck.quoteReset&&uxCheck.homeChanged&&uxCheck.nightChanged&&uxCheck.buttonSize>=44&&uxCheck.homeSize>=44,details:uxCheck});
  for(const name of ['explore','packages','planner','journey','orders']){
   await evaluate("page("+JSON.stringify(name)+");window.scrollTo(0,0);");
   await wait(200);
   const info=await evaluate("({active:document.querySelector('.page.active')?.id,width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,title:document.title,plannerColumns:document.querySelector('#planner .layout')&&getComputedStyle(document.querySelector('#planner .layout')).gridTemplateColumns})");
   const image=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   await fs.writeFile(path.join(out,width+'-'+name+'.png'),Buffer.from(image.data,'base64'));
   report.push({viewport:width,page:name,...info,overflow:info.scrollWidth>info.width});
  }
  // Editorial catalog and service CTA contracts in a real browser.
  await evaluate("page('explore')");
  checks.push({viewport:width,check:'Hero and three service entry points',passed:await evaluate("(()=>{const h=document.querySelector('.hero-art img');return !!h&&h.complete&&h.naturalWidth>0&&document.querySelectorAll('[data-v4-service]').length===3&&!!document.querySelector('#heroExplore')})()")});
  await evaluate("document.querySelector('[data-v4-service=transport]').click()");
  checks.push({viewport:width,check:'Transport CTA opens the shared catalog',passed:await evaluate("state.tab==='transport'&&document.querySelector('[data-tab=transport]').getAttribute('aria-pressed')==='true'")});
  await evaluate("selectCatalogTab('all');page('orders');jdRender({order:{id:'FIXTURE',status:'PARTIAL',total:200000,items:[{item:{type:'transport',vehicleId:'V1',startDate:tripDate(),endDate:endDate(tripDate(),1),withDriver:false},status:'CONFIRMED',amount:200000}]},details:[{index:0,name:'Mobil contoh',productName:'Mobil'}]})");
  const orderInfo=await evaluate("({active:document.querySelector('.page.active').id,width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,transport:document.querySelector('.jd-item').textContent.includes('Mulai sewa'),status:!!document.querySelector('.jd-item .status svg'),disclaimer:!!document.querySelector('.jd-order .jt-disclaimer')})");
  checks.push({viewport:width,check:'Transport order shows dates, status icon and disclaimer',passed:orderInfo.transport&&orderInfo.status&&orderInfo.disclaimer});
  const orderImage=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await fs.writeFile(path.join(out,width+'-orders-filled.png'),Buffer.from(orderImage.data,'base64'));
  report.push({viewport:width,page:'orders-filled',...orderInfo,overflow:orderInfo.scrollWidth>orderInfo.width});
  await evaluate("document.querySelector('#lookupResult').innerHTML='';page('explore')");
  // Real link clicks, browser history, deep-link day selection, and mobile disclosure.
  const navCheck=await evaluate("(()=>{page('explore');const menu=document.querySelector('#mobileNavToggle'),nav=document.querySelector('#mainNav');const mobile=matchMedia('(max-width:800px)').matches;let disclosure=true;if(mobile){disclosure=getComputedStyle(nav).display==='none';menu.click();disclosure=disclosure&&menu.getAttribute('aria-expanded')==='true'&&getComputedStyle(nav).display!=='none';nav.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));disclosure=disclosure&&menu.getAttribute('aria-expanded')==='false'&&document.activeElement===menu;menu.click()}nav.querySelector('[data-page=packages]').click();return {disclosure,active:document.querySelector('.page.active').id,hash:location.hash,aria:nav.querySelector('[aria-current=page]')?.dataset.page,closed:menu.getAttribute('aria-expanded')==='false',focus:document.activeElement===document.querySelector('#packages h1')}})()");
  checks.push({viewport:width,check:'Native navigation, mobile disclosure, focus and ARIA',passed:navCheck.disclosure&&navCheck.active==='packages'&&navCheck.hash==='#/paket'&&navCheck.aria==='packages'&&navCheck.closed&&navCheck.focus});
  await evaluate("history.back()");
  for(let i=0;i<40;i++){if(await evaluate("location.hash==='#/beranda'&&document.querySelector('.page.active').id==='explore'"))break;await wait(50)}
  const back=await evaluate("location.hash==='#/beranda'&&document.querySelector('.page.active').id==='explore'");
  await evaluate("history.forward()");
  for(let i=0;i<40;i++){if(await evaluate("location.hash==='#/paket'&&document.querySelector('.page.active').id==='packages'"))break;await wait(50)}
  const forward=await evaluate("location.hash==='#/paket'&&document.querySelector('.page.active').id==='packages'");
  checks.push({viewport:width,check:'Browser back and forward',passed:back&&forward});
  await evaluate("page('journey');document.querySelector('[data-ib-day-link=\"2\"]').click()");
  const dayExpr="location.hash==='#/itinerary/hari-2'&&document.querySelector('.page.active').id==='journey'&&document.querySelector('[data-ib-day=\"2\"]').hidden===false&&[...document.querySelectorAll('[data-ib-day]')].filter(x=>!x.hidden).length===1&&document.querySelector('[data-ib-day-link=\"2\"]').getAttribute('aria-current')==='location'";
  checks.push({viewport:width,check:'Day link selects only day 2',passed:await evaluate(dayExpr)});
  await call('Page.navigate',{url:base+'/?route-test=1#/itinerary/hari-2'});
  for(let i=0;i<100;i++){if(await evaluate("document.readyState==='complete'&&("+dayExpr+")").catch(()=>false))break;await wait(100)}
  const direct=await evaluate(dayExpr).catch(()=>false);
  checks.push({viewport:width,check:'Fresh document opens day 2 directly',passed:direct});
  const dayInfo=await evaluate("({active:document.querySelector('.page.active')?.id,width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth})");
  const dayImage=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await fs.writeFile(path.join(out,width+'-journey-day2.png'),Buffer.from(dayImage.data,'base64'));
  report.push({viewport:width,page:'journey-day2',...dayInfo,overflow:dayInfo.scrollWidth>dayInfo.width});
  await evaluate("page('journey',16)");
  checks.push({viewport:width,check:'Unavailable day shows explicit notice',passed:await evaluate("!document.querySelector('#ibDayNotice').hidden&&document.querySelector('#ibDayNotice').textContent.includes('Hari 16')")});
  await evaluate("page('journey');document.querySelector('.skip-link').click()");
  checks.push({viewport:width,check:'Skip link preserves route and moves focus',passed:await evaluate("location.hash==='#/itinerary'&&document.activeElement.id==='mainContent'")});
  // Local timeline fixture, including overlapping activities and locked provider booking.
  await evaluate("page('journey');planState.activities=[{type:'hotel',title:'Hotel contoh',date:idate(),startTime:'09:00',endTime:'11:00',sourceItem:{type:'hotel',hotelId:'H1',roomId:'R1',checkIn:idate(),checkOut:endDate(idate(),2),guests:2}},{type:'wisata',title:'Wisata contoh',date:idate(),startTime:'10:00',endTime:'12:00',sourceItem:{type:'wisata',destinationId:1,visitDate:idate(),quantity:2}},{type:'transport',title:'Kendaraan contoh',date:idate(),startTime:'08:00',endTime:'09:00',orderId:'fixture-order',bookingStatus:'CONFIRMED',sourceItem:{type:'transport',vehicleId:'V1',startDate:idate(),endDate:endDate(idate(),2),withDriver:false}}];integratedRender()");
  await wait(150);
  const timeline=await evaluate("({cards:document.querySelectorAll('.ib-timeline-card').length,boundaries:document.querySelectorAll('.ib-boundary').length,conflict:!!document.querySelector('.ib-conflict'),locked:!document.querySelector('[data-ib-edit=\"2\"]'),ticket:document.querySelector('#ibTicket').textContent.includes('Hotel contoh'),width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,active:document.querySelector('.page.active').id})");
  checks.push({viewport:width,check:'Timeline conflict, check-out, return, locked booking and ticket',passed:timeline.cards===3&&timeline.boundaries===2&&timeline.conflict&&timeline.locked&&timeline.ticket});
  const timelineImage=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await fs.writeFile(path.join(out,width+'-journey-filled.png'),Buffer.from(timelineImage.data,'base64'));
  report.push({viewport:width,page:'journey-filled',...timeline,overflow:timeline.scrollWidth>timeline.width});
  await evaluate("(()=>{const x=document.querySelector('[data-ib-move=\"1\"]');x.value=endDate(idate(),1);x.dispatchEvent(new Event('change'))})()");
  checks.push({viewport:width,check:'Move activity updates provider date and day hash',passed:await evaluate("planState.activities[1].date===endDate(idate(),1)&&planState.activities[1].sourceItem.visitDate===planState.activities[1].date&&location.hash==='#/itinerary/hari-2'")});
  await evaluate("page('journey');document.querySelector('#planNew').click()");
  checks.push({viewport:width,check:'Native confirmation dialog opens and cancels without data loss',passed:await evaluate("(()=>{const d=document.querySelector('dialog[open]');if(!d)return false;d.querySelector('[data-cancel]').click();return planState.activities.length===3})()")});
  await evaluate("planState.activities=[];integratedRender()");
  // Exercise all three provider types in a populated cart, including long text.
  await evaluate("state.cart=[{name:'Hotel contoh dengan nama panjang untuk memeriksa responsivitas',item:{type:'hotel',hotelId:'H1',roomId:'R1',checkIn:tripDate(),checkOut:endDate(tripDate(),2),guests:2,plannedStartTime:'14:00',plannedEndTime:'15:00'}},{name:'Destinasi wisata contoh dengan judul panjang',item:{type:'wisata',destinationId:1,visitDate:tripDate(),quantity:2,plannedStartTime:'09:00',plannedEndTime:'11:00'}},{name:'Kendaraan contoh JogjaTrans dengan nama panjang',item:{type:'transport',vehicleId:'V1',startDate:tripDate(),endDate:endDate(tripDate(),2),withDriver:false,plannedStartTime:'08:00',plannedEndTime:'09:00'}}];page('planner');window.scrollTo(0,0)");
  await wait(250);
  const cart=await evaluate("({active:document.querySelector('.page.active')?.id,width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,items:document.querySelectorAll('#cartItems .cart-row').length,columns:getComputedStyle(document.querySelector('#planner .layout')).gridTemplateColumns.split(' ').length})");
  const pic=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await fs.writeFile(path.join(out,width+'-planner-filled.png'),Buffer.from(pic.data,'base64'));
  report.push({viewport:width,page:'planner-filled',...cart,overflow:cart.scrollWidth>cart.width});
  checks.push({viewport:width,check:'Populated cart and responsive grid',passed:cart.items===3&&cart.columns===(width<=800?1:2)});
  await evaluate("state.cart=[];renderCart()");
  // Provider handoff is a read-only entry point; use a fresh document and a future date.
  const handoffDate=await evaluate("endDate(dateStr(new Date()),10)");
  await call('Page.navigate',{url:base+'/?from=wisata&destinationId=1&visitDate='+handoffDate+'&keep=1#/itinerary'});
  const handoffExpr="document.readyState==='complete'&&typeof jtApplyWisataHandoff==='function'&&document.querySelector('#detailDialog')?.open&&document.querySelector('#mDate')?.value==="+JSON.stringify(handoffDate)+"&&document.querySelector('#tripDate').value==="+JSON.stringify(handoffDate)+"&&location.search==='?keep=1'&&location.hash==='#/beranda'&&state.cart.length===0&&state.orders.length===0&&document.querySelector('#mStartTime').value===''&&document.querySelector('#mEndTime').value===''";
  for(let i=0;i<100;i++){if(await evaluate(handoffExpr).catch(()=>false))break;await wait(100)}
  checks.push({viewport:width,check:'Wisata handoff opens catalog detail with requested date, clean query and no automatic booking',passed:await evaluate(handoffExpr).catch(()=>false)});
  const handoffImage=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await fs.writeFile(path.join(out,width+'-wisata-handoff.png'),Buffer.from(handoffImage.data,'base64'));
  const handoffInfo=await evaluate("({active:document.querySelector('.page.active')?.id,width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth})");
  report.push({viewport:width,page:'wisata-handoff',...handoffInfo,overflow:handoffInfo.scrollWidth>handoffInfo.width});
  await evaluate("document.querySelector('#detailDialog').close();jtApplyWisataHandoff();renderCatalog()");
  checks.push({viewport:width,check:'Handoff is consumed once and does not change cart',passed:await evaluate("!document.querySelector('#detailDialog').open&&state.cart.length===0")});
  await call('Page.navigate',{url:base+'/?from=wisata&destinationId=999999999999999#/beranda'});
  for(let i=0;i<100;i++){if(await evaluate("document.readyState==='complete'&&typeof jtApplyWisataHandoff==='function'&&!state.catalogLoading&&location.search===''").catch(()=>false))break;await wait(100)}
  checks.push({viewport:width,check:'Unknown Wisata ID does not open detail or mutate cart',passed:await evaluate("!document.querySelector('#detailDialog').open&&state.cart.length===0&&document.querySelector('#toast').textContent.includes('tidak ditemukan')").catch(()=>false)});
 }
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({fixture:true,report,checks,errors,mutationRequests},null,2));
 console.log(JSON.stringify({screenshots:report.length,mutationRequests,overflow:report.filter(x=>x.overflow),runtimeErrors:errors,checks:checks.map(({viewport,check,passed})=>({viewport,check,passed}))},null,2));
 if(mutationRequests||errors.length||report.some(x=>x.overflow||x.active!==(x.page==='wisata-handoff'?'explore':x.page==='orders-filled'?'orders':x.page==='planner-filled'?'planner':['journey-day2','journey-filled'].includes(x.page)?'journey':x.page))||checks.some(x=>!x.passed))process.exitCode=1;
}finally{ws?.close();chrome.kill();server.close()}
