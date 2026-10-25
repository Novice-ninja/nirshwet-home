'use strict';
// webOS 6 ships Node 8. Keep this TV-side module compatible with it.
var spawn = require('child_process').spawn;

function request(uri, payload, callback, subscription) {
  var child = spawn('/usr/bin/luna-send', [subscription ? '-i' : '-n', subscription ? uri : '1']
    .concat(subscription ? [JSON.stringify(payload)] : [uri, JSON.stringify(payload)]),
  {stdio: ['pipe', 'pipe', 'pipe']});
  // Keep stdin open: this firmware exits luna-send immediately on stdin EOF.
  var buffer = '', finished = false, timer;
  function finish(error, value) {
    if (finished) return;
    if (!subscription || error) {
      finished = true;
      clearTimeout(timer);
      child.kill();
    }
    callback(error, value);
  }
  child.stdout.on('data', function (chunk) {
    buffer += chunk.toString();
    var newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      var line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      try {
        var value = JSON.parse(line);
        if (value.returnValue === false) finish(new Error(value.errorText || 'Luna request failed'));
        else finish(null, value);
      } catch (error) { finish(error); }
    }
    if (buffer.length > 1024 * 1024) finish(new Error('Oversized Luna response'));
  });
  child.stderr.on('data', function () {});
  child.on('error', function (error) { finish(error); });
  child.on('close', function () { finish(new Error('Luna connection closed')); });
  if (!subscription) timer = setTimeout(function () { finish(new Error('Luna request timed out')); }, 7000);
  return function () { finished = true; clearTimeout(timer); child.kill(); };
}
module.exports = request;

if (require.main === module) {
  request(process.argv[2], JSON.parse(process.argv[3] || '{}'), function (error, value) {
    if (error) { console.error(error.message); process.exitCode = 1; }
    else console.log(JSON.stringify(value));
  });
}
