// Start-up safety net, run before the app's own script. If the app hasn't rendered over its placeholder (index.html)
// after a few seconds, it says why: an error before render, or the last start-up step reached (main.tsx marks each on
// <html data-boot>). Built for the installed app on a phone, where there is no inspector. Plain ES5, no modules.
(function () {
  var errors = (window.__bootErrors = []);
  function show(text) {
    var el = document.getElementById('boot-detail');
    if (el) el.textContent = text;
  }
  function record(msg) {
    var text = String(msg).slice(0, 300);
    errors.push({ t: new Date().toISOString(), msg: text });
    show('Error: ' + text);
  }
  // Capture phase: a script or stylesheet that failed to load reports here too.
  addEventListener(
    'error',
    function (e) {
      var t = e.target;
      var what = e.message || (t && (t.src || t.href) ? 'could not load ' + (t.src || t.href) : 'error');
      record(what + (e.filename ? ' (' + e.filename + ':' + e.lineno + ')' : ''));
    },
    true
  );
  addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    record(r && r.name ? r.name + ': ' + r.message : r);
  });
  setTimeout(function () {
    if (!document.getElementById('boot')) return; // the app rendered
    var step = document.documentElement.getAttribute('data-boot') || 'the page loaded, the app script did not start';
    var sw = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
    var last = errors.length ? 'Error: ' + errors[errors.length - 1].msg + '. ' : '';
    show(last + 'Last step: ' + step + '. Browser online: ' + navigator.onLine + '. Service worker: ' + sw + '.');
  }, 6000);
})();
