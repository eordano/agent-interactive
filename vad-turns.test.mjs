import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const { createTurnDetector } = createRequire(import.meta.url)("./vad-turns.js");

const events = (d, probs) => probs.map((p) => d.feed(p)).filter(Boolean);

test("a turn starts on the first speech hop and ends after the redemption window", () => {
  const d = createTurnDetector({ hopMs: 16, redemptionMs: 320, minSpeechMs: 96 });
  assert.deepEqual(d.settings(), { hopMs: 16, startThreshold: 0.5, endThreshold: 0.35, minSpeechHops: 6, redemptionHops: 20 });
  const speech = Array(30).fill(0.9), quiet = Array(20).fill(0.1);
  assert.deepEqual(events(d, [0.1, 0.2, ...speech]), ["start"]);
  assert.equal(d.speaking(), true);
  assert.deepEqual(events(d, quiet.slice(0, 19)), [], "nineteen quiet hops are not yet the window");
  assert.deepEqual(events(d, [0.1]), ["end"]);
  assert.equal(d.speaking(), false);
});

test("speech inside the window resets it, and probabilities between the thresholds keep the turn open", () => {
  const d = createTurnDetector({ hopMs: 16, redemptionMs: 320, minSpeechMs: 96 });
  events(d, Array(10).fill(0.9));
  assert.deepEqual(events(d, [...Array(15).fill(0.1), 0.8, ...Array(19).fill(0.1)]), [], "one speech hop restarts the count");
  assert.deepEqual(events(d, Array(40).fill(0.4)), [], "undecided hops never end a turn");
  assert.deepEqual(events(d, [0.1]), ["end"]);
});

test("a blip shorter than the minimum is a misfire, not a turn", () => {
  const d = createTurnDetector({ hopMs: 16, redemptionMs: 320, minSpeechMs: 96 });
  assert.deepEqual(events(d, [0.9, 0.9, ...Array(20).fill(0.0)]), ["start", "misfire"]);
  assert.deepEqual(events(d, [...Array(6).fill(0.9), ...Array(20).fill(0.0)]), ["start", "end"], "six hops (96 ms) are a turn");
});

test("reset forgets an open turn", () => {
  const d = createTurnDetector();
  events(d, [0.9]);
  d.reset();
  assert.equal(d.speaking(), false);
  assert.deepEqual(events(d, [0.9]), ["start"]);
});
