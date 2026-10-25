(function () {
  'use strict';
  var activeBridges = [];
  function isTV() { return typeof window.PalmServiceBridge === 'function'; }
  function call(uri, payload) {
    return new Promise(function (resolve, reject) {
      if (!isTV()) { reject(new Error('TV connection unavailable')); return; }
      var bridge = new window.PalmServiceBridge();
      activeBridges.push(bridge);
      var finished = false;
      var timer = setTimeout(function () { finish(new Error('The TV did not respond. Please try again.')); }, 7000);
      function finish(error, data) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        activeBridges = activeBridges.filter(function (item) { return item !== bridge; });
        try { if (bridge.cancel) bridge.cancel(); } catch (ignored) { /* Already closed. */ }
        if (error) reject(error); else resolve(data);
      }
      bridge.onservicecallback = function (message) {
        var data;
        try { data = JSON.parse(message); } catch (error) { finish(new Error('Unexpected response from the TV.')); return; }
        if (!data || data.returnValue !== true) {
          finish(new Error(data && data.errorText ? data.errorText : 'The TV could not open this app.'));
        } else finish(null, data);
      };
      try { bridge.call(uri, JSON.stringify(payload)); } catch (error) { finish(error); }
    });
  }
  window.TV = {
    isTV: isTV,
    guard: function (action) {
      if (['status', 'on', 'off'].indexOf(action) === -1) return Promise.reject(new Error('Invalid guard action'));
      return call('luna://org.webosbrew.hbchannel.service/exec', {
        command: '/bin/sh /var/lib/sofa-goblin/guard-control.sh ' + action
      }).then(function (result) {
        var status = JSON.parse(result.stdoutString);
        if (typeof status.enabled !== 'boolean' || typeof status.running !== 'boolean') throw new Error('Guard status unavailable');
        return status;
      });
    },
    launch: function (id) {
      function open() { return call('luna://com.webos.applicationManager/launch', { id: id, params: {} }); }
      if (id !== 'com.webos.app.home') return open();
      // A deliberate LG Home visit must bypass the rooted Home-button watcher.
      // On an ordinary developer install, the unavailable helper falls back to LG.
      return call('luna://org.webosbrew.hbchannel.service/exec', {
        command: 'touch /tmp/sofa-goblin-allow-lg-home'
      }).then(open, open);
    }
  };
}());
