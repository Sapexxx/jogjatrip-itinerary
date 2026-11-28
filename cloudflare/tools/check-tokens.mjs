/* No new component or page CSS hex literals; palette remains in tokens.css. */
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const base=fileURLToPath(new URL('../web/',import.meta.url));
const paths=['components.css','layout.css','accessibility.css',...readdirSync(join(base,'pages')).filter(x=>x.endsWith('.css')).map(x=>'pages/'+x)];
let bad=0;
for(const path of paths){
 const text=readFileSync(join(base,path),'utf8');
 const colors=[...text.matchAll(/#[a-fA-F0-9]{3,8}\b/g)];
 if(colors.length){console.error(path+': '+colors.map(x=>x[0]).join(', '));bad+=colors.length}
}
if(bad){console.error('Use existing color tokens instead of new literal hex colors.');process.exitCode=1}
else console.log('UX CSS token check passed ('+paths.length+' stylesheets; palette untouched).');
