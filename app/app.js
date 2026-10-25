(function () {
  'use strict';
  var catalog = [
    { key: 'youtube', id: 'youtube.leanback.v4', title: 'YouTube', logo: 'logos/youtube.png' },
    { key: 'netflix', id: 'netflix', title: 'Netflix', logo: 'logos/netflix.svg' },
    { key: 'prime', id: 'amazon', title: 'Prime Video', logo: 'logos/prime.png' },
    { key: 'disney', id: 'com.disney.disneyplus-prod', title: 'Disney+', logo: 'logos/disney.png' },
    { key: 'tubi', id: 'com.tubitv.ott.tubi', title: 'Tubi', logo: 'logos/tubi.png' }
  ];
  var storageKey = 'sofa-goblin.v1';
  var apps = catalog.slice();
  var last = catalog[0].key;
  var selected = last;
  var arranging = false;
  var originalOrder = null;
  var dialogOpen = false;
  var returnFocus = null;
  var launching = false;
  var launchToken = 0;
  var toastTimer;
  var clockTimer;
  var guardStatus = null;
  var guardBusy = false;
  var guardButton = document.getElementById('remote-guard');
  var appRow = document.getElementById('apps');
  var main = document.getElementById('home');
  var overlay = document.getElementById('overlay');
  var actions = document.getElementById('dialog-actions');
  var note = document.getElementById('section-note');
  var hint = document.getElementById('selection-hint');

  try {
    var saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && Array.isArray(saved.order)) {
      var ordered = [];
      saved.order.forEach(function (key) {
        var app = catalog.filter(function (item) { return item.key === key; })[0];
        if (app && ordered.indexOf(app) === -1) ordered.push(app);
      });
      apps = ordered.concat(catalog.filter(function (item) { return ordered.indexOf(item) === -1; }));
    }
    if (saved && catalog.some(function (item) { return item.key === saved.last; })) last = saved.last;
  } catch (ignored) { /* Missing or damaged preferences use the defaults. */ }

  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({order: apps.map(function (app) { return app.key; }), last: last}));
      return true;
    } catch (ignored) { toast('Storage is unavailable. Changes will last until Sofa Goblin closes.'); return false; }
  }
  function toast(text) {
    var el = document.getElementById('toast');
    clearTimeout(toastTimer);
    el.textContent = text;
    el.hidden = false;
    toastTimer = setTimeout(function () { el.hidden = true; }, 5000);
  }
  function renderApps(focusKey) {
    appRow.textContent = '';
    apps.forEach(function (app) {
      var button = document.createElement('button');
      button.className = 'app-tile';
      button.setAttribute('data-app', app.key);
      button.setAttribute('data-row', '0');
      button.setAttribute('aria-label', app.title);
      var logo = document.createElement('img');
      logo.className = 'brand-logo';
      logo.src = app.logo;
      logo.alt = '';
      logo.draggable = false;
      button.appendChild(logo);
      button.addEventListener('focus', function () {
        selected = app.key;
        document.getElementById('selected-title').textContent = app.title;
      });
      button.addEventListener('click', function () {
        button.focus();
        if (arranging) finishArrange(true); else launch(app.id, app.title, app.key);
      });
      appRow.appendChild(button);
    });
    if (focusKey) focusApp(focusKey);
  }
  function focusApp(key) {
    var button = appRow.querySelector('[data-app="' + key + '"]') || appRow.firstElementChild;
    button.focus();
  }
  function launch(id, title, key) {
    if (launching) return;
    if (!window.TV.isTV()) { toast('Preview: ' + title + ' opens on the TV after installation.'); return; }
    launching = true;
    var token = ++launchToken;
    appRow.classList.add('busy');
    toast('Opening ' + title + '…');
    window.TV.launch(id).then(function () {
      if (key) { last = key; persist(); }
      if (token === launchToken) clearLaunch();
    }, function (error) {
      if (token !== launchToken) return;
      clearLaunch();
      toast('Couldn’t open ' + title + '. ' + error.message);
    });
  }
  function clearLaunch() { launching = false; appRow.classList.remove('busy'); }
  function openDialog(title, text, choices) {
    if (dialogOpen) return;
    returnFocus = document.activeElement;
    dialogOpen = true;
    main.setAttribute('aria-hidden', 'true');
    document.getElementById('dialog-title').textContent = title;
    document.getElementById('dialog-text').textContent = text;
    actions.textContent = '';
    choices.forEach(function (choice) {
      var button = document.createElement('button');
      button.textContent = choice.label;
      button.addEventListener('click', function () { closeDialog(); choice.action(); });
      actions.appendChild(button);
    });
    overlay.hidden = false;
    actions.firstElementChild.focus();
  }
  function closeDialog() {
    overlay.hidden = true;
    dialogOpen = false;
    main.removeAttribute('aria-hidden');
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus(); else focusApp(last);
  }
  function confirmHome() {
    openDialog('Leave Sofa Goblin?', 'Open the original LG Home screen?', [
      {label: 'Stay here', action: function () {}},
      {label: 'Open LG Home', action: function () { launch('com.webos.app.home', 'LG Home'); }}
    ]);
  }
  function refreshGuard() {
    if (!window.TV.isTV()) return;
    window.TV.guard('status').then(function (status) {
      guardStatus = status;
      guardButton.textContent = status.enabled ? (status.running ? 'Guard: On' : 'Guard: Paused') : 'Guard: Off';
    }, function () { guardStatus = null; guardButton.textContent = 'Remote guard'; });
  }
  function changeGuard(action) {
    if (guardBusy) return;
    guardBusy = true;
    window.TV.guard(action).then(function (status) {
      guardBusy = false;
      guardStatus = status;
      refreshGuard();
      toast(action === 'off' ? 'Remote guard off. All buttons work normally.' :
        (status.running ? 'Remote guard on. Press protected buttons twice.' : 'The guard could not start. Your remote works normally.'));
    }, function (error) { guardBusy = false; toast('Couldn’t change the remote guard. ' + error.message); refreshGuard(); });
  }
  guardButton.addEventListener('click', function () {
    if (guardBusy) return;
    if (!window.TV.isTV()) { toast('Preview: remote protection runs on the TV.'); return; }
    if (!guardStatus) { refreshGuard(); toast('Checking remote protection. Please try again.'); return; }
    var on = guardStatus.enabled && guardStatus.running;
    openDialog('Remote guard', 'In your streaming apps, press Back, Source/Input, Exit, Home, or an app shortcut twice within 2 seconds. Arrows, OK, volume, and power work normally.', [
      {label: 'Keep ' + (on ? 'on' : 'off'), action: function () {}},
      {label: on ? 'Turn off' : 'Turn on', action: function () { changeGuard(on ? 'off' : 'on'); }}
    ]);
  });
  refreshGuard();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshGuard(); });
  function startArrange() {
    if (arranging) return;
    arranging = true;
    originalOrder = apps.slice();
    main.classList.add('arranging');
    Array.prototype.forEach.call(main.querySelectorAll('.utility'), function (button) { button.disabled = true; });
    note.textContent = 'Move with ← → · OK to save · Back to cancel';
    note.hidden = false;
    hint.textContent = 'Move this app left or right';
    focusApp(selected);
  }
  function finishArrange(save) {
    var focused = document.activeElement.getAttribute('data-app') || last;
    if (!save) apps = originalOrder.slice();
    arranging = false;
    originalOrder = null;
    main.classList.remove('arranging');
    Array.prototype.forEach.call(main.querySelectorAll('.utility'), function (button) { button.disabled = false; });
    note.textContent = '';
    note.hidden = true;
    hint.textContent = 'Press OK to open';
    renderApps(focused);
    if (save) { if (persist()) toast('App order saved.'); } else toast('Order unchanged.');
  }
  function moveInRow(delta) {
    var el = document.activeElement;
    var row = el.getAttribute('data-row') || '0';
    var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-row="' + row + '"]:not([hidden])'));
    var index = buttons.indexOf(el);
    if (index < 0) index = 0;
    var next = Math.max(0, Math.min(buttons.length - 1, index + delta));
    if (arranging) {
      if (next === index) return;
      var app = apps.splice(index, 1)[0];
      apps.splice(next, 0, app);
      renderApps(app.key);
    } else buttons[next].focus();
  }
  document.getElementById('arrange').addEventListener('click', startArrange);
  document.getElementById('settings').addEventListener('click', function () { launch('com.palm.app.settings', 'TV settings'); });
  document.getElementById('lg-home').addEventListener('click', confirmHome);
  document.addEventListener('keydown', function (event) {
    var code = event.keyCode;
    var back = code === 461 || code === 27 || code === 8;
    if ([37,38,39,40,13,32,9].indexOf(code) === -1 && !back) return;
    event.preventDefault();
    if (dialogOpen) {
      var buttons = Array.prototype.slice.call(actions.children);
      var index = buttons.indexOf(document.activeElement);
      if (back) { if (!event.repeat) closeDialog(); return; }
      if (code === 13 || code === 32) { if (!event.repeat) document.activeElement.click(); return; }
      var delta = code === 37 || code === 38 || (code === 9 && event.shiftKey) ? -1 : 1;
      buttons[(index + delta + buttons.length) % buttons.length].focus();
      return;
    }
    if (back) {
      if (event.repeat) return;
      if (arranging) finishArrange(false); else confirmHome();
      return;
    }
    if (code === 13 || code === 32) {
      if (!event.repeat && document.activeElement.tagName === 'BUTTON') document.activeElement.click();
      return;
    }
    if (code === 37 || code === 39) { moveInRow(code === 37 ? -1 : 1); return; }
    if (arranging) return;
    if (code === 40) { document.getElementById('arrange').focus(); return; }
    if (code === 38) { focusApp(selected); return; }
    if (code === 9) {
      var all = Array.prototype.slice.call(main.querySelectorAll('button:not([hidden])'));
      var current = all.indexOf(document.activeElement);
      all[(current + (event.shiftKey ? -1 : 1) + all.length) % all.length].focus();
    }
  });
  function updateClock() {
    var now = new Date();
    document.getElementById('clock').textContent = now.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
    document.getElementById('date').textContent = now.toLocaleDateString([], {weekday: 'short', month: 'short', day: 'numeric'});
  }
  function foreground() {
    ++launchToken;
    clearLaunch();
    if (arranging) finishArrange(false);
    if (dialogOpen) closeDialog();
    clearTimeout(toastTimer);
    document.getElementById('toast').hidden = true;
    updateClock();
    clearInterval(clockTimer);
    clockTimer = setInterval(updateClock, 30000);
    focusApp(last);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) clearInterval(clockTimer); else foreground();
  });
  document.addEventListener('webOSRelaunch', foreground);
  window.addEventListener('focus', function () {
    if (document.activeElement === document.body) {
      if (dialogOpen) actions.firstElementChild.focus(); else focusApp(selected);
    }
  });
  renderApps();
  foreground();
}());
