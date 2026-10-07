// Runs before the page paints. The home page arrives with the marketing
// page already in its HTML (scripts/prerender.mjs); someone who has used
// the app before gets their own overview instead, so keep that text
// hidden for the moment the app takes to load.
try {
  if (
    localStorage.getItem('aot_onboarding_completed') === 'true' ||
    localStorage.getItem('has_completed_onboarding') === 'true' ||
    localStorage.getItem('aot_calendar_connected') === 'true'
  ) {
    document.documentElement.classList.add('aot-returning');
  }
} catch (e) {
  // storage blocked: show the page as is
}
