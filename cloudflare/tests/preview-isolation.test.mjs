import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(fs.readFileSync(path.join(root,'wrangler.jsonc'),'utf8'));
test('preview D1 must differ from production and all mutation flags must be false',()=>{
 assert.equal(config.name,'jogjatrip-itinerary');
 assert.equal(config.vars.BOOKING_ENABLED,'false');
 const prod=config.d1_databases?.find(x=>x.binding==='DB');
 const preview=config.previews?.d1_databases?.find(x=>x.binding==='DB');
 assert.ok(prod?.database_id&&preview?.database_id);
 assert.notEqual(prod.database_id,preview.database_id);
 assert.equal(preview.database_name,'jogjatrip-preview-db');
 for(const key of ['BOOKING_ENABLED','INTEROP_HOLDS','INTEROP_PREPARE_ENABLED'])assert.equal(config.previews.vars?.[key],'false',key);
 for(const key of ['HOTEL_API_URL','WISATA_API_URL','TRANSPORT_API_URL'])assert.equal(config.previews.vars?.[key],'https://example.invalid',key);
});
