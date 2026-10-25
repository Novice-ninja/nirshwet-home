'use strict';
var fs = require('fs');
var luna = require('./luna');
var APP = 'com.sofagoblin.home';
var LG = 'com.webos.app.home';
var ENABLED = '/var/lib/sofa-goblin/enabled';
var BYPASS = '/tmp/sofa-goblin-allow-lg-home';
var LOG = '/tmp/sofa-goblin.log';

// Event-driven policy, separated from TV I/O so the recovery paths can be tested.
function Controller(io) {
  var active = false, seenPower = false, booted = false, bypass = false;
  var foreground = '', busy = false, failures = 0, stopped = false, timer;
  function schedule(reason, delay, expectedForeground) {
    io.clear(timer);
    timer = io.later(function () {
      if (expectedForeground && foreground !== expectedForeground) return;
      booted = true;
      redirect(reason);
    }, delay);
  }
  function redirect(reason) {
    if (stopped || busy || !active || bypass || !io.enabled()) return;
    if (reason === 'Home' && foreground !== LG) return;
    var source = foreground;
    busy = true;
    io.launch(function (error) {
      busy = false;
      if (stopped) return;
      if (error) {
        failures++;
        io.log('Launch failed: ' + error.message);
        if (failures >= 3) {
          stopped = true;
          io.clear(timer);
          io.log('Automatic launching paused for this boot; LG Home remains available.');
        } else schedule(reason, 2000, source);
      } else { failures = 0; io.log('Opened Sofa Goblin (' + reason + ').'); }
    }, foreground === LG);
  }
  this.power = function (state) {
    var wasActive = active;
    active = state === 'Active';
    if (!active) { io.clear(timer); bypass = false; }
    else if (!seenPower || !wasActive) {
      bypass = false;
      schedule(seenPower ? 'wake' : 'startup', seenPower ? 1500 : 6000);
    }
    seenPower = true;
  };
  this.foreground = function (id) {
    foreground = id;
    if (id !== LG) { bypass = false; return; }
    if (io.consumeBypass()) { bypass = true; booted = true; io.clear(timer); io.log('Allowed explicit LG Home visit.'); }
    if (!bypass && booted) redirect('Home');
  };
  this.home = function () {
    if (stopped || !active || !io.enabled()) return;
    bypass = false;
    booted = true;
    io.clear(timer);
    if (foreground !== APP) redirect('remote Home');
  };
  this.stop = function () { stopped = true; io.clear(timer); };
  this.available = function () { return !stopped && io.enabled(); };
}
module.exports = Controller;

// Close an existing LG overlay before opening our app, never launch-close-launch.
function launchHome(request, closeLG, done) {
  function open() { request('luna://com.webos.applicationManager/launch', {id: APP}, done); }
  // On this TV LG Home sometimes has no closable process. Opening our app
  // must still proceed; an absent overlay is not a failed Home request.
  if (closeLG) request('luna://com.webos.applicationManager/close', {id: LG}, open);
  else open();
}
module.exports.launchHome = launchHome;

if (require.main === module) {
  var cancellations = {}, restartTimers = {}, exiting = false;
  var guardContext = {appId: '', active: false, session: String(Date.now()), updatedAt: 0};
  function publishGuardContext() {
    guardContext.updatedAt = Date.now();
    guardContext.homeRouting = !exiting && controller.available();
    guardContext.managerPid = process.pid;
    try {
      fs.writeFileSync('/tmp/sofa-goblin-guard-context.json.new', JSON.stringify(guardContext), {mode: 384});
      fs.renameSync('/tmp/sofa-goblin-guard-context.json.new', '/tmp/sofa-goblin-guard-context.json');
    } catch (ignored) { /* The remote filter passes buttons normally when context is stale. */ }
  }
  var contextHeartbeat = setInterval(publishGuardContext, 2000);
  function log(message) {
    try {
      if (fs.existsSync(LOG) && fs.statSync(LOG).size > 131072) fs.renameSync(LOG, LOG + '.1');
      fs.appendFileSync(LOG, new Date().toISOString() + ' ' + message + '\n', {mode: 384});
    } catch (ignored) {}
  }
  function allowLG() {
    try {
      var recent = Date.now() - fs.statSync(BYPASS).mtime.getTime() < 15000;
      fs.unlinkSync(BYPASS);
      return recent;
    } catch (ignored) { return false; }
  }
  var controller = new Controller({
    enabled: function () { return fs.existsSync(ENABLED); },
    consumeBypass: allowLG,
    later: setTimeout,
    clear: clearTimeout,
    log: log,
    launch: function (done, closeLG) { launchHome(luna, closeLG, done); }
  });
  // The physical filter requests Home without sending LG's native Home key.
  // Advertise support in the heartbeat only after this handler is registered.
  process.on('SIGUSR2', function () { controller.home(); });
  function subscribe(uri, handle, delay) {
    if (exiting) return;
    var cancel = luna(uri, {subscribe: true}, function (error, value) {
      if (error) {
        if (exiting) return;
        log('Subscription reconnect: ' + error.message);
        restartTimers[uri] = setTimeout(function () { subscribe(uri, handle, Math.min(delay * 2, 30000)); }, delay);
      } else handle(value);
    }, true);
    cancellations[uri] = cancel;
  }
  fs.writeFileSync('/tmp/sofa-goblin.pid', String(process.pid), {mode: 384});
  log('Home manager started.');
  subscribe('luna://com.webos.applicationManager/getForegroundAppInfo', function (value) {
    if (value.appId) {
      if (guardContext.appId !== value.appId) guardContext.session = String(Date.now());
      guardContext.appId = value.appId;
      publishGuardContext();
      controller.foreground(value.appId);
    }
  }, 2000);
  subscribe('luna://com.webos.service.tvpower/power/getPowerState', function (value) {
    if (value.state) {
      if (guardContext.active !== (value.state === 'Active')) guardContext.session = String(Date.now());
      guardContext.active = value.state === 'Active';
      publishGuardContext();
      controller.power(value.state);
    }
  }, 2000);
  function stop() {
    if (exiting) return;
    exiting = true;
    controller.stop();
    clearInterval(contextHeartbeat);
    guardContext.active = false;
    publishGuardContext();
    Object.keys(cancellations).forEach(function (uri) { cancellations[uri](); });
    Object.keys(restartTimers).forEach(function (uri) { clearTimeout(restartTimers[uri]); });
    try { fs.unlinkSync('/tmp/sofa-goblin.pid'); } catch (ignored) {}
    log('Home manager stopped.');
    setTimeout(function () { process.exit(0); }, 100);
  }
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
