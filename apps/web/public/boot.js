// Start-up safety net, loaded async so it never holds the page up. If the app hasn't rendered over its placeholder
// (index.html) after a few seconds, it says why on screen: an error before render, the last start-up step reached
// (main.tsx marks each on <html data-boot>), and whether the page's own files are in the service worker's cache. It
// also keeps its own short log in localStorage (storyshelf.bootlog), shown under Settings > Player log, so a launch
// where the app never starts still leaves a trace. Built for the installed app on a phone. Plain ES5, no modules.
(function () {
  var KEY = 'storyshelf.bootlog';
  var errors = (window.__bootErrors = []);
  function keep(ev, detail) {
    try {
      var list = JSON.parse(localStorage.getItem(KEY) || '[]');
      list.push({ t: new Date().toISOString(), ev: ev, detail: detail });
      localStorage.setItem(KEY, JSON.stringify(list.slice(-40)));
    } catch (e) {
      // Storage blocked: the screen still says it.
    }
  }
  function show(text) {
    var el = document.getElementById('boot-detail');
    if (el) el.textContent = text;
  }
  function record(msg) {
    var text = String(msg).slice(0, 300);
    errors.push(text);
    keep('error', text);
    if (document.getElementById('boot')) show('Error: ' + text);
  }
  var sw = navigator.serviceWorker;
  keep('page loaded', {
    online: navigator.onLine,
    sw: !!(sw && sw.controller),
    boot: document.documentElement.getAttribute('data-boot'),
  });
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
  // The page's own files: is each in the service worker's cache?
  function cacheCheck(done) {
    if (!window.caches) return done('no Cache Storage');
    var urls = [];
    var i;
    var nodes = document.querySelectorAll('script[src], link[rel="stylesheet"], link[rel="modulepreload"]');
    for (i = 0; i < nodes.length; i++) urls.push((nodes[i].src || nodes[i].href).replace(location.origin, ''));
    var results = [];
    var left = urls.length;
    if (!left) return done('no files listed');
    urls.forEach(function (u) {
      caches
        .match(u, { ignoreSearch: true })
        .then(
          function (r) {
            results.push(u + ' ' + (r ? 'cached' : 'NOT cached'));
          },
          function (e) {
            results.push(u + ' check failed: ' + e);
          }
        )
        .then(function () {
          if (--left === 0) done(results.join('; '));
        });
    });
  }
  setTimeout(function () {
    if (!document.getElementById('boot')) return keep('rendered in time'); // the app rendered
    var step = document.documentElement.getAttribute('data-boot') || 'the app script has not started';
    var state = sw && sw.controller ? sw.controller.state : 'none';
    var last = errors.length ? 'Error: ' + errors[errors.length - 1] + '. ' : '';
    var text =
      last + 'Last step: ' + step + '. Browser online: ' + navigator.onLine + '. Service worker: ' + state + '.';
    show(text);
    keep('stuck', text);
    cacheCheck(function (files) {
      keep('files', files);
      if (document.getElementById('boot')) show(text + ' Files: ' + files);
    });
  }, 4000);
})();
