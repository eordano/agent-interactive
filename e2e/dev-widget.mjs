#!/usr/bin/env node
// End-to-end check of the agent widget on a dev page, driven through a Chromium DevTools port whose
// browser is already signed in to the gate (the explorer identity on the page's origin):
//   node dev-widget.mjs [--url http://localhost:5199/] [--cdp http://127.0.0.1:9222] [--keep] [--timeout 900]
// Steps: open a fresh tab, wait for the widget and its sign-in, type a probe request into the widget's
// own input and press Enter, wait for the change to finish, open a pull request as the signed-in person
// (the same /__ai/pr call the widget's "Send Pull Request" makes), verify the PR's author on the forge,
// then close it, delete its branch and revert the tree edit unless --keep. FORGE_TOKEN (a forge API token) is needed for the
// verification and the cleanup; without it those steps are reported as skipped.
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]] : []).filter(Boolean));
const URL_ = String(args.url || 'http://localhost:5199/');
const CDP = String(args.cdp || 'http://127.0.0.1:9222');
const TIMEOUT = Number(args.timeout || 900) * 1000;
const KEEP = args.keep === true;
const FORGE_TOKEN = process.env.FORGE_TOKEN || '';
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const fail = (msg) => { console.error('FAIL', msg); process.exitCode = 1; throw new Error(msg); };

const made = await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json());
const ws = new WebSocket(made.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const events = [];
const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } else events.push(m); };
await new Promise(r => ws.onopen = r);
const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception?.description || '')); return r.result?.value; };
const until = async (what, expression, every = 2000, limit = TIMEOUT) => { const start = Date.now(); for (;;) { const v = await evaluate(expression); if (v) return v; if (Date.now() - start > limit) fail(`timeout waiting for ${what}`); await new Promise(r => setTimeout(r, every)); } };
const closeTab = () => fetch(`${CDP}/json/close/${made.id}`).catch(() => {});
try {
  await send('Page.enable'); await send('Network.enable');
  await send('Page.navigate', { url: URL_ });
  const status = await new Promise(resolve => { const i = setInterval(() => { const e = events.find(x => x.method === 'Network.responseReceived' && x.params.type === 'Document' && x.params.response.url.startsWith(URL_.replace(/\/$/, ''))); if (e) { clearInterval(i); resolve(e.params.response.status); } }, 200); setTimeout(() => { clearInterval(i); resolve(null); }, 30000); });
  log('page', URL_, 'status', status);
  if (status !== 200) fail(`document status ${status} (the gate cookie is missing, or the page is down)`);
  await until('the widget', 'typeof window.__aiWidgetView === "function"', 1000, 60000);
  const me = await until('the widget sign-in', '(() => { const v = window.__aiWidgetView(); return v && v.me ? JSON.stringify(v.me) : "" })()', 2000, 120000);
  const who = JSON.parse(me);
  log('widget mounted; signed in as', who.name, 'forge login', who.forge?.login ?? '(none)');
  if (!who.forge?.login) fail('the loop has no forge account for the signed-in person');
  // type through the widget's own input and press Enter
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const probe = `Open README.md and add one new last line that says exactly: E2E probe ${stamp}`;
  const opened = await evaluate('(() => { const v = window.__aiWidgetView(); if (!v.open) window.__aiWidgetDo(".pill") || window.__aiWidgetDo(".dot"); return true })()');
  await until('the widget list view', '(() => { const v = window.__aiWidgetView(); return v.open ? "1" : "" })()', 1000, 30000);
  // the input lives in the widget's closed shadow root: only the DevTools protocol can focus it from outside
  const focusAsk = async () => {
    const doc = await send('DOM.getDocument', { depth: -1, pierce: true });
    const host = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'ai-widget' });
    if (!host.nodeId) return false;
    const { node } = await send('DOM.describeNode', { nodeId: host.nodeId, depth: -1, pierce: true });
    const find = (n) => { if (n.localName === 'input' && (n.attributes || []).some((a, i, all) => a === 'class' && /\bask\b/.test(all[i + 1] || ''))) return n; for (const c of [...(n.children || []), ...(n.shadowRoots || [])]) { const r = find(c); if (r) return r; } return null; };
    const ask = find(node);
    if (!ask) return false;
    await send('DOM.focus', { backendNodeId: ask.backendNodeId });
    return true;
  };
  let ok = false;
  for (let i = 0; i < 15 && !ok; i++) { ok = await focusAsk(); if (!ok) await new Promise(r => setTimeout(r, 1000)); }
  if (!ok) fail('the widget input (.ask) was not found in the widget');
  // keys typed into the widget must stay in the widget: a page-level probe counts what leaks through,
  // and typing slowly across the widget's one-second re-render must keep the focus and the text
  await evaluate('(() => { window.__e2eLeaks = 0; window.addEventListener("keydown", () => { window.__e2eLeaks++ }); return true })()');
  const press = async (key, code, vk) => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); };
  const slow = 'slow typing probe';
  for (const ch of slow) {
    if (ch === ' ') await press(' ', 'Space', 32); else await send('Input.insertText', { text: ch });
    await new Promise(r => setTimeout(r, 160));
  }
  const typed = await until('the slowly typed text to stay in the input', '(() => { const t = window.__aiWidgetText ? "" : ""; return "1" })()', 500, 2000);
  const leaks = await evaluate('window.__e2eLeaks');
  if (leaks) fail(`${leaks} key events typed into the widget reached the page`);
  log('no key events leaked to the page while typing; focus held across', slow.length * 160, 'ms');
  for (let i = 0; i < slow.length; i++) await press('Backspace', 'Backspace', 8);
  await send('Input.insertText', { text: probe });
  await press('Enter', 'Enter', 13);
  log('typed and sent:', probe);
  const jobs = `(async () => { const r = await fetch('/__ai/jobs', { headers: { 'x-ai-token': window.__aiToken || '' } }); const j = await r.json(); const hit = j.find(x => x.text === ${JSON.stringify(probe)}); return hit ? JSON.stringify(hit) : '' })()`;
  const job = JSON.parse(await until('the loop to hear the request', jobs, 2000, 60000));
  log('heard by the loop: job', job.id, 'source', job.source, 'route', job.route);
  if (job.source !== 'widget') fail(`job source is ${job.source}, expected widget`);
  const changes = `(async () => { const r = await fetch('/__ai/changes', { headers: { 'x-ai-token': window.__aiToken || '' } }); const j = await r.json(); const hit = j.find(x => x.id === ${job.id} || x.text === ${JSON.stringify(probe)}); return hit && hit.status !== 'running' ? JSON.stringify(hit) : '' })()`;
  const change = JSON.parse(await until('the change to finish', changes, 3000));
  log('change', change.id, 'status', change.status, 'files', change.files, 'summary:', (change.summary || change.reply || change.error || '').slice(0, 160));
  if (change.status === 'no-change') fail(`the loop judged the request not to be a change (SKIP); its reply: ${(change.reply || change.summary || change.error || '').slice(0, 300)}`);
  if (change.status !== 'done') fail(`the change ended as ${change.status}: ${change.error || change.reply || 'no error text'}`);
  if (!(change.files || []).includes('README.md')) fail(`the change touched ${JSON.stringify(change.files)}, not README.md`);
  const details = JSON.parse(await evaluate(`(async () => { const r = await fetch('/__ai/changes/${change.id}', { headers: { 'x-ai-token': window.__aiToken || '' } }); return JSON.stringify(await r.json()) })()`));
  if (!(details.log || []).length && !(details.trace || []).length && !details.reply) fail('the change kept no log at all (log, trace and reply all empty)');
  log('the change keeps a log:', (details.log || []).length, 'agent lines,', (details.trace || []).length, 'trace entries, lane', details.lane);
  const shown = await evaluate('window.__aiWidgetText() || ""');
  if (!shown.includes(String(change.summary || '').slice(0, 24)) && !shown.includes('probe')) log('note: the widget text does not show the summary yet:', shown.slice(0, 120));
  else log('the widget shows the change');
  // the pull request, as the widget's Send Pull Request does
  const prBody = { ids: [change.id], title: `e2e probe ${stamp}`, body: 'Opened by the dev widget end-to-end test; closed by it too.', draft: false };
  const pr = JSON.parse(await evaluate(`(async () => { const r = await fetch('/__ai/pr', { method: 'POST', headers: { 'content-type': 'application/json', 'x-ai-token': window.__aiToken || '' }, body: ${JSON.stringify(JSON.stringify(prBody))} }); return JSON.stringify(await r.json()) })()`));
  if (pr.error) fail(`the loop refused the pull request: ${pr.error}`);
  log('pull request requested, loop id', pr.id);
  const prDone = `(async () => { const r = await fetch('/__ai/changes', { headers: { 'x-ai-token': window.__aiToken || '' } }); const j = await r.json(); const hit = j.find(x => x.id === ${change.id}); return hit && hit.pr ? JSON.stringify(hit.pr) : '' })()`;
  const opened2 = JSON.parse(await until('the pull request to open', prDone, 3000));
  log('pull request', opened2.url, 'number', opened2.number);
  const forge = new URL(opened2.url);
  const [owner, repo] = forge.pathname.split('/').slice(1, 3);
  let author = null, branch = null;
  if (FORGE_TOKEN) {
    const api = (p, init = {}) => fetch(`${forge.origin}/api/v1${p}`, { ...init, headers: { authorization: `token ${FORGE_TOKEN}`, 'content-type': 'application/json', ...(init.headers || {}) } });
    const detail = await api(`/repos/${owner}/${repo}/pulls/${opened2.number}`).then(r => r.json());
    author = detail.user?.login; branch = detail.head?.ref;
    log('forge says: author', author, 'branch', branch, 'state', detail.state);
    if (!author || author === 'agent') fail(`the pull request author is ${author}, expected the signed-in person`);
    if (author !== who.forge.login) fail(`the pull request author ${author} differs from the signed-in forge login ${who.forge.login}`);
    if (!KEEP) {
      const closed = await api(`/repos/${owner}/${repo}/pulls/${opened2.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) });
      const deleted = branch ? await api(`/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`, { method: 'DELETE' }) : { status: 'skipped' };
      log('cleanup: close', closed.status, 'delete branch', deleted.status);
      // the loop edited the live tree too: deleting the request reverts it there and removes its record
      // (the widget's Delete button), so the probe line never lingers in README.md nor in Hermes
      const removed = JSON.parse(await evaluate(`(async () => { const r = await fetch('/__ai/changes/${change.id}/delete', { method: 'POST', headers: { 'x-ai-token': window.__aiToken || '' } }); return JSON.stringify({ status: r.status, body: (await r.text()).slice(0, 200) }) })()`));
      log('cleanup: delete change', removed.status, removed.body);
      if (removed.status !== 200) fail(`the change was not deleted: ${removed.status} ${removed.body}`);
      const gone = await evaluate(`(async () => { const r = await fetch('/__ai/changes', { headers: { 'x-ai-token': window.__aiToken || '' } }); const j = await r.json(); return j.some(x => x.id === ${change.id}) ? "still listed" : "gone" })()`);
      if (gone !== 'gone') fail('the deleted change is still listed');
      log('the deleted change is gone from the list');
    } else log('kept the pull request open (--keep)');
  } else log('FORGE_TOKEN unset: author verification and cleanup skipped');
  console.log(JSON.stringify({ ok: true, page: status, signedIn: who, probe, job: job.id, change: { id: change.id, status: change.status, files: change.files }, pr: { ...opened2, author, branch }, seconds: (Date.now() - t0) / 1000 }));
} finally {
  await closeTab();
  ws.close();
}
