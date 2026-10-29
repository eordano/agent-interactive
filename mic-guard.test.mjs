import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const { createMicGuard } = createRequire(import.meta.url)("./mic-guard.js");

test("a silent microphone warns ten seconds before the silence window and then stops", () => {
  const g = createMicGuard({ silenceSec: 45, maxMin: 10 });
  g.start(0);
  assert.equal(g.tick(1000).state, "live");
  assert.equal(g.tick(34_000).state, "live");
  const w = g.tick(36_000);
  assert.equal(w.state, "warning");
  assert.match(w.why, /nobody is speaking: stopping in 9 s/);
  const s = g.tick(45_000);
  assert.equal(s.state, "stop");
  assert.equal(s.reason, "silence");
  assert.match(s.why, /45 s of silence/);
  assert.equal(g.tick(60_000).state, "stop", "a stopped guard stays stopped");
});

test("speech resets the silence window, and an open turn never counts as silence", () => {
  const g = createMicGuard({ silenceSec: 45, maxMin: 10 });
  g.start(0);
  g.speech(40_000);
  assert.equal(g.tick(80_000).state, "live", "speaking since 40 s: no silence yet");
  g.speechEnd(81_000);
  assert.equal(g.tick(110_000).state, "live");
  assert.equal(g.tick(117_000).state, "warning");
  g.speech(118_000); g.speechEnd(119_000);
  assert.equal(g.tick(150_000).state, "live", "the window restarted at the last speech end");
  assert.equal(g.tick(164_500).state, "stop");
});

test("the session cap stops a microphone that is still hearing speech", () => {
  const g = createMicGuard({ silenceSec: 45, maxMin: 10 });
  g.start(0);
  for (let t = 0; t <= 600_000; t += 20_000) { g.speech(t); g.speechEnd(t + 5000); }
  const w = g.tick(592_000);
  assert.equal(w.state, "warning");
  assert.match(w.why, /session limit/);
  const s = g.tick(600_000);
  assert.equal(s.reason, "cap");
  assert.match(s.why, /10 min/);
});

test("settings are clamped to sane minimums", () => {
  const g = createMicGuard({ silenceSec: 1, maxMin: 0.1 });
  assert.deepEqual(g.settings(), { silenceMs: 5000, maxMs: 30_000, warnMs: 2500 });
});
