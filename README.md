# agent-interactive

Say a change to a web page, see it hot-reload, hear one sentence back about what was done.
One Deno file, no dependencies: a dev server with HMR, a gate that decides whether what was
said is a change request, two agent lanes, and a timing record for every instruction.

```sh
./agent-interactive.ts demo                       # type instructions on stdin
./agent-interactive.ts demo --recgo -- --stt-backend realtime   # speak them
curl -X POST 'localhost:5199/__ai/say?wait=1' --data 'make the title dark red'

# dcl.one while the umbrella is in dev mode: edit its working tree, talk while you browse
./agent-interactive.ts ~/dcl-one --attach https://dcl.one \
    --search sites/src,ui3/src --recgo -- --stt-backend realtime
```

Open `http://localhost:5199/` (with `--recgo`, recgo-tab opens it for you). `--help` has every
option; a mistyped one is answered with the nearest real one.

## `--attach`: a page a Vite dev server already serves

With `--attach URL` nothing is served. The loop reads the token from `URL/@vite/client`, opens
the page's own HMR socket (`wss://dcl.one/?token=…`, subprotocol `vite-hmr`) and stamps each
`update`, `full-reload` and build `error` frame onto the running change. A build error is what
gets spoken. DIR is edited in place; when it is an NFS export with `all_squash`, as dcl.one's tree
is, every write lands owned by the export's anonymous user and the Vite on the exporting machine
sees it through inotify. With `--recgo`, recgo-tab attaches to the open tab whose URL matches
(`--match`, the desktop browser's CDP port 9222) instead of launching one.

A real app cannot be inlined into the prompt, so the fast lane runs with grep and read (never
glob or list) and the loop does the first lookup itself, natively under `--search` (see
[What the fast lane is given](#what-the-fast-lane-is-given)).

| on dcl.one's tree, over NFS | cost |
| --- | --- |
| glob inside the gVisor (runsc) sandbox | 93 s for one pattern |
| the same glob natively / inside bubblewrap | 41 ms / 21–24 s |
| grep inside bubblewrap | 14–360 ms |
| "make the Jump In button bigger", flash finding it with grep | 78 s, 30 tool calls |
| the same after a click on it: lookup, then flash | 267 ms lookup, 1.4 s, no tool calls |
| "change the top bar colour", flash finding it with grep | 6.0 s, 7 tool calls |

That table is why the default launcher is `opencode-bwrap`, why glob is off, and why the fast
lane asks for its model per message (`--flash-model`) instead of relying on a wrapper.

## The app

`app/` is a Tauri window (Rust in `app/src-tauri`, plain HTML/JS in `app/web`, no framework and
no npm lockfile) that starts this loop and shows it:

- **Set up a session**: the folder, the page (its dev server's URL, or the folder's own
  `index.html`), where its code is, the fast lane's model, command and key, how many Claude agents
  and their model, voice and spoken replies. *Check setup* runs `agent-interactive doctor --json`
  with exactly those options and lists every check with its fix; *Start session* is enabled once
  nothing fails. Settings live in the app's config dir; a machine can pin values in
  `~/.config/agent-interactive/managed.json`, which override and grey out the field (recgo's
  managed.conf pattern). A key typed into the window goes to the system keychain (Secret Service,
  or the macOS keychain) and reaches the loop as `<PROVIDER>_API_KEY`; nothing is written into
  opencode's own config.
- **The session**: every agent with its state (idle, working for how long, needs you, not started),
  what is waiting and why, and what finished with its result. Selecting a Claude agent shows its
  terminal, drawn by [ghostty-web](https://github.com/coder/ghostty-web) 0.4.0 (Ghostty's VT core as
  WebAssembly) with the font and colours of `~/.config/ghostty/config`; you can type into it. The
  fast lane shows its log. The box at the bottom sends a change (`!` for Claude); Mute, Loop output
  and Stop session sit in the top bar; Ctrl+1..9 pick an agent, Ctrl+K the box.

`agent-interactive-app --start` checks the saved settings and starts the session at once when nothing
fails (a shortcut, or a restart that should not wait for a click).

The webview's origin is `tauri://localhost`, so the loop answers CORS preflights and adds
`Access-Control-Allow-Origin` for the app's origins only.

Installing: anywhere with Nix, from this directory: `nix build .#app` (the window, x86_64-linux
or aarch64-darwin) or `nix build` (the loop alone: `agent-interactive` and `agent-pty`). The lock
pins the nixpkgs revision it is built and tested with.

From a checkout (Linux): `app/prepare.sh` fetches ghostty-web (checked against npm's sha512) and
makes the icons from `app/icon.svg`; then, in a shell with cargo, cargo-tauri, pkg-config,
webkitgtk 4.1, gtk3, libsoup 3 and dbus, run the app with `AGENT_INTERACTIVE_CLI` pointing at
`agent-interactive.ts` and `agent-pty` on PATH (`cd pty && cargo build --release`).

Tested on 2026-09-29 in a headless sway (its sockets in a short `$XDG_RUNTIME_DIR`: the 108-byte
socket path limit rules out a long scratch dir) through `tauri-driver` in front of WebKitGTK's
`WebKitWebDriver`; synthetic pointer and keyboard input never reach a headless WebKitGTK window.
The run: check (fast lane 5.8 s, Claude logged in, folder trusted), start, a typed change on the
fast lane, a `!` change on claude-1 shown live in its terminal (Update style.css, the diff, the
closing sentence), mute, stop. Two bugs it found: a hidden banner took the terminal's grid row, and
rebuilding the agent list every poll lost clicks.

## Claude agents run in terminals

Every large-change agent (`--claude-workers`, default 4) is an interactive `claude` running in its
own pseudo-terminal through `agent-pty` (in `pty/`, a small Rust helper: the terminal's output on
its stdout, typed input and resizes as frames on its stdin). An agent starts with its first change,
or when something opens its terminal. A change is pasted into it (bracketed paste, then Enter),
and its hooks, passed with `--settings`, report back: SessionStart says it is ready,
PreToolUse is what it is doing now, PostToolUse credits each edit to the change, Notification
means it is waiting for you (a permission prompt), Stop hands over the closing sentence. Edit
tools are pre-approved (`--allowedTools Read,Edit,Write,Glob,Grep`); anything else follows your
own Claude settings, and a prompt shows as the agent needing you.

`WS /__ai/term?agent=claude-N` is that terminal: output as binary frames (the last 2 MiB
replayed to each new viewer), typed bytes back, `{"resize": [cols, rows]}` as text. You can type
into any agent; a turn you start is logged, not taken for a change, and the agent gets no change
until it ends. The first time Claude opens a folder it asks whether to trust it, with "No, exit"
preselected: until someone answers in its terminal no session starts, and the loop says the
agent needs you. On 2026-09-29 a test's Enter chose "No, exit".

The tmux layout, the `dashboard` and `watch` commands and the headless stream-json sessions are
gone; the app replaces them. Without it: `GET /__ai/status` (every agent, the queue, recent
results), `GET /__ai/worker?name=AGENT` (an agent's log) and the terminal socket above.

## Muting

Say "mute", "stop listening" or "silencio" (alone, as the whole utterance), use the app's mute
button, type `:mute` in the loop or `POST /__ai/mute`, and narration stops being acted on:
recgo keeps recording, the loop drops what it was holding and logs every line as "muted, not acted
on". "unmute", "start listening" or "escuchá", the button, `:unmute` or `POST /__ai/mute?on=0` bring it
back. On 2026-09-29 side talk in Spanish was held and merged into the next request, and a
question meant for someone else in the room rode into a Claude change.

## What the gate lets through

English and Spanish ("cambiá", "sacá", "poné", "hacé", "arreglá", "más grande", "fijate por qué", "no
carga", "tarda") both count as requests; performance complaints ("takes too long to load",
"improve the performance", "tarda mucho") go to Claude, while speed words about a UI element ("make
the fade faster") stay a small change. Three kinds of utterance are dropped, not held:

- a cancellation, when it is short and on its own ("never mind", "cancel that", "don't change it",
  "dejalo", "olvidate"): it drops what is being held, or cancels the latest change: taken out of
  the queue, aborted on the fast lane, interrupted on Claude (Esc typed into its terminal);
- a remark about the tool itself ("the queue is not getting fixed", "there is an idle agent"): on
  2026-09-29 one went to Claude, which spent 25 minutes on it;
- anything said while muted.

What is said before a request joins it only when it belongs to it: said within 6 s, or cut off
mid-sentence ("rename this to", "and…"); anything else held is dropped and logged as "not part of
the request". On 2026-09-29 a remark to someone in the room and "Thank you." rode into the next
requests 12-19 s later. A line that trails off with no change word ("But…", "that a few of you
have to…") is not a request; "but" is not a change word.

A Claude change that runs longer than three minutes is announced every three minutes ("still
working on number 5, 6 minutes in"), with what it is doing in the loop pane.

## What the fast lane is given

Finding the code is what costs a fast-lane change, not editing it: every grep or read is another
round trip. So before a change is queued the loop gathers, natively and in about half a second:

0. with `--recgo`, the text on screen: the tab's `innerText` (glued words split at a lower-upper
   boundary) is fuzzy-matched against what was said, so a misheard "something soon right now"
   still finds "Something's on right now", and the source is searched for that exact string;
1. up to four files holding what was last clicked (classes, id, `data-testid`, label from recgo's
   `Click:` lines);
2. the files where the instruction's phrases occur, searched in tiers (quotes and three-word
   phrases, then pairs, then long single words) so a weak word never crowds out a strong one.
   Hits on the current page, or where the phrase stands as text in a string or JSX, count as
   likely; hits in comments elsewhere contribute their lines only;
3. the files the change just before edited;
4. only when none of that points anywhere: the current page's own files, up to 32 KB,
   stylesheets first. The page comes from recgo's `Navigate:` lines; its route file is found from
   the app's React Router config (`appDirectory`, flat route names) and followed two imports deep
   through the tsconfig path aliases, keeping component files (`.tsx`, `.jsx`, `.vue`, `.svelte`,
   `.astro`) and stylesheets. Other frameworks have no route detection yet: there the clicks, words
   and screen text do the pointing. `GET /__ai/page?url=…` shows what a URL resolves to.

The prompt carries what they clicked and the current page, not recgo's error lines; those, repeats
collapsed into counts, go to Claude, where diagnosis happens. A navigation that changes only the
query or hash is not a new page; a new page resets the clicks and errors.

While a change runs the loop polls its tool calls. A grep or glob that starts outside `--search`
is stopped and the same session is told, once, to stay inside it; a whole-tree grep on dcl.one's
NFS tree took 16-55 s, which the 20 s budget would otherwise have spent.

A file is sent whole below 24 KB, otherwise as a window of 80 lines around each hit, within 64 KB
in all. More context is not free: a 64 KB prompt of the wrong files turned a 3.5 s change into
10 s, because every round trip re-reads it.

Dry runs on dcl.one (editing switched off, same model; the cases now live in `evals/dcl-one.jsonl`):

| request | matching lines only | with the relevant files |
| --- | --- | --- |
| click on a subhead, "make this text a bit bigger" | 1.35 s, 0 tools | 1.19 s, 0 tools |
| click on a button, "make this button bigger" | 2.30 s, 0 tools | 1.63 s, 0 tools |
| on /discover, "make the event cards have rounder corners" | 6.12 s, 8 tools | 1.31 s, 0 tools |
| "change the headline Own Your Creations to Make It Yours" | 2.22 s, 3 tools | 0.95 s, 0 tools |
| "make the top bar a bit darker" | 3.53 s, 4 tools | 3.40 s, 0 tools |

## Agents and scheduling

The fast lane is one agent. Every change runs in a new opencode session, taken from a spare
that was created and warmed while the previous change ran, so a session never accumulates
context and the switch costs nothing. The last four changes (what was said, the summary, the
files) ride along in its prompt, which is what keeps "no, the other way" working.

The large-change lane is `--claude-workers` agents (default 4), each an interactive Claude in its
own terminal (above). Each change carries a footprint: the files
its hints point at, found before it is queued. A change starts only when no running change in
its lane shares a file with it and none has an unknown footprint. Across the two lanes nothing waits: the fast lane runs beside Claude even on a file Claude has
already edited, and the loop says so ("#5 runs beside #3: claude-2 is also editing
ItemPreview.tsx"). Both edit tools check a file's current text before writing, so neither loses
the other's change; a guessed overlap used to hold fast changes for minutes (2026-09-29: behind a
Claude change in the engine renderer that never opened the file; later a 2-second padding tweak
held 127 s behind a Claude change to the same component). An unknown
footprint counts only against changes on the same page (path, not hash), and a question ("do we
have telemetry on loading times?") has no footprint at all, since it is answered, not applied:
on 2026-09-27 one waited five minutes behind an unrelated change on the same page. HMR frames
and file writes are credited to the change whose footprint or edits hold that path.

A follow-up goes to the agent that has the context. While the last change is waiting, running or
done less than a minute ago, the fast model is asked whether the new words belong to it (0.4-0.9
s, one word, in a throwaway session). If not started yet, they join its text. Otherwise they
become a change that waits for it and then runs in the same agent: the same Claude terminal, or the fast lane's session of the change before, with that request and
its outcome in the prompt. On 2026-09-27 "let's add some sort of dark", "No, no dark, let's make
sure that we can" and "exit without locking the cursor" ran as three changes on two agents, one
undoing another, and two agents built the same satellite toggle in parallel. Joining a change
that is running on Claude means waiting for it, often one or two minutes, so there the model's
APPEND also needs a correction word at the start ("no", "actually", "instead", "but") or a content
word in common with that change: on 2026-09-28 "My items here seem wrongly placed" joined a
popover fix and waited 88 s for it. The same holds for a change still waiting to start, where
generic words ("click", "here", "take", "go", "button") do not count as in common: on 2026-09-29
"clicking here on the center should take us into the game" joined a waiting "clicking here on
Decentraland should take us back to the lobby". Saying a waiting change again (most of its
content words match) is a repeat, not an addition: the loop says what it is waiting for instead of
gluing the same request on twice.

Claude is told to change files only with its Edit and Write tools. On 2026-09-28 the pane made
its edits through heredocs and python patch scripts, so the loop saw no files for 14 of 38
changes; a change with no recorded edits now takes the files named by the HMR update it gets.

## The pipeline

| stage | what does it |
| --- | --- |
| hear | stdin, `POST /__ai/say`, or `--recgo`: recgo-tab records the page and its narration lines (`**user narration**:` on its stderr) become input. Click, navigation and error lines ride along as context. |
| gate | narration only. Keywords by default: a change word, a complaint ("doesn't", "seems off", "missing", "can we") or a request to diagnose passes, approval and chatter are held as context for 30 s. Diagnosis ("figure out why", "error", "loading", "broken", "check that", "not loaded", "correctly downloaded"), a question of five words or more with no change word in it, and anything naming Claude go to the large lane directly. `--gate-url` asks `POST /v1/systemone` one `choice` question (small / large / incomplete / none) over the last 30 s of what was said instead; `incomplete` keeps listening and joins the next line, `none` clears the buffer. A gate failure falls back to keywords for the rest of the run. |
| settle | recgo narration only (`--settle MS`, default 1000). A request is sent once nothing has been heard for 1 s, counting recgo's `hearing:` partials of the next utterance, and up to 5 s longer while it ends mid-sentence ("…so that we can"); whatever was said by then is one request, judged large if any part was. It adds about a second to every spoken change. |
| follow | `--no-follow-up` switches it off. Is the request part of the last change? See [Agents and scheduling](#agents-and-scheduling). |
| route | small changes go to the fast lane (`opencode-bwrap serve`, the model chosen per message with `--flash-model`, Cerebras qwen-3.8-27b). It may answer `ESCALATE:`, or reach nothing within `--flash-budget` seconds (then it is aborted); either way the change moves to the large lane. A leading `!`, a `large` verdict, or narration that names Claude goes straight there. A change whose HMR brings a build error is followed at once by a repair change carrying the error, once. |
| apply | the file watcher attributes each write to the running job and pushes a Vite-shaped frame over `/__hmr`: CSS swaps the stylesheet, HTML replaces head styles and body in place, anything else reloads. recgo-tab classifies these frames as `HMR: vite update /style.css`. |
| confirm | the page acknowledges after two animation frames (painted), or at once when the tab is hidden (applied, not painted). A status pill in the page says what is happening. |
| speak | the agent's closing "I …" sentence (markdown stripped), clipped to 100 characters, is synthesized by speaches (`POST --tts-url/v1/audio/speech`, kokoro, voice `af_heart`, speed 2.0) and played with `pw-play`, one at a time. `--say none` for quiet, `--say CMD` for any other speaker. Synthesis of a 58-character sentence took 0.24–0.65 s. While speaches fails, summaries go to `spd-say` and the failure is logged once. |

Every instruction prints one line and appends to the JSONL log (`--log`, default
`$TMPDIR/agent-interactive-<port>.jsonl`), with milliseconds from heard to gate, write, HMR,
paint, agent done and spoken. `GET /__ai/jobs` returns the last 20.

## Why each lane is shaped the way it is

- **The flash prompt carries the files.** Every project file under 64 KB total is inlined, and
  read/search/shell/question tools are switched off per message, so the model's first action is
  the edit. With them on, it spends two extra round trips on Glob and Read.
- **A fresh flash session per change.** On dcl.one one session grew from 13k to 79k tokens over
  five changes; then a single 55 s grep put 97k tokens into it and the next change failed with
  `ContextOverflowError` ("too large to compact"). `opencode run` per change would pay about 3 s
  of start-up instead; the warm spare pays nothing.
- **Hints from the words, not only the click.** For "drop no landlord, no reset" the click was on
  a layout element while the words lived in a content file. Two- and three-word phrases from the
  instruction are grepped in one `rg` pass and the matching lines go into the prompt, ranked by
  phrase; "Own Your Creations" lands on `landing-stories.ts:160` directly.
- **`question` is switched off.** With it on, qwen answered the warm-up by asking the user a
  question, and a `question` tool call blocks the request until a human answers.
- **The Opus lane is a session, not a prompt.** `claude -p` per change pays process start, a full
  read of the project and a cold prompt cache each time; a session that stays open pays them once.

## Measured (demo page, 2026-09-27)

| path | heard → file written | HMR sent | agent done |
| --- | --- | --- | --- |
| flash, one CSS rule | 545–793 ms | +20 ms | 1.3–1.6 s |
| flash, HTML + CSS | 774 ms | +21 ms | 1.3 s |
| flash, new FAQ section (HTML + CSS) | 1334 ms | +22 ms | 3.0 s |
| flash, "that looks good" | no edit (SKIP) | | 0.75 s |
| Opus session, first change (cold) | 13.6 s | +22 ms | 15.6 s |
| Opus session, next change | 3.0 s | +22 ms | 3.8 s |
| Opus in the tmux pane, next change | 2.0 s | +22 ms | 3.1 s |
| flash with the tmux panes attached | 662 ms | +21 ms | 1.3 s |
| `claude -p` per change (the lane before it was a session) | 21.1 s | | 23.2 s |

The 20 ms after the write is the watcher's debounce. The page applied each update within
4–20 ms of the frame; recgo-tab's headless tab reports itself hidden, so those runs have no
paint time. A spoken instruction adds recgo's end-of-utterance wait before "heard": 900 ms of
silence on its realtime lane (`RECGO_REALTIME_SILENCE_MS`), about 3 s on its chunked lane.

## Trajectories and evals

Every run writes a trajectory: `<recgo sessions_dir>/agent-interactive/<start>-<port>.jsonl`
(`--trajectories DIR`, `none` to switch it off), owner-only like recgo's own sessions. It is one
JSON event per line: `start` (page, tree, models, git HEAD), each `recgo` line the loop acted on,
each `gate` verdict with the lines it held, and each `job` with its inputs (page, clicks, the
screen text it matched, the hint files and why, the exact prompt), the agent's tool calls, the
exact edits (old and new text), the result and every timing. The loop keeps its own record because
recgo's session document is written at stop and can be missing: on 2026-09-27 two dcl.one
sessions ended with no `SESSION.md`, their final transcription having failed against a 503.

`POST /__ai/replay` runs one case through the same gate and fast lane as live speech:
`{"context": [recgo lines], "screen": [visible text], "said": [utterances]}`, dry (the fast lane
says what it would change, nothing is written) or with `?gate=1` the gate alone.

`scripts/eval.ts CASES.jsonl… --port N [--gate-only] [--out FILE] [--baseline FILE]` replays case
files through a running loop (start it with `--say none --claude-cmd none`) and scores:
- request: did the gate take it as a change (or correctly let it pass);
- lane: small vs large vs none, exactly;
- target: is the file the fast lane names one of the expected files;
- time, tool calls and prompt size.
`--baseline` compares with an earlier `--out` and lists what got better, worse and slower. Cases
whose `attach` differs from the loop's page are skipped, so one command covers several sites.

| suite | what it holds | 2026-09-27 baseline |
| --- | --- | --- |
| `evals/gate.jsonl` | every line spoken in the day's sessions, reworded, labelled none / small / large, plus Spanish phrasings | request 64/65, lane 61/65 (2026-09-29; the same verdict on every case reworded, 2026-10-01) |
| `evals/follow.jsonl` | a request and what was said next, reworded, labelled append / new; `"running": "claude"` when the change before was on Claude | follow 23/24 (2026-09-28), 22/24 (2026-09-29); 26 pairs on 2026-10-01, five runs each: 24.6 reworded, 25.4 as said, 0.4-0.9 s |
| `evals/dcl-one.jsonl` | clicks, page-only, words, vague and misheard requests on dcl.one | target 6/6, median 1.5 s (2026-09-29; 2.5 s on 2026-09-27) |
| `evals/claude.jsonl` | large changes recorded on dcl.one (reworded since the run), replayed through the Claude lane on a shared clone at the recorded rev (`scripts/claude-eval.ts --effort ...`) | 2026-09-30, 4/4 landed at every level; total 999 s at Claude Code's default, 538 s at medium, 622 s at high |
| `evals/sites.jsonl` | decentraland/sites on a local Vite server | target 1/2, median 9.4 s |

The baselines are in `evals/results/`; up to 2026-09-30 they scored the words as said. The suites
are published, so each recorded line is reworded, keeping the words the case turns on (change
words, a mishearing, a trailing "and…") and not the transcript. Targeting cases name text in a live
tree, so an edit that removes that text makes a case stale; gate cases depend on words only and do
not age.

New cases come from use: `scripts/cases-from-trajectory.ts TRAJECTORY.jsonl > draft.jsonl` turns
each gate verdict of a run into a case (the page and clicks recgo had seen, the held lines, the
screen text, and as the expectation what happened), marked `"reviewed": false`. Correct the
expectation where the loop got it wrong, reword what was said, and append it to a suite.

## Open

- A CDP preview (inject the CSS into the tab at once, persist the file in parallel) would put
  the change on screen tens of milliseconds after the model's edit instead of after the file
  round trip.
- recgo's realtime partials only hold a settling request back; dispatching on a partial the
  gate calls complete would start the edit before the end-of-utterance wait.
- The gate question needs labelled narration and a Laya fine-tune
  (`POST /v1/fine_tuning/jobs`) before `--gate-url` is more than plumbing. Asked the follow-up
  question on the 12 pairs of `evals/follow.jsonl` (2026-09-27), Laya answered "new" to
  all of them as a choice, and as a yes/no gave true follow-ups 0.10-0.90 and new requests up to
  0.33, under every wording tried; the fast model got 11-12 of 12. `evals/follow.jsonl` is the
  labelled set a fine-tune would start from.
- recgo-tab takes screenshots around clicks only; a shot after each `HMR: update` would let a
  reviewing agent see the result without asking.
