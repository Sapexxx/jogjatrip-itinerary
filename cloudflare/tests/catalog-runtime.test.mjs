import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
function setup(failKey=''){
 const elements=new Map();
 for(const m of html.matchAll(/\bid="([^"]+)"/g)){
  elements.set('#'+m[1],{value:'',hidden:false,innerHTML:'',textContent:'',dataset:{},classList:{toggle(){}},addEventListener(){}});
 }
 for(const [id,value] of Object.entries({nights:'2',guests:'2',region:'',exploreRentType:'all',exploreRentDriver:'false',exploreRentCategory:'all'}))elements.get('#'+id).value=value;
 const tabs=['all','hotel','wisata','transport'].map(tab=>({dataset:{tab},classList:{toggle(){}}}));
 const document={querySelector:s=>s==='[data-tab]'?tabs[0]:elements.get(s)||null,querySelectorAll:s=>s==='[data-tab]'?tabs:[]};
 const storage={getItem(){return null},setItem(){}};
 const calls=[];
 const ctx=vm.createContext({document,localStorage:storage,sessionStorage:storage,window:{},URL,URLSearchParams,console,setTimeout,clearTimeout,fetch:async path=>{
  calls.push(path);const key=path.split('/').pop().split('?')[0];
  const p=new URL(path,'https://test.invalid').searchParams;
  const fixtures={hotels:[{hotelId:'H1',name:'Test Hotel',city:'Sleman'}],rooms:[{hotelId:'H1',roomId:'R1',pricePerNight:250000}],destinations:[{id:1,name:'Test Wisata',price:10000}],vehicles:[{id:'V1',name:'Test Rental',type:'mobil',dailyPrice:200000,totalPrice:600000,days:3,unitsAvailable:2,available:true,startDate:p.get('startDate'),endDate:p.get('endDate'),withDriver:false}]};
  return {ok:key!==failKey,status:key===failKey?502:200,json:async()=>key===failKey?{error:'Provider offline'}:{items:fixtures[key],provider:key==='vehicles'?'transport':key}};
 }});
 vm.runInContext(js,ctx,{filename:'app.js'});
 return {elements,tabs,calls,ctx};
}
test('catalog startup executes and fetches all four API resources without user interaction',async()=>{
 const {elements,calls,tabs}=setup();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.length,4);
 assert.ok(calls.some(x=>x.startsWith('/api/catalog/vehicles?startDate=')));
 const catalog=elements.get('#catalog');
 for(const name of ['Test Hotel','Test Wisata','Test Rental'])assert.ok(catalog.innerHTML.includes(name),name);
 assert.match(elements.get('#catalogNotice').textContent,/Hotel, Wisata, dan Transportasi terhubung/);
 tabs[3].onclick();
 assert.match(catalog.innerHTML,/Test Rental/);
 assert.doesNotMatch(catalog.innerHTML,/Test Hotel|Test Wisata/);
 tabs[0].onclick();
 assert.match(catalog.innerHTML,/Test Hotel/);
});
test('one failed provider does not prevent the remaining catalogs from rendering',async()=>{
 const {elements}=setup('vehicles');
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(elements.get('#catalog').innerHTML,/Test Hotel/);
 assert.match(elements.get('#catalog').innerHTML,/Test Wisata/);
 assert.match(elements.get('#catalogNotice').textContent,/Transportasi: Provider offline/);
});
test('transport card no longer includes the checkout note',()=>{
 assert.doesNotMatch(html,/Harga simulasi\. Pemesanan demo hanya saat checkout diaktifkan\./);
});
