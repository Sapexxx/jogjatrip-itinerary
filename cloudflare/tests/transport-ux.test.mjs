import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../web/'+name,import.meta.url),'utf8');
test('transport card retains Mobilitas and opens the journey builder',()=>{
 const html=read('index.html'), js=read('v4.js');
 assert.match(html,/03 \/ MOBILITAS/);
 assert.match(html,/id="v4UseTransport"/);
 assert.match(html,/Jelajahi transportasi/);
 assert.match(js,/transportLink\.onclick=\(\)=>\{page\('journey'\)/);
});
test('transport catalog sends rental dates and selected filters',()=>{
 const js=read('integrated.js');
 assert.match(js,/startDate:r\.startDate,endDate:r\.endDate,withDriver:String\(r\.withDriver\),type:r\.type,category:r\.category/);
 assert.match(js,/seq!==integrated\.vehicleRequest/);
 assert.match(js,/sourceItem:item/);
});
