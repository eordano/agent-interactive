#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-run --allow-env

const HELP = `claude-eval: replay recorded large changes through the Claude lane at several effort levels

usage: scripts/claude-eval.ts CASES.jsonl --effort LEVEL[,LEVEL...] [--model M] [--work DIR] [--out FILE]
                              [--opencode-cmd CMD] [--port N]

  CASES.jsonl     one case per line: {"id", "tree" (a leading ~/ is $HOME), "rev", "search"?,
                  "context"?: [recgo lines], "said": [the request],
                  "expect": {"files": [paths the recorded change edited]}}
  --effort        levels to compare (low, medium, high, xhigh, max; "default" = Claude Code's own);
                  each level runs in parallel on its own copy of the tree, the cases one after another
  --model M       the Claude model (default claude-opus-5-5)
  --work DIR      where the copies live (default $TMPDIR/agent-interactive-claude-eval): a shared clone
                  of each case's tree per level, checked out at the case's rev and cleaned between cases,
                  so the original repository is only read
  --out FILE      write the results as JSON
  --opencode-cmd  the fast lane's launcher; the loop needs one even though every case goes to Claude
                  (default opencode-bwrap)
  --port N        the first loop's port; each level takes N + 10 * i (default 5310)

Each case starts a fresh loop (one Claude agent, --claude-effort LEVEL) on the copy, answers Claude's
first-run folder trust prompt in the agent's terminal, posts the case's recgo context, sends the
request with a leading ! (straight to Claude) and waits for it to finish. Scored on: time to the first
write and to done, whether a file the recorded change edited was touched, tool calls, and the diff.`;

type Case = {
  id: string; tree: string; rev: string; search?: string; context?: string[]; said: string[];
  expect: { files: string[] }; recorded?: { doneMs?: number; writeMs?: number; tools?: number };
};
type Result = {
  case: string; effort: string; doneMs: number | null; writeMs: number | null; files: string[]; landed: boolean;
  tools: number | null; summary: string | null; error: string | null; diff: string[];
};

const args = [...Deno.args];
if (!args.length || args.includes("-h") || args.includes("--help")) {
  console.log(HELP);
  Deno.exit(args.length ? 0 : 64);
}
const opt = (name: string, dflt: string) => {
  const i = args.indexOf(name);
  if (i < 0) return dflt;
  const v = args[i + 1];
  if (!v) {
    console.error(`claude-eval: ${name} needs a value`);
    Deno.exit(64);
  }
  args.splice(i, 2);
  return v;
};
const efforts = opt("--effort", "").split(",").map((e) => e.trim()).filter(Boolean);
const model = opt("--model", "claude-opus-5-5");
const work = opt("--work", `${Deno.env.get("TMPDIR") ?? "/tmp"}/agent-interactive-claude-eval`);
const out = opt("--out", "");
const opencodeCmd = opt("--opencode-cmd", "opencode-bwrap");
const basePort = Number(opt("--port", "5310"));
if (!efforts.length || efforts.some((e) => !/^(default|low|medium|high|xhigh|max)$/.test(e))) {
  console.error("claude-eval: --effort takes default, low, medium, high, xhigh or max, comma-separated");
  Deno.exit(64);
}
const loop = new URL("../agent-interactive.ts", import.meta.url).pathname;
const cases: Case[] = args.flatMap((f) =>
  Deno.readTextFileSync(f).split("\n").filter((l) => l.trim() && !l.trim().startsWith("//")).map((l) => JSON.parse(l))
);

const enc = new TextEncoder();
const dec = new TextDecoder();
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const say = (effort: string, line: string) => console.log(`${new Date().toTimeString().slice(0, 8)}  [${effort}] ${line}`);

async function git(dir: string, ...a: string[]): Promise<string> {
  const r = await new Deno.Command("git", { args: ["-C", dir, ...a], stdout: "piped", stderr: "piped" }).output();
  if (!r.success) throw new Error(`git ${a.join(" ")}: ${dec.decode(r.stderr).trim()}`);
  return dec.decode(r.stdout);
}

async function copyAt(c: Case, dir: string) {
  try {
    await Deno.stat(`${dir}/.git`);
  } catch {
    await Deno.mkdir(dir, { recursive: true });
    const tree = c.tree.replace(/^~(?=\/|$)/, Deno.env.get("HOME") ?? "~");
    const r = await new Deno.Command("git", { args: ["clone", "-q", "--shared", "--no-checkout", tree, dir], stderr: "piped" }).output();
    if (!r.success) throw new Error(`git clone --shared ${tree}: ${dec.decode(r.stderr).trim()}`);
  }
  await git(dir, "checkout", "-q", "-f", "--detach", c.rev);
  await git(dir, "clean", "-fdq");
}

function answerTrust(port: number, effort: string): WebSocket {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/__ai/term?agent=claude-1`);
  ws.binaryType = "arraybuffer";
  let seen = "";
  let answered = false;
  ws.onmessage = (e) => {
    if (typeof e.data === "string" || answered) return;
    seen = (seen + dec.decode(new Uint8Array(e.data))).slice(-4000);
    if (/trustthisfolder/i.test(seen.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "").replace(/\s+/g, ""))) {
      answered = true;
      say(effort, "answering Claude's folder trust prompt in claude-1's terminal");
      setTimeout(() => ws.send(enc.encode("\x1b[B")), 1500);
      setTimeout(() => ws.send(enc.encode("\r")), 2100);
    }
  };
  return ws;
}

async function runCase(c: Case, effort: string, port: number, dir: string): Promise<Result> {
  await copyAt(c, dir);
  const loopArgs = [dir, "--port", String(port), "--claude-workers", "1", "--claude-model", model, "--opencode-cmd", opencodeCmd,
    "--say", "none", "--no-follow-up", "--trajectories", `${work}/trajectories`, ...(c.search ? ["--search", c.search] : []),
    ...(effort === "default" ? [] : ["--claude-effort", effort])];
  const p = new Deno.Command(loop, { args: loopArgs, env: { AGENT_INTERACTIVE_PARENT: "claude-eval" }, stdin: "piped", stdout: "piped", stderr: "piped" })
    .spawn();
  const stdin = p.stdin.getWriter();
  let log = "";
  (async () => { for await (const b of p.stdout) log += dec.decode(b); })();
  (async () => { for await (const b of p.stderr) log += dec.decode(b); })();
  let term: WebSocket | undefined;
  const base = () => `http://127.0.0.1:${Number(/listening on 127\.0\.0\.1:(\d+)/.exec(log)?.[1] ?? port)}`;
  try {
    const until = Date.now() + 120_000;
    while (!log.includes("ready on")) {
      if (Date.now() > until) throw new Error(`the loop did not start: ${log.slice(-300)}`);
      await delay(300);
    }
    const port2 = Number(new URL(base()).port);
    term = answerTrust(port2, effort);
    const sessionBy = Date.now() + 90_000;
    for (;;) {
      const st = await (await fetch(`${base()}/__ai/status`)).json();
      if (st.workers.find((w: { name: string }) => w.name === "claude-1")?.terminal?.ready) break;
      if (Date.now() > sessionBy) throw new Error("claude-1 was not ready within 90 s (a prompt in its terminal?)");
      await delay(1000);
    }
    if (c.context?.length) await fetch(`${base()}/__ai/context?clear=1`, { method: "POST", body: c.context.join("\n") });
    say(effort, `${c.id}: sent`);
    const r = await (await fetch(`${base()}/__ai/say?wait=1`, { method: "POST", body: `!${c.said.join(" ")}`, signal: AbortSignal.timeout(20 * 60_000) })).json();
    const diff = (await git(dir, "diff", "--stat")).trim().split("\n").filter(Boolean);
    const touched = (await git(dir, "diff", "--name-only")).trim().split("\n").filter(Boolean);
    const files = [...new Set([...(r.files ?? []), ...touched])];
    return {
      case: c.id, effort, doneMs: r.ms?.done ?? null, writeMs: r.ms?.write ?? null, files,
      landed: !r.error && c.expect.files.some((f) => files.includes(f)), tools: Array.isArray(r.tools) ? r.tools.length : null,
      summary: r.summary ?? r.reply ?? null, error: r.error ?? null, diff,
    };
  } catch (e) {
    return { case: c.id, effort, doneMs: null, writeMs: null, files: [], landed: false, tools: null, summary: null, error: String(e), diff: [] };
  } finally {
    term?.close();
    await stdin.close().catch(() => {});
    await Promise.race([p.status, delay(30_000)]);
    try {
      p.kill("SIGKILL");
    } catch { /* exited */ }
  }
}

const results: Result[] = [];
await Promise.all(efforts.map(async (effort, i) => {
  const dir = `${work}/${effort}`;
  for (const c of cases) {
    const r = await runCase(c, effort, basePort + 10 * i, dir);
    results.push(r);
    say(effort, `${c.id}: ${r.error ? `failed: ${r.error.slice(0, 160)}` : `${r.landed ? "landed" : "missed"} · done ${((r.doneMs ?? 0) / 1000).toFixed(0)} s · ` +
      `first write ${r.writeMs == null ? "-" : `${(r.writeMs / 1000).toFixed(0)} s`} · ${r.tools ?? "?"} tools · ${r.files.join(", ") || "no files"}`}`);
  }
}));

const median = (xs: number[]) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN;
};
console.log("\ncase                       " + efforts.map((e) => e.padEnd(28)).join(""));
for (const c of cases) {
  const cells = efforts.map((e) => {
    const r = results.find((x) => x.case === c.id && x.effort === e)!;
    return (r.error ? "failed" : `${r.landed ? "✓" : "✗"} ${((r.doneMs ?? 0) / 1000).toFixed(0)}s ${r.tools ?? "?"}t`).padEnd(28);
  });
  const rec = c.recorded?.doneMs ? `  (recorded ${(c.recorded.doneMs / 1000).toFixed(0)}s ${c.recorded.tools ?? "?"}t)` : "";
  console.log(c.id.padEnd(27) + cells.join("") + rec);
}
for (const e of efforts) {
  const rs = results.filter((r) => r.effort === e);
  console.log(`${e}: landed ${rs.filter((r) => r.landed).length}/${rs.length} · median done ${(median(rs.map((r) => r.doneMs ?? NaN)) / 1000).toFixed(0)} s · ` +
    `median first write ${(median(rs.map((r) => r.writeMs ?? NaN)) / 1000).toFixed(0)} s · median tools ${median(rs.map((r) => r.tools ?? NaN))}`);
}
if (out) Deno.writeTextFileSync(out, JSON.stringify({ model, efforts, at: new Date().toISOString(), results }, null, 1) + "\n");
