(function () {
  'use strict';
  var files = Array.isArray(window.HOME_PHOTOS) ? window.HOME_PHOTOS.filter(function (file) {
    return typeof file === 'string' && /^photos\/[a-z0-9_-]+\.jpg$/.test(file);
  }).slice(0, 24) : [];
  var background = document.getElementById('photo-background');
  var button = document.getElementById('photos');
  var layers = [document.getElementById('photo-a'), document.getElementById('photo-b')];
  var enabled = true;
  var current = -1;
  var next = 0;
  var failures = 0;
  var timer = null;
  var loading = false;
  var unavailable = false;
  var storageKey = 'sofa-goblin.photos';
  try { enabled = localStorage.getItem(storageKey) !== 'off'; } catch (ignored) {}
  function label() { button.textContent = unavailable ? 'Photos: unavailable' : 'Photos: ' + (enabled ? 'On' : 'Off'); }
  function stop() { clearTimeout(timer); timer = null; }
  function schedule() {
    stop();
    if (enabled && !document.hidden && files.length > 1 && !unavailable) timer = setTimeout(advance, 30000);
  }
  function advance() {
    if (loading || !enabled || document.hidden || !files.length || unavailable) return;
    loading = true;
    var target = current === 0 ? 1 : 0;
    var image = layers[target];
    var source = files[next % files.length];
    next++;
    image.onload = function () {
      loading = false;
      image.onload = image.onerror = null;
      failures = 0;
      if (!enabled || document.hidden) { image.removeAttribute('src'); return; }
      image.classList.add('visible');
      if (current >= 0) layers[current].classList.remove('visible');
      current = target;
      background.hidden = false;
      schedule();
    };
    image.onerror = function () {
      loading = false;
      image.onload = image.onerror = null;
      image.removeAttribute('src');
      failures++;
      if (failures >= files.length) { unavailable = true; label(); stop(); return; }
      if (enabled && !document.hidden) timer = setTimeout(advance, 1000);
    };
    image.src = source;
  }
  function suspend() {
    stop();
    loading = false;
    layers.forEach(function (image) {
      image.onload = image.onerror = null;
      image.removeAttribute('src');
      image.classList.remove('visible');
    });
    current = -1;
    background.hidden = true;
  }
  button.addEventListener('click', function () {
    enabled = !enabled;
    unavailable = false;
    failures = 0;
    try { localStorage.setItem(storageKey, enabled ? 'on' : 'off'); } catch (ignored) {}
    label();
    if (enabled) advance(); else suspend();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) suspend(); else if (enabled) advance();
  });
  if (files.length) { button.hidden = false; label(); if (enabled) advance(); }
}());
