#!/usr/bin/env node
// The hot-mic guard and the spoken path, end to end, through a Chromium DevTools port whose browser is
// signed in to the gate (see dev-widget.mjs):
//   node mic-guard.mjs [--url http://localhost:5199/] [--cdp http://127.0.0.1:9222] [--silence 12] [--wav speech.wav] [--timeout 300]
// The page's getUserMedia is replaced by a stream the test owns: silent by default, or a WAV of speech.
// Silent: the widget's microphone must show the live banner and the ● LIVE title, warn, beep and stop
// itself after --silence seconds, naming the reason. With --wav: the speech plays once; the test measures
// the time from the end of the speech to the first partial transcript, to the loop hearing the request,
// to the agent's dispatch, and prints them; the request it makes is deleted afterwards.
import { readFileSync } from 'node:fs';
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]] : []).filter(Boolean));
const URL_ = String(args.url || 'http://localhost:5199/');
const CDP = String(args.cdp || 'http://127.0.0.1:9222');
const SILENCE = Number(args.silence || 12);
const WAV = args.wav ? (() => {
  // a streamed WAV carries 0xffffffff sizes; the browser's decoder wants the real ones
  const b = readFileSync(String(args.wav));
  if (b.readUInt32LE(4) === 0xffffffff) { b.writeUInt32LE(b.length - 8, 4); const i = b.indexOf('data'); if (i > 0) b.writeUInt32LE(b.length - i - 8, i + 4); }
  return b;
})() : null;
const TIMEOUT = Number(args.timeout || 300) * 1000;
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const fail = (msg) => { console.error('FAIL', msg); process.exitCode = 1; throw new Error(msg); };
const made = await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json());
const ws = new WebSocket(made.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
await new Promise(r => ws.onopen = r);
const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception?.description || '')); return r.result.value; };
const until = async (what, expression, every = 500, limit = TIMEOUT) => { const start = Date.now(); for (;;) { const v = await evaluate(expression); if (v) return v; if (Date.now() - start > limit) fail(`timeout waiting for ${what}`); await new Promise(r => setTimeout(r, every)); } };
const closeTab = () => fetch(`${CDP}/json/close/${made.id}`).catch(() => {});
try {
  await send('Page.enable');
  await send('Page.navigate', { url: URL_ });
  await until('the widget', 'typeof window.__aiWidgetView === "function"', 1000, 60000);
  await until('the widget sign-in', '(() => { const v = window.__aiWidgetView(); return v && v.me ? "1" : "" })()', 2000, 120000);
  // the test's own microphone: silence, or the speech WAV played once after a second
  const wavB64 = WAV ? WAV.toString('base64') : '';
  await evaluate(`(() => {
    window.__e2e = { speechEnd: 0, hearing: [], events: [] };
    const bytes = ${wavB64 ? `Uint8Array.from(atob("${wavB64}"), c => c.charCodeAt(0)).buffer` : 'null'};
    navigator.mediaDevices.getUserMedia = async () => {
      const ac = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
      await ac.resume();
      const dest = ac.createMediaStreamDestination();
      if (bytes) {
        const buf = await ac.decodeAudioData(bytes.slice(0));
        const src = ac.createBufferSource(); src.buffer = buf; src.connect(dest);
        const at = ac.currentTime + 1.0;
        src.start(at);
        window.__e2e.speechEnd = performance.timeOrigin + performance.now() + (at - ac.currentTime + buf.duration) * 1000;
      } else {
        const g = ac.createGain(); g.gain.value = 0; const o = ac.createOscillator(); o.connect(g); g.connect(dest); o.start();
      }
      return dest.stream;
    };
    window.__ai.on(m => { if (m.ai === "hearing") window.__e2e.hearing.push({ t: Date.now(), text: m.text }); if (m.ai === "status") window.__e2e.events.push({ t: Date.now(), id: m.id, phase: m.phase, msg: m.msg }); });
    localStorage.setItem("ai-widget-mic", JSON.stringify({ silenceSec: ${SILENCE}, maxMin: 10, vad: true }));
    return true;
  })()`);
  // press Listen through the widget (a user gesture, so audio may start)
  const opened = await evaluate('(() => { const v = window.__aiWidgetView(); if (!v.open) window.__aiWidgetDo(".dot"); return true })()');
  await until('the widget to open', '(() => window.__aiWidgetView().open ? "1" : "")()', 500, 20000);
  const clicked = await evaluate('window.__aiWidgetDo(".mic")');
  if (!clicked) fail('no Listen button in the widget (is --stt-url set on the loop?)');
  await until('the microphone to be on', '(() => window.__ai.micOn() ? "1" : "")()', 500, 20000);
  const micAt = Date.now();
  log('microphone on');
  const live = await until('the live banner', '(() => document.querySelector("ai-live") ? "1" : "")()', 500, 10000);
  const title = await until('the ● LIVE title', '(() => document.title.startsWith("● LIVE") ? document.title : "")()', 500, 10000);
  log('live banner shown; title:', title);
  const vad = await until('the voice detector', '(() => { const s = window.__ai.micState(); return s.vad ? "ready" : "" })()', 500, 60000).catch(() => 'absent');
  log('voice detector:', vad, 'after', Date.now() - micAt, 'ms');
  if (!WAV) {
    const warn = await until('the countdown warning', '(() => { const s = window.__ai.micState(); return s.guard && s.guard.state === "warning" ? s.guard.why : s.stopped ? "missed: " + s.stopped.why : "" })()', 250, (SILENCE + 5) * 1000);
    if (warn.startsWith('missed')) fail(`the microphone stopped (${warn}) before any warning was seen`);
    log('warning:', warn, 'at', ((Date.now() - micAt) / 1000).toFixed(1), 's');
    const stopped = await until('the microphone to stop itself', '(() => { const s = window.__ai.micState(); return !s.on && s.stopped ? s.stopped.why : "" })()', 500, (SILENCE + 10) * 1000);
    const stopAt = (Date.now() - micAt) / 1000;
    log('stopped:', stopped, 'after', stopAt.toFixed(1), 's');
    if (!/silence/.test(stopped)) fail(`the stop reason is not the silence window: ${stopped}`);
    if (stopAt < SILENCE - 1 || stopAt > SILENCE + 6) fail(`stopped after ${stopAt}s, expected about ${SILENCE}s`);
    const bannerGone = await until('the live banner to go', '(() => document.querySelector("ai-live") ? "" : "1")()', 500, 5000);
    const titleBack = await evaluate('document.title');
    if (titleBack.startsWith('● LIVE') || titleBack.startsWith('⚠ MIC')) fail(`the title kept its live prefix: ${titleBack}`);
    log('banner gone, title restored:', titleBack);
    console.log(JSON.stringify({ ok: true, mode: 'silence', silenceSec: SILENCE, stoppedAfterSec: Number(stopAt.toFixed(1)), reason: stopped, vad }));
  } else {
    const end = await until('the speech to end', '(() => window.__e2e.speechEnd && Date.now() > window.__e2e.speechEnd ? String(window.__e2e.speechEnd) : "")()', 200, 60000);
    const speechEnd = Number(end);
    log('speech ended');
    const heard = JSON.parse(await until('the loop to hear a request', '(() => { const e = window.__e2e.events.find(x => x.phase === "working" || x.phase === "heard"); return e ? JSON.stringify(e) : "" })()', 200, 60000));
    const jobs = await evaluate(`(async () => { const r = await fetch('/__ai/jobs', { headers: { 'x-ai-token': window.__aiToken || '' } }); return JSON.stringify(await r.json()) })()`);
    const list = JSON.parse(jobs);
    const job = list.find(j => j.id === heard.id) || list.at(-1);
    const first = JSON.parse(await evaluate('JSON.stringify(window.__e2e.hearing[0] || null)'));
    const settled = JSON.parse(await until('the request to settle into a job', `(async () => { const r = await fetch('/__ai/changes', { headers: { 'x-ai-token': window.__aiToken || '' } }); const j = await r.json(); const hit = j.find(x => x.id === ${heard.id}); return hit && hit.ms && hit.ms.dispatch != null ? JSON.stringify(hit) : "" })()`, 500, 60000));
    const heardAt = Date.parse(settled.heard);
    const numbers = {
      speechEndToFirstPartialMs: first ? first.t - speechEnd : null,
      speechEndToHeardMs: heardAt - speechEnd,
      heardToDispatchMs: settled.ms.dispatch,
      speechEndToDispatchMs: heardAt + settled.ms.dispatch - speechEnd,
      settleMs: job?.ms?.settle ?? null,
      vad,
      text: settled.text,
    };
    log('numbers', JSON.stringify(numbers));
    await evaluate('window.__ai.stopMic("test over")');
    const done = JSON.parse(await until('the request to finish', `(async () => { const r = await fetch('/__ai/changes', { headers: { 'x-ai-token': window.__aiToken || '' } }); const j = await r.json(); const hit = j.find(x => x.id === ${heard.id}); return hit && hit.status !== "running" ? JSON.stringify(hit) : "" })()`, 1000, 180000));
    log('request finished as', done.status, 'files', done.files);
    const del = await evaluate(`(async () => { const r = await fetch('/__ai/changes/${heard.id}/delete', { method: 'POST', headers: { 'x-ai-token': window.__aiToken || '' } }); return r.status })()`);
    log('deleted the test request:', del);
    console.log(JSON.stringify({ ok: true, mode: 'speech', ...numbers, status: done.status }));
  }
} finally {
  await evaluate('window.__ai && window.__ai.micOn() && window.__ai.stopMic("test over")').catch(() => {});
  await closeTab();
  ws.close();
}
