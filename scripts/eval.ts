#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write

const HELP = `eval: replay recorded cases through a running agent-interactive and score it

usage: scripts/eval.ts CASES.jsonl... [--port N] [--gate-only] [--label NAME] [--out FILE] [--baseline FILE]

  CASES.jsonl      one case per line: {"id", "attach"?, "context"?: [recgo lines], "screen"?: [lines],
                   "said": [utterances], "expect": {"verdict"?: "none"|"small"|"large", "files"?: [paths]}}
                   or a follow-up case: {"id", "prev": "the request before", "running"?: "claude"|"queued", "said": [...],
                   "expect": {"follow": "append"|"new"}}, scored through POST /__ai/relation
  --port N         the loop to replay through (default 5199); start it with --say none --claude-cmd none
  --gate-only      judge only the gate: no model calls, cases need no loop attached to their page
  --label NAME     name this run in the output (default: the date)
  --out FILE       write the scored run as JSON, to compare later with --baseline
  --baseline FILE  a previous --out file: print what got better and what got worse

A case with expect.files is replayed dry (the fast lane says what it would change, nothing is edited)
and scored on the file it names; cases whose "attach" differs from the loop's page are skipped.`;

type Case = {
  id: string;
  attach?: string;
  context?: string[];
  screen?: string[];
  said: string[];
  prev?: string;
  running?: "claude" | "queued";
  expect: { verdict?: "none" | "small" | "large"; files?: string[]; follow?: "append" | "new" };
  notes?: string;
};
type Job = { planned: string | null; files: string[]; tools: string[] | null; promptBytes: number | null; summary: string | null; error: string | null; ms: { done: number | null } };
type Result = {
  id: string;
  skipped?: string;
  expected: Case["expect"];
  verdict?: string;
  request?: boolean;
  lane?: boolean;
  target?: boolean | null;
  follow?: boolean;
  relation?: string;
  planned?: string | null;
  ms?: number | null;
  tools?: number | null;
  promptKB?: number | null;
  answer?: string;
};

function die(msg: string): never {
  console.error(`eval: ${msg}\nrun 'scripts/eval.ts --help' for usage`);
  Deno.exit(64);
}

const files: string[] = [];
let port = 5199, gateOnly = false, label = new Date().toISOString().slice(0, 10), out = "", baseline = "";
for (let i = 0; i < Deno.args.length; i++) {
  const a = Deno.args[i];
  const val = () => Deno.args[++i] ?? die(`${a} needs a value`);
  if (a === "-h" || a === "--help") {
    console.log(HELP);
    Deno.exit(0);
  } else if (a === "--port") port = Number(val());
  else if (a === "--gate-only") gateOnly = true;
  else if (a === "--label") label = val();
  else if (a === "--out") out = val();
  else if (a === "--baseline") baseline = val();
  else if (a.startsWith("-")) die(`unknown option ${a}`);
  else files.push(a);
}
if (!files.length) die("give at least one CASES.jsonl");

const cases: Case[] = [];
for (const f of files) {
  const text = await Deno.readTextFile(f).catch(() => die(`cannot read ${f}`));
  text.split("\n").forEach((line, n) => {
    if (!line.trim() || line.trim().startsWith("//")) return;
    try {
      const c = JSON.parse(line);
      if (!c.id || !Array.isArray(c.said) || !c.expect) throw new Error("needs id, said and expect");
      cases.push(c);
    } catch (e) {
      die(`${f}:${n + 1}: ${e instanceof Error ? e.message : e}`);
    }
  });
}

const B = `http://127.0.0.1:${port}/__ai`;
const status = await fetch(`${B}/status`, { signal: AbortSignal.timeout(3000) }).then((r) => r.json()).catch(() => undefined);
if (!status) die(`no agent-interactive answers on port ${port}; start one (--say none --claude-cmd none) or pass --port`);
const page = String(status.page ?? "");

const lane = (v?: string) => (v === "small" || v === "large" ? "request" : "none");
const secs = (ms?: number | null) => (ms == null ? "-" : `${(ms / 1000).toFixed(1)}s`);
const same = (a: string, b: string) => a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
const results: Result[] = [];

for (const c of cases) {
  if (c.prev !== undefined) {
    const r = await fetch(`${B}/relation`, {
      method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ prev: c.prev, said: c.said.join(" "), running: c.running }),
    }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
    if (r.error || !r.verdict) {
      results.push({ id: c.id, expected: c.expect, skipped: `relation failed: ${r.error ?? "no verdict"}` });
      continue;
    }
    const res: Result = { id: c.id, expected: c.expect, relation: r.verdict, follow: r.verdict === c.expect.follow, ms: r.ms };
    results.push(res);
    console.log(`${res.follow ? "✓" : "✗"}   ${c.id.padEnd(22)} ${String(c.expect.follow).padEnd(6)} -> ${r.verdict.padEnd(6)} ${r.ms}ms ${r.method}  "${c.said.at(-1)!.slice(0, 50)}"`);
    continue;
  }
  const dry = !gateOnly && Boolean(c.expect.files?.length);
  if (dry && c.attach && !page.startsWith(c.attach)) {
    results.push({ id: c.id, expected: c.expect, skipped: `needs a loop attached to ${c.attach}` });
    continue;
  }
  const r = await fetch(`${B}/replay${dry ? "" : "?gate=1"}`, {
    method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({ context: c.context ?? [], screen: c.screen ?? [], said: c.said }),
  }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
  if (r.error) {
    results.push({ id: c.id, expected: c.expect, skipped: `replay failed: ${r.error}` });
    continue;
  }
  const verdict = r.gates?.at(-1)?.verdict as string | undefined;
  const job = (r.jobs as Job[] | undefined)?.at(-1);
  const res: Result = { id: c.id, expected: c.expect, verdict };
  if (c.expect.verdict) {
    res.request = lane(verdict) === lane(c.expect.verdict);
    res.lane = verdict === c.expect.verdict;
  }
  if (dry) {
    const named = job?.planned ?? job?.files?.[0] ?? null;
    res.planned = named;
    res.target = named ? c.expect.files!.some((f) => same(named, f)) : false;
    res.ms = job?.ms.done ?? null;
    res.tools = job?.tools?.length ?? null;
    res.promptKB = job?.promptBytes ? Math.round(job.promptBytes / 1024) : null;
    res.answer = (job?.error ?? job?.summary ?? "").replace(/\s+/g, " ").slice(0, 100);
  }
  results.push(res);
  const mark = (b?: boolean | null) => (b === undefined ? " " : b ? "✓" : "✗");
  console.log(`${mark(res.request)}${mark(res.lane)}${dry ? mark(res.target) : " "} ${c.id.padEnd(22)} ` +
    `${(c.expect.verdict ?? "-").padEnd(5)} -> ${(verdict ?? "-").padEnd(5)}` +
    (dry ? `  ${secs(res.ms)} tools=${res.tools ?? "-"} ${res.promptKB ?? "-"}KB ${res.planned ?? "(no file)"}` : "") +
    `  "${c.said.at(-1)!.slice(0, 60)}"`);
}

const scored = results.filter((r) => !r.skipped);
const rate = (xs: (boolean | undefined | null)[]) => {
  const v = xs.filter((x) => x !== undefined && x !== null);
  return v.length ? { hit: v.filter(Boolean).length, of: v.length } : null;
};
const median = (xs: number[]) => (xs.length ? xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const nums = (k: "ms" | "tools" | "promptKB") => scored.flatMap((r) => (r[k] == null ? [] : [r[k]!]));
const summary = {
  cases: cases.length, scored: scored.length, skipped: results.length - scored.length,
  request: rate(scored.map((r) => r.request)), lane: rate(scored.map((r) => r.lane)), target: rate(scored.map((r) => r.target)),
  follow: rate(scored.map((r) => r.follow)),
  medianMs: median(nums("ms")), meanTools: mean(nums("tools")), meanPromptKB: mean(nums("promptKB")),
};
const pct = (x: { hit: number; of: number } | null) => (x ? `${x.hit}/${x.of} (${Math.round((x.hit / x.of) * 100)}%)` : "-");
console.log(`\n${label}: request ${pct(summary.request)} · lane ${pct(summary.lane)} · target ${pct(summary.target)} · follow ${pct(summary.follow)} · ` +
  `median ${secs(summary.medianMs)} · tools ${summary.meanTools ?? "-"} · ` +
  `prompt ${summary.meanPromptKB ?? "-"}KB${summary.skipped ? ` · ${summary.skipped} skipped` : ""}`);
for (const r of results.filter((x) => x.skipped)) console.log(`  skipped ${r.id}: ${r.skipped}`);

if (baseline) {
  const prev = JSON.parse(await Deno.readTextFile(baseline).catch(() => die(`cannot read ${baseline}`)));
  const before = new Map<string, Result>((prev.results as Result[]).map((r) => [r.id, r]));
  console.log(`\ncompared with ${prev.label}: request ${pct(prev.summary.request)} · lane ${pct(prev.summary.lane)} · ` +
    `target ${pct(prev.summary.target)} · median ${secs(prev.summary.medianMs)}`);
  for (const r of scored) {
    const b = before.get(r.id);
    if (!b || b.skipped) continue;
    for (const k of ["request", "lane", "target", "follow"] as const) {
      if (b[k] === true && r[k] === false) console.log(`  worse  ${r.id}: ${k} (${b.verdict ?? b.planned} -> ${r.verdict ?? r.planned})`);
      if (b[k] === false && r[k] === true) console.log(`  better ${r.id}: ${k}`);
    }
    if (r.relation === undefined && b.ms && r.ms && r.ms > b.ms * 1.5 && r.ms - b.ms > 1000) console.log(`  slower ${r.id}: ${secs(b.ms)} -> ${secs(r.ms)}`);
  }
}

if (out) {
  await Deno.writeTextFile(out, JSON.stringify({ label, at: new Date().toISOString(), port, page, summary, results }, null, 1) + "\n");
  console.log(`wrote ${out}`);
}
