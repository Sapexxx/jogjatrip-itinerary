import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../web/'+name,import.meta.url),'utf8');
test('all three service cards share the lower Explore catalog navigation',()=>{
 const html=read('index.html'), js=read('v4.js');
 assert.match(html,/03 \/ MOBILITAS/);
 assert.match(html,/id="openTransportPlanner" data-v4-service="transport"/);
 assert.match(html,/data-tab="transport"/);
 assert.match(js,/selectCatalogTab\(btn.dataset.v4Service\)/);
 assert.match(js,/querySelector\('#explore \.section-top'\)\.scrollIntoView/);
 assert.doesNotMatch(js,/transportLink\.onclick=.*page\('journey'\)/);
});
test('Explore rental uses actual provider items, dates and filters',()=>{
 const js=read('app.js');
 assert.match(js,/request\('\/api\/catalog\/vehicles\?'\+query\)/);
 assert.match(js,/state\.vehicles=result\.items/);
 assert.match(js,/seq!==state\.rentalSeq/);
 assert.match(js,/vehicleId:String\(v.id\),startDate:p.startDate,endDate:p.endDate,withDriver:p.withDriver/);
 assert.match(js,/state\.cart\.push\(\{item,name:v.name,estimate:Number\(v.totalPrice\)\}\)/);
});
test('transport selection is carried into the itinerary with rental dates',()=>{
 const js=read('v2.js');
 assert.match(js,/c.item.type==='transport'\?c.item.startDate/);
 assert.match(js,/a.sourceItem\?\.endDate/);
});
