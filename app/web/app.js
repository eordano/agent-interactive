import { FitAddon, init, Terminal } from "./vendor/ghostty-web.js";

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { open: openDialog } = window.__TAURI__.dialog;

const $ = (sel) => document.querySelector(sel);
const enc = new TextEncoder();

const DEFAULTS = {
  dir: "", attach: true, url: "", search: "", flashModel: "cerebras/qwen-3.8-27b", opencodeCmd: "opencode",
  claudeWorkers: 4, claudeModel: "claude-opus-5-5", claudeEffort: "", voice: false, browserPort: 9222, sttBackend: "realtime", speech: false, ttsUrl: "",
};
const FIELDS = Object.keys(DEFAULTS);

let saved = {};
let managed = {};
let fleet = {};
let settings = { ...DEFAULTS };
let port = 0;
let running = false;
let selected = "";
let status;
const logLines = [];

function effective() {
  return { ...DEFAULTS, ...fleet, ...saved, ...managed };
}

function text(el, value) {
  el.textContent = value ?? "";
  return el;
}

function li(cls, first, second) {
  const item = document.createElement("li");
  if (cls) item.className = cls;
  const a = document.createElement("div");
  a.textContent = first;
  item.append(a);
  if (second) item.append(text(Object.assign(document.createElement("div"), { className: "line2" }), second));
  return item;
}

/* ---------------- setup ---------------- */

function fillForm() {
  const f = $("#form");
  for (const k of FIELDS) {
    const v = settings[k];
    if (k === "attach") {
      for (const r of f.querySelectorAll('input[name="attach"]')) r.checked = (r.value === "1") === Boolean(v);
    } else if (typeof DEFAULTS[k] === "boolean") f.elements[k].checked = Boolean(v);
    else f.elements[k].value = v ?? "";
    const fixed = k in managed;
    for (const el of f.querySelectorAll(`[name="${k}"]`)) {
      el.disabled = fixed;
      el.title = fixed ? "Set by this machine's configuration" : "";
    }
  }
  const pinned = Object.keys(managed).filter((k) => FIELDS.includes(k));
  $("#managed-note").hidden = !pinned.length;
  text($("#managed-note"), pinned.length ? `Greyed values are set by this machine's configuration and cannot be changed here.` : "");
  syncForm();
}

function readForm() {
  const f = $("#form");
  const next = { ...settings };
  for (const k of FIELDS) {
    if (k in managed) continue;
    if (k === "attach") next.attach = f.querySelector('input[name="attach"]:checked')?.value !== "0";
    else if (typeof DEFAULTS[k] === "boolean") next[k] = f.elements[k].checked;
    else if (typeof DEFAULTS[k] === "number") next[k] = Number(f.elements[k].value);
    else next[k] = f.elements[k].value.trim();
  }
  return next;
}

function syncForm() {
  const f = $("#form");
  const s = readForm();
  f.elements.url.disabled = !s.attach || "url" in managed;
  f.elements.browserPort.disabled = !s.voice || !s.attach || "browserPort" in managed;
  f.elements.sttBackend.disabled = !s.voice || "sttBackend" in managed;
  f.elements.ttsUrl.disabled = !s.speech || "ttsUrl" in managed;
  f.elements.claudeModel.disabled = s.claudeWorkers < 1 || "claudeModel" in managed;
  f.elements.claudeEffort.disabled = s.claudeWorkers < 1 || "claudeEffort" in managed;
  const provider = (s.flashModel.split("/")[0] || "the provider");
  text($("#provider"), provider);
  invoke("key_status", { providers: [provider] }).then((has) => {
    text($("#key-note"), has[provider]
      ? `A key for ${provider} is in the keychain; the fast lane gets it when a session starts.`
      : `No key for ${provider} in the keychain: the fast lane uses opencode's own configuration, if it has one.`);
  }).catch(() => {});
}

function argsFor(s, port) {
  const a = [s.dir];
  if (port) a.push("--port", String(port));
  if (s.attach && s.url) a.push("--attach", s.url);
  if (s.search.trim()) a.push("--search", s.search.replace(/\s+/g, ""));
  a.push("--flash-model", s.flashModel, "--opencode-cmd", s.opencodeCmd);
  if (s.claudeWorkers > 0) a.push("--claude-workers", String(s.claudeWorkers), "--claude-model", s.claudeModel);
  if (s.claudeWorkers > 0 && s.claudeEffort) a.push("--claude-effort", s.claudeEffort);
  else a.push("--claude-cmd", "none");
  if (s.voice) {
    a.push("--recgo");
    if (s.attach && s.browserPort) a.push("--recgo-port", String(s.browserPort));
  }
  if (s.speech && s.ttsUrl) a.push("--say", "speaches", "--tts-url", s.ttsUrl);
  else a.push("--say", "none");
  if (s.voice && s.sttBackend) a.push("--", "--stt-backend", s.sttBackend);
  return a;
}

function problem(s) {
  if (!s.dir) return "Choose the folder the agents edit.";
  if (s.attach && !/^https?:\/\//.test(s.url)) return "Give the dev server's address, starting with http:// or https://.";
  if (!/^[^/\s]+\/\S+$/.test(s.flashModel)) return "The fast lane model is written provider/model, e.g. cerebras/qwen-3.8-27b.";
  if (s.speech && !/^https?:\/\//.test(s.ttsUrl)) return "Give the speech server's address, or stop saying replies.";
  return "";
}

async function check() {
  settings = { ...readForm(), ...managed };
  const bad = problem(settings);
  const st = $("#setup-status");
  st.classList.toggle("bad", Boolean(bad));
  $("#start").disabled = true;
  if (bad) return text(st, bad);
  text(st, "Checking: the fast lane answers a warm-up, which takes a few seconds...");
  $("#check").disabled = true;
  try {
    const r = await invoke("doctor", { args: argsFor(settings) });
    renderChecks(r.checks);
    const fails = r.checks.filter((c) => c.state === "fail").length;
    st.classList.toggle("bad", fails > 0);
    text(st, fails ? `${fails} ${fails === 1 ? "problem stops" : "problems stop"} a session; each says how to fix it.` : "Ready to start.");
    $("#start").disabled = fails > 0;
    $("#checks-section").scrollIntoView({ block: "end", behavior: "smooth" });
  } catch (e) {
    st.classList.add("bad");
    text(st, String(e));
  } finally {
    $("#check").disabled = false;
  }
}

function renderChecks(checks) {
  const ol = $("#checks");
  ol.replaceChildren();
  const mark = { ok: "✓", warn: "!", fail: "✗", skip: "–" };
  for (const c of checks) {
    const item = document.createElement("li");
    item.className = c.state;
    item.append(
      text(Object.assign(document.createElement("span"), { className: "mark" }), mark[c.state]),
      text(document.createElement("b"), c.title),
      text(document.createElement("span"), c.detail),
    );
    if (c.fix && c.state !== "ok" && c.state !== "skip") item.append(text(Object.assign(document.createElement("span"), { className: "fix" }), c.fix));
    ol.append(item);
  }
  $("#checks-section").hidden = false;
}

async function persist() {
  const own = {};
  for (const k of FIELDS) if (!(k in managed)) own[k] = settings[k];
  saved = own;
  await invoke("settings_save", { settings: own });
}

/* ---------------- session ---------------- */

async function start(ev) {
  ev.preventDefault();
  settings = { ...readForm(), ...managed };
  if (problem(settings)) return check();
  await persist();
  const suggested = await invoke("free_port");
  port = 0;
  logLines.length = 0;
  text($("#log"), "");
  try {
    await invoke("loop_start", { args: argsFor(settings, suggested) });
  } catch (e) {
    $("#setup-status").classList.add("bad");
    return text($("#setup-status"), String(e));
  }
  running = true;
  status = undefined;
  selected = "";
  terms.clear();
  $("#view-body").replaceChildren();
  text($("#run-title"), settings.dir.split("/").filter(Boolean).pop() ?? settings.dir);
  text($("#run-page"), settings.attach ? settings.url : `${settings.dir}/index.html`);
  $("#setup").hidden = true;
  $("#run").hidden = false;
  text($("#run-state"), "Starting: warming up the fast lane...");
  poll();
}

const api = (path, init) => fetch(`http://127.0.0.1:${port}${path}`, { ...init, signal: AbortSignal.timeout(4000) });

async function poll() {
  while (running) {
    if (!port) {
      await new Promise((r) => setTimeout(r, 200));
      continue;
    }
    try {
      status = await (await api("/__ai/status")).json();
      renderRun();
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
}

function since(ms) {
  if (!ms) return "";
  const s = Math.round((status.now - ms) / 1000);
  return s < 60 ? `${s} s` : `${Math.round(s / 60)} min`;
}

function renderRun() {
  const s = status;
  const parts = [];
  if (s.viteUp !== null) parts.push(s.viteUp ? "Hot reload connected" : "Hot reload not connected");
  if (s.recgo !== null) parts.push(s.recgo ? "Recording the tab" : "Voice not running");
  parts.push(s.muted ? "Muted" : s.recgo ? "Listening" : "Type changes below");
  if (s.speechError) parts.push("Speech server failing, using the system voice");
  text($("#run-state"), parts.join(" · "));
  const mute = $("#mute");
  mute.classList.toggle("on", Boolean(s.muted));
  text(mute, s.muted ? "Unmute" : "Mute");

  if (!selected) selected = s.workers[0]?.name ?? "";
  const agents = $("#agents");
  const rows = new Map([...agents.children].map((el) => [el.dataset.name, el]));
  for (const w of s.workers) {
    let item = rows.get(w.name);
    rows.delete(w.name);
    if (!item) {
      item = document.createElement("li");
      item.dataset.name = w.name;
      item.append(document.createElement("div"), Object.assign(document.createElement("span"), { className: "state" }),
        Object.assign(document.createElement("div"), { className: "line2" }));
      item.onclick = () => select(w.name);
      agents.append(item);
    }
    const t = w.terminal;
    const needs = t?.attention;
    const state = needs ? "needs you" : w.job ? `working ${since(w.since)}` : t?.typing ? "your turn" : t && !t.started ? "not started" : "idle";
    const line2 = w.job ? `#${w.job.id} ${w.job.text}` : w.lane === "flash" ? "Small changes, a fresh session each" : "Large changes and anything you type";
    item.className = `${w.name === selected ? "selected" : ""} ${needs ? "needs" : ""}`.trim();
    text(item.children[0], w.name);
    text(item.children[1], state);
    text(item.children[2], line2);
  }
  for (const gone of rows.values()) gone.remove();

  const queue = $("#queue");
  queue.replaceChildren();
  const waiting = [...s.preparing.map((q) => ({ ...q, why: "finding the code" })), ...s.queued.map((q) => ({
    ...q, why: q.waitsFor ? `waits for #${q.waitsFor.id} (${q.waitsFor.why})` : "starts when an agent is free",
  }))];
  for (const q of waiting) queue.append(li("", `#${q.id} ${q.text}`, q.why));
  if (!waiting.length) queue.append(li("empty", "Nothing is waiting."));

  const recent = $("#recent");
  recent.replaceChildren();
  for (const r of s.recent.slice().reverse()) {
    const secs = r.ms.done == null ? "" : ` · ${(r.ms.done / 1000).toFixed(1)} s`;
    const result = r.error ? `failed: ${r.error}` : r.hmrError ? `broke the build: ${r.hmrError}` : r.summary || "no change";
    recent.append(li(r.error || r.hmrError ? "bad" : "", `#${r.id} ${r.text}`, `${result}${secs}`));
  }
  if (!s.recent.length) recent.append(li("empty", "Nothing finished yet. Say or type a change."));

  renderView();
}

function select(name) {
  selected = name;
  if (status) renderRun();
}

function renderView() {
  const w = status.workers.find((x) => x.name === selected);
  if (!w) return;
  text($("#view-title"), w.job ? `${w.name} · #${w.job.id} ${w.job.text}` : w.name);
  text($("#view-doing"), w.job ? w.activity || "working" : "");
  const need = w.terminal?.attention;
  $("#attention").hidden = !need;
  text($("#attention"), need ? `${w.name} is waiting for you in its terminal: ${need}` : "");
  for (const el of $("#view-body").children) el.hidden = el.dataset.agent !== w.name;
  if (w.terminal) showTerm(w.name);
  else showLog(w.name);
}

/* ---------------- terminals and logs ---------------- */

const terms = new Map();
let look = {};
let ghosttyReady;

function themeFrom(l) {
  const p = l.palette ?? {};
  const names = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];
  const theme = {};
  names.forEach((n, i) => {
    if (p[i]) theme[n] = p[i];
    if (p[i + 8]) theme[`bright${n[0].toUpperCase()}${n.slice(1)}`] = p[i + 8];
  });
  if (l.background) theme.background = l.background.startsWith("#") ? l.background : `#${l.background}`;
  if (l.foreground) theme.foreground = l.foreground.startsWith("#") ? l.foreground : `#${l.foreground}`;
  if (l["cursor-color"]) theme.cursor = l["cursor-color"];
  if (l["selection-background"]) theme.selectionBackground = l["selection-background"];
  return theme;
}

async function showTerm(name) {
  let t = terms.get(name);
  if (!t) {
    ghosttyReady ??= init();
    await ghosttyReady;
    if (terms.has(name)) return;
    const el = Object.assign(document.createElement("div"), { className: "term" });
    el.dataset.agent = name;
    $("#view-body").append(el);
    const term = new Terminal({
      fontFamily: `${look.fontFamily ? `"${look.fontFamily}", ` : ""}ui-monospace, monospace`,
      fontSize: Math.round((look.fontSize ?? 10) * 4 / 3),
      cursorBlink: true, scrollback: 10000, theme: themeFrom(look),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    t = { el, term, fit, ws: undefined };
    terms.set(name, t);
    term.onData((d) => t.ws?.readyState === WebSocket.OPEN && t.ws.send(enc.encode(d)));
    term.onResize(({ cols, rows }) => t.ws?.readyState === WebSocket.OPEN && t.ws.send(JSON.stringify({ resize: [cols, rows] })));
    connect(name, t);
  }
  t.el.hidden = false;
  requestAnimationFrame(() => {
    t.fit.fit();
    if (document.activeElement === document.body) t.term.focus();
  });
}

function connect(name, t) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/__ai/term?agent=${encodeURIComponent(name)}`);
  ws.binaryType = "arraybuffer";
  t.ws = ws;
  ws.onopen = () => ws.send(JSON.stringify({ resize: [t.term.cols, t.term.rows] }));
  ws.onmessage = (e) => {
    if (typeof e.data !== "string") return t.term.write(new Uint8Array(e.data));
    const m = JSON.parse(e.data);
    if ("exit" in m) t.term.write(`\r\n\x1b[2m[claude ended with exit ${m.exit}; the next change starts it again]\x1b[0m\r\n`);
    if (m.error) t.term.write(`\r\n\x1b[31m${m.error}\x1b[0m\r\n`);
  };
  ws.onclose = () => {
    if (running && terms.get(name) === t) setTimeout(() => running && connect(name, t), 1500);
  };
}

const logs = new Map();

async function showLog(name) {
  let l = logs.get(name);
  if (!l) {
    const el = Object.assign(document.createElement("pre"), { className: "agent-log" });
    el.dataset.agent = name;
    $("#view-body").append(el);
    l = { el, after: 0, busy: false };
    logs.set(name, l);
  }
  l.el.hidden = false;
  if (l.busy) return;
  l.busy = true;
  try {
    const r = await (await api(`/__ai/worker?name=${encodeURIComponent(name)}&after=${l.after}`)).json();
    const stick = l.el.scrollTop + l.el.clientHeight >= l.el.scrollHeight - 8;
    for (const line of r.lines) {
      const cls = line.text.startsWith("▶") ? "change" : line.text.startsWith("■") ? (/failed/.test(line.text) ? "failed" : "done")
        : line.text.startsWith("→") ? "tool" : "";
      const time = new Date(line.t).toTimeString().slice(0, 8);
      l.el.append(text(Object.assign(document.createElement("div"), { className: cls }), `${time}  ${line.text}`));
    }
    l.after = r.next;
    if (!l.el.children.length) l.el.append(text(Object.assign(document.createElement("div"), { className: "tool" }), "No change yet: small changes appear here as the fast lane works on them."));
    if (stick) l.el.scrollTop = l.el.scrollHeight;
  } catch { /* the loop is busy starting */ } finally {
    l.busy = false;
  }
}

/* ---------------- wiring ---------------- */

async function stopSession() {
  $("#stop").disabled = true;
  text($("#stop"), "Stopping...");
  await invoke("loop_stop").catch(() => {});
}

function backToSetup(message) {
  running = false;
  for (const t of terms.values()) {
    t.ws?.close();
    t.term.dispose();
  }
  terms.clear();
  logs.clear();
  $("#view-body").replaceChildren();
  $("#stop").disabled = false;
  text($("#stop"), "Stop session");
  $("#run").hidden = true;
  $("#setup").hidden = false;
  const st = $("#setup-status");
  st.classList.toggle("bad", Boolean(message));
  text(st, message ?? "The session stopped.");
  $("#start").disabled = false;
}

async function main() {
  const r = await invoke("settings_load");
  saved = r.settings ?? {};
  const known = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => FIELDS.includes(k)));
  managed = known(r.managed);
  fleet = known(r.defaults);
  settings = effective();
  look = await invoke("ghostty_look").catch(() => ({}));
  fillForm();
  $("#setup").hidden = false;

  const f = $("#form");
  f.addEventListener("input", () => {
    $("#start").disabled = true;
    syncForm();
  });
  f.addEventListener("submit", start);
  $("#check").onclick = check;
  $("#pick").onclick = async () => {
    const dir = await openDialog({ directory: true, multiple: false, defaultPath: f.elements.dir.value || undefined });
    if (typeof dir === "string") {
      f.elements.dir.value = dir;
      $("#start").disabled = true;
      syncForm();
    }
  };
  $("#save-key").onclick = async () => {
    const provider = readForm().flashModel.split("/")[0];
    try {
      await invoke("key_set", { provider, key: f.elements.key.value });
      f.elements.key.value = "";
      syncForm();
    } catch (e) {
      text($("#key-note"), String(e));
    }
  };

  $("#mute").onclick = () => api("/__ai/mute", { method: "POST" }).catch(() => {});
  $("#stop").onclick = stopSession;
  $("#log-toggle").onclick = () => {
    const log = $("#log");
    log.hidden = !log.hidden;
    $("#log-toggle").classList.toggle("on", !log.hidden);
    log.scrollTop = log.scrollHeight;
  };
  $("#say").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const input = ev.target.elements.text;
    const said = input.value.trim();
    if (!said) return;
    input.value = "";
    try {
      await api("/__ai/say", { method: "POST", body: said });
    } catch (e) {
      input.value = said;
      text($("#run-state"), `Could not reach the loop: ${e.message}`);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (!running || !(e.ctrlKey || e.metaKey)) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 9 && status?.workers[n - 1]) {
      e.preventDefault();
      select(status.workers[n - 1].name);
    } else if (e.key === "k") {
      e.preventDefault();
      $("#say").elements.text.focus();
    }
  });

  await listen("loop-line", (e) => {
    const heard = /listening on 127\.0\.0\.1:(\d+)$/.exec(e.payload);
    if (heard) port = Number(heard[1]);
    logLines.push(e.payload);
    if (logLines.length > 3000) logLines.splice(0, logLines.length - 3000);
    const log = $("#log");
    const stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 8;
    log.append(`${e.payload}\n`);
    while (log.childNodes.length > 3000) log.firstChild.remove();
    if (stick) log.scrollTop = log.scrollHeight;
  });
  await listen("loop-exit", (e) => {
    if (!running) return;
    const code = e.payload;
    const last = logLines.slice(-3).join(" / ");
    backToSetup(code === null || code === 0 || code === 130 ? undefined : `The session ended (exit ${code}). Its last words: ${last}`);
  });
  if (await invoke("start_requested")) {
    await check();
    if (!$("#start").disabled) $("#form").requestSubmit();
  }
}

main().catch((e) => {
  document.body.textContent = `agent-interactive could not start its window: ${e}`;
});
