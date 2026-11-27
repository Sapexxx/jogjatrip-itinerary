// Keep the checkout safety guard without displaying a permanent preview banner.
// The backend remains the authority: BOOKING_ENABLED=false blocks booking APIs.
(async () => {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    if (!response.ok) return;
    const health = await response.json();
    window.JTInteropI5Mounted?.setPreparationEnabled(health.interopPreparationEnabled===true);
    if (health.bookingEnabled !== false) return;

    document.addEventListener('click', (event) => {
      const button = event.target.closest?.('#bookBtn, #ibBook, #packageBookBtn');
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      alert('Checkout belum tersedia. Anda tetap dapat menjelajahi katalog, menyusun itinerary, dan memeriksa harga.');
    }, true);
  } catch {
    // A health-check error does not prevent other UI actions.
    // Booking is always authorized independently by the Worker backend.
  }
})();
