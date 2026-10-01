#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-run --allow-env

const HELP = `agent-interactive: say a change to a web page, see it hot-reload, hear one sentence back

USAGE
  agent-interactive [DIR] [OPTIONS] [-- RECGO-TAB ARGS]

  DIR is the directory the agents may edit (default: the current one).

QUICK START
  # a local page: serve DIR with its own hot reload, type changes below
  agent-interactive demo

  # dcl.one in dev mode: edit the umbrella's working tree while you browse and talk
  agent-interactive ~/dcl-one --attach https://dcl.one \\
      --search sites/src,ui3/src --recgo -- --stt-backend realtime

  # send a change from anywhere and get its timings back
  curl -X POST 'localhost:5199/__ai/say?wait=1' --data 'make the title dark red'

CHECKING THE SETUP
  agent-interactive doctor [--json] [DIR] [OPTIONS]
                       checks what a run with these options needs, without starting it: Deno, rg/git/
                       curl, the page (a Vite dev server with hot reload for --attach), the fast lane
                       (a real warm-up with --flash-model), Claude (installed, logged in, agent-pty,
                       whether it already trusts DIR), voice (recgo-tab and the browser's debugging
                       port) and spoken replies. Each problem comes with its fix; exits 1 if one
                       would stop the run. --json is what the app reads

GIVING INSTRUCTIONS
  a typed line         a change for the fast lane
  !a typed line        straight to the large-change lane (Claude)
  :mark                passed to recgo-tab's stdin (also :sysaudio on|off)
  never mind           "never mind", "cancel that", "don't change it", "dejalo", "olvidate" (short,
                       on their own) cancel the latest change: out of the queue if it waits, aborted
                       if the fast lane runs it, interrupted if Claude does
  mute                 say "mute" / "stop listening" / "silencio" (alone), type :mute, use the app's
                       mute button or POST /__ai/mute: narration is ignored, so you can talk freely;
                       "unmute" / "start listening" / "escuchá", :unmute or the button bring it back
  POST /__ai/say       body = the change; ?wait=1 answers with its timings,
                       ?source=narration judges it the way speech is judged,
                       ?dry=1 has the fast lane say what it would change without editing
  POST /__ai/context   recgo-format lines (Navigate:, Click:) as if recgo had seen them;
                       ?clear=1 forgets the page and clicks first
  speech (--recgo)     each narrated sentence is judged: requests and complaints ("this doesn't
                       look right") run, diagnosis ("figure out why", "error", "loading") goes
                       to Claude, approval and chatter wait as context or are dropped

WHERE THE PAGE COMES FROM
  (default)            DIR is served on --port with its own hot reload and a status pill
  --attach URL         a Vite dev server already serves the page (https://dcl.one): nothing is
                       served, its HMR socket is read and DIR is edited in place
  --search DIRS        with --attach: comma-separated dirs under DIR that hold the page's code;
                       what you click is looked up there (default: all of DIR)
  --port N             this loop's HTTP port (default 5199); the fast lane's server takes N+1. When
                       either is taken the next pair is tried (N+2, N+4, ... 50 of them) and the
                       loop says "listening on 127.0.0.1:PORT"

AGENTS
  --flash-model P/M    fast lane model (default cerebras/qwen-3.8-27b)
  --opencode-cmd CMD   opencode launcher, started as 'CMD serve' (default opencode-bwrap; the
                       gVisor launcher is far slower on an NFS tree)
  --opencode URL       use an opencode server that is already running instead
  --flash-budget S     seconds the fast lane gets to reach a change before it is aborted and
                       handed to Claude (default 20). The fast lane is one agent that starts a
                       fresh session for every change (pre-warmed, so it costs nothing); the
                       last few changes ride along in its prompt instead of a history
  --claude-workers N   large-change agents working at once (default 4), each an interactive Claude
                       Code in its own terminal (agent-pty), which the app shows and you can type
                       into. A change starts beside the running ones only when the files
                       it points at differ from theirs; one that touches a file being edited, or
                       whose files are unknown (a bare "no, the other way"), waits its turn
  --claude-cmd CMD     the large-change lane (default claude; 'none' keeps everything fast)
  --claude-model M     its model (default claude-opus-5-5)
  --claude-effort E    low, medium, high, xhigh or max: how hard each agent thinks (--effort);
                       default: Claude Code's own

THE APP
  agent-interactive-app starts this loop and shows every agent: what it is doing, the queue, recent
  results, each Claude agent's terminal and the fast lane's log. Without it:
  GET /__ai/status     every agent, the queue and recent results as JSON
  GET /__ai/worker     ?name=AGENT[&after=N]: that agent's log (changes, tool calls, replies)
  WS /__ai/term        ?agent=claude-N: that agent's terminal; binary frames both ways,
                       text {"resize": [cols, rows]}; opening it starts the agent

LISTENING
  --recgo              run recgo-tab. With --attach it records the open tab whose URL matches
                       (a browser with remote debugging, port 9222); otherwise it launches a
                       browser on the page. Arguments after -- go to recgo-tab
                       (--stt-backend realtime streams narration as you speak)
  --recgo-port N       recgo-tab's CDP port (default 9333 for a launched browser, 9222 with --attach)
  --gate-url URL       judge narration with URL/v1/systemone instead of keywords
  --gate-model M       the model the gate asks (default auto)
  --settle MS          a spoken request is sent once you pause: nothing heard for MS (default
                       1000; 0 sends each sentence at once), and up to 5 s more while it ends
                       mid-sentence ("...so that we can"); everything said by then is one request
  --no-follow-up       send every request as a new change. By default, while the last change is
                       still waiting, running or done less than a minute ago, the fast model is
                       asked whether the new words belong to it (a correction, a change of mind,
                       the rest of the sentence, more detail about the same thing). If they do,
                       they join it before it starts, or run next in the same agent's session

SPEAKING
  --say WHAT           speaches (default): TTS from --tts-url played with pw-play (afplay on a Mac,
                       spd-say or say when the server fails); none; or a
                       command run as CMD "<summary>"
  --tts-url URL        speech endpoint base (default http://localhost:8000)
  --tts-voice V        voice (default af_heart)
  --tts-speed X        0.5 to 2.0 (default 2.0)

OUTPUT
  One line per change here: what was heard, the lane, the files, and milliseconds to the
  file write, the HMR frame, the paint (local pages) and the spoken summary.
  --log FILE           the same as JSONL (default $TMPDIR/agent-interactive-PORT.jsonl)
  --trajectories DIR   where each run's trajectory goes: every recgo line, gate verdict and change
                       with its inputs (page, clicks, screen text, hint files, prompt), tool calls,
                       exact edits and timings, for replay as evals (default: recgo's sessions_dir
                       + /agent-interactive, else ~/walk-and-talk/agent-interactive; none = off)
  GET /__ai/jobs       the last 20 as JSON
  GET /__ai/page       the route and files the loop takes the current page (or ?url=) to be
  POST /__ai/relation  {"prev", "said", "running"?: "claude"|"queued"}: the follow-up check alone
                       (evals/follow.jsonl)
  --no-toast           no status pill in a served page

Ctrl-C stops everything; recgo-tab writes its session document first.`;

function die(msg: string): never {
  console.error(`agent-interactive: ${msg}`);
  Deno.exit(2);
}

function usage(msg: string): never {
  console.error(`agent-interactive: ${msg}\nrun 'agent-interactive --help' for the options`);
  Deno.exit(64);
}

const OPTIONS = ["--port", "--attach", "--search", "--opencode", "--opencode-cmd", "--flash-model", "--flash-budget", "--claude-workers",
  "--claude-cmd", "--claude-model", "--claude-effort", "--recgo", "--recgo-port", "--gate-url", "--gate-model", "--say",
  "--tts-url", "--tts-voice", "--tts-speed", "--log", "--trajectories", "--no-toast", "--settle", "--no-follow-up", "--help"];
const RECGO_FLAGS = /^--?(stt-|headless|no-audio|mic|live|system-audio|out|duration|match|launch|portal|title-|whisper-|no-sync|sync-target|keep-raw|json)/;

function unknownOption(a: string): string {
  if (RECGO_FLAGS.test(a)) return `${a} is a recgo-tab option: put it after --, e.g. --recgo -- ${a} ...`;
  const [best, dist] = OPTIONS.map((opt) => [opt, lev(a, opt)] as const).sort((p, q) => p[1] - q[1])[0];
  return dist <= 3 ? `unknown option ${a}; did you mean ${best}?` : `unknown option ${a}`;
}

function parseArgs(raw: string[]) {
  const cut = raw.indexOf("--");
  const argv = [
    ...(cut < 0 ? raw : raw.slice(0, cut)).flatMap((x) => /^--[^=]+=/.test(x) ? [x.slice(0, x.indexOf("=")), x.slice(x.indexOf("=") + 1)] : [x]),
    ...(cut < 0 ? [] : raw.slice(cut)),
  ];
  let dirGiven = "";
  const o = {
    dir: ".",
    port: 5199,
    attach: "",
    search: "",
    opencode: "",
    opencodeCmd: "opencode-bwrap",
    flashModel: "cerebras/qwen-3.8-27b",
    claudeCmd: "claude",
    claudeModel: "claude-opus-5-5",
    gateUrl: "",
    gateModel: "auto",
    recgo: false,
    recgoPort: 0,
    recgoArgs: [] as string[],
    say: "speaches",
    ttsUrl: "http://localhost:8000",
    ttsVoice: "af_heart",
    ttsSpeed: 2.0,
    flashBudget: 20,
    claudeWorkers: 4,
    claudeEffort: "",
    settle: 1000,
    followUp: true,
    log: "",
    toast: true,
    trajectories: "",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => argv[++i] ?? usage(`${a} needs a value`);
    const url = () => val().replace(/\/$/, "");
    const num = () => {
      const n = Number(val());
      return Number.isInteger(n) && n > 0 ? n : usage(`${a} needs a positive whole number (got ${argv[i]})`);
    };
    switch (a) {
      case "--port": o.port = num(); break;
      case "--attach": o.attach = url(); break;
      case "--search": o.search = val(); break;
      case "--opencode": o.opencode = url(); break;
      case "--opencode-cmd": o.opencodeCmd = val(); break;
      case "--flash-model":
        o.flashModel = val();
        if (!/^[^/\s]+\/\S+$/.test(o.flashModel)) usage(`--flash-model wants provider/model, e.g. cerebras/qwen-3.8-27b (got ${o.flashModel})`);
        break;
      case "--tts-url": o.ttsUrl = url(); break;
      case "--tts-voice": o.ttsVoice = val(); break;
      case "--tts-speed": {
        const x = Number(val());
        o.ttsSpeed = x >= 0.5 && x <= 2 ? x : usage(`--tts-speed must be between 0.5 and 2.0 (got ${argv[i]}); speaches refuses anything else`);
        break;
      }
      case "--claude-cmd": o.claudeCmd = val(); break;
      case "--claude-model": o.claudeModel = val(); break;
      case "--claude-effort":
        o.claudeEffort = val();
        if (!/^(low|medium|high|xhigh|max)$/.test(o.claudeEffort)) usage(`--claude-effort is low, medium, high, xhigh or max (got ${o.claudeEffort})`);
        break;
      case "--gate-url": o.gateUrl = url(); break;
      case "--gate-model": o.gateModel = val(); break;
      case "--recgo": o.recgo = true; break;
      case "--recgo-port": o.recgoPort = num(); break;
      case "--say": o.say = val(); break;
      case "--flash-budget": o.flashBudget = num(); break;
      case "--claude-workers": o.claudeWorkers = num(); break;
      case "--settle": o.settle = num(); break;
      case "--no-follow-up": o.followUp = false; break;
      case "--log": o.log = val(); break;
      case "--trajectories": o.trajectories = val(); break;
      case "--no-toast": o.toast = false; break;
      case "--": o.recgoArgs = argv.slice(i + 1); i = argv.length; break;
      case "-h":
      case "--help":
        console.log(HELP);
        Deno.exit(0);
        break;
      default:
        if (a.startsWith("-")) usage(unknownOption(a));
        if (dirGiven) usage(`two directories given (${dirGiven} and ${a}); agent-interactive edits one`);
        dirGiven = a;
        o.dir = a;
    }
  }
  return o;
}

const doctorMode = Deno.args[0] === "doctor";
const doctorJson = doctorMode && Deno.args.includes("--json");
const o = parseArgs(doctorMode ? Deno.args.slice(1).filter((a) => a !== "--json") : Deno.args);
const askedPort = o.port;
if (doctorMode) {
  o.trajectories = "none";
  o.log ||= "/dev/null";
  o.port = freePort(() => 20000 + Math.floor(Math.random() * 20000));
} else {
  o.port = freePort((i) => askedPort + 2 * i);
}

function free(port: number): boolean {
  try {
    Deno.listen({ hostname: "127.0.0.1", port }).close();
    return true;
  } catch {
    return false;
  }
}

function freePort(nth: (i: number) => number): number {
  for (let i = 0; i < 50; i++) {
    const p = nth(i);
    if (p > 65534) break;
    if (free(p) && (o.opencode || free(p + 1))) return p;
  }
  die(`no free pair of ports from ${askedPort} on (tried 50: this loop takes N, its fast lane N+1); pick another start with --port N`);
}

const root = (() => {
  try {
    const r = Deno.realPathSync(o.dir);
    if (!Deno.statSync(r).isDirectory) die(`${o.dir} is a file; give the directory the agents may edit`);
    return r;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) die(`no such directory: ${o.dir}`);
    throw e;
  }
})();
const absolute = (p: string) => p && p !== "none" && !p.startsWith("/") ? `${Deno.cwd()}/${p}` : p;
o.log = absolute(o.log);
o.trajectories = absolute(o.trajectories);
Deno.chdir(root);
if (o.attach && !/^https?:\/\//.test(o.attach)) usage(`--attach wants the page's URL, e.g. https://dcl.one (got ${o.attach})`);
const searchDirs = o.search ? o.search.split(",").map((s) => s.trim()).filter(Boolean) : ["."];
for (const d of o.search ? searchDirs : []) {
  try {
    Deno.statSync(`${root}/${d}`);
  } catch {
    die(`--search ${d}: no such directory under ${root}`);
  }
}
const pageUrl = o.attach ? `${o.attach}/` : `http://localhost:${o.port}/`;
const tmp = Deno.env.get("TMPDIR") ?? "/tmp";
const logPath = o.log || `${tmp}/agent-interactive-${o.port}.jsonl`;
const JSON_H = { "content-type": "application/json" };
const enc = new TextEncoder();

type Route = "flash" | "opus" | "flash→opus";
type Job = {
  id: number;
  source: string;
  text: string;
  route: Route;
  heard: number;
  gateMs?: number;
  dispatched?: number;
  write?: number;
  hmr?: number;
  applied?: number;
  hidden?: boolean;
  done?: number;
  spoken?: number;
  files: string[];
  reply?: string;
  summary?: string;
  error?: string;
  escalated?: boolean;
  retried?: boolean;
  nudged?: boolean;
  repairOf?: number;
  follows?: Job;
  pin?: string;
  sid?: string;
  question?: boolean;
  settleMs?: number;
  hints?: string;
  cancelled?: boolean;
  footprint?: Set<string> | null;
  worker?: string;
  dry?: boolean;
  tools?: string[];
  writeDenied?: string;
  promptBytes?: number;
  prompt?: string;
  screen?: string[];
  named?: string[];
  hintFiles?: { file: string; why: string }[];
  page?: string;
  clicks?: string[];
  trace?: { tool: string; what: string; ms?: number; status?: string }[];
  edits?: { file: string; old?: string; new?: string; bytes?: number }[];
  hmrError?: string;
  ttsMs?: number;
  appliedSignal: PromiseWithResolvers<void>;
  hmrSignal: PromiseWithResolvers<void>;
  finished: PromiseWithResolvers<Job>;
};

let nextId = 1;
const jobs: Job[] = [];
const inflight = new Set<Job>();
const clicks: string[] = [];
const pageErrors = new Map<string, { line: string; count: number; at: number }>();
const clients = new Set<WebSocket>();
const seqJob = new Map<number, Job>();
let seq = 0;

const now = () => Date.now();
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const say = (line: string) => doctorMode || console.log(`${new Date().toTimeString().slice(0, 8)}  ${line}`);

function send(msg: unknown) {
  const s = JSON.stringify(msg);
  for (const c of clients) if (c.readyState === WebSocket.OPEN) c.send(s);
}

function status(job: Job, phase: string, msg: string) {
  send({ ai: "status", id: job.id, phase, msg });
}

function newJob(source: string, text: string, route: Route): Job {
  const job: Job = {
    id: nextId++,
    source,
    text,
    route,
    heard: now(),
    files: [],
    appliedSignal: Promise.withResolvers<void>(),
    hmrSignal: Promise.withResolvers<void>(),
    finished: Promise.withResolvers<Job>(),
  };
  jobs.push(job);
  if (jobs.length > 200) jobs.shift();
  return job;
}

function enqueue(source: string, text: string, gateMs?: number, dry = false): Job {
  const large = text.startsWith("!") && !dry;
  const body = large ? text.slice(1).trim() : text;
  const job = newJob(source, body, large && claude ? "opus" : "flash");
  job.gateMs = gateMs;
  job.dry = dry;
  say(`#${job.id} heard (${source}): ${clip(body, 100)}`);
  status(job, "working", `…${clip(body, 60)}`);
  preparing.add(job);
  prepare(job).catch(() => {}).finally(() => {
    preparing.delete(job);
    submit(job);
  });
  return job;
}

const EDITABLE = /\.(html?|css|m?js|jsx|tsx?|svg|json)$/i;
const skipped = (rel: string) => rel.split("/").some((s) => s.startsWith(".") || s === "node_modules");

async function projectFiles(limit = 64_000): Promise<string> {
  const out: string[] = [];
  let total = 0;
  const walk = async (dir: string, depth: number) => {
    for await (const e of Deno.readDir(dir)) {
      const abs = `${dir}/${e.name}`;
      const rel = abs.slice(root.length + 1);
      if (skipped(rel)) continue;
      if (e.isDirectory && depth < 3) await walk(abs, depth + 1);
      else if (e.isFile && EDITABLE.test(e.name)) {
        const text = await Deno.readTextFile(abs);
        if (total + text.length > limit) out.push(`=== ${rel} === (not shown: over the prompt budget)\n`);
        else {
          total += text.length;
          out.push(`=== ${rel} ===\n${text}\n`);
        }
      }
    }
  };
  await walk(root, 0);
  return out.sort().join("\n");
}

function recentChanges(): string {
  const done = jobs.filter((j) => j.done !== undefined && !j.error && !j.dry && j.summary && now() - j.done < 10 * 60_000).slice(-4);
  if (!done.length) return "";
  const line = (j: Job) => `- they said "${clip(j.text, 140)}" -> ${j.summary}${j.files.length ? ` (${j.files.join(", ")})` : ""}`;
  return `Changes made just before this one, oldest first:\n${done.map(line).join("\n")}\n\n`;
}

function contextBlock(withErrors = false): string {
  const parts: string[] = [];
  if (clicks.length) parts.push(`What they clicked, newest last:\n${clicks.join("\n")}`);
  if (withErrors && pageErrors.size) {
    const errs = [...pageErrors.values()].sort((a, b) => a.at - b.at).slice(-6)
      .map((e) => `${e.line}${e.count > 1 ? ` (×${e.count})` : ""}`);
    parts.push(`Errors the page reported, newest last:\n${errs.join("\n")}`);
  }
  return parts.length ? `${parts.join("\n\n")}\n\n` : "";
}

const RULES = `Make the smallest change that does what they asked. Afterwards reply with one sentence of at most 100 characters that starts with "I " and says what you changed.
If the request needs more than a few small edits (new sections, new behaviour, restructuring), change nothing and reply "ESCALATE: " and a short reason.
If what they said is not a request to change the page, change nothing and reply "SKIP".`;

let lastPage = "";

function clickTokens(): string[] {
  const out: string[] = [];
  for (const line of clicks.slice(-2).reverse()) {
    const sel = line.match(/ on (.+?)(?: text: | → | — |$)/)?.[1] ?? "";
    const parts = sel.split(/\s*>\s*|\s+/).reverse();
    for (const p of parts) {
      for (const m of p.matchAll(/data-testid="([^"]+)"|#([A-Za-z_][\w-]{2,})|\.([A-Za-z_][\w-]{2,})/g)) {
        const t = m[1] ?? m[2] ?? m[3];
        if (t && !out.includes(t)) out.push(t);
      }
    }
    const text = line.match(/ text: (.+?)(?: → | — |$)/)?.[1]?.trim();
    if (text && text.length >= 3 && !out.includes(text)) out.push(text);
  }
  return out.slice(0, 5);
}

async function rg(args: string[]): Promise<string[]> {
  const out = await new Deno.Command("rg", { args, cwd: root, stdout: "piped", stderr: "null" }).output().catch(() => undefined);
  return out ? new TextDecoder().decode(out.stdout).split("\n").filter(Boolean).map((l) => l.replace(/^\.\//, "")) : [];
}

async function rgFiles(token: string): Promise<string[]> {
  return (await rg(["-l", "-F", "--glob", "*.{css,scss,tsx,ts,jsx,js,html}", "--", token, ...searchDirs])).slice(0, 3);
}

const STOP = new Set(("a an and are as at be but by can could do does for from get go had has have here how i if in into " +
  "is it its just let lets like make me more my not now of oh ok okay on or our please put really so some that the their " +
  "them then there these they this those to too um uh up us very was we what whats when where which why will with would " +
  "yeah yes you your also bit little change drop remove add move replace want need should thing things one way").split(" "));

function phraseTiers(text: string): string[][] {
  const quoted = [...text.matchAll(/["“]([^"”]{3,60})["”]/g)].map((m) => m[1].toLowerCase());
  const words = text.toLowerCase().replace(/['’]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").split(" ").filter(Boolean);
  const isContent = (x: string) => !STOP.has(x) && x.length >= 3;
  const tiers: string[][] = [[...quoted], [], []];
  for (const n of [3, 2]) {
    for (let i = 0; i + n <= words.length; i++) {
      const w = words.slice(i, i + n);
      const content = w.filter(isContent);
      if (!isContent(w[0]) && !isContent(w[n - 1])) continue;
      if (content.length >= 2 || (n === 2 && content.some((x) => x.length >= 6))) tiers[3 - n].push(w.join(" "));
    }
  }
  for (const w of words) if (isContent(w) && w.length >= 8) tiers[2].push(w);
  return tiers.map((t) => [...new Set(t)].slice(0, 6));
}

function clickFiles(): Promise<{ rel: string; token: string }[]> {
  return Promise.all(clickTokens().map(async (t) => ({ t, files: await rgFiles(t).catch(() => []) })))
    .then((hits) => hits.flatMap(({ t, files }) => files.map((rel) => ({ rel, token: t }))));
}

const RG_SOURCE = ["--glob", "*.{css,scss,tsx,ts,jsx,js,html,json}", "--glob", "!**/build/**", "--glob", "!**/dist/**",
  "--glob", "!**/generated/**", "--glob", "!*.test.*", "--glob", "!*.spec.*", "--glob", "!*.stories.*"];

function rgTier(ps: string[], perFile: number): Promise<string[]> {
  if (!ps.length) return Promise.resolve([]);
  return rg(["-n", "-i", "-F", "--max-count", String(perFile), "--max-columns", "180", "--max-columns-preview", ...RG_SOURCE,
    ...ps.flatMap((p) => ["-e", p]), "--", ...searchDirs]);
}

type Hit = { lines: number[]; literal: boolean };

async function wordHits(text: string): Promise<{ lines: string; strong: Map<string, Hit> }> {
  const tiers = phraseTiers(text);
  const found = await Promise.all(tiers.map((t, i) => rgTier(t, i === 0 ? 8 : 4)));
  const shown = found.flatMap((lines, i) => lines.slice(0, [10, 5, 3][i]));
  const [strongTier, phrases] = found[0].length ? [found[0], tiers[0]] : [found[1], tiers[1]];
  const asText = (line: string) => {
    const t = line.toLowerCase();
    const spans = [...t.matchAll(/(["'`])(.*?)\1/g)].map((m) => m[2]).concat([...t.matchAll(/>([^<]+)</g)].map((m) => m[1]));
    return phrases.some((p) => spans.some((x) => x.includes(p)));
  };
  const byFile = new Map<string, Hit>();
  for (const l of strongTier) {
    const [f, n] = l.split(":");
    const hit = byFile.get(f) ?? { lines: [], literal: false };
    hit.lines.push(Number(n));
    hit.literal ||= asText(l.split(":").slice(2).join(":"));
    byFile.set(f, hit);
  }
  const strong = new Map([...byFile].sort((x, y) => Number(y[1].literal) - Number(x[1].literal) || y[1].lines.length - x[1].lines.length)
    .slice(0, 3));
  return { lines: shown.length ? `Lines that contain their words (file:line:text):\n${shown.join("\n")}\n\n` : "", strong };
}

const FILE_WHOLE = 24_000;
const CONTEXT_BUDGET = 64_000;
type Context = { files: Map<string, string>; why: Map<string, string>; notes: string[]; bytes: number };

async function addFile(ctx: Context, rel: string, why: string, lines: number[] = [], cap = CONTEXT_BUDGET) {
  if (ctx.files.has(rel)) return;
  const text = await Deno.readTextFile(`${root}/${rel}`).catch(() => "");
  if (!text) return;
  let body = text;
  let label = "whole file";
  if (text.length > FILE_WHOLE) {
    if (!lines.length) {
      ctx.notes.push(`${rel} (${why}; ${Math.round(text.length / 1024)} KB)`);
      return;
    }
    const all = text.split("\n");
    const spans: [number, number][] = [];
    for (const n of [...lines].sort((x, y) => x - y)) {
      const lo = Math.max(0, n - 41), hi = Math.min(all.length, n + 40);
      const last = spans.at(-1);
      if (last && lo <= last[1]) last[1] = Math.max(last[1], hi);
      else spans.push([lo, hi]);
    }
    body = spans.map(([lo, hi]) => all.slice(lo, hi).join("\n")).join("\n[…]\n");
    label = `lines ${spans.map(([lo, hi]) => `${lo + 1}-${hi}`).join(", ")} of ${all.length}`;
  }
  if (ctx.bytes + body.length > cap) {
    ctx.notes.push(`${rel} (${why}; over the prompt budget)`);
    return;
  }
  ctx.bytes += body.length;
  ctx.files.set(rel, `=== ${rel} === (${label}, current; ${why})\n${body}\n`);
  ctx.why.set(rel, why);
}

const STYLE = /\.(css|scss|sass|less)$/;
const COMPONENT = /\.(tsx|jsx|vue|svelte|astro)$/;

type App = { routesDir: string; routes: { rel: string; name: string }[]; aliases: [string, string][] };
let app: App | undefined;

async function detectApp() {
  const cfg = (await rg(["--files", "--max-depth", "3", "--glob", "react-router.config.*", "."]))[0];
  if (!cfg) return;
  const dir = cfg.includes("/") ? cfg.slice(0, cfg.lastIndexOf("/")) : ".";
  const appDir = (await Deno.readTextFile(`${root}/${cfg}`)).match(/appDirectory:\s*["']([^"']+)["']/)?.[1] ?? "app";
  const routesDir = `${dir}/${appDir}/routes`.replace(/^\.\//, "");
  const routes: App["routes"] = [];
  for await (const e of Deno.readDir(`${root}/${routesDir}`)) {
    if (/\.(test|spec)\./.test(e.name)) continue;
    if (e.isFile && /\.(tsx|ts|jsx|js)$/.test(e.name)) routes.push({ rel: `${routesDir}/${e.name}`, name: e.name.replace(/\.[jt]sx?$/, "") });
    else if (e.isDirectory) {
      for (const f of ["route.tsx", "route.ts", "route.jsx"]) {
        try {
          Deno.statSync(`${root}/${routesDir}/${e.name}/${f}`);
          routes.push({ rel: `${routesDir}/${e.name}/${f}`, name: e.name });
          break;
        } catch { /* not this one */ }
      }
    }
  }
  const tsconfig = await Deno.readTextFile(`${root}/${dir}/tsconfig.json`).catch(() => "");
  const aliases: [string, string][] = [...tsconfig.matchAll(/"([^"*]+)\*"\s*:\s*\[\s*"([^"*]+)\*"/g)]
    .map(([, from, to]) => [from, normalize(`${dir}/${to}`) + (to.endsWith("/") ? "/" : "")]);
  app = { routesDir, routes, aliases };
  say(`page files: ${routes.length} routes under ${routesDir}, ${aliases.length} import aliases`);
}

function normalize(p: string): string {
  const out: string[] = [];
  for (const part of p.split("/")) {
    if (part === "..") out.pop();
    else if (part && part !== ".") out.push(part);
  }
  return out.join("/");
}

function routeFor(pathname: string): string | undefined {
  if (!app) return undefined;
  const segs = pathname.split("/").filter(Boolean).map((x) => decodeURIComponent(x));
  let best: { rel: string; score: number } | undefined;
  for (const r of app.routes) {
    const parts = r.name.split(".").filter((x) => !(x.startsWith("_") && x !== "_index")).map((x) => x.replace(/_$/, ""));
    const index = parts.at(-1) === "_index";
    if (index) parts.pop();
    let i = 0, score = index ? 1 : 0, ok = true;
    for (const p of parts) {
      if (p === "$") {
        i = segs.length;
        score += 1;
        break;
      }
      if (p.startsWith("(") && p.endsWith(")")) {
        if (segs[i] === p.slice(1, -1).replace(/^\$/, segs[i] ?? "")) i++;
        continue;
      }
      if (i >= segs.length) {
        ok = false;
        break;
      }
      if (p.startsWith("$")) score += 5;
      else if (p === segs[i]) score += 10;
      else {
        ok = false;
        break;
      }
      i++;
    }
    if (ok && i === segs.length && (!best || score > best.score)) best = { rel: r.rel, score };
  }
  return best?.rel;
}

async function importsOf(rel: string): Promise<string[]> {
  const text = await Deno.readTextFile(`${root}/${rel}`).catch(() => "");
  const specs = [...text.matchAll(/(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\sfrom\s+)?["']([^"']+)["']/g)]
    .filter((m) => !/^\s*import\s+type\s/.test(m[0].trim())).map((m) => m[1]);
  const base = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : ".";
  const out: string[] = [];
  for (const spec of specs) {
    const alias = app?.aliases.find(([from]) => spec.startsWith(from));
    const path = alias ? `${alias[1]}${spec.slice(alias[0].length)}` : spec.startsWith(".") ? normalize(`${base}/${spec}`) : "";
    if (!path) continue;
    for (const ext of ["", ".tsx", ".ts", ".jsx", ".js", ".vue", ".svelte", "/index.tsx", "/index.ts", "/index.jsx", "/index.js"]) {
      try {
        if (Deno.statSync(`${root}/${path}${ext}`).isFile) {
          out.push(`${path}${ext}`);
          break;
        }
      } catch { /* try the next */ }
    }
  }
  return out;
}

async function pageFiles(url: string): Promise<{ route?: string; files: string[] }> {
  let route: string | undefined;
  try {
    route = routeFor(new URL(url).pathname);
  } catch {
    return { files: [] };
  }
  if (!route) return { files: [] };
  const ui = (f: string) => STYLE.test(f) || COMPONENT.test(f);
  const out = [route];
  let level = [route];
  for (let depth = 0; depth < 2 && out.length < 14; depth++) {
    const next: string[] = [];
    for (const f of level) {
      for (const imp of (await importsOf(f)).filter(ui)) {
        if (out.includes(imp)) continue;
        out.push(imp);
        if (COMPONENT.test(imp)) next.push(imp);
      }
    }
    level = next;
  }
  for (const f of out.filter((x) => COMPONENT.test(x) && x !== route)) {
    for (const c of await importsOf(f)) if (STYLE.test(c) && !out.includes(c)) out.push(c);
  }
  const css = out.filter((f) => STYLE.test(f));
  const tsx = out.slice(1).filter((f) => !css.includes(f));
  const pages = tsx.filter((f) => /\/(pages|routes|views|screens|app)\//.test(f));
  return { route, files: [route, ...pages, ...css, ...tsx.filter((f) => !pages.includes(f))].slice(0, 14) };
}

function lastChange(): Job | undefined {
  return jobs.filter((j) => j.done !== undefined && !j.dry && j.files.length && now() - j.done < 10 * 60_000).at(-1);
}

const PAGE_BUDGET = 32_000;

let tabCdp: { port: number; id: string } | undefined;
let screenCache: { at: number; lines: string[] } | undefined;

let screenOverride: string[] | undefined;

async function screenLines(): Promise<string[]> {
  if (screenOverride) return screenOverride;
  if (!tabCdp) return [];
  if (screenCache && now() - screenCache.at < 1500) return screenCache.lines;
  const { port, id } = tabCdp;
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(800) })).json();
  const url = (list as { id: string; webSocketDebuggerUrl?: string }[]).find((t) => t.id === id)?.webSocketDebuggerUrl;
  if (!url) return [];
  const text = await new Promise<string>((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("the tab did not answer"));
    }, 1500);
    ws.onopen = () =>
      ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: "document.body ? document.body.innerText : ''", returnByValue: true } }));
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      if (m.id !== 1) return;
      clearTimeout(timer);
      ws.close();
      resolve(String(m.result?.result?.value ?? ""));
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("could not reach the tab"));
    };
  });
  const lines = [...new Set(text.split("\n").map((l) => l.trim().replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2"))
    .filter((l) => l.length >= 3 && l.length <= 140))].slice(0, 800);
  screenCache = { at: now(), lines };
  return lines;
}

function lev(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

function onScreen(text: string, lines: string[]): string[] {
  const words = (x: string) =>
    x.toLowerCase().replace(/['’‘]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").split(" ").filter((w) => w.length >= 3 && !STOP.has(w));
  const said = words(text);
  if (!said.length) return [];
  const close = (a: string, b: string) =>
    a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a) || lev(a, b) <= (Math.min(a.length, b.length) >= 7 ? 2 : 1)));
  return lines.map((line) => {
    const lw = words(line);
    const hit = lw.filter((w) => said.some((x) => close(x, w))).length;
    return { line, hit, score: lw.length ? hit / lw.length : 0, n: lw.length };
  }).filter((x) => x.n <= 16 && x.score >= 0.6 && (x.hit >= 2 || (x.n === 1 && x.line.length >= 6)))
    .sort((a, b) => b.hit - a.hit || b.score - a.score || a.line.length - b.line.length).slice(0, 3).map((x) => x.line);
}

function looseRegex(line: string): string {
  return line.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/['’‘]/g, ".?")).join("\\s+");
}

async function screenHits(text: string): Promise<{ named: string[]; strong: Map<string, Hit>; lines: string[] }> {
  const lines = await screenLines().catch(() => [] as string[]);
  const named = onScreen(text, lines);
  if (!named.length) return { named, strong: new Map(), lines };
  const patterns = named.flatMap((l) => {
    const w = l.split(/\s+/);
    return w.length >= 5 ? [l, w.slice(0, 3).join(" "), w.slice(-3).join(" ")] : [l];
  });
  const strong = new Map<string, Hit>();
  for (const l of await rg(["-n", "-i", "--max-count", "4", "--max-columns", "180", "--max-columns-preview", ...RG_SOURCE,
    ...patterns.flatMap((p) => ["-e", looseRegex(p)]), "--", ...searchDirs])) {
    const [f, n] = l.split(":");
    const hit = strong.get(f) ?? { lines: [], literal: true };
    hit.lines.push(Number(n));
    strong.set(f, hit);
  }
  return { named, strong: new Map([...strong].slice(0, 3)), lines };
}

async function prepare(job: Job) {
  job.page = lastPage;
  job.clicks = [...clicks];
  const [words, clicked, page, screen] = await Promise.all([
    wordHits(job.text), clickFiles(), o.attach && lastPage ? pageFiles(lastPage) : Promise.resolve({ files: [] as string[] }),
    screenHits(job.text),
  ]);
  const onPage = new Set(page.files);
  const ctx: Context = { files: new Map(), why: new Map(), notes: [], bytes: 0 };
  for (const [rel, h] of screen.strong) await addFile(ctx, rel, "holds the on-screen text they named", h.lines);
  for (const { rel, token } of clicked.slice(0, 4)) await addFile(ctx, rel, `holds "${token}", what they last clicked`);
  const hits = [...words.strong];
  const likelyHits = hits.filter(([f, h]) => onPage.has(f) || h.literal);
  for (const [rel, h] of likelyHits) {
    await addFile(ctx, rel, onPage.has(rel) ? "holds their words, on this page" : "holds their words as text", h.lines);
  }
  const last = lastChange();
  const target = new Set(ctx.files.keys());
  for (const rel of last?.files ?? []) await addFile(ctx, rel, `edited by the change just before (#${last!.id})`);
  const likely = [...ctx.files.keys()];
  const pageCap = likely.length ? 0 : PAGE_BUDGET;
  for (const rel of page.files) {
    if (ctx.bytes >= pageCap) break;
    await addFile(ctx, rel, "part of the page they are on", [], pageCap);
  }
  const named = screen.named.length
    ? `Speech recognition may have misheard them; on the page they most likely mean: ${screen.named.map((l) => `"${l}"`).join(", ")}\n\n`
    : "";
  job.hints = named + words.lines +
    (ctx.files.size ? `Current content of the files most likely involved:\n${[...ctx.files.values()].join("\n")}\n` : "") +
    (ctx.notes.length ? `Also relevant, not shown: ${ctx.notes.join("; ")}\n\n` : "");
  job.footprint = target.size ? target : words.strong.size ? new Set(words.strong.keys()) : null;
  if (isQuestion(job.text)) {
    job.question = true;
    job.footprint = new Set();
  }
  job.named = screen.named;
  job.screen = screen.lines.slice(0, 300);
  job.hintFiles = [...ctx.why].map(([file, why]) => ({ file, why }));
  if (screen.named.length) say(`#${job.id} on screen: ${screen.named.map((l) => `"${clip(l, 50)}"`).join(", ")}`);
}

async function flashPrompt(job: Job): Promise<string> {
  if (o.attach) {
    return `You are live-editing ${pageUrl} while its owner watches it and talks to you. A Vite dev server serves it from ${root} and hot-reloads every save.
The page's code is under ${searchDirs.join(", ")}. The file contents below are current: when they hold what to change, edit them straight away without reading them again. Only when what you need is not below, grep for it inside those directories (never the whole tree) and read just that; never glob, list, run commands or ask questions.
${RULES}

${ask(job)}`;
  }
  return `You are live-editing a web page while its owner watches it and talks to you. Every save hot-reloads the page.
Project directory: ${root}. The file contents below are current: edit them with the edit tool directly; never read, search, run commands or ask questions.
${RULES}

${recentChanges()}${contextBlock()}${await projectFiles()}
They said: "${job.text}"`;
}

const OPUS_ROLE = `You are live-editing a web page in ${root} while its owner watches it and talks to you. Every save hot-reloads the page, so save as soon as each part is ready. Change files only with the Edit and Write tools, never through shell commands (cat >, sed -i, a python script): the loop around you tracks your changes through those tools. Do what they ask with the fewest edits that do it well. End every turn with one sentence of at most 100 characters that starts with "I " and says what you changed; it is read aloud. Never ask through a tool: they are talking, not watching this terminal. When something is ambiguous, choose the most sensible option, do it, and name the choice in that closing sentence; only if you truly cannot go on, end with one short question instead, which is read aloud to them.`;

function ask(job: Job, withErrors = false): string {
  const f = job.follows;
  const follow = f ? `This continues their previous request, "${clip(f.text, 240)}"${f.summary ? `, which ended with: ${f.summary}` : ""}. ` +
    `Build on what was done for it; where they now say otherwise, what they say now wins.\n\n` : "";
  return `${recentChanges()}${contextBlock(withErrors)}${lastPage ? `They are looking at ${lastPage}\n\n` : ""}${job.hints ?? ""}${follow}They said: "${job.text}"`;
}

const READ_TOOLS_OFF = Object.fromEntries(
  ["read", "glob", "grep", "list", "bash", "webfetch", "websearch", "codesearch", "task", "todowrite", "todoread", "skill", "question"]
    .map((t) => [t, false]),
);
const ALL_TOOLS_OFF = { ...READ_TOOLS_OFF, edit: false, write: false, patch: false };
const ATTACH_TOOLS = { ...READ_TOOLS_OFF, read: true, grep: true };
const FLASH_TOOLS = o.attach ? ATTACH_TOOLS : READ_TOOLS_OFF;
const EDIT_TOOLS = new Set(["edit", "write", "patch", "multiedit", "Edit", "Write", "MultiEdit"]);

function insideSearch(path: string): boolean {
  if (searchDirs.includes(".")) return true;
  const abs = path.startsWith("/") ? normalize(path) : normalize(`${root}/${path || "."}`);
  return searchDirs.some((d) => {
    const dir = normalize(`${root}/${d}`);
    return abs === dir || abs.startsWith(`${dir}/`);
  });
}

function relTo(file: string): string {
  return file.startsWith(root + "/") ? file.slice(root.length + 1) : file;
}

function describeInput(i: Record<string, unknown>): string {
  const f = (i.filePath ?? i.file_path) as string | undefined;
  if (f) return relTo(f);
  const pat = i.pattern as string | undefined;
  if (pat) return `'${clip(pat, 60)}'${i.path ? ` in ${relTo(String(i.path))}` : ""}`;
  return clip(String(i.command ?? i.description ?? ""), 80);
}

function noteEdit(job: Job, file: string, old?: string, neu?: string, content?: string) {
  (job.edits ??= []).push({ file: relTo(file), old, new: neu, bytes: content?.length });
}

const toolWhat = (i: { file_path?: string; pattern?: string; command?: string }) =>
  i.file_path?.split("/").at(-1) ?? (i.pattern ? `'${clip(i.pattern, 30)}'` : clip(i.command ?? "", 30));

function noteWrite(job: Job, t: number, file?: string) {
  if (job.write === undefined || t < job.write) job.write = t;
  if (!file) return;
  const rel = relTo(file);
  if (!job.files.includes(rel)) job.files.push(rel);
}


class OverBudget extends Error {}

function descendants(pid: number): number[] {
  const kids = new Map<number, number[]>();
  try {
    for (const e of Deno.readDirSync("/proc")) {
      if (!/^\d+$/.test(e.name)) continue;
      try {
        const stat = Deno.readTextFileSync(`/proc/${e.name}/stat`);
        const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
        if (!kids.has(ppid)) kids.set(ppid, []);
        kids.get(ppid)!.push(Number(e.name));
      } catch { /* exited meanwhile */ }
    }
  } catch {
    const under = (p: number): number[] =>
      new TextDecoder().decode(new Deno.Command("pgrep", { args: ["-P", String(p)], stdout: "piped", stderr: "null" }).outputSync().stdout)
        .split(/\s+/).filter(Boolean).map(Number).flatMap((k) => [...under(k), k]);
    return under(pid);
  }
  const out: number[] = [];
  const walk = (p: number) => {
    for (const k of kids.get(p) ?? []) {
      walk(k);
      out.push(k);
    }
  };
  walk(pid);
  return out;
}

function killTree(pid: number | undefined, signal: Deno.Signal = "SIGTERM") {
  if (!pid) return;
  for (const p of [...descendants(pid), pid]) {
    try {
      Deno.kill(p, signal);
    } catch { /* already gone */ }
  }
}

type Part = {
  type?: string; tool?: string;
  state?: { status?: string; error?: string; time?: { start?: number; end?: number }; input?: Record<string, string> };
};

const DENIED = /PermissionDenied|EACCES|EROFS|read-only file system|Operation not permitted|permission denied/i;

function sandboxDenial(parts: Part[]): string | undefined {
  return parts.find((p) => p.type === "tool" && EDIT_TOOLS.has(p.tool ?? "") && p.state?.status === "error" && DENIED.test(p.state?.error ?? ""))
    ?.state?.error;
}

const cannotWrite = (why: string) =>
  `the fast lane's sandbox (${o.opencodeCmd}) may not write in ${root} (${clip(why, 120)}); ` +
  "choose a launcher whose sandbox may (on the fleet opencode-bwrap: the gVisor launchers cannot write an NFS folder)";

class OpenCode {
  base = "";
  sid = "";
  spare?: Promise<string>;
  child?: Deno.ChildProcess;
  ready = Promise.withResolvers<void>();

  async start() {
    if (o.opencode) this.base = o.opencode;
    else {
      const port = o.port + 1;
      this.base = `http://127.0.0.1:${port}`;
      const logFile = await Deno.open(`${tmp}/agent-interactive-${o.port}-opencode.log`, {
        write: true, create: true, truncate: true,
      });
      try {
        this.child = new Deno.Command(o.opencodeCmd, {
          args: ["serve", "--port", String(port), "--hostname", "127.0.0.1"],
          cwd: root, stdin: "null", stdout: "null", stderr: "piped",
        }).spawn();
      } catch (e) {
        if (e instanceof Deno.errors.NotFound) {
          throw new Error(`'${o.opencodeCmd}' is not on PATH; pass --opencode-cmd <opencode launcher> or --opencode <running server URL>`);
        }
        throw e;
      }
      this.child.stderr.pipeTo(logFile.writable).catch(() => {});
      let exited: number | undefined;
      this.child.status.then((s) => (exited = s.code));
      const until = now() + 30_000;
      for (;;) {
        try {
          if ((await fetch(`${this.base}/config`, { signal: AbortSignal.timeout(1000) })).ok) break;
        } catch { /* not up yet */ }
        const log = `${tmp}/agent-interactive-${o.port}-opencode.log`;
        if (exited !== undefined) throw new Error(`${o.opencodeCmd} serve exited ${exited} before answering; see ${log}`);
        if (now() > until) throw new Error(`${o.opencodeCmd} serve did not answer on ${this.base} within 30s; see ${log}`);
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    this.spare = this.newSession();
    await this.spare;
    this.ready.resolve();
  }

  async newSession(): Promise<string> {
    const r = await fetch(`${this.base}/session`, {
      method: "POST", headers: JSON_H, body: JSON.stringify({ title: "agent-interactive" }),
    });
    if (!r.ok) throw new Error(`opencode session: ${r.status} ${await r.text()}`);
    const sid = (await r.json()).id;
    await this.message(sid, "Reply with the single word ok. Use no tools and ask nothing.", ALL_TOOLS_OFF);
    return sid;
  }

  async next(): Promise<string> {
    const sid = await (this.spare ?? this.newSession()).catch(() => this.newSession());
    this.spare = this.newSession();
    this.spare.catch(() => {});
    return sid;
  }

  async message(sid: string, text: string, tools: Record<string, boolean>): Promise<{ text: string; ctx: number }> {
    const [providerID, ...rest] = o.flashModel.split("/");
    const model = rest.length ? { providerID, modelID: rest.join("/") } : undefined;
    const r = await fetch(`${this.base}/session/${sid}/message`, {
      method: "POST", headers: JSON_H, signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({ parts: [{ type: "text", text }], tools, model }),
    });
    if (!r.ok) throw new Error(`opencode ${r.status}: ${clip(await r.text(), 200)}`);
    const m = await r.json();
    if (m.info?.error) throw new Error(`opencode: ${clip(JSON.stringify(m.info.error), 200)}`);
    const t = m.info?.tokens ?? {};
    return {
      text: (m.parts ?? []).filter((p: { type: string }) => p.type === "text")
        .map((p: { text: string }) => p.text).join("").trim(),
      ctx: (t.input ?? 0) + (t.cache?.read ?? 0) + (t.output ?? 0),
    };
  }

  async run(job: Job, w?: Worker): Promise<string> {
    await this.ready.promise;
    const sid = job.sid ?? await this.next();
    job.sid = sid;
    this.sid = sid;
    const prompt = await flashPrompt(job) + (job.dry
      ? "\n\nDRY RUN: editing is switched off. Reply with the file, then the exact old text and the new text you would write, nothing else."
      : "");
    job.promptBytes = prompt.length;
    job.prompt = prompt;
    let aborting: Promise<unknown> = Promise.resolve();
    const abort = () => (aborting = fetch(`${this.base}/session/${sid}/abort`, { method: "POST" }).catch(() => {}));
    const tools = job.dry ? { ...FLASH_TOOLS, edit: false, write: false, patch: false } : FLASH_TOOLS;
    let over = false;
    const budget = setTimeout(() => {
      if (job.write !== undefined || job.hmr !== undefined) return;
      over = true;
      abort();
    }, o.flashBudget * 1000);
    let strayed = false;
    const watch = setInterval(() =>
      this.activity(sid).then((a) => {
        if (w && a.text && a.text !== w.activity) note(w, `→ ${a.text}`);
        if (w && a.text) w.activity = a.text;
        if (a.stray && !strayed && !job.nudged) {
          strayed = true;
          abort();
        }
      }).catch(() => {}), 500);
    try {
      const { text } = await this.message(sid, prompt, tools);
      await this.editTimes(job, sid).catch(() => {});
      if (job.writeDenied && job.write === undefined) throw new Error(cannotWrite(job.writeDenied));
      return text;
    } catch (e) {
      if (strayed && !over) {
        job.nudged = true;
        say(`#${job.id} fast lane: stopped a search over the whole tree; pointing it at ${searchDirs.join(", ")}`);
        await aborting;
        await delay(300);
        try {
          const { text } = await this.message(sid, `That search ran outside ${searchDirs.join(", ")} and was stopped: it is far too slow. ` +
            `Search only inside those directories, or use the files already given, then make the change.`, tools);
          await this.editTimes(job, sid).catch(() => {});
          return text;
        } catch (e2) {
          if (over) throw new OverBudget(`nothing changed within ${o.flashBudget}s`);
          throw e2;
        }
      }
      if (over) throw new OverBudget(`nothing changed within ${o.flashBudget}s`);
      if (/ContextOverflow|exceeds model limit|too large/i.test(errText(e)) && !job.retried) {
        job.retried = true;
        say(`#${job.id} fast lane: the prompt overflowed its session; retrying once in a new one`);
        return this.run(job, w);
      }
      throw e;
    } finally {
      clearTimeout(budget);
      clearInterval(watch);
    }
  }

  async judge(text: string, ms: number): Promise<string> {
    await this.ready.promise;
    const signal = AbortSignal.timeout(ms);
    const r = await fetch(`${this.base}/session`, { method: "POST", headers: JSON_H, body: JSON.stringify({ title: "agent-interactive judge" }), signal });
    if (!r.ok) throw new Error(`opencode session: ${r.status}`);
    const sid = (await r.json()).id;
    try {
      const [providerID, ...rest] = o.flashModel.split("/");
      const m = await (await fetch(`${this.base}/session/${sid}/message`, {
        method: "POST", headers: JSON_H, signal,
        body: JSON.stringify({ parts: [{ type: "text", text }], tools: ALL_TOOLS_OFF, model: rest.length ? { providerID, modelID: rest.join("/") } : undefined }),
      })).json();
      if (m.info?.error) throw new Error(`opencode: ${clip(JSON.stringify(m.info.error), 120)}`);
      return (m.parts ?? []).filter((p: { type: string }) => p.type === "text").map((p: { text: string }) => p.text).join("").trim();
    } finally {
      fetch(`${this.base}/session/${sid}`, { method: "DELETE" }).catch(() => {});
    }
  }

  async messages(sid: string, signal?: AbortSignal): Promise<{ parts?: Part[] }[]> {
    return await (await fetch(`${this.base}/session/${sid}/message`, { signal })).json();
  }

  async activity(sid: string): Promise<{ text: string; stray: boolean }> {
    const parts = (await this.messages(sid, AbortSignal.timeout(600))).flatMap((m) => m.parts ?? []);
    const last = parts.filter((p) => p.type === "tool").at(-1);
    if (!last) return { text: parts.some((p) => p.type === "reasoning") ? "thinking" : "", stray: false };
    const i = last.state?.input ?? {};
    const what = i.filePath ? i.filePath.split("/").at(-1) : i.pattern ? `'${clip(i.pattern, 30)}'` : "";
    const running = last.state?.status === "running";
    const stray = running && (last.tool === "grep" || last.tool === "glob") && !insideSearch(i.path ?? "");
    return { text: `${last.tool} ${what}${running ? "…" : ""}`.trim(), stray };
  }

  async editTimes(job: Job, sid: string) {
    const msgs = await this.messages(sid);
    const toolParts = msgs.flatMap((m) => m.parts ?? []).filter((p) => p.type === "tool" && (p.state?.time?.start ?? 0) >= (job.dispatched ?? 0));
    job.tools = toolParts.map((p) => p.tool ?? "?");
    job.writeDenied = sandboxDenial(toolParts);
    job.trace = toolParts.map((p) => ({
      tool: p.tool ?? "?", what: describeInput(p.state?.input ?? {}), status: p.state?.status,
      ms: (p.state?.time?.end ?? 0) - (p.state?.time?.start ?? 0),
    }));
    for (const m of msgs) {
      for (const p of m.parts ?? []) {
        const end = p.state?.time?.end;
        if (p.type !== "tool" || !EDIT_TOOLS.has(p.tool ?? "") || p.state?.status !== "completed") continue;
        if (end && end >= (job.dispatched ?? 0)) noteWrite(job, end, p.state?.input?.filePath);
        const i = p.state?.input ?? {};
        if (end && end >= (job.dispatched ?? 0) && i.filePath) noteEdit(job, i.filePath, i.oldString, i.newString, i.content);
      }
    }
  }

  stop() {
    killTree(this.child?.pid);
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function which(cmd: string): string {
  for (const dir of (Deno.env.get("PATH") ?? "").split(":")) {
    try {
      return Deno.realPathSync(`${dir}/${cmd}`);
    } catch { /* not here */ }
  }
  return cmd;
}

type HookEvent = {
  hook_event_name?: string; session_id?: string; last_assistant_message?: string; tool_name?: string; message?: string; prompt?: string;
  tool_input?: { file_path?: string; pattern?: string; command?: string; questions?: { question?: string }[]; old_string?: string; new_string?: string; content?: string };
};

const SCROLLBACK = 2 * 1024 * 1024;

class TermClaude {
  sid = "";
  child?: Deno.ChildProcess;
  input?: WritableStreamDefaultWriter<Uint8Array>;
  ready = Promise.withResolvers<void>();
  waiting?: PromiseWithResolvers<string>;
  job?: Job;
  worker?: Worker;
  typing = false;
  attention = "";
  cols = 120;
  rows = 36;
  live = false;
  isReady = false;
  pastedAt = 0;
  tail = "";
  transcript = "";
  scrollback: Uint8Array[] = [];
  scrollBytes = 0;
  viewers = new Set<WebSocket>();

  constructor(readonly name: string) {}

  start() {
    if (this.child) return;
    const post = (flags: string) =>
      [{ hooks: [{ type: "command", command: `${which("curl")} -s ${flags} --data-binary @- 'http://127.0.0.1:${o.port}/__ai/claude-hook?agent=${this.name}' >/dev/null 2>&1; true` }] }];
    const quick = post("-m 3");
    const sure = post("-m 5 --retry 3 --retry-delay 1 --retry-all-errors");
    const settings = JSON.stringify({
      hooks: { SessionStart: sure, UserPromptSubmit: quick, PreToolUse: quick, PostToolUse: quick, Notification: sure, Stop: sure },
    });
    if (!this.sid) this.sid = crypto.randomUUID();
    const args = ["--cols", String(this.cols), "--rows", String(this.rows), "--", o.claudeCmd, "--model", o.claudeModel,
      "--append-system-prompt", OPUS_ROLE, "--allowedTools", "Read,Edit,Write,Glob,Grep", "--disallowedTools", "AskUserQuestion",
      "--settings", settings, ...(o.claudeEffort ? ["--effort", o.claudeEffort] : []),
      ...(this.live ? ["--resume", this.sid] : ["--session-id", this.sid])];
    let child: Deno.ChildProcess;
    try {
      const env = Object.fromEntries(Object.entries(Deno.env.toObject()).filter(([k]) => !/^(CLAUDECODE$|CLAUDE_CODE_|CLAUDE_PID$|CLAUDE_EFFORT$)/.test(k)));
      child = new Deno.Command(PTY_CMD, { args, cwd: root, env, clearEnv: true, stdin: "piped", stdout: "piped", stderr: "piped" }).spawn();
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        throw new Error(`'${PTY_CMD}' is not on PATH: Claude agents run in its terminals (the agent-interactive package ships it; ` +
          `'cargo build --release' in pty/ builds it; --claude-cmd none keeps everything on the fast lane)`);
      }
      throw e;
    }
    this.child = child;
    this.input = child.stdin.getWriter();
    this.ready = Promise.withResolvers<void>();
    this.isReady = false;
    this.tail = "";
    (async () => {
      for await (const chunk of child.stdout) this.output(chunk);
    })().catch(() => {});
    const errors = new Response(child.stderr).text();
    child.status.then(async (st) => {
      if (this.child !== child) return;
      this.child = undefined;
      this.input = undefined;
      const why = (await errors.catch(() => "")).trim();
      say(`${this.name}: claude ended (exit ${st.code})${why ? `: ${clip(why, 160)}` : ""}; ` +
        `the next change starts it again${this.sid ? `, resuming session ${this.sid}` : ""}`);
      for (const v of this.viewers) v.readyState === WebSocket.OPEN && v.send(JSON.stringify({ exit: st.code }));
      const w = this.waiting;
      this.waiting = undefined;
      w?.reject(new Error(`${this.name}'s claude ended mid-turn (exit ${st.code}); the next change resumes it`));
    });
  }

  markReady() {
    if (this.isReady) return;
    this.isReady = true;
    this.live = true;
    this.ready.resolve();
  }

  turnEnd(since: number): string | undefined {
    const base = `${Deno.env.get("CLAUDE_CONFIG_DIR") ?? `${Deno.env.get("HOME")}/.claude`}/projects`;
    if (!this.transcript) {
      try {
        for (const d of Deno.readDirSync(base)) {
          try {
            Deno.statSync(`${base}/${d.name}/${this.sid}.jsonl`);
            this.transcript = `${base}/${d.name}/${this.sid}.jsonl`;
            break;
          } catch { /* not here */ }
        }
      } catch { /* no transcripts */ }
    }
    if (!this.transcript) return undefined;
    let text = "";
    try {
      const f = Deno.openSync(this.transcript);
      const size = f.statSync().size;
      const from = Math.max(0, size - 256 * 1024);
      const buf = new Uint8Array(size - from);
      f.seekSync(from, Deno.SeekMode.Start);
      let n = 0;
      while (n < buf.length) {
        const r = f.readSync(buf.subarray(n));
        if (!r) break;
        n += r;
      }
      f.close();
      text = new TextDecoder().decode(buf.subarray(0, n));
    } catch {
      return undefined;
    }
    let ended = false;
    for (const l of text.trimEnd().split("\n").reverse()) {
      let m: { type?: string; subtype?: string; timestamp?: string; message?: { content?: { type?: string; text?: string }[] } };
      try {
        m = JSON.parse(l);
      } catch {
        continue;
      }
      if (Date.parse(m.timestamp ?? "") < since) break;
      if (m.type === "system" && (m.subtype === "turn_duration" || m.subtype === "stop_hook_summary")) ended = true;
      if (ended && m.type === "assistant") {
        const reply = (m.message?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
        if (reply) return reply;
      }
    }
    return ended ? "" : undefined;
  }

  watchScreen(chunk: Uint8Array) {
    const flat = new TextDecoder().decode(chunk).replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "").replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "")
      .replace(/\s+/g, "");
    this.tail = (this.tail + flat).slice(-400);
    if (!this.isReady && /\?forshortcuts|shift\+tabtocycle|bypasspermissions|accepteditson|planmodeon/i.test(this.tail)) {
      setTimeout(() => this.markReady(), 500);
    }
  }

  output(chunk: Uint8Array) {
    this.watchScreen(chunk);
    this.scrollback.push(chunk);
    this.scrollBytes += chunk.length;
    while (this.scrollBytes > SCROLLBACK && this.scrollback.length > 1) this.scrollBytes -= this.scrollback.shift()!.length;
    for (const v of this.viewers) if (v.readyState === WebSocket.OPEN) v.send(chunk);
  }

  frame(kind: string, body: Uint8Array) {
    if (!this.input) return;
    const f = new Uint8Array(5 + body.length);
    f[0] = kind.charCodeAt(0);
    new DataView(f.buffer).setUint32(1, body.length);
    f.set(body, 5);
    this.input.write(f).catch(() => {});
  }

  type(text: string | Uint8Array) {
    this.frame("i", typeof text === "string" ? enc.encode(text) : text);
  }

  resize(cols: number, rows: number) {
    if (!(cols > 0 && rows > 0) || (cols === this.cols && rows === this.rows)) return;
    this.cols = cols;
    this.rows = rows;
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint16(0, cols);
    new DataView(b.buffer).setUint16(2, rows);
    this.frame("r", b);
  }

  view(socket: WebSocket) {
    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
      this.viewers.add(socket);
      for (const c of this.scrollback) socket.send(c);
      try {
        this.start();
      } catch (e) {
        socket.send(JSON.stringify({ error: errText(e) }));
      }
    };
    socket.onmessage = (e) => {
      if (typeof e.data !== "string") return this.type(new Uint8Array(e.data as ArrayBuffer));
      try {
        const m = JSON.parse(e.data);
        if (Array.isArray(m.resize)) this.resize(Number(m.resize[0]), Number(m.resize[1]));
      } catch { /* not a control message */ }
    };
    socket.onclose = () => this.viewers.delete(socket);
  }

  hook(ev: HookEvent) {
    if (ev.session_id && ev.session_id !== this.sid) {
      this.sid = ev.session_id;
      this.transcript = "";
      say(`${this.name} session ${this.sid} (claude --resume ${this.sid} continues it)`);
    }
    this.live = true;
    if (ev.hook_event_name === "SessionStart" && !this.isReady) setTimeout(() => this.markReady(), 8000);
    const w = this.worker ?? workers.find((x) => x.name === this.name);
    const i = ev.tool_input ?? {};
    const event = ev.hook_event_name;
    if (event !== "Notification") this.attention = "";
    if (event === "UserPromptSubmit" && !this.job) {
      this.typing = true;
      note(w, `you typed: ${clip(ev.prompt ?? "", 300)}`);
      return;
    }
    if (event === "Notification") {
      if (!this.job && !this.typing) return;
      this.attention = ev.message ?? "it needs you";
      say(`${this.job ? `#${this.job.id} ` : ""}${this.name} waits for you in its terminal: ${this.attention}`);
      if (this.job) status(this.job, "working", `${this.name} needs you: ${clip(this.attention, 50)}`);
      note(w, `! ${this.attention}`);
      speakText(`${this.name.replace("-", " ")} needs you in its terminal.`);
      return;
    }
    if (event === "PreToolUse" && ev.tool_name === "AskUserQuestion") {
      const q = i.questions?.[0]?.question ?? "a question";
      this.attention = q;
      say(`${this.job ? `#${this.job.id} ` : ""}${this.name} is asking in its terminal: ${q}`);
      if (this.job) status(this.job, "working", `Claude asks: ${clip(q, 60)}`);
      speakText(`Claude is asking: ${clip(q, 140)}`);
      return;
    }
    if (event === "PreToolUse") {
      if (this.job) (this.job.trace ??= []).push({ tool: ev.tool_name ?? "?", what: describeInput(i) });
      if (w) w.activity = `${ev.tool_name ?? "tool"} ${toolWhat(i)}`.trim();
      note(w, `→ ${ev.tool_name ?? "tool"} ${describeInput(i)}`);
    }
    if (event === "PostToolUse" && this.job && EDIT_TOOLS.has(ev.tool_name ?? "")) {
      noteWrite(this.job, now(), i.file_path);
      if (i.file_path) noteEdit(this.job, i.file_path, i.old_string, i.new_string, i.content);
    }
    if (event !== "Stop") return;
    const msg = String(ev.last_assistant_message ?? "").trim();
    const waiting = this.waiting;
    this.waiting = undefined;
    if (waiting) return waiting.resolve(msg);
    if (this.typing) {
      this.typing = false;
      note(w, `“${clip(msg, 300)}”`);
      say(`${this.name} finished a turn you typed in its terminal: ${clip(msg.replace(/\s+/g, " "), 100)}`);
      pump();
    }
  }

  busy(): boolean {
    return this.typing;
  }

  async run(job: Job, worker?: Worker): Promise<string> {
    this.job = job;
    this.worker = worker;
    try {
      return await this.turn(job, worker);
    } finally {
      this.job = undefined;
      this.worker = undefined;
      this.attention = "";
    }
  }

  async turn(job: Job, worker?: Worker): Promise<string> {
    this.start();
    if (worker) worker.activity = "starting its terminal";
    const late = setTimeout(() => {
      this.attention = "Claude has not started a session: answer what its terminal shows (a new folder asks to be trusted once)";
      say(`#${job.id} waits for ${this.name}: its Claude has not started a session yet (answer anything its terminal shows)`);
      status(job, "working", `${this.name} needs you in its terminal…`);
      speakText(`${this.name.replace("-", " ")} needs you in its terminal.`);
    }, 5000);
    await this.ready.promise;
    clearTimeout(late);
    this.attention = "";
    if (worker) worker.activity = "reading the request";
    note(worker, "typed into its terminal");
    this.waiting = Promise.withResolvers<string>();
    this.pastedAt = Date.now();
    this.tail = "";
    this.type(`\x1b[200~${ask(job, true)}\x1b[201~`);
    await delay(300);
    this.type("\r");
    const waiting = this.waiting;
    const poll = setInterval(() => {
      if (this.waiting !== waiting) return;
      const reply = this.turnEnd(this.pastedAt);
      if (reply === undefined) return;
      say(`${this.name}: its turn ended without the Stop hook reaching the loop; the reply comes from its transcript`);
      this.waiting = undefined;
      waiting.resolve(reply);
    }, 3000);
    const timeout = delay(900_000).then(() => {
      throw new Error(`${this.name} has not finished after 15 min`);
    });
    try {
      return await Promise.race([waiting.promise, timeout]);
    } finally {
      clearInterval(poll);
    }
  }

  interrupt() {
    this.type("\x1b");
    const w = this.waiting;
    this.waiting = undefined;
    w?.resolve("");
  }

  stop() {
    this.input?.close().catch(() => {});
    killTree(this.child?.pid);
  }
}

type Worker = {
  name: string; lane: "flash" | "claude"; job?: Job; since?: number; activity: string; spokeAt?: number;
  log: { seq: number; t: number; text: string }[]; run: (job: Job, w: Worker) => Promise<void>;
  interrupt?: (job: Job) => void; busy?: () => boolean;
};

let logSeq = 0;
function note(w: Worker | undefined, text: string) {
  if (!w) return;
  w.log.push({ seq: ++logSeq, t: now(), text: text.replace(/\s+/g, " ").trim() });
  if (w.log.length > 400) w.log.splice(0, w.log.length - 400);
}

const opencode = new OpenCode();
const claude = o.claudeCmd !== "none";
const PTY_CMD = Deno.env.get("AGENT_PTY") || "agent-pty";
const claudeBackends: TermClaude[] = claude ? Array.from({ length: o.claudeWorkers }, (_, i) => new TermClaude(`claude-${i + 1}`)) : [];
const terms = new Map(claudeBackends.map((b) => [b.name, b]));
const workers: Worker[] = [
  {
    name: "flash", lane: "flash", activity: "", log: [],
    interrupt: (job) => {
      if (job.sid) fetch(`${opencode.base}/session/${job.sid}/abort`, { method: "POST" }).catch(() => {});
    },
    run: async (job, w) => {
      const handOff = (why: string, pill: string) => {
        say(`#${job.id} ${why}`);
        status(job, "working", `${pill}: handing to Claude…`);
        job.route = "flash→opus";
        job.escalated = true;
      };
      let reply: string;
      try {
        reply = await opencode.run(job, w);
      } catch (e) {
        if (job.cancelled) return;
        if (!claude || job.dry) throw e;
        if (e instanceof OverBudget) return handOff(`fast lane: ${e.message}; handing it to Claude`, "taking longer");
        return handOff(`fast lane failed (${clip(errText(e), 100)}); handing it to Claude`, "fast lane failed");
      }
      if (/^\s*ESCALATE/i.test(reply) && claude && job.write === undefined && !job.dry) {
        return handOff(`escalating: ${clip(reply.replace(/^\s*ESCALATE:?\s*/i, ""), 100)}`, "bigger change");
      }
      job.reply = reply;
    },
  },
  ...claudeBackends.map((b): Worker => ({
    name: b.name, lane: "claude", activity: "", log: [], busy: () => b.busy(),
    interrupt: () => b.interrupt(),
    run: async (job, w) => {
      job.reply = await b.run(job, w);
    },
  })),
];
const queues = { flash: [] as Job[], claude: [] as Job[] };
const preparing = new Set<Job>();

function overlaps(a: Job, b: Job): string | undefined {
  if (!a.footprint || !b.footprint) return a.page && b.page && !samePath(a.page, b.page) ? undefined : "files unknown";
  for (const f of a.footprint) if (b.footprint.has(f)) return f;
  return undefined;
}

function blocker(job: Job, lane: "flash" | "claude"): { by: Job; why: string } | undefined {
  if (job.follows && job.follows.done === undefined) return { by: job.follows, why: "follows" };
  const holds = (why: string | undefined, sameLane: boolean) => why && (why !== "files unknown" || (sameLane && lane === "flash"));
  for (const w of workers) {
    if (!w.job) continue;
    if (w.lane !== lane) continue;
    const why = overlaps(job, w.job);
    if (holds(why, true)) return { by: w.job, why: why! };
  }
  for (const other of queues[lane]) {
    if (other === job) break;
    if (other.follows && other.follows.done === undefined) continue;
    const why = overlaps(job, other);
    if (holds(why, true)) return { by: other, why: why! };
  }
  return undefined;
}

function pump() {
  for (const lane of ["flash", "claude"] as const) {
    for (const w of workers) {
      if (w.lane !== lane || w.job || w.busy?.()) continue;
      const pinnedElsewhere = (j: Job) => j.pin && j.pin !== w.name && !workers.find((x) => x.name === j.pin)?.job;
      const job = queues[lane].find((j) => !pinnedElsewhere(j) && !blocker(j, lane));
      if (!job) continue;
      queues[lane].splice(queues[lane].indexOf(job), 1);
      work(w, job);
    }
  }
}

function submit(job: Job) {
  if (job.cancelled) {
    job.done = now();
    finish(job);
    return;
  }
  if (job.route !== "flash" && !claude) job.route = "flash";
  const lane = job.route === "flash" ? "flash" : "claude";
  queues[lane].push(job);
  pump();
  announceWait(job, lane);
}

function announceWait(job: Job, lane: "flash" | "claude") {
  if (!queues[lane].includes(job)) return;
  const b = blocker(job, lane);
  if (b?.why === "follows") {
    say(`#${job.id} follows #${b.by.id}: it runs next, in the same agent`);
    status(job, "working", `adds to #${b.by.id}…`);
    speakText("Adding that to the change in progress.");
    return;
  }
  const msg = b
    ? `waiting for #${b.by.id}: ${b.why === "files unknown" ? "it may touch the same files" : `both touch ${b.why.split("/").at(-1)}`}`
    : `waiting: every ${lane === "flash" ? "fast-lane" : "Claude"} agent is busy`;
  say(`#${job.id} ${msg}`);
  status(job, "working", msg);
  speakText(b ? `Waiting for the change before; it touches the same ${b.why === "files unknown" ? "page" : "file"}.` : "Waiting for a free agent.");
}

async function work(w: Worker, job: Job) {
  w.job = job;
  w.since = now();
  w.activity = "starting";
  note(w, `▶ #${job.id} ${clip(job.text, 400)}`);
  for (const x of workers) {
    if (x === w || x.lane === w.lane || !x.job || !job.footprint) continue;
    const f = x.job.files.find((p) => job.footprint!.has(p));
    if (!f) continue;
    say(`#${job.id} runs beside #${x.job.id}: ${x.name} is also editing ${f.split("/").at(-1)}`);
    note(w, `${x.name} (#${x.job.id}) is also editing ${f}`);
  }
  job.worker = w.name;
  job.dispatched ??= now();
  inflight.add(job);
  try {
    await w.run(job, w);
  } catch (e) {
    job.error = errText(e);
  }
  inflight.delete(job);
  const took = Math.round((now() - (w.since ?? now())) / 1000);
  note(w, job.error ? `■ #${job.id} failed after ${took}s: ${clip(job.error, 200)}`
    : job.escalated ? `■ #${job.id} handed to Claude after ${took}s`
    : `■ #${job.id} done in ${took}s: ${clip(job.reply ?? "", 300)}`);
  w.job = undefined;
  w.since = now();
  w.activity = "";
  if (job.cancelled) {
    job.escalated = false;
    job.error = undefined;
  }
  if (job.escalated) {
    job.escalated = false;
    queues.claude.push(job);
    for (const f of queues.flash.filter((x) => x.follows === job)) bindFollow(f);
    pump();
    announceWait(job, "claude");
  } else {
    job.done = now();
    for (const f of [...queues.flash, ...queues.claude]) if (f.follows === job) bindFollow(f);
    finish(job);
  }
  pump();
}

function bindFollow(f: Job) {
  const p = f.follows!;
  const onClaude = claude && (p.route !== "flash" || Boolean(p.worker?.startsWith("claude")));
  if (onClaude) {
    const i = queues.flash.indexOf(f);
    if (i >= 0) {
      queues.flash.splice(i, 1);
      queues.claude.push(f);
    }
    f.route = "opus";
    if (p.worker?.startsWith("claude")) f.pin = p.worker;
  }
  if (p.done === undefined) return;
  if (p.files.length) f.footprint = new Set([...(f.footprint ?? []), ...p.files]);
  if (!onClaude && p.sid && !p.error) f.sid = p.sid;
}

function summaryOf(reply: string): string {
  const lines = reply.replace(/```[\s\S]*?```/g, " ").split("\n")
    .map((l) => l.replace(/^\s*(?:[-*+]|\d+\.|#+|>)\s+/, "").replace(/\*\*|`/g, "").trim()).filter(Boolean);
  const sentences = lines.flatMap((l) => l.split(/(?<=[.!?])\s+/)).filter(Boolean);
  const closing = [...sentences].reverse().find((x) => /^I\s/.test(x) && x.length <= 160);
  return clip((closing ?? sentences[0] ?? "Done.").replace(/\s+/g, " "), 100);
}

async function finish(job: Job) {
  const settle = (signal: Promise<void>) =>
    Promise.race([signal, delay(Math.max(0, (job.write ?? now()) + 3000 - now()))]);
  if (o.attach) {
    if (job.write !== undefined && job.hmr === undefined && job.hmrError === undefined && viteUp) {
      await settle(job.hmrSignal.promise);
    }
  } else if (job.write !== undefined && job.applied === undefined && clients.size) {
    await settle(job.appliedSignal.promise);
  }
  const reply = job.reply ?? "";
  let spoken: Promise<void> | undefined;
  if (job.cancelled) {
    job.summary = `Cancelled number ${job.id}.`;
    status(job, "skip", "cancelled");
    spoken = speak(job);
  } else if (job.dry) {
    job.summary = clip(reply.replace(/\s+/g, " "), 300);
  } else if (job.error) {
    status(job, "error", `✗ ${clip(job.error, 80)}`);
  } else if (/^\s*SKIP\b/i.test(reply) && job.write === undefined) {
    status(job, "skip", "not a change request");
  } else if (job.hmrError && job.repairOf === undefined) {
    const fix = newJob("repair", `Your last change ("${clip(job.text, 160)}") broke the build. The dev server says:\n` +
      `${clip(job.hmrError, 1500)}\nFix exactly that error${job.files.length ? ` in ${job.files.join(", ")}` : ""} and change nothing else.`, "flash");
    fix.repairOf = job.id;
    job.summary = "That broke the page; fixing it.";
    say(`#${job.id} broke the build; repairing it as #${fix.id}`);
    status(job, "error", job.summary);
    spoken = speak(job);
    fix.footprint = job.files.length ? new Set(job.files) : null;
    submit(fix);
  } else {
    job.summary = job.hmrError
      ? clip(`That broke the page: ${job.hmrError.replace(/\s+/g, " ")}`, 100)
      : summaryOf(reply);
    status(job, job.hmrError ? "error" : "done", job.summary);
    spoken = speak(job);
  }
  if (spoken) await Promise.race([spoken, delay(8000)]);
  const r = record(job);
  say(summaryLine(job));
  Deno.writeTextFile(logPath, JSON.stringify(r) + "\n", { append: true }).catch(() => {});
  trace({
    type: "job", ...r, page: job.page ?? null, clicks: job.clicks ?? [], named: job.named ?? [], screen: job.screen ?? [],
    hintFiles: job.hintFiles ?? [], footprint: job.footprint ? [...job.footprint] : null, prompt: job.prompt ?? null,
    trace: job.trace ?? [], edits: job.edits ?? [],
  });
  job.finished.resolve(job);
}

let sayBroken = o.say === "none";
let speechQueue: Promise<unknown> = Promise.resolve();
let lastSpeechError = "";
const sayWav = `${tmp}/agent-interactive-${o.port}-say.wav`;

function sessionsRoot(): string {
  const home = Deno.env.get("HOME") ?? "/tmp";
  try {
    const cfg = Deno.readTextFileSync(`${home}/.config/recgo/config.toml`);
    const dir = cfg.match(/^\s*sessions_dir\s*=\s*"([^"]+)"/m)?.[1];
    if (dir) return dir.replace(/^~/, home);
  } catch { /* no recgo config */ }
  return `${home}/walk-and-talk`;
}

const trajectoryPath = (() => {
  if (o.trajectories === "none") return "";
  const dir = o.trajectories || `${sessionsRoot()}/agent-interactive`;
  try {
    Deno.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch (e) {
    console.error(`agent-interactive: trajectories off: cannot create ${dir}: ${errText(e)}`);
    return "";
  }
  const stamp = new Date().toISOString().slice(0, 16).replace(":", "-");
  return `${dir}/${stamp}-${o.port}.jsonl`;
})();

function trace(ev: Record<string, unknown>) {
  if (!trajectoryPath) return;
  try {
    Deno.writeTextFileSync(trajectoryPath, JSON.stringify({ at: new Date().toISOString(), ...ev }) + "\n", { append: true, mode: 0o600 });
  } catch { /* never let the record break the loop */ }
}

async function speaches(text: string): Promise<Uint8Array> {
  const r = await fetch(`${o.ttsUrl}/v1/audio/speech`, {
    method: "POST", headers: JSON_H, signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ model: "kokoro", input: text, voice: o.ttsVoice, speed: o.ttsSpeed, response_format: "wav" }),
  });
  if (!r.ok) {
    const body = clip((await r.text()).replace(/\s+/g, " "), 160);
    const hint = r.status === 503 ? " (the model server is warming up; the next summary retries)" : "";
    throw new Error(`speech ${o.ttsUrl}/v1/audio/speech answered ${r.status}${hint}: ${body}`);
  }
  return new Uint8Array(await r.arrayBuffer());
}

const quiet = (cmd: string, args: string[]) =>
  new Deno.Command(cmd, { args, stdin: "null", stdout: "null", stderr: "null" }).output();

function padWav(wav: Uint8Array, leadMs: number, tailMs: number): Uint8Array {
  const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const tag = (at: number) => String.fromCharCode(...wav.subarray(at, at + 4));
  if (wav.length < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return wav;
  let at = 12;
  let fmt: { code: number; channels: number; rate: number; bits: number } | undefined;
  let data = -1;
  let size = 0;
  while (at + 8 <= wav.length) {
    const id = tag(at);
    const len = v.getUint32(at + 4, true);
    if (id === "fmt ") fmt = { code: v.getUint16(at + 8, true), channels: v.getUint16(at + 10, true), rate: v.getUint32(at + 12, true), bits: v.getUint16(at + 22, true) };
    if (id === "data") {
      data = at + 8;
      size = Math.min(len, wav.length - data);
      break;
    }
    at += 8 + len + (len & 1);
  }
  if (!fmt || data < 0 || fmt.bits < 16) return wav;
  const frame = fmt.channels * fmt.bits / 8;
  const lead = Math.round(fmt.rate * leadMs / 1000) * frame;
  const tail = Math.round(fmt.rate * tailMs / 1000) * frame;
  const out = new Uint8Array(44 + lead + size + tail);
  const w = new DataView(out.buffer);
  out.set(new TextEncoder().encode("RIFF"), 0);
  w.setUint32(4, 36 + lead + size + tail, true);
  out.set(new TextEncoder().encode("WAVEfmt "), 8);
  w.setUint32(16, 16, true);
  w.setUint16(20, fmt.code, true);
  w.setUint16(22, fmt.channels, true);
  w.setUint32(24, fmt.rate, true);
  w.setUint32(28, fmt.rate * frame, true);
  w.setUint16(32, frame, true);
  w.setUint16(34, fmt.bits, true);
  out.set(new TextEncoder().encode("data"), 36);
  w.setUint32(40, lead + size + tail, true);
  out.set(wav.subarray(data, data + size), 44 + lead);
  return out;
}

const MAC = Deno.build.os === "darwin";
const PLAYER = MAC ? "afplay" : "pw-play";
const VOICE = MAC ? "say" : "spd-say";
const voice = (text: string) => quiet(VOICE, MAC ? [text] : ["-w", text]);

function speakText(text: string): Promise<number | undefined> {
  if (sayBroken || !text) return Promise.resolve(undefined);
  const started = Promise.withResolvers<number | undefined>();
  speechQueue = speechQueue.then(async () => {
    try {
      if (o.say !== "speaches") {
        const [cmd, ...args] = o.say.split(/\s+/);
        started.resolve(now());
        await quiet(cmd, [...args, text]);
        return;
      }
      const wav = padWav(await speaches(text), 450, 150);
      await Deno.writeFile(sayWav, wav);
      started.resolve(now());
      await quiet(PLAYER, [sayWav]);
      if (lastSpeechError) say("speaches answers again");
      lastSpeechError = "";
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        sayBroken = true;
        const cmd = o.say === "speaches" ? PLAYER : o.say.split(/\s+/)[0];
        say(`speech off for this run: '${cmd}' is not on PATH (use --say none to silence, or --say <command>)`);
        started.resolve(undefined);
        return;
      }
      const msg = errText(e);
      if (msg !== lastSpeechError) say(`${msg}; speaking with ${VOICE} until it answers again`);
      lastSpeechError = msg;
      started.resolve(now());
      await voice(text).catch(() => {});
    }
  });
  return started.promise;
}

async function speak(job: Job): Promise<void> {
  if (!job.summary) return;
  const t = now();
  const at = await speakText(job.summary);
  if (at === undefined) return;
  job.spoken = at;
  if (o.say === "speaches" && !lastSpeechError) job.ttsMs = at - t;
}

function record(j: Job) {
  const rel = (t?: number) => (t === undefined ? null : t - j.heard);
  return {
    id: j.id, source: j.source, route: j.route, text: j.text, files: j.files,
    summary: j.summary ?? null, reply: j.reply ?? null, error: j.error ?? null, hmrError: j.hmrError ?? null,
    dry: j.dry ?? false, tools: j.tools ?? j.trace?.map((t) => t.tool) ?? null, promptBytes: j.promptBytes ?? null,
    follows: j.follows?.id ?? null,
    worker: j.worker ?? null, cancelled: j.cancelled ?? false,
    heard: new Date(j.heard).toISOString(),
    painted: j.applied === undefined ? null : !j.hidden,
    ms: {
      gate: j.gateMs ?? null, settle: j.settleMs ?? null, dispatch: rel(j.dispatched), write: rel(j.write), hmr: rel(j.hmr),
      paint: rel(j.applied), done: rel(j.done), spoken: rel(j.spoken), tts: j.ttsMs ?? null,
    },
  };
}

function summaryLine(j: Job): string {
  const r = (t?: number) => (t === undefined ? "-" : `${t - j.heard}ms`);
  const head = `#${j.id} [${j.route}]`;
  if (j.cancelled) return `${head} cancelled`;
  if (j.error) return `${head} failed: ${j.error}`;
  if (j.write === undefined) return `${head} no change (${clip(j.reply ?? "", 60)}) · agent done ${r(j.done)}`;
  const shown = o.attach
    ? (j.hmrError ? `BUILD ERROR ${clip(j.hmrError.replace(/\s+/g, " "), 80)}` : "")
    : j.hidden ? `applied ${r(j.applied)} (tab hidden, no paint)` : `paint ${r(j.applied)}`;
  const waited = j.dispatched !== undefined && j.dispatched - j.heard > 1500 ? ` · waited ${r(j.dispatched)}` : "";
  return `${head} ${j.files.join(", ")}:${waited} write ${r(j.write)} · hmr ${r(j.hmr)}${shown ? ` · ${shown}` : ""} · ` +
    `agent done ${r(j.done)}${j.spoken ? ` · said "${j.summary}"` : ""}`;
}

function touches(j: Job, paths: string[]): boolean {
  const norm = paths.map((p) => p.replace(/^\/@fs\//, "/").replace(/^\/+/, "").replace(/\?.*$/, "")).filter(Boolean);
  return [...(j.footprint ?? []), ...j.files].some((f) => norm.some((p) => f.endsWith(p) || p.endsWith(f)));
}

function hmrOwner(paths: string[] = []): Job | undefined {
  const live = [...inflight];
  const recent = jobs.filter((j) => j.done !== undefined && now() - j.done < 3000 && j.write !== undefined && j.hmr === undefined);
  return live.find((j) => touches(j, paths)) ?? recent.find((j) => touches(j, paths)) ??
    (live.length === 1 ? live[0] : undefined) ?? owner() ?? recent.at(-1);
}

let viteUp = false;

async function attachVite() {
  const base = new URL(o.attach);
  let warned = "";
  for (;;) {
    try {
      const r = await fetch(new URL("/@vite/client", base), { signal: AbortSignal.timeout(8000) });
      const src = r.ok ? await r.text() : "";
      const token = src.match(/const wsToken = "([^"]*)"/)?.[1];
      if (token === undefined) {
        throw new Error(`${base.origin}/@vite/client ${r.ok ? "is not a Vite client" : `answered ${r.status}`}: ` +
          "no Vite dev server behind it. For dcl.one, put the umbrella in dev mode (ssh dcl, umbrella/scripts/up-dev.sh)");
      }
      const port = src.match(/const hmrPort = (\d+)/)?.[1] ?? base.port;
      const proto = src.includes('const socketProtocol = "wss"') || base.protocol === "https:" ? "wss" : "ws";
      const url = `${proto}://${base.hostname}${port ? `:${port}` : ""}/?token=${token}`;
      const opened = now();
      let lastFrame = opened;
      await new Promise<void>((resolve) => {
        const ws = new WebSocket(url, "vite-hmr");
        ws.onmessage = (e) => {
          lastFrame = now();
          onVite(String(e.data));
        };
        ws.onclose = () => resolve();
      });
      const quiet = Math.round((now() - lastFrame) / 1000);
      if (viteUp) {
        say(`lost ${o.attach}'s HMR socket after ${Math.round((now() - opened) / 1000)}s, ${quiet}s after its last frame` +
          `${quiet >= 55 && quiet <= 65 ? " (a proxy's 60s idle timeout in front of the dev server, not a restart)" : ""}; reconnecting`);
      }
      viteUp = false;
      warned = "";
    } catch (e) {
      const msg = errText(e);
      if (msg !== warned) say(`HMR: ${msg}; retrying every 2s`);
      warned = msg;
    }
    await delay(2000);
  }
}

function viteFile(p: string): string | undefined {
  const clean = p.replace(/\?.*$/, "");
  if (clean.startsWith("/@fs/")) return relTo(clean.slice(4));
  const tops = [...new Set(["", ...searchDirs.map((d) => d.split("/")[0])])];
  for (const top of tops) {
    const rel = normalize(`${top}/${clean}`);
    try {
      if (Deno.statSync(`${root}/${rel}`).isFile) return rel;
    } catch { /* not under this one */ }
  }
  return undefined;
}

function onVite(data: string) {
  let m: {
    type?: string; event?: string; path?: string; updates?: { path?: string; acceptedPath?: string }[];
    err?: { message?: string; id?: string; loc?: { file?: string } };
  };
  try {
    m = JSON.parse(data);
  } catch {
    return;
  }
  if (m.type === "connected") {
    viteUp = true;
    say(`listening to ${o.attach}'s Vite HMR`);
    return;
  }
  if (m.type === "error") {
    const msg = m.err?.message ?? "build error";
    const job = hmrOwner([m.err?.id ?? m.err?.loc?.file ?? ""]);
    say(`vite build error${job ? ` (#${job.id})` : ""}: ${clip(msg.replace(/\s+/g, " "), 200)}`);
    if (job && job.hmr !== undefined) {
      job.hmrError ??= msg;
      job.hmrSignal.resolve();
    }
    return;
  }
  let paths: string[];
  if (m.type === "update") paths = (m.updates ?? []).map((u) => u.acceptedPath || u.path || "?");
  else if (m.type === "full-reload") paths = [m.path ?? ""];
  else return;
  const job = hmrOwner(paths);
  const tag = job ? ` (#${job.id})` : "";
  say(`vite ${m.type}: ${clip(paths.join(", ") || "page", 120)}${tag}`);
  if (job) {
    if (!job.edits?.length) for (const rel of paths.map(viteFile)) if (rel && !job.files.includes(rel)) job.files.push(rel);
    job.hmr ??= now();
    job.hmrSignal.resolve();
  }
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();

function owner(): Job | undefined {
  let best: Job | undefined;
  for (const j of inflight) if (!best || (j.dispatched ?? 0) > (best.dispatched ?? 0)) best = j;
  return best;
}

async function watch() {
  for await (const ev of Deno.watchFs(root, { recursive: true })) {
    if (ev.kind === "access" || ev.kind === "remove" || ev.kind === "other") continue;
    for (const p of ev.paths) {
      const rel = p.slice(root.length + 1);
      if (!EDITABLE.test(rel) || skipped(rel)) continue;
      const job = hmrOwner([rel]);
      if (job) {
        job.write ??= now();
        if (!job.files.includes(rel)) job.files.push(rel);
      }
      clearTimeout(pending.get(rel));
      pending.set(rel, setTimeout(() => {
        pending.delete(rel);
        pushUpdate(rel, job);
      }, 20));
    }
  }
}

function pushUpdate(rel: string, job?: Job) {
  const s = ++seq;
  const path = `/${rel}`;
  const t = now();
  if (job) {
    seqJob.set(s, job);
    job.hmr ??= t;
  }
  const kind = /\.css$/i.test(rel) ? "css" : /\.html?$/i.test(rel) ? "html" : "";
  send(kind ? { type: "update", seq: s, updates: [{ type: `${kind}-update`, path, acceptedPath: path, timestamp: t }] }
    : { type: "full-reload", seq: s, path });
}

const CLIENT = `(function (toast) {
  var ws, pill, pillHost, pillTimer;
  var now = function () { return performance.timeOrigin + performance.now(); };
  function ack(seq) {
    var done = function (hidden) {
      if (ws.readyState === 1) ws.send(JSON.stringify({ ack: seq, t: now(), hidden: hidden }));
    };
    if (document.visibilityState !== "visible") return done(true);
    requestAnimationFrame(function () { requestAnimationFrame(function () { done(false); }); });
  }
  function show(msg, sticky) {
    if (!toast) return;
    if (!pill) {
      pillHost = document.createElement("ai-status");
      pillHost.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:2147483647;pointer-events:none";
      var shadow = pillHost.attachShadow({ mode: "closed" });
      pill = document.createElement("div");
      pill.style.cssText = "font:500 12px/1.3 system-ui,sans-serif;color:#fff;background:rgba(20,20,24,.86);" +
        "padding:6px 10px;border-radius:999px;max-width:60vw;white-space:nowrap;overflow:hidden;" +
        "text-overflow:ellipsis;transition:opacity .2s";
      shadow.appendChild(pill);
    }
    if (!pillHost.isConnected) document.documentElement.appendChild(pillHost);
    pill.textContent = msg;
    pill.style.opacity = "1";
    clearTimeout(pillTimer);
    if (!sticky) pillTimer = setTimeout(function () { pill.style.opacity = "0"; }, 5000);
  }
  function samePage(path) {
    var here = location.pathname;
    return path === here || (here.slice(-1) === "/" && path === here + "index.html");
  }
  function css(path, seq) {
    var links = Array.prototype.filter.call(document.querySelectorAll('link[rel="stylesheet"]'), function (l) {
      return new URL(l.href, location.href).pathname === path;
    });
    if (!links.length) return location.reload();
    var left = links.length;
    links.forEach(function (l) {
      var n = l.cloneNode();
      n.href = path + "?t=" + Date.now();
      n.onload = n.onerror = function () { l.remove(); if (--left === 0) ack(seq); };
      l.after(n);
    });
  }
  function html(path, seq) {
    if (!samePage(path)) return;
    fetch(location.href, { cache: "no-store" }).then(function (r) { return r.text(); }).then(function (text) {
      var doc = new DOMParser().parseFromString(text, "text/html");
      var y = scrollY;
      document.head.querySelectorAll("style").forEach(function (s) { s.remove(); });
      doc.head.querySelectorAll("style").forEach(function (s) { document.head.appendChild(s); });
      document.title = doc.title;
      document.body.replaceWith(doc.body);
      scrollTo(0, y);
      ack(seq);
    });
  }
  function connect() {
    ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/__hmr");
    ws.onmessage = function (e) {
      var m = JSON.parse(e.data);
      if (m.type === "update") m.updates.forEach(function (u) { (u.type === "css-update" ? css : html)(u.path, m.seq); });
      else if (m.type === "full-reload") location.reload();
      else if (m.ai === "status") show(m.msg, m.phase === "working");
    };
    ws.onclose = function () { setTimeout(connect, 500); };
  }
  connect();
})(${o.toast});`;

let replaying: Promise<unknown> = Promise.resolve();

function forgetPage() {
  clicks.length = 0;
  pageErrors.clear();
  lastPage = "";
}

function replay(c: { context?: string[]; screen?: string[]; said?: string[] }, mode: GateMode) {
  const run = replaying.then(async () => {
    forgetPage();
    heardBuf.length = 0;
    for (const l of c.context ?? []) onRecgoLine(l);
    screenOverride = c.screen ?? [];
    const gates: { text: string; verdict: string }[] = [];
    const started: Job[] = [];
    try {
      for (const text of c.said ?? []) {
        const job = await onNarration(text, mode);
        gates.push({ text, verdict: lastVerdict });
        if (job) started.push(job);
      }
      const done = await Promise.all(started.map((j) => j.finished.promise));
      return { gates, jobs: done.map((j) => ({ ...record(j), planned: plannedFile(j), named: j.named ?? [], hintFiles: j.hintFiles ?? [] })) };
    } finally {
      screenOverride = undefined;
    }
  });
  replaying = run.catch(() => {});
  return run;
}

function plannedFile(j: Job): string | null {
  for (const m of (j.reply ?? "").matchAll(/[\w@.\/+$-]+\.(?:css|scss|sass|less|tsx|ts|jsx|js|mjs|html|json|vue|svelte|astro|md)\b/g)) {
    const f = relTo(m[0]).replace(/^\.?\//, "");
    try {
      if (Deno.statSync(`${root}/${f}`).isFile) return f;
    } catch { /* not a path in this tree */ }
  }
  return null;
}

function statusJson() {
  const view = (j: Job) => ({ id: j.id, text: clip(j.text, 160), route: j.route, source: j.source, heard: j.heard, follows: j.follows?.id ?? null });
  return {
    page: pageUrl, port: o.port, now: now(), attach: Boolean(o.attach), viteUp: o.attach ? viteUp : null,
    recgo: o.recgo ? Boolean(recgo) : null, speech: o.say, speechError: lastSpeechError || null,
    gate: o.gateUrl ? `${o.gateUrl} (${o.gateModel})` : "keywords", lastVerdict, held: heardBuf.map((h) => h.text),
    muted,
    workers: workers.map((w) => {
      const t = terms.get(w.name);
      return {
        name: w.name, lane: w.lane, since: w.since ?? null, activity: w.activity, job: w.job ? view(w.job) : null,
        terminal: t ? { started: Boolean(t.child), ready: t.isReady, session: t.live ? t.sid : null, typing: t.typing, attention: t.attention || null } : null,
      };
    }),
    preparing: [...preparing].map(view),
    queued: (["flash", "claude"] as const).flatMap((lane) =>
      queues[lane].map((j) => {
        const b = blocker(j, lane);
        return { ...view(j), lane, waitsFor: b ? { id: b.by.id, why: b.why } : null };
      })
    ),
    recent: jobs.filter((j) => j.done !== undefined).slice(-8).map(record),
  };
}

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8", json: "application/json",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  ico: "image/x-icon", woff2: "font/woff2", txt: "text/plain; charset=utf-8",
};

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v, null, 1) + "\n", { status, headers: JSON_H });

const LOCAL_HOSTS = new Set([`127.0.0.1:${o.port}`, `localhost:${o.port}`, `[::1]:${o.port}`]);
const APP_ORIGINS = new Set(["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"]);

function foreign(req: Request): string | undefined {
  const host = req.headers.get("host") ?? "";
  if (!LOCAL_HOSTS.has(host)) return `host ${host || "(none)"}`;
  const origin = req.headers.get("origin");
  if (origin && !APP_ORIGINS.has(origin) && !LOCAL_HOSTS.has(origin.replace(/^https?:\/\//, ""))) return `origin ${origin}`;
  return undefined;
}

async function serve(req: Request): Promise<Response> {
  const refused = foreign(req);
  if (refused) {
    say(`refused a request from ${refused}: only this machine's own pages and the app may use this port`);
    return new Response("forbidden\n", { status: 403 });
  }
  const origin = req.headers.get("origin") ?? "";
  if (!APP_ORIGINS.has(origin)) return handle(req);
  const cors = {
    "access-control-allow-origin": origin, "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type", "vary": "origin",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const res = await handle(req);
  if (res.status === 101) return res;
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
  return res;
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = decodeURIComponent(url.pathname);

  if (path === "/__hmr") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    socket.onopen = () => {
      clients.add(socket);
      socket.send(JSON.stringify({ type: "connected" }));
    };
    socket.onclose = () => clients.delete(socket);
    socket.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        const job = typeof m.ack === "number" ? seqJob.get(m.ack) : undefined;
        if (job && job.applied === undefined) {
          job.applied = Math.max(Math.round(m.t), job.hmr ?? 0);
          job.hidden = m.hidden === true;
          job.appliedSignal.resolve();
        }
      } catch { /* not ours */ }
    };
    return response;
  }
  if (path === "/__ai/say" && req.method === "POST") {
    const text = (await req.text()).trim();
    if (!text) return json({ error: "empty" }, 400);
    const source = url.searchParams.get("source") ?? "http";
    const job = source === "narration" ? await onNarration(text) : enqueue(source, text, undefined, url.searchParams.has("dry"));
    if (!job) return json({ queued: false, verdict: lastVerdict });
    return url.searchParams.has("wait") ? json(record(await job.finished.promise)) : json({ id: job.id });
  }
  if (path === "/__ai/relation" && req.method === "POST") {
    const b = await req.json().catch(() => ({})) as { prev?: unknown; said?: unknown };
    if (typeof b.prev !== "string" || typeof b.said !== "string") return json({ error: "the body is {prev, said}" }, 400);
    const running = (b as { running?: unknown }).running;
    const prev = { text: b.prev, dispatched: running === "queued" ? undefined : now(), route: running === "claude" ? "opus" : "flash" };
    return json(await relation(prev as Job, b.said));
  }
  if (path === "/__ai/replay" && req.method === "POST") {
    const c = await req.json().catch(() => undefined) as { context?: string[]; screen?: string[]; said?: string[] } | undefined;
    if (!c?.said?.length) return json({ error: "a case needs said: [...]" }, 400);
    const mode: GateMode = url.searchParams.has("gate") ? "gate" : "dry";
    return json(await replay(c, mode));
  }
  if (path === "/__ai/context" && req.method === "POST") {
    if (url.searchParams.has("clear")) forgetPage();
    for (const l of (await req.text()).split("\n")) if (l.trim()) onRecgoLine(l.trim());
    return json({ clicks, errors: [...pageErrors.values()], lastPage });
  }
  if (path === "/__ai/jobs") return json(jobs.slice(-20).map(record));
  if (path === "/__ai/page") return json(await pageFiles(url.searchParams.get("url") ?? lastPage));
  if (path === "/__ai/status") return json(statusJson());
  if (path === "/__ai/mute" && req.method === "POST") {
    const on = url.searchParams.get("on");
    setMuted(on === null ? !muted : on === "1" || on === "true", "http");
    return json({ muted });
  }
  if (path === "/__ai/term") {
    const t = terms.get(url.searchParams.get("agent") ?? "");
    if (!t) return json({ error: `no Claude agent called ${url.searchParams.get("agent")}`, agents: [...terms.keys()] }, 404);
    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return json({ error: "this is a WebSocket" }, 426);
    const { socket, response } = Deno.upgradeWebSocket(req);
    t.view(socket);
    return response;
  }
  if (path === "/__ai/worker") {
    const name = url.searchParams.get("name") ?? "";
    const w = workers.find((x) => x.name === name || x.name.split(" ")[0] === name);
    if (!w) return json({ error: `no agent called ${name}`, agents: workers.map((x) => x.name.split(" ")[0]) }, 404);
    const after = Number(url.searchParams.get("after") ?? 0);
    return json({
      name: w.name, busy: Boolean(w.job), job: w.job ? { id: w.job.id, text: w.job.text } : null, activity: w.activity,
      lines: w.log.filter((l) => l.seq > after), next: w.log.at(-1)?.seq ?? after,
    });
  }
  if (path === "/__ai/claude-hook" && req.method === "POST") {
    try {
      terms.get(url.searchParams.get("agent") ?? "")?.hook(await req.json());
    } catch { /* not a hook payload */ }
    return json({});
  }

  if (o.attach) {
    return new Response(`agent-interactive is attached to ${pageUrl}; open that page. This port only answers /__ai/say and /__ai/jobs.\n`, { status: 404 });
  }
  let file = `${root}${path}`;
  if (!file.startsWith(root + "/") && file !== root) return new Response("forbidden\n", { status: 403 });
  try {
    if ((await Deno.stat(file)).isDirectory) file = file.replace(/\/?$/, "/index.html");
    const ext = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
    const headers = { "content-type": MIME[ext] ?? "application/octet-stream", "cache-control": "no-store" };
    if (ext === "html" || ext === "htm") {
      const text = await Deno.readTextFile(file);
      const tag = `<script>${CLIENT}</script>`;
      const body = /<\/body>/i.test(text) ? text.replace(/<\/body>/i, `${tag}\n</body>`) : text + tag;
      return new Response(body, { headers });
    }
    return new Response((await Deno.open(file)).readable, { headers });
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return new Response("not found\n", { status: 404 });
    throw e;
  }
}

const APPROVE = ["this is great", "looks great", "looks good", "love it", "i love", "perfect", "this is good",
  "keep this", "amazing", "great", "fine", "nice", "that works", "works now", "cool", "much better"];
const ASK = /\b(doesn'?t|does not|isn'?t|is not|aren'?t|don'?t|do not|can'?t|cannot|won'?t|didn'?t|nothing|instead|supposed to|expected|actually|not|no longer|wrong|weird|odd|ugly|missing|should|seems?|looks? (off|bad|wrong|weird|odd|broken)|feels?|can we|could (we|you)|would you|please|i want|i'?d like|we need|needs?|stylized|styled|styling)\b/i;
const DIAGNOSE = /\b(figure out|find out|why|errors?|fail(s|ed|ing|ure)?|broken|breaks?|not working|doesn'?t work|isn'?t working|crash(es|ed|ing)?|loading|retry|investigate|look into|debug|bug|stuck|hangs?|check (that|whether|if|what)|(are|is|isn'?t|aren'?t) not (loaded|showing|shown|downloaded|working|updating|rendering|appearing)|not (loaded|downloaded|rendered)|(don'?t|doesn'?t|do not|does not) have (any )?data|correctly (downloaded|loaded|fetched))\b/i;
const CHANGE = /\b(drop|remove|change|make|replace|let'?s|add|move|fix|instead|reduce|less|more|rename|highlight|center|update|bigger|smaller|larger|darker|lighter|hide|show|swap|align|increase|decrease|put|turn|use)\b/i;

const L0 = "(?<![\\p{L}])";
const L1 = "(?![\\p{L}])";
const es = (words: string) => new RegExp(`${L0}(${words})${L1}`, "iu");
const CHANGE_MORE = /\b(improve|polish|tweak|clean up|tidy|simplify|restyle|shorten|widen|narrow|enlarge|shrink)\b/i;
const CHANGE_ES = es("cambi[aá]|cambi[aá](lo|la|los|las)|cambiemos|cambiar|sac[aá]|sac[aá](lo|la|los|las)|saquemos|sacar|pon[eé]|pon[eé](lo|la|los|las)|" +
  "pongamos|poner|agreg[aá]|agreg[aá](lo|la)|agreguemos|agregar|añad[ií]|mov[eé]|mov[eé](lo|la)|movamos|mover|quit[aá]|quit[aá](lo|la)|quitar|" +
  "borr[aá]|borr[aá](lo|la)|borrar|elimin[aá]|eliminar|renombr[aá]|renombrar|arregl[aá]|arregl[aá](lo|la)|arreglemos|arreglar|hac[eé]|" +
  "hac[eé](lo|la)|hagamos|centr[aá]|centr[aá](lo|la)|centrar|aline[aá]|alinear|agrand[aá]|achic[aá]|reemplaz[aá]|reemplazar|mostr[aá]|" +
  "ocult[aá]|ocultar|mejor[aá]|mejorar|más grande|más chico|más chica|más oscuro|más oscura|más claro|más clara|a la izquierda|a la derecha");
const ASK_ES = es("debería|deberían|tendría que|hay que|necesito que|quiero que|no se ve|se ve mal|queda mal|está mal|feo|fea|raro|rara|no me gusta");
const DIAGNOSE_ES = es("por qué|porqué|fijate|fíjate|investig[aá]|no carga|no cargan|no se carga|no anda|no funciona|errores|error|falla|fallan|" +
  "se rompe|roto|rota|tarda|tardan|lento|lenta|más rápido|rendimiento");
const PERF = /\b(performance|(takes?|taking) (too|so|way too) long|too (slow|long)|(is|are|so|very|really|pretty) slow|loads? slow(ly)?|slow to load|load(s|ing)? faster|faster to load|speed (it |this |that )?up|optimi[sz]e|laggy)\b/i;
const APPROVE_ES = ["está bien", "me gusta", "perfecto", "genial", "buenísimo", "queda bien", "así está bien", "dale"];
const CANCEL = /\b(never ?mind|forget (it|that|about it)|cancel (it|that|this)|scratch that|leave it( as it (is|was))?|don'?t (change|do|touch) (it|that|anything))\b/i;
const CANCEL_ES = es("no importa|olvid[aá](lo|te)?|dej[aá]lo( así| como est[aá])?|no lo (cambies|hagas|toques)|cancel[aá](lo)?");
const ABOUT_TOOL = /\b(the queue|la cola)\b.{0,40}\b(not|isn'?t|stuck|getting|picking|moving|fixed|working|no|está)\b|\bidle agents?\b|\b(flash|fast lane)( thing| agent| lane)?\b.{0,25}\b(is|isn'?t|not|thing|queued|idle|picking|stuck)\b|\bthe focus pane\b|\bagents? (is|are|isn'?t|aren'?t) (not )?(picking|working|idle|doing|stuck)\b|(?<![\p{L}])(el|los) agentes?(?![\p{L}])/iu;

const changes = (t: string) => CHANGE.test(t) || CHANGE_MORE.test(t) || CHANGE_ES.test(t);
const asks = (t: string) => changes(t) || ASK.test(t) || ASK_ES.test(t) || diagnoses(t);
const diagnoses = (t: string) => DIAGNOSE.test(t) || DIAGNOSE_ES.test(t) || PERF.test(t);
const approves = (t: string) => APPROVE.some((p) => t.includes(p)) || APPROVE_ES.some((p) => t.includes(p));
const isCancel = (t: string) => t.split(/\s+/).filter(Boolean).length <= 10 && (CANCEL.test(t) || CANCEL_ES.test(t));

function isQuestion(text: string): boolean {
  return /\?\s*$/.test(text) && !changes(text);
}

function keywordVerdict(text: string): string {
  const lower = text.toLowerCase();
  if (/\bclaude\b/.test(lower)) return "large";
  const words = lower.split(/\s+/).filter(Boolean).length;
  if (isQuestion(text) && words >= 5) return "large";
  if (words <= 12 && approves(lower) && !changes(lower) && !diagnoses(lower)) return "none";
  if (TRAILING_OFF.test(text) && !changes(lower) && !diagnoses(lower)) return "none";
  if (diagnoses(lower)) return "large";
  return asks(lower) ? "small" : "none";
}

const GATE_OPTIONS = {
  small: "a complete request for a small visual or text change to the page",
  large: "a complete request for a bigger change: new sections, new behaviour or restructuring",
  incomplete: "they are still describing a change and have not finished saying what they want",
  none: "not a request to change the page",
};

async function systemoneVerdict(heard: string[]): Promise<{ choice: string; p?: number }> {
  const state = `Page: ${pageUrl}\n${contextBlock()}They said, oldest first:\n${heard.map((h) => `- ${h}`).join("\n")}`;
  const r = await fetch(`${o.gateUrl}/v1/systemone`, {
    method: "POST", headers: JSON_H, signal: AbortSignal.timeout(2000),
    body: JSON.stringify({
      state, model: o.gateModel,
      questions: { intent: { type: "choice", instructions: "Someone is talking while looking at a web page an assistant can edit. What do their latest words ask for?", criteria: GATE_OPTIONS } },
    }),
  });
  if (!r.ok) throw new Error(`systemone ${r.status}: ${clip(await r.text(), 120)}`);
  const ans = (await r.json())?.answers?.intent;
  const choice = ans?.choice;
  if (!(choice in GATE_OPTIONS)) throw new Error(`systemone answered ${JSON.stringify(choice)}`);
  return { choice, p: ans?.probabilities?.[choice] };
}

const heardBuf: { t: number; text: string }[] = [];
let lastVerdict = "";
let gateChain: Promise<unknown> = Promise.resolve();
let gateDown = false;
let lastHearing = 0;
let lastNarration = 0;
let settling: { verdict: string; gateMs: number; since: number; timer?: ReturnType<typeof setTimeout> } | undefined;

const DANGLING = /\b(a|an|the|this|that|these|those|to|of|for|with|and|or|but|so|we|i|you|it|can|could|should|would|will|is|are|be|like|in|on|at|from|by|into|our|my|your|their|then|than|if|when|because|let'?s)$/i;
const TRAILING_OFF = /(\.\.\.|…)["')\]]?\s*$/;
const dangling = (s: string) =>
  TRAILING_OFF.test(s) || (!/[.!?…]["')\]]?\s*$/.test(s) && DANGLING.test(s.trim().replace(/[,;:\s]+$/, "")));
const FOLLOW_CUE = /^(no\b|nope|not\b|actually|instead|wait|oh,? (but|no)|but\b|and\b|also\b|undo|revert|go back|that'?s (too|not)|too (big|small|much|dark|light)|(a (bit|little) )?(more|less)\b|bigger|smaller|rather)/i;

type GateMode = "live" | "dry" | "gate";

function followCandidate(): Job | undefined {
  const j = jobs.filter((x) => !x.dry && x.source !== "repair").at(-1);
  if (!j || j.error) return undefined;
  return j.done === undefined || now() - j.done < 60_000 ? j : undefined;
}

const FOLLOW_STOP = new Set(("the and for but not you can all any are was its let now how why who too way yes use put add one two out off see say " +
  "got get had has him her our via this that here there these those with from have should make want like just also them they what " +
  "when where which would could maybe some seem seems look looks into over need does doesn't don't it's let's about their your please " +
  "really thing things kind sort something everything anything more less very much only still then than well okay yeah drop remove " +
  "change move replace show hide fix rename align think sure click clicking clicked press tap take takes taking " +
  "go goes going come comes page button work works working stuff").split(" "));

function contentWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
  return new Set(words.filter((w) => w.length >= 3 && !FOLLOW_STOP.has(w)).map((w) => w.replace(/(?<!s)s$/, "")));
}

function runningOnClaude(j: Job): boolean {
  return j.dispatched !== undefined && j.done === undefined && (j.route !== "flash" || Boolean(j.worker?.startsWith("claude")));
}

async function relation(prev: Job, said: string): Promise<{ verdict: "append" | "new"; method: string; ms: number }> {
  const d = await relationOf(prev, said);
  const waiting = prev.dispatched === undefined;
  if (d.verdict !== "append" || !(runningOnClaude(prev) || waiting) || FOLLOW_CUE.test(said.trim())) return d;
  const mine = contentWords(prev.text);
  if ([...contentWords(said)].some((w) => mine.has(w))) return d;
  const what = waiting ? "a change still waiting to start" : "a running Claude change";
  return { ...d, verdict: "new", method: `${d.method}; not joined to ${what} without a word in common` };
}

async function relationOf(prev: Job, said: string): Promise<{ verdict: "append" | "new"; method: string; ms: number }> {
  const t = now();
  const state = prev.dispatched === undefined ? "not started yet" : prev.done === undefined ? "still being worked on" : "just done";
  try {
    const out = await opencode.judge(`Someone is talking to an assistant that edits the web page they are looking at, one spoken request at a time.
Their previous request (${state}): "${clip(prev.text, 400)}"
What they just said: "${clip(said, 400)}"
Answer with one word. APPEND only if what they just said belongs to the previous request: it corrects it, changes their mind about it, finishes its sentence, or adds detail about the very same element or feature. NEW if it is about another element, another feature or another question, even on the same page. When unsure, NEW.`, 3000);
    const v = /APPEND/i.test(out) ? "append" : /\bNEW\b/i.test(out) ? "new" : undefined;
    if (v) return { verdict: v, method: o.flashModel, ms: now() - t };
  } catch (e) {
    say(`follow-up check: ${errText(e)}; deciding by cue words`);
  }
  return { verdict: FOLLOW_CUE.test(said.trim()) && (prev.done === undefined || now() - prev.done < 30_000) ? "append" : "new", method: "cue words", ms: now() - t };
}

function followUp(prev: Job, text: string, verdict: string, gateMs: number, settleMs?: number): Job {
  if (prev.dispatched === undefined) {
    prev.text = `${prev.text} ${text}`;
    if (verdict === "large" && claude && prev.route === "flash") {
      prev.route = "opus";
      const i = queues.flash.indexOf(prev);
      if (i >= 0) {
        queues.flash.splice(i, 1);
        queues.claude.push(prev);
        pump();
      }
    }
    say(`#${prev.id} + ${clip(text, 100)} (joined it before it started)`);
    status(prev, "working", `…${clip(prev.text, 60)}`);
    trace({ type: "joined", into: prev.id, text });
    return prev;
  }
  const job = newJob("narration", text, verdict === "large" && claude ? "opus" : "flash");
  job.follows = prev;
  job.gateMs = gateMs;
  job.settleMs = settleMs;
  say(`#${job.id} heard (narration), follows #${prev.id}: ${clip(text, 100)}`);
  status(job, "working", `…${clip(text, 60)}`);
  preparing.add(job);
  prepare(job).catch(() => {}).finally(() => {
    preparing.delete(job);
    bindFollow(job);
    submit(job);
  });
  return job;
}

function isRepeat(prev: Job, said: string): boolean {
  const mine = contentWords(prev.text);
  const theirs = [...contentWords(said)];
  if (theirs.length < 2) return false;
  const shared = theirs.filter((w) => mine.has(w)).length;
  return shared / theirs.length >= 0.6;
}

async function dispatchSaid(said: string, verdict: string, gateMs: number, settleMs?: number): Promise<Job | undefined> {
  const prev = o.followUp ? followCandidate() : undefined;
  if (prev && prev.dispatched === undefined && isRepeat(prev, said)) {
    const b = blocker(prev, prev.route === "flash" ? "flash" : "claude");
    say(`#${prev.id} said again while it waits${b && b.why !== "follows" ? ` for #${b.by.id}` : ""}; not added twice`);
    trace({ type: "repeat", into: prev.id, text: said });
    speakText(b ? `Still waiting for number ${b.by.id} to finish; yours is next.` : "Still queued; it starts as soon as an agent is free.");
    return prev;
  }
  if (prev) {
    const d = await relation(prev, said);
    say(`follow-up check against #${prev.id}: ${d.verdict} (${d.method}, ${d.ms}ms)`);
    trace({ type: "follow", prev: prev.id, text: said, verdict: d.verdict, method: d.method, ms: d.ms });
    if (d.verdict === "append") return followUp(prev, said, verdict, gateMs, settleMs);
  }
  const job = enqueue("narration", (verdict === "large" ? "!" : "") + said, gateMs);
  job.settleMs = settleMs;
  return job;
}

function flushLater(ms: number) {
  if (!settling) return;
  clearTimeout(settling.timer);
  settling.timer = setTimeout(() => {
    gateChain = gateChain.then(flushPending).catch((e) => say(`settle: ${errText(e)}`));
  }, ms);
}

function continuation(buf: { t: number; text: string }[], anchorT: number): string {
  if (!buf.length) return "";
  let a = buf.findIndex((h) => h.t >= anchorT);
  if (a < 0) a = buf.length - 1;
  let i = a;
  while (i > 0) {
    const prev = buf[i - 1];
    if (buf[i].t - prev.t <= 6000 || dangling(prev.text)) i--;
    else break;
  }
  if (i > 0) {
    const gone = buf.slice(0, i).map((h) => h.text).join(" ");
    say(`not part of the request, dropped: ${clip(gone, 100)}`);
    trace({ type: "dropped", text: gone });
  }
  return buf.slice(i).map((h) => h.text).join(" ");
}

async function flushPending() {
  const p = settling;
  if (!p) return;
  const said = heardBuf.map((h) => h.text).join(" ");
  const held = now() - p.since;
  const quiet = now() - Math.max(lastHearing, lastNarration);
  if (held < 8000 && (quiet < o.settle || (dangling(said) && held < 5000))) return flushLater(200);
  const kept = continuation(heardBuf, p.since);
  settling = undefined;
  heardBuf.length = 0;
  const verdict = p.verdict === "large" || keywordVerdict(kept) === "large" ? "large" : "small";
  say(`settled after ${held}ms: ${clip(kept, 100)}`);
  trace({ type: "settle", said: kept, verdict, heldMs: held });
  await dispatchSaid(kept, verdict, p.gateMs, held);
}

let muted = false;
const MUTE = /^(please )?(mute|mute (it|this|yourself)|stop listening|pause listening|silencio|mut[eé]a(te|lo)?|dej[aá] de escuchar)[.!]*$/i;
const UNMUTE = /^(please )?(unmute|un-mute|start listening|listen again|resume listening|you can listen|escuch[aá]( de nuevo)?|volv[eé] a escuchar|desmute[aá]?)[.!]*$/i;

function setMuted(on: boolean, via: string): string {
  if (muted === on) return on ? "already muted" : "already listening";
  muted = on;
  if (on) {
    heardBuf.length = 0;
    if (settling) clearTimeout(settling.timer);
    settling = undefined;
  }
  say(on ? `muted (${via}): narration is ignored until you say "unmute", use the app's mute button or type :unmute`
    : `listening again (${via})`);
  trace({ type: "mute", on, via });
  speakText(on ? "Muted. Say unmute when you want me back." : "Listening again.");
  return on ? "muted" : "listening";
}

function cancelLatest(said: string) {
  if (settling || heardBuf.length) {
    if (settling) clearTimeout(settling.timer);
    settling = undefined;
    heardBuf.length = 0;
    say("cancel: dropped what I was still holding");
    speakText("Dropped that.");
    return;
  }
  const pending = jobs.filter((j) => !j.dry && j.done === undefined && !j.cancelled).at(-1);
  if (!pending) {
    const last = jobs.filter((j) => !j.dry && j.done !== undefined).at(-1);
    const recent = last && now() - last.done! < 120_000;
    say(`cancel: ${recent ? `#${last!.id} had already finished; ask for the opposite change to undo it` : "nothing to cancel"}`);
    speakText(recent ? "That one is already done." : "Nothing to cancel.");
    return;
  }
  pending.cancelled = true;
  trace({ type: "cancel", job: pending.id, text: said });
  say(`#${pending.id} cancelled: ${clip(pending.text, 80)}`);
  for (const lane of ["flash", "claude"] as const) {
    const i = queues[lane].indexOf(pending);
    if (i < 0) continue;
    queues[lane].splice(i, 1);
    pending.done = now();
    finish(pending);
    pump();
    return;
  }
  const w = workers.find((x) => x.job === pending);
  if (w) {
    note(w, `✗ #${pending.id} cancelled`);
    w.interrupt?.(pending);
  }
}

const PROGRESS_EVERY = 180_000;
setInterval(() => {
  const long = workers.filter((w) => w.job && w.lane === "claude" && now() - (w.since ?? now()) > PROGRESS_EVERY &&
    now() - (w.spokeAt ?? w.since ?? now()) > PROGRESS_EVERY);
  if (!long.length) return;
  for (const w of long) w.spokeAt = now();
  const mins = (w: Worker) => Math.round((now() - w.since!) / 60_000);
  say(`still working: ${long.map((w) => `#${w.job!.id} on ${w.name}, ${mins(w)} min (${w.activity || "…"})`).join("; ")}`);
  speakText(`Still working on ${long.map((w) => `number ${w.job!.id}, ${mins(w)} minutes in`).join("; ")}.`);
}, 30_000);

function onNarration(text: string, mode: GateMode = "live", settle = false): Promise<Job | undefined> {
  const said = text.trim().replace(/^[.,…\s]+/, "");
  if (mode === "live" && UNMUTE.test(said)) {
    setMuted(false, "voice");
    return Promise.resolve(undefined);
  }
  if (mode === "live" && MUTE.test(said)) {
    setMuted(true, "voice");
    return Promise.resolve(undefined);
  }
  if (mode === "live" && muted) {
    say(`muted, not acted on: ${clip(said, 100)}`);
    trace({ type: "muted", text: said });
    return Promise.resolve(undefined);
  }
  const run = gateChain.then(async () => {
    const t = now();
    lastNarration = t;
    heardBuf.push({ t, text });
    while (heardBuf.length > 5 || (heardBuf.length && t - heardBuf[0].t > 30_000)) heardBuf.shift();
    const aside = ABOUT_TOOL.test(text) ? "about the tool" : isCancel(text) ? "cancel" : "";
    if (aside) {
      heardBuf.pop();
      lastVerdict = "none";
      say(`${aside === "cancel" ? "cancel" : "about the tool, not acted on"}: ${clip(text, 100)}`);
      trace({ type: "gate", text, verdict: "none", method: aside, ms: 0, held: heardBuf.map((h) => h.text), mode });
      if (aside === "cancel" && mode === "live") cancelLatest(text);
      return undefined;
    }
    let verdict = keywordVerdict(text);
    let judged = false;
    let why = "keywords";
    if (o.gateUrl && !gateDown) {
      try {
        const v = await systemoneVerdict(heardBuf.map((h) => h.text));
        verdict = v.choice;
        why = `${o.gateModel}${v.p === undefined ? "" : ` p=${v.p.toFixed(2)}`}`;
        judged = true;
      } catch (e) {
        gateDown = true;
        say(`gate unavailable, using keywords from now on: ${errText(e)}`);
      }
    }
    if (judged && claude && (/\bclaude\b/i.test(text) || diagnoses(text)) && (verdict === "small" || verdict === "none")) {
      verdict = "large";
    }
    const gateMs = now() - t;
    lastVerdict = verdict;
    say(`gate ${verdict} (${why}, ${gateMs}ms), ${heardBuf.length} line(s) held: ${clip(text, 80)}`);
    trace({ type: "gate", text, verdict, method: why, ms: gateMs, held: heardBuf.map((h) => h.text), mode });
    const request = verdict === "small" || verdict === "large";
    if (settle && mode === "live" && o.settle > 0 && (request || settling)) {
      settling = { verdict: settling?.verdict === "large" || verdict === "large" ? "large" : "small", gateMs: settling?.gateMs ?? gateMs, since: settling?.since ?? t };
      flushLater(o.settle);
      return undefined;
    }
    if (verdict === "none" && judged) heardBuf.length = 0;
    if (!request) return undefined;
    const said = continuation(heardBuf, t);
    heardBuf.length = 0;
    if (mode === "gate") return undefined;
    if (mode === "dry") return enqueue("narration", (verdict === "large" ? "!" : "") + said, gateMs, true);
    return dispatchSaid(said, verdict, gateMs);
  });
  gateChain = run.catch(() => {});
  return run;
}

const NARRATION = /^\d\d\.\d\d\.\d\d\s+\*\*user (narration|approves)\*\*:\s*(.+)$/;

async function* lines(stream: ReadableStream<Uint8Array>) {
  let buf = "";
  for await (const chunk of stream.pipeThrough(new TextDecoderStream())) {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      yield buf.slice(0, i);
      buf = buf.slice(i + 1);
    }
  }
  if (buf) yield buf;
}

let recgo: Deno.ChildProcess | undefined;
let recgoIn: WritableStreamDefaultWriter<Uint8Array> | undefined;

const CLICK = /^\d\d\.\d\d\.\d\d\s+Click:/;
const PAGE_ERROR = /^\d\d\.\d\d\.\d\d\s+Error:\s*(.*)$/;

function samePath(a: string, b: string): boolean {
  try {
    const x = new URL(a), y = new URL(b);
    return x.origin === y.origin && x.pathname === y.pathname;
  } catch {
    return false;
  }
}

function onRecgoLine(line: string) {
  if (/^\d\d\.\d\d\.\d\d\s+hearing:/.test(line)) {
    lastHearing = now();
    if (settling) flushLater(o.settle);
  }
  if (!/^\d\d\.\d\d\.\d\d\s+(console\.|hearing:)/.test(line)) trace({ type: "recgo", line });
  const err = line.match(PAGE_ERROR);
  if (err) {
    const key = err[1].replace(/(https?:\/\/[^\s?#]+)[?#]\S*/g, "$1").replace(/\d+/g, "N").slice(0, 160);
    const seen = pageErrors.get(key);
    if (seen) {
      seen.count++;
      seen.at = now();
      return;
    }
    pageErrors.set(key, { line: `Error: ${clip(err[1], 200)}`, count: 1, at: now() });
    if (pageErrors.size > 30) pageErrors.delete(pageErrors.keys().next().value!);
    console.log(`recgo| ${line}`);
    return;
  }
  const n = line.match(NARRATION);
  if (n) {
    console.log(`recgo| ${line}`);
    if (n[1] === "narration") onNarration(n[2].trim(), "live", true);
    return;
  }
  const nav = line.match(/\b(?:Navigate|Tab): (\S+)/)?.[1];
  if (nav) {
    const moved = !lastPage || !samePath(nav, lastPage);
    lastPage = nav;
    if (!moved) return;
    clicks.length = 0;
    pageErrors.clear();
  } else if (CLICK.test(line)) {
    clicks.push(line.trim());
    if (clicks.length > 4) clicks.shift();
  }
  console.log(`recgo| ${line}`);
}

async function recgoTab(): Promise<string[] | undefined> {
  const port = o.recgoPort || 9222;
  const cdp = `http://127.0.0.1:${port}`;
  const host = new URL(o.attach).host;
  let list: { id: string; type: string; url: string }[];
  for (let told = false;;) {
    try {
      list = await (await fetch(`${cdp}/json/list`, { signal: AbortSignal.timeout(3000) })).json();
      break;
    } catch {
      if (!told) say(`--recgo: waiting for a browser on ${cdp}: start one with --remote-debugging-port=${port} (or point ` +
        `--recgo-port at yours); recgo-tab attaches when it answers, and instructions come from stdin and POST /__ai/say meanwhile`);
      told = true;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  const hostOf = (u: string) => {
    try {
      return new URL(u).host;
    } catch {
      return "";
    }
  };
  let tab = list.find((t) => t.type === "page" && hostOf(t.url) === host);
  if (tab) say(`recgo-tab records your open tab ${clip(tab.url, 80)}`);
  else {
    const r = await fetch(`${cdp}/json/new?${encodeURI(pageUrl)}`, { method: "PUT", signal: AbortSignal.timeout(5000) })
      .catch((e) => ({ ok: false, status: errText(e) } as const));
    if (!r.ok) {
      say(`--recgo: no ${host} tab is open and opening one failed (${r.status}); open ${pageUrl} and run again`);
      return undefined;
    }
    tab = await (r as Response).json();
    say(`no ${host} tab was open: opened ${pageUrl} in a new tab of the browser on ${cdp} for recgo-tab`);
  }
  tabCdp = { port, id: tab!.id };
  lastPage ||= tab!.url;
  return ["--target", tab!.id, "--port", String(port)];
}

async function startRecgo() {
  const args = o.attach ? await recgoTab() : ["--launch", pageUrl, "--port", String(o.recgoPort || 9333)];
  if (!args) return;
  try {
    recgo = new Deno.Command("recgo-tab", { args: [...args, ...o.recgoArgs], stdin: "piped", stdout: "piped", stderr: "piped" })
      .spawn();
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) die("--recgo needs recgo-tab on PATH (programs.recgo in the fleet config)");
    throw e;
  }
  recgoIn = recgo.stdin.getWriter();
  const started = Date.now();
  (async () => { for await (const l of lines(recgo!.stderr)) onRecgoLine(l); })();
  (async () => { for await (const l of lines(recgo!.stdout)) onRecgoLine(l); })();
  recgo.status.then((s) => {
    const why = s.code === 0 ? "" : o.attach
      ? ` -- is a tab on ${new URL(o.attach).host} open in a browser with remote debugging on port ${o.recgoPort || 9222}?`
      : " -- see its lines above";
    say(`recgo-tab exited ${s.code}${why}; instructions still come from stdin and POST /__ai/say`);
    recgo = undefined;
    if (o.attach && Date.now() - started > 10_000) startRecgo().catch((e) => say(`--recgo: ${errText(e)}`));
  });
}

const TERMINAL_NOISE = /\x1b(?:\[[0-9;?$>=!<]*[ -\/]*[@-~]|[P_\]^X][\s\S]*?(?:\x1b\\|\x07)|[@-Z\\-_])|[\x00-\x08\x0b-\x1f\x7f]/g;

async function readStdin() {
  for await (const raw of lines(Deno.stdin.readable)) {
    const t = raw.replace(TERMINAL_NOISE, "").trim();
    if (!t) continue;
    if (t === ":mute" || t === ":unmute" || t === ":m") {
      setMuted(t === ":m" ? !muted : t === ":mute", "typed");
      continue;
    }
    if (t.startsWith(":")) {
      if (recgoIn) await recgoIn.write(enc.encode(t.slice(1) + "\n"));
      else say("no recgo-tab is running");
      continue;
    }
    enqueue("stdin", t);
  }
  if (Deno.env.get("AGENT_INTERACTIVE_PARENT")) {
    say(`the ${Deno.env.get("AGENT_INTERACTIVE_PARENT")} that started this loop is gone; stopping`);
    await shutdown();
  }
}

type Check = { id: string; title: string; state: "ok" | "warn" | "fail" | "skip"; detail: string; fix?: string };

async function doctor(): Promise<never> {
  const checks: Check[] = [];
  const mark = { ok: "✓", warn: "!", fail: "✗", skip: "·" };
  const add = (c: Check) => {
    checks.push(c);
    if (doctorJson) return;
    console.log(`${mark[c.state]} ${c.title.padEnd(18)} ${c.detail}`);
    if (c.fix && c.state !== "ok") console.log(`  ${" ".repeat(18)} → ${c.fix}`);
  };
  const onPath = (cmd: string) => {
    if (!cmd.includes("/")) return which(cmd) !== cmd;
    try {
      return Deno.statSync(cmd).isFile;
    } catch {
      return false;
    }
  };
  const firstLine = async (cmd: string, args: string[]) => {
    const r = await new Deno.Command(cmd, { args, stdout: "piped", stderr: "piped" }).output();
    return new TextDecoder().decode(r.stdout).trim().split("\n")[0];
  };
  const within = <T>(p: Promise<T>, ms: number, what: string) =>
    Promise.race([p, delay(ms).then(() => { throw new Error(`${what} did not answer within ${ms / 1000} s`); })]);

  const major = Number(Deno.version.deno.split(".")[0]);
  add({ id: "deno", title: "Deno", state: major >= 2 ? "ok" : "fail", detail: Deno.version.deno, fix: "install Deno 2 or newer" });
  const missing = ["rg", "git", "curl"].filter((c) => !onPath(c));
  add({
    id: "tools", title: "rg, git, curl", state: missing.length ? "fail" : "ok",
    detail: missing.length ? `not found: ${missing.join(", ")}` : "found",
    fix: "install ripgrep, git and curl (the agent-interactive package brings them)",
  });

  if (o.attach) {
    try {
      const r = await fetch(o.attach, { signal: AbortSignal.timeout(8000) });
      await r.body?.cancel();
      const v = await fetch(`${o.attach}/@vite/client`, { signal: AbortSignal.timeout(8000) });
      const vite = v.ok && (await v.text()).includes("wsToken");
      add({
        id: "page", title: "Page", state: vite ? "ok" : "warn",
        detail: vite ? `${o.attach} is a Vite dev server with hot reload` : `${o.attach} answers (${r.status}) but serves no Vite client`,
        fix: "changes still land in the files, but the page will not reload by itself: attach to its dev server",
      });
    } catch (e) {
      add({ id: "page", title: "Page", state: "fail", detail: `${o.attach}: ${errText(e)}`, fix: "start the page's dev server, or check the URL" });
    }
  } else {
    let index = false;
    try {
      index = Deno.statSync(`${root}/index.html`).isFile;
    } catch { /* none */ }
    add({
      id: "page", title: "Page", state: index ? "ok" : "warn",
      detail: index ? `${root}/index.html, served here with its own hot reload` : `no index.html in ${root}`,
      fix: "pick the folder that holds the page, or the URL of the dev server that serves it",
    });
  }

  const fastCmd = o.opencodeCmd.split(/\s+/)[0];
  if (o.opencode) {
    add({ id: "fast", title: "Fast lane", state: "skip", detail: `uses the opencode server at ${o.opencode}` });
  } else if (!onPath(fastCmd)) {
    add({
      id: "fast", title: "Fast lane", state: "fail", detail: `'${fastCmd}' is not on PATH`,
      fix: "install opencode (https://opencode.ai) and choose it as the fast lane's command",
    });
  } else {
    const t = now();
    try {
      await within(opencode.start(), 60_000, `${fastCmd} serve`);
      add({ id: "fast", title: "Fast lane", state: "ok", detail: `${o.flashModel} answered in ${((now() - t) / 1000).toFixed(1)} s` });
      const probe = `${root}/.agent-interactive-write-check`;
      const gone = () => Deno.remove(probe).catch(() => {});
      try {
        let result: Check | undefined;
        for (let attempt = 1; attempt <= 2 && !result?.state.match(/ok|fail/); attempt++) {
          await gone();
          const sid = await opencode.next();
          await within(opencode.message(sid, `Use the write tool to create the file ${probe} containing the word ok. ` +
            "Do nothing else, then reply DONE.", { ...FLASH_TOOLS, write: true }), 45_000, "the write check");
          const wrote = await Deno.stat(probe).then(() => true, () => false);
          const parts = (await opencode.messages(sid)).flatMap((m) => m.parts ?? []);
          const denied = sandboxDenial(parts);
          const call = parts.find((p) => p.type === "tool" && EDIT_TOOLS.has(p.tool ?? ""));
          const why = call?.state?.error ? `: ${clip(call.state.error, 120)}` : call?.state?.input?.filePath !== probe && call ? ` (it wrote ${call.state?.input?.filePath})` : "";
          result = {
            id: "write", title: "Fast lane writes", state: wrote ? "ok" : denied ? "fail" : "warn",
            detail: wrote ? `its sandbox may change files in ${root}` : denied ? cannotWrite(denied)
              : call ? `its write did not land${why}${attempt === 1 ? "" : ", twice"}` : "the model did not try to write the check file",
            fix: "choose a launcher whose sandbox may write the folder (on the fleet: opencode-bwrap)",
          };
        }
        add(result!);
      } catch (e) {
        add({ id: "write", title: "Fast lane writes", state: "warn", detail: `could not check: ${clip(errText(e), 120)}` });
      } finally {
        await gone();
      }
    } catch (e) {
      add({
        id: "fast", title: "Fast lane", state: "fail", detail: `${o.flashModel}: ${clip(errText(e), 200)}`,
        fix: `give ${o.flashModel.split("/")[0]} a key (the app keeps it in your keychain) or choose another model`,
      });
    } finally {
      opencode.stop();
    }
  }

  if (!claude) {
    add({ id: "claude", title: "Claude", state: "skip", detail: "off: every change stays on the fast lane" });
  } else if (!onPath(o.claudeCmd)) {
    add({
      id: "claude", title: "Claude", state: "fail", detail: `'${o.claudeCmd}' is not on PATH`,
      fix: "install Claude Code (https://claude.com/claude-code), or turn the Claude agents off",
    });
  } else {
    const v = await firstLine(o.claudeCmd, ["--version"]).catch(() => "");
    let auth: { loggedIn?: boolean; authMethod?: string; configDirectory?: string } = {};
    let failed = "";
    try {
      const r = await within(new Deno.Command(o.claudeCmd, { args: ["auth", "status", "--json"], stdout: "piped", stderr: "piped" })
        .output(), 20_000, "claude auth status");
      const out = new TextDecoder().decode(r.stdout);
      try {
        auth = JSON.parse(out);
      } catch {
        failed = (new TextDecoder().decode(r.stderr).trim() || out.trim()).split("\n")[0];
      }
    } catch (e) {
      failed = errText(e);
    }
    add({
      id: "claude", title: "Claude", state: auth.loggedIn ? "ok" : "fail",
      detail: auth.loggedIn ? `${v || o.claudeCmd}, logged in (${auth.authMethod ?? "account"})`
        : failed ? `'${o.claudeCmd} auth status' failed in ${root}: ${clip(failed, 160)}` : `${v || o.claudeCmd}, not logged in`,
      fix: failed ? `run '${o.claudeCmd} auth status' in ${root} to see why` : `log in with '${o.claudeCmd} auth login'`,
    });
    add({
      id: "pty", title: "Agent terminals", state: onPath(PTY_CMD) ? "ok" : "fail",
      detail: onPath(PTY_CMD) ? which(PTY_CMD) : `'${PTY_CMD}' is not on PATH`,
      fix: "the agent-interactive package ships agent-pty; from a checkout: cd pty && cargo build --release",
    });
    const home = Deno.env.get("HOME") ?? "";
    const configs = [auth.configDirectory && `${auth.configDirectory}/.config.json`, `${home}/.claude/.config.json`, `${home}/.claude.json`];
    const ancestors = root.split("/").map((_, i, parts) => parts.slice(0, i + 1).join("/") || "/");
    let trusted = false;
    for (const f of configs.filter(Boolean) as string[]) {
      try {
        const projects = JSON.parse(Deno.readTextFileSync(f)).projects ?? {};
        trusted ||= ancestors.some((d) => projects[d]?.hasTrustDialogAccepted);
      } catch { /* not this one */ }
    }
    add({
      id: "trust", title: "Folder trust", state: trusted ? "ok" : "warn",
      detail: trusted ? `Claude trusts ${root}` : `Claude has not been told to trust ${root}`,
      fix: "the first agent asks once, with \"No, exit\" preselected: choose \"Yes, I trust this folder\" in its terminal",
    });
  }

  if (!o.recgo) {
    add({ id: "voice", title: "Voice", state: "skip", detail: "off: type instructions, or turn voice on to talk" });
  } else if (!onPath("recgo-tab")) {
    add({ id: "voice", title: "Voice", state: "fail", detail: "recgo-tab is not on PATH", fix: "install recgo (programs.recgo on the fleet)" });
  } else if (o.attach) {
    const port = o.recgoPort || 9222;
    try {
      const b = await (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(3000) })).json();
      add({ id: "voice", title: "Voice", state: "ok", detail: `recgo-tab will record ${b.Browser ?? "the browser"} on port ${port}` });
    } catch {
      add({
        id: "voice", title: "Voice", state: "warn", detail: `no browser with remote debugging on port ${port}`,
        fix: `start Chromium with --remote-debugging-port=${port} and open ${o.attach} in it`,
      });
    }
  } else {
    add({ id: "voice", title: "Voice", state: "ok", detail: `recgo-tab launches its own browser on the page (port ${o.recgoPort || 9333})` });
  }

  if (o.say === "none") {
    add({ id: "speech", title: "Spoken replies", state: "skip", detail: "off" });
  } else if (o.say === "speaches") {
    const player = onPath(PLAYER);
    try {
      const r = await fetch(`${o.ttsUrl}/v1/models`, { signal: AbortSignal.timeout(6000) });
      await r.body?.cancel();
      add({
        id: "speech", title: "Spoken replies", state: r.ok && player ? "ok" : "warn",
        detail: r.ok ? (player ? `${o.ttsUrl} answers` : `${o.ttsUrl} answers, but ${PLAYER} is not on PATH`)
          : `${o.ttsUrl} answered ${r.status}; replies are spoken with ${VOICE} meanwhile`,
        fix: player ? `start the speech server at ${o.ttsUrl}, or point to another one` : `install ${PLAYER}`,
      });
    } catch (e) {
      add({
        id: "speech", title: "Spoken replies", state: "warn",
        detail: `${o.ttsUrl}: ${clip(errText(e), 100)}; replies are spoken with ${onPath(VOICE) ? VOICE : "nothing"} meanwhile`,
        fix: "point to a speech server (OpenAI-compatible /v1/audio/speech), or turn spoken replies off",
      });
    }
  } else {
    const cmd = o.say.split(/\s+/)[0];
    add({ id: "speech", title: "Spoken replies", state: onPath(cmd) ? "ok" : "fail", detail: onPath(cmd) ? `with ${cmd}` : `'${cmd}' is not on PATH` });
  }

  const failed = checks.filter((c) => c.state === "fail").length;
  if (doctorJson) console.log(JSON.stringify({ ok: failed === 0, root, page: pageUrl, checks }, null, 1));
  else console.log(failed ? `\n${failed} to fix before it can run` : "\nready");
  Deno.exit(failed ? 1 : 0);
}

let stopping = false;
async function shutdown() {
  if (stopping) Deno.exit(130);
  stopping = true;
  if (recgo) {
    say("stopping recgo-tab: it packs the session first (Ctrl-C again to abandon it)");
    try { recgo.kill("SIGINT"); } catch { /* gone */ }
    await recgo.status.catch(() => {});
  }
  opencode.stop();
  for (const b of claudeBackends) b.stop();
  Deno.exit(0);
}
Deno.addSignalListener("SIGINT", shutdown);
Deno.addSignalListener("SIGTERM", shutdown);

if (doctorMode) await doctor();
if (o.port !== askedPort) say(`port ${askedPort} or ${askedPort + 1} is taken; using ${o.port} (fast lane ${o.port + 1}) instead`);
say(`listening on 127.0.0.1:${o.port}`);

try {
  Deno.serve({ port: o.port, hostname: "127.0.0.1", onListen() {} }, serve);
} catch (e) {
  if (e instanceof Deno.errors.AddrInUse) {
    die(`port ${o.port} was taken between the check and the start (another agent-interactive starting?); run it again`);
  }
  throw e;
}
if (o.attach) {
  attachVite();
  await detectApp().catch((e) => say(`page files: could not read the app's routes (${errText(e)}); only clicks and words guide the fast lane`));
  say(`attached to ${pageUrl}: agents edit ${searchDirs.map((d) => d === "." ? root : `${root}/${d}`).join(", ")}`);
  say(`instructions: type here, or curl -X POST 'localhost:${o.port}/__ai/say?wait=1' --data '...'`);
} else {
  watch();
  say(`serving ${root} at ${pageUrl}`);
}
say(`log ${logPath}`);
if (trajectoryPath) say(`trajectory ${trajectoryPath}`);
trace({
  type: "start", page: pageUrl, root, search: searchDirs, attach: o.attach || null, flashModel: o.flashModel,
  claudeModel: claude ? o.claudeModel : null, claudeWorkers: o.claudeWorkers, claudeEffort: o.claudeEffort || null, gate: o.gateUrl || "keywords",
  git: await new Deno.Command("git", { args: ["-C", root, "rev-parse", "HEAD"], stdout: "piped", stderr: "null" }).output()
    .then((r) => new TextDecoder().decode(r.stdout).trim() || null).catch(() => null),
});
await opencode.start().catch((e) => {
  opencode.stop();
  die(`the fast lane could not answer a warm-up message with ${o.flashModel}: ${errText(e)}\n` +
    `  check the model id (--flash-model provider/model) and that its provider has a key in ~/.config/opencode/opencode.json`);
});
say(`fast lane ${o.flashModel} ready on ${opencode.base} (a fresh session per change); large changes -> ${claude ? `${o.claudeWorkers} × ${o.claudeCmd} ${o.claudeModel}` : "the fast lane too"}`);
if (claude) say(`claude agents ${[...terms.keys()].join(", ")}: each starts in its own terminal with its first change or when the app opens it`);
say(`gate: ${o.gateUrl ? `${o.gateUrl}/v1/systemone (${o.gateModel})` : "keywords"}; speech: ${o.say}`);
if (o.recgo) startRecgo().catch((e) => say(`--recgo: ${errText(e)}`));
readStdin();
