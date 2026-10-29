// The hot-mic guard: how long a microphone may stay open without anyone speaking, and at most how long
// in one go. Pure and clock-driven, so the page client runs it on a timer and node tests it directly.
// Shared by the page client (window.__aiMicGuard) and `node --test mic-guard.test.mjs`.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.__aiMicGuard = factory();
})(typeof self !== "undefined" ? self : this, function () {
  function createMicGuard(opts) {
    opts = opts || {};
    var silenceMs = Math.max(5000, (opts.silenceSec || 45) * 1000);
    var maxMs = Math.max(30000, (opts.maxMin || 10) * 60000);
    var warnMs = Math.min(opts.warnMs || 10000, silenceMs / 2);
    var on = false, since = 0, lastSpeech = 0, speaking = false, stopped = null;
    var guard = {
      start: function (t) { on = true; since = t; lastSpeech = t; speaking = false; stopped = null; },
      speech: function (t) { if (!on) return; speaking = true; lastSpeech = t; },
      speechEnd: function (t) { if (!on) return; speaking = false; lastSpeech = t; },
      stop: function () { on = false; },
      tick: function (t) {
        if (!on) return { state: "off" };
        if (stopped) return stopped;
        var elapsed = t - since;
        var quiet = speaking ? 0 : t - lastSpeech;
        var toCap = maxMs - elapsed, toSilence = silenceMs - quiet;
        if (toCap <= 0) { stopped = { state: "stop", reason: "cap", why: "stopped after " + Math.round(maxMs / 60000) + " min, the limit for one session", elapsedMs: elapsed }; return stopped; }
        if (toSilence <= 0) { stopped = { state: "stop", reason: "silence", why: "stopped after " + Math.round(silenceMs / 1000) + " s of silence", elapsedMs: elapsed }; return stopped; }
        var remaining = Math.min(toCap, toSilence);
        if (remaining <= warnMs) {
          return { state: "warning", remainingMs: remaining, elapsedMs: elapsed, sinceSpeechMs: quiet,
            why: toSilence <= toCap ? "nobody is speaking: stopping in " + Math.ceil(remaining / 1000) + " s" : "session limit: stopping in " + Math.ceil(remaining / 1000) + " s" };
        }
        return { state: "live", remainingMs: remaining, elapsedMs: elapsed, sinceSpeechMs: quiet, speaking: speaking };
      },
      settings: function () { return { silenceMs: silenceMs, maxMs: maxMs, warnMs: warnMs }; },
    };
    return guard;
  }
  return { createMicGuard: createMicGuard };
});
