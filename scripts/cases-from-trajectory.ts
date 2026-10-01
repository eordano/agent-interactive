#!/usr/bin/env -S deno run --allow-read

const HELP = `cases-from-trajectory: turn a recorded run into draft eval cases

usage: scripts/cases-from-trajectory.ts TRAJECTORY.jsonl [--prefix ID] > draft.jsonl

Each gate verdict becomes a case: the page and clicks recgo had seen, the lines the gate held with
it, the screen text the change was matched against, and as "expect" what happened (the verdict and,
when files were edited, those files). Everything is marked "reviewed": false: correct the expectations
where the loop got it wrong, then append the case to an evals/*.jsonl file.`;

type Ev = Record<string, unknown> & { type: string };

const args = [...Deno.args];
if (!args.length || args.includes("-h") || args.includes("--help")) {
  console.log(HELP);
  Deno.exit(args.length ? 0 : 64);
}
const pi = args.indexOf("--prefix");
const prefix = pi >= 0 ? args.splice(pi, 2)[1] : "";
const file = args[0];
const events: Ev[] = (await Deno.readTextFile(file)).split("\n").filter(Boolean).map((l) => JSON.parse(l));
const stem = prefix || file.split("/").at(-1)!.replace(/\.jsonl$/, "");

const samePath = (a: string, b: string) => {
  try {
    const x = new URL(a), y = new URL(b);
    return x.origin === y.origin && x.pathname === y.pathname;
  } catch {
    return false;
  }
};

let attach: string | null = null;
let nav = "";
let clicks: string[] = [];
let n = 0;
const pending: Record<string, unknown>[] = [];

for (const ev of events) {
  if (ev.type === "start") attach = (ev.attach as string | null) ?? null;
  if (ev.type === "recgo") {
    const line = String(ev.line);
    const url = line.match(/\b(?:Navigate|Tab): (\S+)/)?.[1];
    if (url) {
      if (!nav || !samePath(url, nav.match(/(?:Navigate|Tab): (\S+)/)?.[1] ?? "")) clicks = [];
      nav = line;
    } else if (/^\d\d\.\d\d\.\d\d\s+Click:/.test(line)) clicks = [...clicks, line].slice(-4);
  }
  if (ev.type === "gate" && ev.mode !== "gate" && ev.mode !== "dry") {
    const held = (ev.held as string[] | undefined)?.length ? (ev.held as string[]) : [String(ev.text)];
    pending.push({
      id: `${stem}-${String(++n).padStart(2, "0")}`, ...(attach ? { attach } : {}),
      context: [...(nav ? [nav] : []), ...clicks], said: held,
      expect: { verdict: ev.verdict }, reviewed: false, _text: ev.text,
    });
  }
  if (ev.type === "job" && !ev.dry) {
    const text = String(ev.text ?? "");
    const c = [...pending].reverse().find((p) => text.includes(String(p._text)));
    if (c) {
      const files = ev.files as string[] | undefined;
      if (files?.length) (c.expect as Record<string, unknown>).files = files;
      const screen = ev.screen as string[] | undefined;
      if (screen?.length) c.screen = screen;
      c.notes = `route ${ev.route}; ${String(ev.summary ?? ev.error ?? "").slice(0, 120)}`;
    }
  }
}
for (const c of pending) {
  delete c._text;
  console.log(JSON.stringify(c));
}
