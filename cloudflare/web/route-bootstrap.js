// Run before body parsing to prevent first-paint flash of the wrong SPA page.
(() => {
 const match=/^#\/(beranda|paket|pilihan|itinerary|pesanan)(?:\/hari-([1-9]|1[0-6]))?$/.exec(location.hash);
 const routes={beranda:'explore',paket:'packages',pilihan:'planner',itinerary:'journey',pesanan:'orders'};
 const page=match&&(!match[2]||match[1]==='itinerary')?routes[match[1]]:'explore';
 document.documentElement.dataset.initialPage=page;
})();
