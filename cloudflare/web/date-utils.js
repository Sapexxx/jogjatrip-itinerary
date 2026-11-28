/* Small, deterministic calendar-date helpers. No timezone-dependent parsing. */
(function(root){
'use strict';
function epoch(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return NaN;
 const [year,month,day]=value.split('-').map(Number);
 const time=Date.UTC(year,month-1,day);
 const d=new Date(time);
 return d.getUTCFullYear()===year&&d.getUTCMonth()+1===month&&d.getUTCDate()===day?time:NaN;
}
function addDays(value,n){
 const t=epoch(value);
 if(!Number.isFinite(t)||!Number.isInteger(n))return null;
 return new Date(t+n*86400000).toISOString().slice(0,10);
}
function nightsBetween(start,end){
 const a=epoch(start),b=epoch(end);
 return Number.isFinite(a)&&Number.isFinite(b)&&b>a?(b-a)/86400000:null;
}
function inclusiveDays(start,end){
 const a=epoch(start),b=epoch(end);
 return Number.isFinite(a)&&Number.isFinite(b)&&b>=a?(b-a)/86400000+1:null;
}
function rentalValid(start,end){const d=inclusiveDays(start,end);return Number.isInteger(d)&&d>=1&&d<=30}
root.JTUXDates=Object.freeze({addDays,nightsBetween,inclusiveDays,rentalValid});
})(typeof window==='undefined'?globalThis:window);
