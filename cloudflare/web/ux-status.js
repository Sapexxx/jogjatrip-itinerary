/* Maps only returned, verified states to user-facing language. Never guesses payment. */
(function(root){
'use strict';
const reservations=Object.freeze({awaiting_payment:'Ditahan, menunggu konfirmasi',reserved:'Terkonfirmasi',cancelled:'Dibatalkan',expired:'Masa penahanan berakhir'});
const payments=Object.freeze({unpaid:'Belum dibayar (simulasi)',paid:'Dibayar (simulasi)',refunded:'Dikembalikan (simulasi)',partially_refunded:'Sebagian dikembalikan (simulasi)',expired:'Pembayaran kedaluwarsa',not_applicable:'Tidak ada pembayaran'});
const local=Object.freeze({DRAFT:'Draft, belum memesan',IN_FLIGHT:'Sedang diproses, jangan kirim ulang',UNKNOWN:'Hasil belum pasti; jangan checkout ulang',AWAITING_CONFIRMATION:'Menunggu konfirmasi penyedia',CONFIRMED:'Terkonfirmasi',PARTIAL:'Sebagian berhasil; jangan batalkan yang sudah terkonfirmasi',COMPENSATED:'Penahanan dilepas; periksa status tiap penyedia',BLOCKED:'Tidak dapat dilanjutkan'});
function reservation(value){return reservations[value]||'Status reservasi belum diketahui'}
function payment(value){return payments[value]||'Status pembayaran belum diketahui'}
function journal(value){return local[value]||'Status sedang diperbarui'}
function item(row){
 if(!row||typeof row!=='object')return 'Data komponen belum tersedia';
 const provider=typeof row.provider==='string'?row.provider:'Penyedia';
 return provider+': reservasi '+reservation(row.reservationState)+', pembayaran '+payment(row.paymentState);
}
root.JTUXStatus=Object.freeze({reservation,payment,journal,item});
})(typeof window==='undefined'?globalThis:window);
