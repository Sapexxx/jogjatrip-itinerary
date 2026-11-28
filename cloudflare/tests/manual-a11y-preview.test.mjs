import test from 'node:test';import assert from 'node:assert/strict';
import {createPreviewServer} from '../tools/manual-a11y-preview.mjs';
test('manual accessibility preview is synthetic and fail-closed on all mutations',async()=>{
 const server=createPreviewServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const health=await(await fetch(base+'/api/health')).json();
  assert.equal(health.bookingEnabled,false);
  assert.equal(health.interopPreparationEnabled,false);
  const hotels=await(await fetch(base+'/api/hotels')).json();
  assert.equal(hotels.items[0].hotelId,'H1');
  const html=await fetch(base+'/');
  assert.equal(html.status,200);
  assert.match(await html.text(),/id="ibPeople"/);
  for(const path of ['/api/book','/api/interop/prepare','/api/quote','/api/itineraries/fixture/sync']){
   const result=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
   assert.equal(result.status,403,path);
  }
  assert.equal((await fetch(base+'/api/interop/saga')).status,404);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
