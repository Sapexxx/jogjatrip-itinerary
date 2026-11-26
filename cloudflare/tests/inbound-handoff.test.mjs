import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const code=src.slice(src.indexOf('function jtParseWisataHandoff('),src.indexOf('function jtReadLocation('));
const create=(url='https://local.test/?from=wisata&destinationId=101&visitDate=2026-12-10# /beranda',extra={})=>{
 const opened=[],messages=[],routes=[],replaced=[],tab=[],date={value:'2026-12-02'},dialog={open:false};
 const state={catalogLoading:false,catalogResults:{destinations:'ok'},destinations:[{id:101,name:'Fixture',region:'Sleman',price:1000}],cart:[],orders:[],...extra};
 const context=vm.createContext({URL,URLSearchParams,Date,state,window:{location:{href:url},history:{state:null,replaceState:(s,t,u)=>replaced.push(u)}},dateStr:()=> '2026-11-25',$:s=>s==='#tripDate'?date:dialog,toast:m=>messages.push(m),page:r=>routes.push(r),selectCatalogTab:t=>tab.push(t),openDetail:d=>opened.push(d)});
 vm.runInContext(code,context);
 return {state,opened,messages,routes,replaced,tab,date,dialog,run:s=>vm.runInContext(s,context)};
};
const parse=s=>JSON.parse(JSON.stringify(create().run('jtParseWisataHandoff('+JSON.stringify(s)+',"2026-11-25")')));
test('handoff accepts a positive 1–15 digit ID and real bounded visit date',()=>{
 assert.deepEqual(parse('?from=wisata&destinationId=101&visitDate=2026-12-10'),{id:'101',date:'2026-12-10'});
 assert.equal(parse('?from=wisata&destinationId=999999999999999').id,'999999999999999');
 for(const d of ['2026-02-30','2026-11-24','2027-11-26','2027-02-29','x'])assert.equal(parse('?from=wisata&destinationId=1&visitDate='+d).date,null);
 assert.equal(parse('?from=wisata&destinationId=1&visitDate=2027-11-25').date,'2027-11-25');
});
test('invalid, duplicate and injection-like IDs are rejected; other sources ignored',()=>{
 for(const id of ['0','01','-1','1234567890123456','<svg>','1e2','1&destinationId=2'])assert.equal(parse('?from=wisata&destinationId='+id).id,null);
 assert.equal(parse('?from=wisata&from=wisata&destinationId=1').id,null);
 assert.equal(parse('?from=jogjatrans&destinationId=1'),null);
});
test('successful handoff cleans only context parameters, pre-fills date, opens once, leaves order/cart unchanged',()=>{
 const x=create('https://local.test/?from=wisata&destinationId=101&visitDate=2026-12-10&keep=1#/beranda');
 x.run('jtInitWisataHandoff();jtApplyWisataHandoff()');
 assert.deepEqual(x.replaced,['/?keep=1#/beranda']);assert.equal(x.opened.length,1);assert.equal(x.opened[0].name,'Fixture');assert.equal(x.date.value,'2026-12-10');assert.deepEqual(x.routes,['explore']);assert.deepEqual(x.tab,['wisata']);assert.deepEqual(x.state.cart,[]);assert.deepEqual(x.state.orders,[]);
});
test('waits for asynchronous catalog and consumes only once even on rerender',()=>{
 const x=create(undefined,{catalogLoading:true});x.run('jtInitWisataHandoff()');assert.equal(x.opened.length,0);x.state.catalogLoading=false;x.run('jtApplyWisataHandoff();jtApplyWisataHandoff()');assert.equal(x.opened.length,1);
});
test('unknown ID, failed catalog and invalid ID produce messages without opening detail',()=>{
 for(const x of [create('https://local.test/?from=wisata&destinationId=999'),create(undefined,{catalogResults:{destinations:'offline'}}),create('https://local.test/?from=wisata&destinationId=0')]){
  x.run('jtInitWisataHandoff()');assert.equal(x.opened.length,0);assert.equal(x.messages.length,1);assert.equal(x.date.value,'2026-12-02');assert.deepEqual(x.state.cart,[]);
 }
});
test('invalid date preserves default; open dialog is never replaced',()=>{
 const x=create('https://local.test/?from=wisata&destinationId=101&visitDate=2026-02-30');x.run('jtInitWisataHandoff()');assert.equal(x.date.value,'2026-12-02');assert.equal(x.opened.length,1);
 const y=create();y.dialog.open=true;y.run('jtInitWisataHandoff()');assert.equal(y.opened.length,0);assert.equal(y.messages.length,1);
});
test('unrelated source leaves URL and DOM untouched',()=>{const x=create('https://local.test/?from=jogjatrans&destinationId=101');x.run('jtInitWisataHandoff()');assert.deepEqual(x.replaced,[]);assert.deepEqual(x.opened,[]);assert.deepEqual(x.messages,[])});

const parsePartner=search=>JSON.parse(JSON.stringify(create().run('jtParsePartnerHandoff('+JSON.stringify(search)+',"2026-11-25")')));
test('final PR: Hotel handoff validates unique ID, optional room and bounded dates',()=>{
 assert.deepEqual(parsePartner('?from=jogjastay&hotelId=HOTEL_01&roomId=ROOM-2&checkIn=2026-12-12&checkOut=2026-12-14'),
  {kind:'hotel',id:'HOTEL_01',roomId:'ROOM-2',date:'2026-12-12',endDate:'2026-12-14'});
 assert.equal(parsePartner('?from=jogjastay&hotelId=HOTEL_01&hotelId=HOTEL_02').id,null);
 assert.equal(parsePartner('?from=jogjastay&hotelId=%3Csvg%3E').id,null);
 assert.equal(parsePartner('?from=jogjastay&hotelId=HOTEL_01&checkIn=2026-02-30').date,null);
 assert.equal(parsePartner('?from=jogjastay&hotelId=HOTEL_01&checkIn=2026-12-14&checkOut=2026-12-12').endDate,null);
});
test('final PR: Transport handoff validates vehicle or vehicleId and rental range',()=>{
 assert.deepEqual(parsePartner('?from=jogjatrans&vehicleId=HONDA_BEAT&startDate=2026-12-12&endDate=2026-12-14'),
  {kind:'transport',id:'HONDA_BEAT',roomId:null,date:'2026-12-12',endDate:'2026-12-14'});
 assert.equal(parsePartner('?from=jogjatrans&vehicle=HONDA_BEAT').id,'HONDA_BEAT');
 assert.equal(parsePartner('?from=jogjatrans&vehicle=HONDA_BEAT&vehicleId=R-01').id,null);
 assert.equal(parsePartner('?from=jogjatrans&vehicle=HONDA_BEAT&startDate=2026-12-12&endDate=2027-02-01').endDate,null);
 assert.equal(parsePartner('?from=jogjatrans&vehicle=%3Cscript%3E').id,null);
 assert.equal(parsePartner('?from=jogjatrans&from=jogjatrans&vehicleId=R-01'),null);
 assert.equal(parsePartner('?from=wisata&vehicleId=R-01'),null);
});
