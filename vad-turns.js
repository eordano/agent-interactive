// Turn detection over a stream of per-hop speech probabilities (TEN VAD, 16 ms hops): the same
// contract the Silero detector had (start on the first speech hop, end after a redemption window
// below the end threshold, misfire when the turn was shorter than the minimum). Pure, so the
// loop's tests drive it with numbers.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.__aiVadTurns = factory();
})(typeof self !== "undefined" ? self : this, function () {
  function createTurnDetector(opts) {
    opts = opts || {};
    var hopMs = opts.hopMs || 16;
    var startThreshold = opts.startThreshold !== undefined ? opts.startThreshold : 0.5;
    var endThreshold = opts.endThreshold !== undefined ? opts.endThreshold : 0.35;
    var minSpeechHops = Math.max(1, Math.round((opts.minSpeechMs || 96) / hopMs));
    var redemptionHops = Math.max(1, Math.round((opts.redemptionMs || 320) / hopMs));
    var speaking = false, speechHops = 0, quietHops = 0;
    function feed(prob) {
      if (!speaking) {
        if (prob >= startThreshold) { speaking = true; speechHops = 1; quietHops = 0; return "start"; }
        return null;
      }
      if (prob >= startThreshold) { speechHops++; quietHops = 0; return null; }
      if (prob < endThreshold) {
        quietHops++;
        if (quietHops >= redemptionHops) {
          var short = speechHops < minSpeechHops;
          speaking = false; speechHops = 0; quietHops = 0;
          return short ? "misfire" : "end";
        }
        return null;
      }
      speechHops++;
      return null;
    }
    return {
      feed: feed,
      speaking: function () { return speaking; },
      reset: function () { speaking = false; speechHops = 0; quietHops = 0; },
      settings: function () { return { hopMs: hopMs, startThreshold: startThreshold, endThreshold: endThreshold, minSpeechHops: minSpeechHops, redemptionHops: redemptionHops }; },
    };
  }
  return { createTurnDetector: createTurnDetector };
});
