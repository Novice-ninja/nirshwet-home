const test = require('node:test');
const assert = require('node:assert/strict');
const Controller = require('../tv/home-manager');
function setup() {
  const timers = new Map();
  const state = {enabled: true, bypass: false, launches: 0, fail: false, pending: null, closeLG: []};
  let sequence = 0;
  const controller = new Controller({
    enabled: () => state.enabled,
    consumeBypass: () => { const value = state.bypass; state.bypass = false; return value; },
    later: callback => { timers.set(++sequence, callback); return sequence; },
    clear: id => timers.delete(id),
    log: () => {},
    launch: (done, closeLG) => { state.launches++; state.closeLG.push(closeLG); if (state.hold) state.pending = done; else done(state.fail ? new Error('offline') : null); }
  });
  function tick() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); }
  return {controller, state, tick, timers};
}
test('startup and Home redirect, but ordinary app changes do not', () => {
  const {controller: c, state: s, tick} = setup();
  c.power('Active'); c.foreground('com.webos.app.home');
  assert.equal(s.launches, 0); tick(); assert.equal(s.launches, 1);
  c.foreground('netflix'); assert.equal(s.launches, 1);
  c.foreground('com.webos.app.home'); assert.equal(s.launches, 2);
});
test('explicit LG Home cancels pending startup and remains until leaving LG', () => {
  const {controller: c, state: s, tick} = setup();
  c.power('Active'); s.bypass = true; c.foreground('com.webos.app.home');
  tick(); c.foreground('com.webos.app.home'); assert.equal(s.launches, 0);
  c.foreground('youtube.leanback.v4'); c.foreground('com.webos.app.home'); assert.equal(s.launches, 1);
});
test('standby cancels pending launch and wake resets bypass', () => {
  const {controller: c, state: s, tick} = setup();
  c.power('Active'); c.power('Suspend'); tick(); assert.equal(s.launches, 0);
  s.bypass = true; c.foreground('com.webos.app.home');
  c.power('Active'); tick(); assert.equal(s.launches, 1);
  c.power('Active'); tick(); assert.equal(s.launches, 1);
});
test('three failed launches stop automatic redirects until restart', () => {
  const {controller: c, state: s, tick} = setup();
  s.fail = true; c.power('Active'); tick(); tick(); tick(); tick();
  assert.equal(s.launches, 3);
  assert.equal(c.available(), false);
  c.foreground('com.webos.app.home'); c.power('Suspend'); c.power('Active'); tick();
  assert.equal(s.launches, 3);
});
test('disable flag and stop prevent launches; in-flight calls are not duplicated', () => {
  const {controller: c, state: s, tick} = setup();
  s.enabled = false; c.power('Active'); tick(); assert.equal(s.launches, 0);
  s.enabled = true; s.hold = true; c.foreground('com.webos.app.home');
  c.foreground('com.webos.app.home'); assert.equal(s.launches, 1);
  s.pending(null); c.stop(); c.foreground('com.webos.app.home'); tick(); assert.equal(s.launches, 1);
});
test('failed Home redirect does not drag the viewer out of a new app', () => {
  const {controller: c, state: s, tick} = setup();
  c.power('Active'); tick(); s.fail = true;
  c.foreground('com.webos.app.home'); c.foreground('netflix'); tick();
  assert.equal(s.launches, 2);
});
test('physical Home launches directly once and cancels the startup timer', () => {
  const {controller: c, state: s, tick} = setup();
  c.power('Active'); c.foreground('netflix'); s.hold = true;
  c.home(); c.home(); tick();
  assert.equal(s.launches, 1);
  assert.deepEqual(s.closeLG, [false]);
  c.foreground('com.sofagoblin.home'); s.pending(null);
  c.home(); c.home(); tick();
  assert.equal(s.launches, 1);
});
test('physical Home can leave an intentional LG visit, but ignores standby and disable', () => {
  const {controller: c, state: s, tick} = setup();
  c.power('Active'); s.bypass = true; c.foreground('com.webos.app.home'); tick();
  assert.equal(s.launches, 0);
  c.home(); assert.equal(s.launches, 1); assert.deepEqual(s.closeLG, [true]);
  c.power('Suspend'); c.home(); tick(); assert.equal(s.launches, 1);
  c.power('Active'); s.enabled = false; c.home(); tick(); assert.equal(s.launches, 1);
});
test('a failed direct Home request does not retry after the viewer opens another app', () => {
  const {controller: c, state: s, tick} = setup();
  c.power('Active'); c.foreground('netflix'); s.fail = true; c.home();
  c.foreground('amazon'); tick();
  assert.equal(s.launches, 1);
});
test('Home routing uses one launch; LG fallback closes the overlay before that launch', () => {
  for (const closeLG of [false, true]) {
    const calls = []; let finished = false;
    Controller.launchHome((uri, payload, done) => { calls.push([uri.split('/').pop(), payload.id]); done(null); }, closeLG, error => {
      assert.equal(error, null); finished = true;
    });
    assert.deepEqual(calls, closeLG ? [['close', 'com.webos.app.home'], ['launch', 'com.sofagoblin.home']] : [['launch', 'com.sofagoblin.home']]);
    assert.equal(finished, true);
  }
});
test('an unclosable LG overlay still allows the single Home launch', () => {
  const calls = []; let finished = false;
  Controller.launchHome((uri, payload, done) => {
    calls.push(uri.split('/').pop());
    done(calls.length === 1 ? new Error('no app matched by pid') : null);
  }, true, error => { assert.equal(error, null); finished = true; });
  assert.deepEqual(calls, ['close', 'launch']);
  assert.equal(finished, true);
});
