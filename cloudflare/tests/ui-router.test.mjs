import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../web/'+name,import.meta.url),'utf8');
const js=read('app.js'),html=read('index.html');
const start=js.indexOf('const jtRoutes='),end=js.indexOf('let jtActiveRoute=',start);
const ctx=vm.createContext({});
vm.runInContext(js.slice(start,end),ctx);
const parse=h=>JSON.parse(JSON.stringify(vm.runInContext('jtParseRoute('+JSON.stringify(h)+')',ctx)));
const hash=(name,day)=>vm.runInContext('jtRouteHash('+JSON.stringify(name)+','+JSON.stringify(day)+')',ctx);
test('public route mapping and day bounds are strict',()=>{
 for(const [name,path] of Object.entries({explore:'beranda',packages:'paket',planner:'pilihan',journey:'itinerary',orders:'pesanan'})){
  assert.equal(hash(name,null),'#/'+path);assert.deepEqual(parse('#/'+path),{name,day:null});
 }
 for(const day of [1,2,16])assert.deepEqual(parse(hash('journey',day)),{name:'journey',day});
 for(const invalid of ['#/itinerary/hari-0','#/itinerary/hari-17','#/itinerary/hari-02','#/pesanan/hari-2','#/itinerary?token=secret','#/unknown',''])assert.deepEqual(parse(invalid),{name:'explore',day:null});
 assert.equal(hash('journey',17),'#/itinerary');assert.equal(hash('orders',2),'#/pesanan');assert.equal(hash('constructor',null),'#/beranda');
});
test('native navigation anchors preserve all five data-page contracts',()=>{
 for(const [name,path] of Object.entries({explore:'beranda',packages:'paket',planner:'pilihan',journey:'itinerary',orders:'pesanan'}))assert.match(html,new RegExp('<a class="navlink[^"]*" data-page="'+name+'"[^>]*href="#/'+path+'"'));
 assert.match(html,/id="mobileNavToggle"[^>]*aria-controls="mainNav"[^>]*aria-expanded="false"/);
 assert.match(html,/href="#mainContent"/);
 assert.match(read('integrated.js'),/data-ib-day="\$\{i\+1\}"/);
});
