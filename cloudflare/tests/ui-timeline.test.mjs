import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../web/integrated.js',import.meta.url),'utf8');
const ctx=vm.createContext({endDate:(d,n)=>new Date(Date.parse(d)+n*86400000).toISOString().slice(0,10),jtValidTimes:(s,e)=>!!s&&!!e&&s<e,state:{hotels:[],rooms:[{roomId:'R',hotelId:'H',pricePerNight:100}],destinations:[{id:1,price:20}],vehicles:[{id:'V',dailyPrice:50,driverDailyPrice:10}]},integrated:{vehicles:[],rec:[]},photoURL:()=>''});
vm.runInContext(js.slice(js.indexOf('function jtPlanDays('),js.indexOf('function jtInvalidateQuote(')),ctx);
const evaluate=s=>JSON.parse(JSON.stringify(vm.runInContext(s,ctx)));
test('timeline dates, boundaries and lock-safe movement preserve duration',()=>{
 const r=evaluate("(()=>{const a={date:'2027-01-01',sourceItem:{type:'hotel',checkIn:'2027-01-01',checkOut:'2027-01-03'}};const v={date:'2027-01-01',sourceItem:{type:'transport',startDate:'2027-01-01',endDate:'2027-01-02'}};const locked={...v,orderId:'O'};return {days:jtPlanDays([a,v],'2027-01-01','2027-01-03').map(d=>d.boundaries.length),moved:jtMoveDate(a,'2027-01-02'),checkout:a.sourceItem.checkOut,lock:jtMoveDate(locked,'2027-01-03')}})()");
 assert.deepEqual(r,{days:[0,1,1],moved:true,checkout:'2027-01-04',lock:false});
});
test('overlaps, ordering and user travel notes do not rewrite clock times',()=>{
 const r=evaluate("(()=>{const a={date:'2027-01-01',startTime:'09:00',endTime:'11:00',notes:'Existing'},b={date:a.date,startTime:'10:00',endTime:'12:00'};const list=[a,b];jtSetTravelMinutes(a,'15');return {conflicts:jtConflicts(list,a).length,swap:jtSwapDay(list,0,1),first:list[0].startTime,notes:a.notes,minutes:jtTravelMinutes(a)}})()");
 assert.equal(r.conflicts,1);assert.equal(r.swap,true);assert.equal(r.first,'10:00');assert.equal(r.minutes,15);assert.match(r.notes,/Existing/);
});
test('catalog costs are daily, unknown prices are not invented, booked excluded',()=>{
 const r=evaluate("jtDayEstimate([{sourceItem:{type:'hotel',hotelId:'H',roomId:'R',checkIn:'2027-01-01',checkOut:'2027-01-03'}},{sourceItem:{type:'wisata',destinationId:1,quantity:2,visitDate:'2027-01-01'}},{sourceItem:{type:'transport',vehicleId:'V',startDate:'2027-01-01',endDate:'2027-01-02',withDriver:true}},{sourceItem:{type:'wisata',destinationId:99,quantity:1,visitDate:'2027-01-01'}},{orderId:'O',sourceItem:{type:'wisata',destinationId:1,quantity:1,visitDate:'2027-01-01'}}],'2027-01-01')");
 assert.deepEqual(r,{amount:200,unknown:1,booked:1});
});
