// The agent widget: the dot, the pill, the stack of changes, a request's ghost terminal, the
// history card, the review window and the pull request flow. Served by agent-interactive after
// its page client, which leaves a bridge at window.__ai (tell, on, startMic, stopMic, micOn).
// Design: "Agent Widget · Flow v1" (Decentraland Explorer design system), frames A1, B1-B5, C1-C4.
(function (cfg) {
  if (!window.__ai) return;
  var ai = window.__ai;
  var T = {
    shadow: "#161518", pale: "#43404A", cloudy: "#716B7C", silver: "#A09BA8", gray: "#CFCDD4", white: "#FCFCFC",
    ruby: "#FF2D55", rubyLight: "#FF859C", coral: "#FF7439", coralLight: "#FF9A6E", yellow: "#FFBC5B", green: "#30CD00", purple: "#DF9CFF",
  };
  var S = {
    dot: "off",          // off | ready | listening | working | needs
    open: false,
    view: "list",        // first | status | list | request | review | compose | sending | opened | models
    current: null,
    hover: false,
    hearing: "",
    held: null,          // { text, at }: the last words the loop heard but did not take as a request
    changes: [],
    details: {},
    me: null,            // { address, name, token, forge: { login, name, avatar } | null }
    identity: null,      // the Decentraland identity found in the page's storage
    pr: null,            // { id, lines: [], state, url, number, branch, count, files }
    selected: {},
    firstOpen: !localStorage.getItem("ai-widget-seen"),
    models: null,
    sys: null,
    sysAt: 0,
    editing: null,       // { id, mode: "edit" | "clarify", text }
  };
  var host = document.createElement("ai-widget");
  host.style.cssText = "position:fixed;right:0;bottom:0;z-index:2147483647;font-family:'Inter UI',Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
  var root = host.attachShadow({ mode: "closed" });
  var style = document.createElement("style");
  var MONO = "ui-monospace,'SF Mono',Menlo,monospace";
  style.textContent = [
    ":host{all:initial}",
    "*{box-sizing:border-box;margin:0;padding:0}",
    "a{color:inherit;text-decoration:none}",
    "button{font:inherit;color:inherit;border:0;background:none;cursor:pointer}",
    "@keyframes wave{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}",
    "@keyframes ring{0%{transform:scale(1);opacity:.8}100%{transform:scale(2.4);opacity:0}}",
    "@keyframes blink{50%{opacity:0}}",
    "@keyframes spin{to{transform:rotate(360deg)}}",
    // B1 · the dot; B2 · the pill it stretches into
    ".dot{position:fixed;right:16px;bottom:16px;height:40px;width:40px;border-radius:9999px;background:rgba(22,21,24,.94);display:flex;align-items:center;justify-content:center;gap:10px;",
    "  box-shadow:0 8px 24px rgba(0,0,0,.35),inset 0 0 0 1px rgba(255,255,255,.12);color:" + T.white + ";cursor:pointer;transition:width .18s ease,padding .18s ease;overflow:hidden;white-space:nowrap}",
    ".dot .c{width:14px;height:14px;border-radius:50%;background:var(--c," + T.silver + ");box-shadow:0 0 10px var(--c," + T.silver + ");flex:none;position:relative}",
    ".dot.off{--c:" + T.silver + "}.dot.ready{--c:" + T.silver + "}.dot.listening{--c:" + T.green + "}.dot.working{--c:" + T.coral + "}.dot.needs{--c:" + T.ruby + "}",
    ".dot.working .c::after,.dot.needs .c::after{content:'';position:absolute;inset:0;border-radius:50%;border:2px solid var(--c);animation:ring 1.8s ease-out infinite}",
    ".dot.pill{width:auto;min-width:200px;max-width:min(340px,80vw);padding:0 6px 0 14px;justify-content:flex-start}",
    ".dot.pill .c{display:none}",
    ".wave{display:flex;align-items:center;gap:2px;height:14px;flex:none}.wave i{display:block;width:2px;height:14px;border-radius:1px;background:" + T.green + ";animation:wave 1s ease-in-out infinite;transform-origin:center}",
    ".wave i:nth-child(2){animation-delay:.2s}.wave i:nth-child(3){animation-delay:.4s}.wave i:nth-child(4){animation-delay:.1s}",
    ".wave.off i{animation:none;transform:scaleY(.35);background:" + T.silver + "}",
    ".dot .words{flex:1;min-width:0;font:400 12px/1 inherit;color:" + T.gray + ";white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".cnt{display:flex;align-items:center;gap:6px;padding:6px 10px 6px 8px;border-radius:9999px;background:rgba(255,116,57,.18);color:" + T.coralLight + ";font:700 12px/1 inherit;flex:none}.cnt i{width:10px;height:10px;border-radius:50%;background:" + T.coral + "}",
    // the stage above the dot
    ".stage{position:fixed;right:16px;bottom:68px;display:flex;flex-direction:column;align-items:flex-end;gap:7px;color:" + T.white + ";font-size:12px;line-height:1.3}",
    // A1 / B5 · a card
    ".card{width:320px;max-width:calc(100vw - 32px);border-radius:16px;background:" + T.shadow + ";box-shadow:0 24px 64px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.08);padding:14px 16px 16px;display:flex;flex-direction:column;gap:12px;max-height:min(72vh,640px)}",
    ".card .scroll{overflow:auto;display:flex;flex-direction:column;gap:12px;min-height:0}",
    ".top{display:flex;align-items:center;gap:8px}",
    ".chip{flex:1;display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.05);cursor:pointer;min-width:0}.chip:hover{background:rgba(255,255,255,.09)}",
    ".chip .k{font:600 12px/1 inherit}.chip .v{flex:1;font:400 11px/1 inherit;color:" + T.silver + ";white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.chip .ar{font:600 14px/1 inherit;color:" + T.silver + "}",
    ".dots{display:flex;gap:4px}.dots i{width:6px;height:6px;border-radius:50%;background:" + T.cloudy + "}.dots i.on{background:" + T.green + "}",
    ".x{font:600 16px/1 inherit;color:" + T.silver + ";padding:4px 2px;cursor:pointer}.x:hover{color:" + T.white + "}",
    ".hd{display:flex;align-items:center;gap:8px;min-width:0}.hd .t{flex:1;font:600 14px/1.2 inherit;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.back{font:600 16px/1 inherit;color:" + T.silver + ";cursor:pointer;padding:2px 4px 2px 0}",
    ".listen{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;background:rgba(48,205,0,.08);font:600 12px/1.3 inherit;color:" + T.gray + "}.listen.off{background:rgba(255,255,255,.05)}.listen .m{flex:1}.listen{flex-wrap:wrap}.listen .held{flex-basis:100%;display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:6px;padding-top:8px;border-top:1px solid rgba(255,255,255,.08)}.listen .held .m{font-weight:500}",
    ".mic{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:9999px;background:rgba(255,255,255,.12);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18),0 2px 6px rgba(0,0,0,.3);color:" + T.white + ";font:600 12px/1 inherit;flex:none;cursor:pointer;transition:background .12s}",
    ".mic:hover{background:rgba(255,255,255,.2)}.mic:active{transform:translateY(1px)}.mic.go{background:rgba(48,205,0,.22);box-shadow:inset 0 0 0 1px rgba(48,205,0,.5),0 2px 6px rgba(0,0,0,.3)}.mic.go svg{color:" + T.green + "}.mic.go:hover{background:rgba(48,205,0,.32)}",
    ".mic svg{width:12px;height:12px}.mic.in{padding:5px 10px;margin:-2px -8px -2px 0;font-size:11px}.mic.in svg{width:11px;height:11px}",
    ".srow{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.05)}.srow .k{font:600 12px/1 inherit;width:84px;flex:none}.srow .v{flex:1;font:400 11px/1.3 inherit;color:" + T.silver + ";min-width:0;overflow:hidden;text-overflow:ellipsis}.srow i.d{width:6px;height:6px;border-radius:50%;background:" + T.cloudy + ";flex:none}.srow i.d.on{background:" + T.green + "}",
    ".lnk{font:600 11px/1 inherit;color:" + T.rubyLight + ";cursor:pointer;white-space:nowrap}.lnk:hover{color:" + T.white + "}",
    ".muted{font:400 11px/1.4 inherit;color:" + T.silver + "}",
    // B3 · the stack of pills
    ".pl{display:flex;align-items:center;gap:8px;padding:5px 12px 5px 5px;border-radius:9999px;background:rgba(22,21,24,.72);color:" + T.gray + ";font:600 12px/1 inherit;cursor:pointer;max-width:min(360px,calc(100vw - 32px));white-space:nowrap}",
    ".pl:hover{background:rgba(22,21,24,.9)}.pl .tt{overflow:hidden;text-overflow:ellipsis}.pl .age{color:" + T.cloudy + ";font-weight:400;flex:none}",
    ".pl.run{background:rgba(22,21,24,.94);color:" + T.white + ";box-shadow:0 8px 20px rgba(0,0,0,.25)}.pl.run .age{color:" + T.silver + "}",
    ".pl .ic{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none;font:700 12px/1 inherit}",
    ".ic.ok{background:rgba(48,205,0,.16);color:" + T.green + "}.ic.bad{background:rgba(255,45,85,.2);color:" + T.rubyLight + "}.ic.fast{background:rgba(255,188,91,.18);color:" + T.yellow + "}.ic.smart{background:rgba(198,64,205,.24);color:" + T.purple + "}.ic.dim{background:rgba(255,255,255,.08);color:" + T.silver + "}",
    ".ic svg{width:12px;height:12px}.ic.ok svg{width:11px;height:11px}",
    ".pl.review{padding:7px 12px;background:" + T.ruby + ";color:#fff;font-weight:700;box-shadow:0 0 24px rgba(255,45,85,.45);gap:6px}.pl.review:hover{background:#ff4268}.pl.review svg{width:12px;height:12px}.pl.review.no{opacity:.45;cursor:default;box-shadow:none}",
    ".pl.small{padding:5px 10px;background:rgba(22,21,24,.7);font:600 11px/1 inherit}.pl.chipish{padding:6px 14px 6px 12px;background:rgba(22,21,24,.94);box-shadow:0 8px 20px rgba(0,0,0,.25);color:" + T.white + ";gap:6px}.pl.chipish .age{color:" + T.silver + "}",
    ".row2{display:flex;gap:7px;align-items:center}",
    ".ask{width:320px;max-width:calc(100vw - 32px);height:40px;border-radius:9999px;background:rgba(22,21,24,.94);box-shadow:0 8px 20px rgba(0,0,0,.25),inset 0 0 0 1px rgba(255,255,255,.12);color:" + T.white + ";font:400 13px/1 inherit;padding:0 16px;border:0;outline:0}",
    ".ask::placeholder{color:" + T.silver + "}.ask:focus{box-shadow:0 8px 20px rgba(0,0,0,.25),inset 0 0 0 2px " + T.ruby + "}.ask.busy{opacity:.6}",
    ".card .ask{width:100%;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}",
    ".sep{height:1px;width:120px;background:rgba(160,155,168,.35);margin:3px 0}",
    // B4 / C3 · the ghost terminal
    ".ghost{width:320px;max-width:calc(100vw - 32px);max-height:min(70vh,560px);border-radius:16px;background:rgba(67,64,74,.78);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 24px 64px rgba(0,0,0,.35);color:" + T.white + ";display:flex;flex-direction:column;overflow:hidden}",
    ".ghost .ghd{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.1)}.ghost .ghd .t{flex:1;font:600 13px/1.2 inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".stop{font:600 11px/1 inherit;color:" + T.rubyLight + ";cursor:pointer}.stop:hover{color:" + T.white + "}",
    ".term{flex:1;min-height:0;overflow:auto;padding:12px 14px;font:400 11px/1.65 " + MONO + ";color:" + T.gray + ";display:flex;flex-direction:column;white-space:pre-wrap;word-break:break-word}",
    ".term .meta{color:" + T.cloudy + "}.term .p{color:" + T.yellow + "}.term .b{color:" + T.green + ";font-weight:700}.term .b.bad{color:" + T.rubyLight + "}.term .b.warn{color:" + T.yellow + "}.term .tool{color:" + T.white + ";font-weight:600}.term .arg{color:" + T.silver + "}",
    ".term .dl{padding-left:14px}.term .cur{color:" + T.purple + "}.term .cur::after{content:'';display:inline-block;width:6px;height:11px;background:" + T.purple + ";vertical-align:-1px;margin-left:3px;animation:blink 1s steps(1) infinite}",
    ".gft{padding:10px 14px;border-top:1px solid rgba(255,255,255,.1);font:400 11px/1.4 inherit;color:" + T.silver + "}.gft b{color:" + T.white + ";font-weight:400}",
    ".plus{color:" + T.green + "}.minus{color:" + T.rubyLight + "}.ok{color:" + T.green + "}.bad{color:" + T.rubyLight + "}",
    // B5 · the history card
    ".badge{display:inline-flex;align-items:center;padding:3px 7px;border-radius:9999px;font:700 9px/1 inherit;letter-spacing:.04em;flex:none;background:rgba(255,255,255,.1);color:" + T.gray + "}",
    ".badge.done{background:rgba(48,205,0,.16);color:" + T.green + "}.badge.smart{background:rgba(198,64,205,.22);color:" + T.purple + "}.badge.fast{background:rgba(255,188,91,.18);color:" + T.yellow + "}.badge.fail{background:rgba(255,45,85,.2);color:" + T.rubyLight + "}",
    ".lab{font:700 10px/1 inherit;letter-spacing:.04em;color:" + T.cloudy + "}.sect{display:flex;flex-direction:column;gap:6px}",
    ".said{padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.06);font:400 12px/1.45 inherit;color:" + T.silver + "}.said b{color:" + T.white + ";font-weight:400;background:rgba(255,188,91,.18);border-radius:3px;padding:0 2px}",
    ".tl{display:grid;grid-template-columns:52px 14px 1fr;column-gap:8px;row-gap:9px;align-items:center;font:400 12px/1.2 inherit}.tl .ts{font:400 10px/1 " + MONO + ";color:" + T.cloudy + "}.tl i{width:8px;height:8px;border-radius:50%;background:" + T.cloudy + ";justify-self:center}.tl i.y{background:" + T.yellow + "}.tl i.g{background:" + T.green + "}.tl i.r{background:" + T.ruby + "}.tl i.p{background:#C640CD}.tl span.w{color:" + T.gray + "}",
    ".btns{display:flex;gap:8px}.b{flex:1;padding:11px 10px;border-radius:12px;background:rgba(255,255,255,.1);font:600 13px/1 inherit;color:" + T.white + ";text-align:center;cursor:pointer;white-space:nowrap}.b:hover{background:rgba(255,255,255,.16)}",
    ".b.primary{background:" + T.ruby + ";font-weight:700;color:#fff}.b.primary:hover{background:#ff4268}.b.outline{background:transparent;box-shadow:inset 0 0 0 1px rgba(255,45,85,.5);color:" + T.rubyLight + "}.b.outline:hover{background:rgba(255,45,85,.1)}.b:disabled,.b.no{opacity:.4;cursor:default}",
    ".diff{font:11px/1.5 " + MONO + ";white-space:pre;overflow:auto;min-width:0;max-width:100%;padding:8px 10px;border-radius:10px;background:rgba(0,0,0,.35);color:" + T.gray + "}.diff .a{color:" + T.green + "}.diff .r{color:" + T.rubyLight + "}.diff .h{color:" + T.cloudy + "}.diff .f{color:" + T.white + ";font-weight:700;margin-top:8px}",
    ".logt{font:400 11px/1.65 " + MONO + ";color:" + T.gray + ";min-width:0;max-width:100%;padding:8px 10px;border-radius:10px;background:rgba(0,0,0,.35);white-space:pre-wrap;word-break:break-word}",
    // C1 / C2 · maximized
    ".max{position:fixed;inset:20px;border-radius:24px;background:" + T.shadow + ";box-shadow:0 24px 64px rgba(0,0,0,.55);color:" + T.white + ";display:flex;flex-direction:column;overflow:hidden;font-size:13px;line-height:1.4}",
    ".mhd{display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.08);flex:none}.mhd .t{font:600 18px/1 inherit}.mhd .c{width:12px;height:12px;border-radius:50%;background:" + T.coral + "}.mhd .sp{flex:1}",
    ".tag{padding:6px 10px;border-radius:8px;background:rgba(255,255,255,.08);font:600 12px/1 inherit;color:" + T.gray + "}",
    ".cols{flex:1;display:grid;grid-template-columns:minmax(260px,380px) 1fr;min-height:0}.lcol{border-right:1px solid rgba(255,255,255,.08);padding:14px 12px;display:flex;flex-direction:column;gap:4px;overflow:auto}.rcol{overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:12px}",
    ".lhd{display:flex;justify-content:space-between;padding:4px 8px 8px;font:700 10px/1 inherit;letter-spacing:.04em;color:" + T.cloudy + "}.lhd .lnk{color:" + T.rubyLight + "}",
    ".ritem{display:flex;align-items:center;gap:10px;padding:10px 8px;border-radius:12px;cursor:pointer}.ritem:hover,.ritem.cur{background:rgba(255,255,255,.08)}.ritem .tt{flex:1;display:flex;flex-direction:column;gap:5px;min-width:0}.ritem .tt .n{font:600 13px/1.2 inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ritem .tt .s{font:400 11px/1 inherit;color:" + T.silver + "}",
    ".cb{width:16px;height:16px;border-radius:5px;background:rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center;flex:none;cursor:pointer}.cb.on{background:" + T.ruby + "}.cb.no{opacity:.3;cursor:default}.cb svg{width:10px;height:10px}",
    ".mft{display:flex;align-items:center;gap:14px;padding:14px 20px;border-top:1px solid rgba(255,255,255,.08);flex:none;font:400 12px/1 inherit;color:" + T.silver + "}.mft .sp{flex:1}.mft .b{flex:none;padding:12px 18px;font-size:14px}",
    ".field{display:flex;flex-direction:column;gap:6px}.field .lab{color:" + T.gray + "}.field input,.field textarea{width:100%;font:600 14px/1.2 inherit;color:" + T.white + ";background:rgba(22,21,24,.5);border:0;border-radius:8px;padding:11px 12px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);outline:0}",
    ".field input:focus,.field textarea:focus{box-shadow:inset 0 0 0 2px " + T.ruby + "}.field textarea{font:400 13px/1.55 inherit;color:" + T.gray + ";min-height:170px;resize:vertical}",
    ".sw{display:inline-flex;align-items:center;gap:8px;font:600 13px/1 inherit;cursor:pointer}.sw i{width:32px;height:18px;border-radius:9px;background:" + T.pale + ";position:relative}.sw i::after{content:'';position:absolute;top:3px;left:3px;width:12px;height:12px;border-radius:50%;background:#fff;transition:left .15s}.sw.on i{background:" + T.ruby + "}.sw.on i::after{left:17px}",
    ".form{flex:1;overflow:auto;padding:20px;display:flex;flex-direction:column;gap:16px;max-width:720px;width:100%;margin:0 auto}",
    // C4 · opened
    ".scrim{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:20px}",
    ".big{width:100%;max-width:460px;border-radius:24px;background:" + T.shadow + ";box-shadow:0 24px 64px rgba(0,0,0,.55);color:" + T.white + ";display:flex;flex-direction:column;align-items:center;gap:18px;padding:32px;text-align:center}",
    ".big .ico{width:56px;height:56px;border-radius:50%;background:rgba(48,205,0,.16);display:flex;align-items:center;justify-content:center}.big .ico svg{width:26px;height:26px}",
    ".big h2{font:600 24px/1.1 inherit}.big .sub{font:400 14px/1.4 inherit;color:" + T.silver + "}",
    ".kvs{width:100%;border-radius:12px;background:rgba(255,255,255,.05);text-align:left}.kv{display:flex;justify-content:space-between;gap:12px;padding:12px 14px;font:400 13px/1 inherit;color:" + T.silver + "}.kv+.kv{border-top:1px solid rgba(255,255,255,.08)}.kv .v{color:" + T.gray + ";overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kv .v.mono{font-family:" + MONO + "}",
    ".spin{display:inline-block;width:11px;height:11px;border:2px solid rgba(255,255,255,.25);border-top-color:" + T.coral + ";border-radius:50%;animation:spin .9s linear infinite}",
    "@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}",
    ".live{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:9999px;background:rgba(255,45,85,.18);color:" + T.rubyLight + ";font:700 10px/1 inherit;letter-spacing:.04em}.live i{width:7px;height:7px;border-radius:50%;background:" + T.ruby + ";animation:pulse 1s ease-in-out infinite}.live.warn{background:rgba(255,188,91,.18);color:" + T.yellow + "}.live.warn i{background:" + T.yellow + "}",
    ".ed{width:100%;font:400 13px/1.5 inherit;color:" + T.white + ";background:rgba(255,255,255,.06);border:0;border-radius:10px;padding:10px 12px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);outline:0;min-height:72px;resize:vertical}.ed:focus{box-shadow:inset 0 0 0 2px " + T.ruby + "}",
    ".acts{display:flex;flex-wrap:wrap;gap:6px}.acts .b{flex:none;padding:8px 10px;font-size:12px}.b.danger{background:transparent;box-shadow:inset 0 0 0 1px rgba(255,45,85,.5);color:" + T.rubyLight + "}.b.danger:hover{background:rgba(255,45,85,.12)}",
    ".logl{display:flex;flex-direction:column;gap:3px}.logl .ln{display:grid;grid-template-columns:52px 1fr;gap:8px;font:400 11px/1.5 " + MONO + ";color:" + T.gray + "}.logl .ln .ts{color:" + T.cloudy + "}",
    ".num{width:64px;font:600 13px/1 inherit;color:" + T.white + ";background:rgba(22,21,24,.5);border:0;border-radius:8px;padding:8px 10px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);outline:0}",
  ].join("\n");
  root.appendChild(style);
  var ui = document.createElement("div");
  root.appendChild(ui);
  document.documentElement.appendChild(host);
  // keys typed into the widget stay in the widget: composed key events would otherwise reach the
  // document, where the explorer moves the player on space and binds the rest of the keyboard
  ["keydown", "keypress", "keyup", "beforeinput", "input"].forEach(function (type) {
    host.addEventListener(type, function (e) {
      if (root.activeElement) { e.stopPropagation(); e.stopImmediatePropagation(); }
    });
  });

  // ---------------------------------------------------------------- helpers
  var h = function (tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "class") el.className = attrs[k];
      else if (k === "text") el.textContent = attrs[k];
      else if (k === "html") el.innerHTML = attrs[k];
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), attrs[k]);
      else if (k === "style") el.style.cssText = attrs[k];
      else if (attrs[k] === false || attrs[k] == null) continue;
      else if (attrs[k] === true) el.setAttribute(k, "");
      else el.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  };
  var esc = function (s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); };
  var I = {
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/></svg>',
    micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/><path d="M3 3l18 18"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    checkW: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.94 15.5a2 2 0 0 0-1.44-1.44l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0l1.58 6.14a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96l-6.14 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/></svg>',
    expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>',
    shrink: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></svg>',
    pr: '<svg viewBox="0 0 24 24" fill="none" stroke="#30CD00" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M6 9v12"/></svg>',
  };
  var svg = function (name, cls) { return h("span", { class: cls || "", html: I[name], style: "display:inline-flex;align-items:center" }); };
  var wave = function (on) { return h("span", { class: "wave" + (on ? "" : " off") }, [h("i"), h("i"), h("i"), h("i")]); };
  var api = function (path, opts) {
    opts = opts || {};
    var headers = { "content-type": "application/json" };
    if (S.me && S.me.token) headers["x-ai-token"] = S.me.token;
    if (opts.raw != null) headers["content-type"] = "text/plain";
    return fetch(path, { method: opts.method || "GET", headers: headers, body: opts.raw != null ? opts.raw : opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ("HTTP " + r.status)); return j; }); });
  };
  var age = function (iso) {
    var s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
    if (s < 60) return s + "s"; if (s < 3600) return Math.round(s / 60) + "m"; if (s < 86400) return Math.round(s / 3600) + "h";
    return Math.round(s / 86400) + "d";
  };
  var elapsed = function (iso) {
    var s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
    return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
  };
  var clock = function (iso) { var d = new Date(iso); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) + ":" + ("0" + d.getSeconds()).slice(-2); };
  var running = function () { return S.changes.filter(function (c) { return c.status === "running"; }); };
  var title = function (c) { var t = (c.summaryTitle || c.text || "").replace(/\s+/g, " ").trim(); t = t.charAt(0).toUpperCase() + t.slice(1); return t.length > 64 ? t.slice(0, 61) + "…" : t; };
  var counts = function (c) {
    return c.plus || c.minus ? h("span", {}, [h("span", { class: "plus", text: "+" + (c.plus || 0) }), " ", h("span", { class: "minus", text: "−" + (c.minus || 0) })]) : null;
  };
  var lane = function (c) { return c.route === "claude" || c.route === "codex" ? "SMART" : "FAST"; };
  var mine = function (c) { return !!(S.me && c.who && c.who.address === S.me.address); };
  var whoName = function (w) { return w && w.name ? w.name : "someone"; };
  var forgeHost = function () { return cfg.forge ? cfg.forge.replace(/^https?:\/\//, "") : "the forge"; };
  var icon = function (c) {
    if (c.status === "running") return h("span", { class: "ic " + (lane(c) === "SMART" ? "smart" : "fast"), html: lane(c) === "SMART" ? I.spark : I.bolt });
    if (c.status === "failed") return h("span", { class: "ic bad", text: "!" });
    if (c.status === "cancelled" || c.status === "no-change") return h("span", { class: "ic dim", text: c.status === "cancelled" ? "–" : "·" });
    return h("span", { class: "ic ok", html: I.check });
  };
  var setDot = function () {
    var r = running().length;
    var needs = S.changes.some(function (c) { return c.status === "failed" && Date.now() - Date.parse(c.heard) < 10 * 60000; }) || (S.pr && S.pr.state === "failed");
    S.dot = (r || (S.pr && S.pr.state === "running")) ? "working" : needs ? "needs" : ai.micOn() ? "listening" : S.me ? "ready" : "off";
    render();
  };

  // --------------------------------------------------------- B1 / B2 · dot
  function glance() {
    if (Date.now() - S.sysAt < 2000) return;
    S.sysAt = Date.now();
    api("/__ai/status").then(function (st) { S.sys = st; paintDot(); }, function () {});
  }
  var dotEl = h("div", { class: "dot off",
    onmouseenter: function () { S.hover = true; glance(); paintDot(); },
    onmouseleave: function () { S.hover = false; paintDot(); },
    onclick: function () { S.open = !S.open; if (S.open) { S.view = S.firstOpen ? "first" : "list"; refresh(); } render(); },
  });
  ui.appendChild(dotEl);
  var stageEl = h("div");
  ui.appendChild(stageEl);
  function paintDot() {
    var r = running().length;
    var pill = (S.hover || S.hearing) && !S.open;
    dotEl.className = "dot " + S.dot + (pill ? " pill" : "");
    dotEl.title = { off: "Signed out", ready: "Ready · mic off", listening: "Listening", working: "Working", needs: "Needs you" }[S.dot];
    dotEl.textContent = "";
    dotEl.appendChild(h("span", { class: "c" }));
    if (!pill) return;
    // a first glance at the system: the live words, who is working on what, the microphone
    dotEl.appendChild(wave(ai.micOn()));
    var parts = [];
    if (S.hearing) parts.push("“" + S.hearing + "”");
    else {
      var st = S.sys;
      if (st && st.workers) {
        var busy = st.workers.filter(function (w) { return w.job; });
        busy.forEach(function (w) { parts.push(w.name + " · R-" + w.job.id + (w.activity ? " " + w.activity : "")); });
        if (!busy.length) parts.push(S.me ? "agents idle" : "signed out");
        if (st.queued && st.queued.length) parts.push(st.queued.length + " queued");
      } else parts.push(!S.me ? "signed out" : r ? r + " running" : "agents idle");
      if (cfg.mic) parts.push(ai.micOn() ? "listening" : "mic off");
    }
    dotEl.appendChild(h("span", { class: "words", text: parts.join(" · ") }));
    if (r) dotEl.appendChild(h("span", { class: "cnt" }, [h("i"), String(r)]));
  }
  function render() {
    // an open editor is left alone: a status push must not re-mount the textarea under the person's fingers
    if (S.editing && S.open && S.view === "request" && stageEl.querySelector("textarea.ed")) { paintDot(); return; }
    // the input is one stable element; a render that re-mounts it keeps the person's focus and caret
    var keep = typing() ? { start: askEl.selectionStart, end: askEl.selectionEnd } : null;
    paintDot();
    stageEl.textContent = "";
    if (S.open) {
      var views = { first: viewFirst, status: viewStatus, list: viewList, request: viewRequest, review: viewReview, compose: viewCompose, sending: viewSending, opened: viewOpened, models: viewModels };
      stageEl.appendChild((views[S.view] || viewList)());
    }
    if (keep && askEl.isConnected && root.activeElement !== askEl) {
      askEl.focus();
      try { askEl.setSelectionRange(keep.start, keep.end); } catch (e) {}
    }
  }
  function stage(kids) { return h("div", { class: "stage" }, kids); }
  // typed requests: the same route as the spoken ones, in the person's name
  var askEl = h("input", { class: "ask", placeholder: "Type a change and press Enter", title: "or say it, with the microphone on", onkeydown: function (e) {
    if (e.key !== "Enter" || e.isComposing) return;
    var text = askEl.value.trim();
    if (!text || askEl.classList.contains("busy")) return;
    askEl.classList.add("busy");
    api("/__ai/say?source=widget", { method: "POST", raw: text }).then(function () { askEl.value = ""; askEl.classList.remove("busy"); S.hearing = ""; refresh(); }, function (x) { askEl.classList.remove("busy"); toast(x); });
  } });
  var typing = function () { return root.activeElement === askEl; };
  function card(kids) { return stage([h("div", { class: "card" }, kids)]); }
  function close() { S.open = false; seen(); render(); }
  function seen() { if (S.firstOpen) { S.firstOpen = false; try { localStorage.setItem("ai-widget-seen", "1"); } catch (e) {} } }
  function goList() { seen(); S.view = "list"; refresh(); render(); }
  function micButton() {
    if (!cfg.mic) return null;
    var on = ai.micOn();
    return h("button", { class: "mic" + (on ? "" : " go"), html: (on ? I.mic : I.micOff) + "<span>" + (on ? "Mute" : "Listen") + "</span>", title: on ? "stop listening" : "start listening", onclick: toggleMic });
  }
  function toggleMic() {
    if (ai.micOn()) { ai.stopMic("stopped by you"); setDot(); return; }
    ai.startMic().then(setDot, function (e) { toast("microphone: " + e.message); });
  }
  function liveChip() {
    if (!ai.micOn() || !ai.micState) return null;
    var g = ai.micState().guard || {};
    var warn = g.state === "warning";
    return h("span", { class: "live" + (warn ? " warn" : ""), title: warn ? g.why : "the microphone stops by itself after " + ai.micSettings().silenceSec + " s of silence" }, [h("i"), warn ? Math.ceil((g.remainingMs || 0) / 1000) + "s" : "LIVE " + elapsed(new Date(ai.micState().since).toISOString())]);
  }
  function statusChip() {
    return h("div", { class: "chip", title: "Decentraland, Forgejo, the agents, the models", onclick: function () { S.view = "status"; glance(); render(); } }, [
      h("span", { class: "k", text: "Status" }),
      h("span", { class: "dots" }, [h("i", { class: S.me ? "on" : "" }), cfg.forge ? h("i", { class: S.me && S.me.forge ? "on" : "" }) : null]),
      h("span", { class: "v", text: S.me ? "Decentraland" + (cfg.forge ? (S.me.forge ? ", Forgejo" : ", Forgejo pending") : "") : S.identity ? "checking your login…" : "sign in on this site first" }),
      h("span", { class: "ar", text: "›" }),
    ]);
  }
  function listenRow() {
    var on = ai.micOn();
    var st = ai.micState ? ai.micState() : null;
    var g = st && st.guard || {};
    var text = !cfg.mic ? "No microphone on this loop; type in its terminal."
      : on ? (g.state === "warning" ? g.why + ". Say something to keep listening." : "Listening. Say what you want to change.")
      : st && st.stopped && Date.now() - st.stopped.at < 60000 ? "Mic off: " + st.stopped.why + "." : "Muted. Say what you want to change?";
    var held = S.held && Date.now() - S.held.at < 10 * 60000 ? S.held : null;
    return h("div", { class: "listen" + (on ? "" : " off") }, [
      wave(on),
      h("span", { class: "m", text: S.hearing && on ? "“" + S.hearing + "”" : text }),
      liveChip(),
      micButton(),
      held ? h("div", { class: "held" }, [
        h("span", { class: "m", text: "Heard, not taken as a request: “" + held.text + "”" }),
        h("button", { class: "b", text: "Send it as a request", onclick: function () {
          var say = held.text; S.held = null; render();
          api("/__ai/say?source=widget", { method: "POST", raw: say }).then(function () { refresh(); }, function (e) { toast(e); });
        } }),
        h("button", { class: "b ghost", text: "Dismiss", onclick: function () { S.held = null; render(); } }),
      ]) : null,
    ]);
  }

  // A1 · first open
  function viewFirst() {
    var n = S.changes.filter(function (c) { return Date.now() - Date.parse(c.heard) < 86400e3; }).length;
    return card([
      h("div", { class: "top" }, [statusChip(), h("span", { class: "x", text: "×", onclick: close })]),
      listenRow(),
      askEl,
      n ? h("div", { class: "srow", style: "cursor:pointer", onclick: goList }, [h("span", { class: "v", text: n + " change" + (n === 1 ? "" : "s") + " today" }), h("span", { class: "lnk", text: "Changes ›" })]) : null,
      !S.me && !S.identity ? h("p", { class: "muted", text: "The widget reuses your Decentraland login on this site" + (cfg.forge ? ", and " + forgeHost() + " takes the same login." : ".") }) : null,
    ]);
  }

  // the status card: both logins, the agents, the models
  function viewStatus() {
    var st = S.sys;
    var busy = st && st.workers ? st.workers.filter(function (w) { return w.job; }) : [];
    var agents = !st ? "…" : (busy.length ? busy.map(function (w) { return w.name + " on R-" + w.job.id; }).join(", ") : "idle") + (st && st.queued && st.queued.length ? " · " + st.queued.length + " queued" : "") + (st && st.muted ? " · muted" : "");
    return card([
      h("div", { class: "hd" }, [h("span", { class: "back", text: "‹", onclick: function () { S.view = S.firstOpen ? "first" : "list"; render(); } }), h("span", { class: "t", text: "Status" }), h("span", { class: "x", text: "×", onclick: close })]),
      h("div", { class: "srow" }, [h("i", { class: "d" + (S.me ? " on" : "") }), h("span", { class: "k", text: "Decentraland" }), h("span", { class: "v", text: S.me ? (S.me.name || "signed in") : "sign in on this site" })]),
      cfg.forge ? h("div", { class: "srow" }, [h("i", { class: "d" + (S.me && S.me.forge ? " on" : "") }), h("span", { class: "k", text: "Forgejo" }),
        h("span", { class: "v", text: S.me && S.me.forge ? S.me.forge.login + " on " + forgeHost() : S.me ? "making your account on " + forgeHost() + "…" : "comes with the Decentraland login" }),
        S.me && S.me.forge ? h("a", { class: "lnk", text: "Open", href: cfg.forge + "/" + S.me.forge.login, target: "_blank" }) : null]) : null,
      h("div", { class: "srow" }, [h("i", { class: "d" + (busy.length ? " on" : "") }), h("span", { class: "k", text: "Agents" }), h("span", { class: "v", text: agents }), h("span", { class: "lnk", text: "Settings", onclick: openModels })]),
      listenRow(),
    ]);
  }

  // B3 · the stack: review on top, history, a line, what is running nearest the dot
  function viewList() {
    var today = S.changes.filter(function (c) { return Date.now() - Date.parse(c.heard) < 86400e3; });
    var run = today.filter(function (c) { return c.status === "running"; });
    var done = today.filter(function (c) { return c.status !== "running"; });
    var inSession = done.filter(function (c) { return Date.now() - Date.parse(c.heard) < 3 * 3600e3; });
    var earlier = done.length - inSession.length;
    var reviewable = done.filter(function (c) { return c.status === "done" && !c.pr; }).length;
    var on = ai.micOn();
    var kids = [
      h("div", { class: "row2" }, [
        h("div", { class: "pl chipish", title: "Decentraland, Forgejo, the agents, the models" }, [
          h("span", { text: "Status:", onclick: function () { S.view = "status"; glance(); render(); } }),
          on ? liveChip() : h("span", { class: "age", text: cfg.mic ? "Muted" : (S.me ? "Signed in" : "Signed out"), onclick: function () { S.view = "status"; glance(); render(); } }),
          cfg.mic ? h("button", { class: "mic in" + (on ? "" : " go"), html: (on ? I.mic : I.micOff) + "<span>" + (on ? "Mute" : "Listen") + "</span>", title: on ? "stop listening" : "start listening", onclick: function (e) { e.stopPropagation(); toggleMic(); } }) : null,
        ]),
        h("span", { class: "x", text: "\u00d7", onclick: close }),
      ]),
      reviewable ? h("div", { class: "pl review", onclick: function () { S.view = "review"; S.selected = {}; refresh(); render(); } }, [
        svg("expand"), h("span", { text: "Review " + reviewable + (reviewable === 1 ? " change" : " changes") }),
      ]) : null,
      earlier > 0 ? h("div", { class: "pl small", text: "+" + earlier + " earlier today" }) : null,
    ];
    inSession.slice(-6).forEach(function (c) { kids.push(pill(c)); });
    if (run.length) {
      if (inSession.length) kids.push(h("span", { class: "sep" }));
      run.forEach(function (c) { kids.push(pill(c)); });
    }
    kids.push(askEl);
    return stage(kids);
  }
  function pill(c) {
    var run = c.status === "running";
    return h("div", { class: "pl" + (run ? " run" : ""), title: c.text, onclick: function () { S.view = "request"; S.current = c.id; loadDetails(c.id); render(); } }, [
      icon(c),
      h("span", { class: "tt", text: title(c) }),
      c.who && !mine(c) ? h("span", { class: "age", text: whoName(c.who) }) : null,
      c.pr ? h("span", { class: "badge", text: "PR #" + c.pr.number }) : c.retriedAs ? h("span", { class: "badge smart", text: "→ R-" + c.retriedAs }) : null,
      h("span", { class: "age", text: run ? elapsed(c.heard) : age(c.done || c.heard) }),
    ]);
  }

  // B4 · the ghost terminal of a running request; B5 · the history card of a finished one
  function termLine(t) {
    var kids = [h("span", { class: "b" + (t.kind === "bad" ? " bad" : t.kind === "warn" ? " warn" : ""), text: "● " })];
    if (t.tool) kids.push(h("span", { class: "tool", text: t.tool }), " ");
    kids.push(h("span", { class: "arg", text: t.what || t.line || "" }));
    if (t.plus || t.minus) kids.push(" ", h("span", { class: "plus", text: "+" + (t.plus || 0) }), " ", h("span", { class: "minus", text: "−" + (t.minus || 0) }));
    return h("span", {}, kids);
  }
  function viewRequest() {
    var c = S.changes.find(function (x) { return x.id === S.current; });
    if (!c) return viewList();
    var d = S.details[c.id] || {};
    var back = function () { S.view = "list"; render(); };
    if (c.status === "running") {
      var lines = [
        h("span", { class: "meta", text: (lane(c) === "SMART" ? "smart-agent" : "fast-agent") + " · R-" + c.id + " · spawned " + clock(c.heard) }),
        h("span", { class: "p", text: "> " + c.text }),
        h("span", { text: " " }),
      ];
      (d.trace || []).forEach(function (t) { lines.push(termLine(t)); });
      lines.push(h("span", { class: "cur", text: "✻ " + (c.phase || "working") }));
      return stage([h("div", { class: "ghost" }, [
        h("div", { class: "ghd" }, [
          h("span", { class: "back", text: "‹", onclick: back }),
          h("span", { class: "t", text: title(c) }),
          h("span", { class: "badge " + (lane(c) === "SMART" ? "smart" : "fast"), text: lane(c) }),
          h("span", { class: "stop", text: "Stop", onclick: function () { api("/__ai/changes/" + c.id + "/stop", { method: "POST" }).then(refresh, toast); } }),
        ]),
        h("div", { class: "term" }, lines),
        h("div", { class: "gft" }, ["From " + (c.who ? (mine(c) ? "you" : whoName(c.who)) : "the terminal") + " at " + clock(c.heard) + " · ", h("b", { text: "“" + c.text + "”" })]),
      ])]);
    }
    var at = function (ms) { return clock(new Date(Date.parse(c.heard) + (ms || 0)).toISOString()); };
    var tl = [];
    var step = function (ts, dot, kids) { tl.push(h("span", { class: "ts", text: ts }), h("i", { class: dot || "" }), h("span", { class: "w" }, typeof kids === "string" ? [kids] : kids)); };
    step(at(0), "", "Heard" + (c.source && c.source !== "narration" ? " (" + c.source + ")" : " in transcript"));
    if (c.follows) step(at(0), "", "Grouped with R-" + c.follows + " into a batch");
    if (c.retryOf) step(at(0), "p", "Retry of R-" + c.retryOf + (c.lane ? " on " + c.lane : ""));
    if (c.editOf) step(at(0), "", "Edited from R-" + c.editOf);
    if (c.ms && c.ms.dispatch != null) step(at(c.ms.dispatch), lane(c) === "SMART" ? "p" : "y", (c.lane === "claude" ? "Claude" : c.lane === "codex" ? "Codex" : lane(c) === "SMART" ? "Smart" : "Fast") + " agent spawned");
    if (c.ms && c.ms.write != null) step(at(c.ms.write), "", ["Edited " + (c.files || []).map(function (f) { return f.split("/").pop(); }).join(", ") + " ", counts(c)]);
    if (c.ms && c.ms.paint != null) step(at(c.ms.paint), "g", [h("span", { class: "ok", text: "Live on page" })]);
    else if (c.ms && c.ms.hmr != null) step(at(c.ms.hmr), "g", "Hot update sent");
    if (c.status === "failed") step(at(c.ms && c.ms.done), "r", [h("span", { class: "bad", text: "Failed: " + (c.error || "") })]);
    if (c.status === "cancelled") step(at(c.ms && c.ms.done), "", "Stopped");
    if (c.status === "no-change") step(at(c.ms && c.ms.done), "", "No file changed" + (c.summary ? ": " + c.summary : ""));
    if (c.retriedAs) step("", "p", [h("span", { class: "lnk", text: "Retried as R-" + c.retriedAs + " ›", onclick: function () { S.current = c.retriedAs; loadDetails(c.retriedAs); render(); } })]);
    if (c.pr) step("", "g", [h("a", { href: c.pr.url, target: "_blank", class: "lnk", text: "In pull request #" + c.pr.number })]);
    var badge = c.status === "done" ? "DONE" : c.status === "failed" ? "FAILED" : c.status === "cancelled" ? "STOPPED" : c.status === "reverted" ? "REVERTED" : "NO CHANGE";
    var showLog = !!d.showLog;
    var stuck = (c.status === "failed" || c.status === "no-change" || c.status === "cancelled") && !c.retriedAs;
    var smartOn = d.smart ? d.smart.on : (cfg.smart && cfg.smart.on);
    var ed = S.editing && S.editing.id === c.id ? S.editing : null;
    var editor = function () {
      var ta = h("textarea", { class: "ed", placeholder: ed.mode === "edit" ? "What you meant to say" : "What the agent should know, e.g. which button, where", oninput: function (e) { ed.text = e.target.value; } });
      ta.value = ed.text;
      setTimeout(function () { ta.focus(); }, 0);
      return h("div", { class: "sect" }, [
        h("span", { class: "lab", text: ed.mode === "edit" ? "EDIT WHAT YOU SAID" : "ADD A CLARIFICATION" }),
        ta,
        h("div", { class: "acts" }, [
          h("button", { class: "b primary", text: ed.mode === "edit" ? (c.status === "running" || !c.ms || c.ms.dispatch == null ? "Save" : "Save and run again") : "Run again with this", onclick: function () {
            var text = ed.text.trim(); if (!text) return;
            api("/__ai/changes/" + c.id + "/" + (ed.mode === "edit" ? "edit" : "clarify"), { method: "POST", body: { text: text } }).then(function (r) {
              S.editing = null; toast(ed.mode === "edit" ? "saved" : "sent to the " + (cfg.smart && cfg.smart.claude ? "Claude" : "smart") + " agent");
              if (r.id) { S.current = r.id; }
              refresh().then(function () { loadDetails(S.current, true); });
            }, toast);
          } }),
          h("button", { class: "b", text: "Cancel", onclick: function () { S.editing = null; render(); } }),
        ]),
      ]);
    };
    var logLines = (d.log || []).map(function (l) { return h("div", { class: "ln" }, [h("span", { class: "ts", text: clock(l.at) }), h("span", { text: l.text })]); });
    var lastOutput = c.status === "failed" ? (c.error || d.error) : (d.reply || "");
    return card([
      h("div", { class: "hd" }, [h("span", { class: "back", text: "‹", onclick: back }), h("span", { class: "t", text: title(c) }), h("span", { class: "badge " + (c.status === "done" ? "done" : c.status === "failed" ? "fail" : ""), text: badge })]),
      h("div", { class: "scroll" }, [
        h("div", { class: "sect" }, [h("span", { class: "lab", text: c.who && !mine(c) ? whoName(c.who).toUpperCase() + " SAID" : "YOU SAID" }), h("div", { class: "said" }, ["“", h("b", { text: c.text }), "”"])]),
        h("div", { class: "sect" }, [h("span", { class: "lab", text: "WHAT HAPPENED" }), h("div", { class: "tl" }, tl)]),
        ed ? editor() : null,
        stuck && lastOutput ? h("div", { class: "sect" }, [h("span", { class: "lab", text: "THE AGENT'S LAST WORDS" }), h("div", { class: "said", text: String(lastOutput).slice(0, 600) })]) : null,
        stuck && !ed ? h("div", { class: "acts" }, [
          smartOn ? h("button", { class: "b primary", text: "Try a smarter agent", title: "the same request, on " + (cfg.smart && cfg.smart.claude ? "Claude" : "the smart agent"), onclick: function () {
            api("/__ai/changes/" + c.id + "/retry", { method: "POST" }).then(function (r) { toast("retrying as R-" + r.id); S.current = r.id; refresh().then(function () { loadDetails(r.id); }); }, toast);
          } }) : h("span", { class: "muted", text: "No smart agent on this loop: turn one on in Settings." }),
          h("button", { class: "b", text: "Add a clarification", onclick: function () { S.editing = { id: c.id, mode: "clarify", text: "" }; render(); } }),
        ]) : null,
        showLog && d.patch ? diffView(d.patch) : null,
        showLog && d.trace && d.trace.length ? h("div", { class: "logt" }, d.trace.map(function (t) { return h("div", {}, [termLine(t)]); })) : null,
        showLog && logLines.length ? h("div", { class: "logl" }, logLines) : null,
        showLog && d.reply && c.status !== "failed" ? h("div", { class: "said", text: String(d.reply).slice(0, 1200) }) : null,
        showLog && !d.patch && !(d.trace && d.trace.length) && !logLines.length && !d.reply ? h("p", { class: "muted", text: "The agent wrote nothing before it stopped." }) : null,
        c.hermes ? h("div", { class: "srow" }, [h("i", { class: "d on" }), h("span", { class: "k", text: "Hermes" }), h("span", { class: "v", text: "the review agents' copy of this request" }), h("a", { class: "lnk", text: "Continue in Hermes", href: c.hermes.url, target: "_blank" })]) : null,
      ]),
      h("div", { class: "btns" }, [
        h("button", { class: "b", text: showLog ? "Hide log" : "View full log", onclick: function () { loadDetails(c.id, true).then(function () { S.details[c.id].showLog = !showLog; render(); }); } }),
        c.status === "done" && !c.pr ? h("button", { class: "b outline", text: "Revert", onclick: function () {
          if (!confirm("Revert " + (c.files || []).join(", ") + " to the last commit? Other changes to the same files go too.")) return;
          api("/__ai/changes/" + c.id + "/revert", { method: "POST" }).then(function () { toast("reverted"); refresh(); }, toast);
        } }) : null,
      ]),
      !ed && (mine(c) || !c.who) ? h("div", { class: "acts" }, [
        !c.pr ? h("button", { class: "b", text: "Edit", title: "fix what was heard; a finished change is reverted and run again", onclick: function () { S.editing = { id: c.id, mode: "edit", text: c.text }; render(); } }) : null,
        !c.pr ? h("button", { class: "b danger", text: "Delete", title: "forget this request: its change is reverted and its record removed, here and in Hermes", onclick: function () {
          if (!confirm("Delete this request? Its change is reverted and its record goes, here and in Hermes.")) return;
          api("/__ai/changes/" + c.id + "/delete", { method: "POST" }).then(function () { toast("deleted"); S.view = "list"; refresh(); }, toast);
        } }) : null,
        !c.pr ? h("button", { class: "b danger", text: "Delete this and everything after", title: "for a microphone left open: every request heard from this one on goes", onclick: function () {
          var later = S.changes.filter(function (x) { return Date.parse(x.heard) >= Date.parse(c.heard); }).length;
          if (!confirm("Delete " + later + " request" + (later === 1 ? "" : "s") + " heard from " + clock(c.heard) + " on? Their changes are reverted and their records go, here and in Hermes.")) return;
          api("/__ai/changes/" + c.id + "/delete-after", { method: "POST" }).then(function (r) { toast("deleted " + (r.deleted || []).length); S.view = "list"; refresh(); }, toast);
        } }) : null,
      ]) : null,
    ]);
  }
  function diffView(patch) {
    var lines = String(patch).split("\n").map(function (l) {
      var cls = l.indexOf("+++") === 0 || l.indexOf("---") === 0 ? "h" : l.indexOf("diff --git") === 0 ? "f" : l.charAt(0) === "+" ? "a" : l.charAt(0) === "-" ? "r" : l.charAt(0) === "@" ? "h" : "";
      return '<div class="' + cls + '">' + esc(l) + "</div>";
    }).join("");
    return h("div", { class: "diff", html: lines });
  }
  function loadDetails(id, force) {
    if (S.details[id] && !force) return Promise.resolve(S.details[id]);
    return api("/__ai/changes/" + id).then(function (d) { S.details[id] = Object.assign(S.details[id] || {}, d); render(); return S.details[id]; }, toast);
  }

  // C1 · review, maximized
  function viewReview() {
    var items = S.changes.slice().reverse().filter(function (c) { return Date.now() - Date.parse(c.heard) < 86400e3; });
    var pickable = function (c) { return c.status === "done" && !c.pr && mine(c); };
    var picked = items.filter(function (c) { return S.selected[c.id]; });
    var files = {}, plus = 0, minus = 0;
    picked.forEach(function (c) { (c.files || []).forEach(function (f) { files[f] = 1; }); plus += c.plus || 0; minus += c.minus || 0; });
    var cur = S.changes.find(function (x) { return x.id === S.current; }) || picked[0] || items[0];
    if (cur && !S.details[cur.id]) loadDetails(cur.id);
    var d = cur ? (S.details[cur.id] || {}) : {};
    var canAll = items.filter(pickable);
    var allOn = canAll.length > 0 && canAll.every(function (c) { return S.selected[c.id]; });
    var needForge = !!(cfg.forge && S.me && !S.me.forge);
    if (needForge) whoAmI();
    var first = items.length ? items[items.length - 1] : null;
    return h("div", { class: "max" }, [
      h("div", { class: "mhd" }, [
        h("span", { class: "c", style: "background:" + ({ off: T.silver, ready: T.silver, listening: T.green, working: T.coral, needs: T.ruby })[S.dot] }),
        h("span", { class: "t", text: "Changes" }),
        h("span", { class: "tag", text: "Today" }),
        h("span", { class: "sp" }),
        h("span", { class: "tag", style: "cursor:pointer;display:inline-flex;width:32px;height:32px;justify-content:center;align-items:center;padding:0;border-radius:10px", html: I.shrink, onclick: function () { S.view = "list"; render(); } }),
      ]),
      h("div", { class: "cols" }, [
        h("div", { class: "lcol" }, [
          h("div", { class: "lhd" }, [h("span", { text: "SESSION · " + (first ? clock(first.heard).slice(0, 5) : "") + " – NOW" }), h("span", { class: "lnk", text: allOn ? "CLEAR" : "SELECT ALL", onclick: function () { canAll.forEach(function (c) { S.selected[c.id] = !allOn; }); render(); } })]),
        ].concat(items.map(function (c) {
          var can = pickable(c);
          return h("div", { class: "ritem" + (cur && cur.id === c.id ? " cur" : ""), onclick: function () { S.current = c.id; loadDetails(c.id); render(); } }, [
            h("span", { class: "cb" + (S.selected[c.id] ? " on" : can ? "" : " no"), html: S.selected[c.id] ? I.checkW : "", onclick: function (e) { e.stopPropagation(); if (can) { S.selected[c.id] = !S.selected[c.id]; render(); } } }),
            h("span", { class: "tt" }, [h("span", { class: "n", text: title(c) }), h("span", { class: "s" }, [
              (lane(c) === "SMART" ? "Smart" : "Fast") + " · " + (c.status === "running" ? "still running" : c.status === "failed" ? "failed" : (c.files || []).length === 1 ? c.files[0].split("/").pop() : (c.files || []).length + " files") + (c.who ? (mine(c) ? "" : " · " + whoName(c.who)) : " · typed, nobody's") + " ",
              counts(c),
            ])]),
            c.pr ? h("span", { class: "badge", text: "PR #" + c.pr.number }) : c.status === "running" ? h("span", { class: "spin" }) : c.status === "failed" ? h("span", { class: "bad", text: "!" }) : c.status === "done" ? h("span", { class: "ok", html: I.check, style: "width:12px;height:12px;display:inline-flex" }) : null,
          ]);
        }))),
        h("div", { class: "rcol" }, cur ? [
          h("div", { class: "hd" }, [h("span", { class: "t", text: title(cur) }), h("span", { class: "badge " + (lane(cur) === "SMART" ? "smart" : "fast"), text: lane(cur) }), h("span", { class: "muted", text: clock(cur.heard) })]),
          h("div", { class: "said" }, ["“", h("b", { text: cur.text }), "”" + (cur.who && !mine(cur) ? " · " + whoName(cur.who) : "")]),
          d.patch ? diffView(d.patch) : h("p", { class: "muted", text: cur.status === "running" ? "Still running." : "No diff recorded." }),
          h("div", { class: "btns", style: "max-width:360px" }, [
            h("button", { class: "b", text: "View agent log", onclick: function () { S.view = "request"; S.current = cur.id; loadDetails(cur.id, true).then(function () { S.details[cur.id].showLog = true; render(); }); } }),
            cur.status === "done" && !cur.pr ? h("button", { class: "b outline", text: "Revert", onclick: function () {
              if (!confirm("Revert " + (cur.files || []).join(", ") + " to the last commit?")) return;
              api("/__ai/changes/" + cur.id + "/revert", { method: "POST" }).then(function () { toast("reverted"); refresh(); }, toast);
            } }) : null,
          ]),
        ] : [h("p", { class: "muted", text: "Pick a change." })]),
      ]),
      h("div", { class: "mft" }, [
        h("span", { style: "color:" + T.white, text: picked.length + " change" + (picked.length === 1 ? "" : "s") + " selected" }),
        h("span", { text: Object.keys(files).length + " files · " }, []),
        h("span", {}, [h("span", { class: "plus", text: "+" + plus }), " ", h("span", { class: "minus", text: "−" + minus })]),
        h("span", { class: "sp" }),
        h("span", { text: !S.me ? "sign in on this site to send a pull request" : needForge ? "making your " + forgeHost() + " account…" : "a pull request carries only your own changes, in your name" }),
        h("button", { class: "b primary", disabled: !picked.length || !cfg.forge || !S.me || needForge, text: "Create Pull Request", onclick: function () { S.view = "compose"; S.draft = draftPr(picked); render(); } }),
      ]),
    ]);
  }
  function draftPr(picked) {
    var titles = picked.map(title);
    var t = titles.length <= 3 ? titles.join(", ") : titles.slice(0, 2).join(", ") + " and " + (titles.length - 2) + " more";
    var body = picked.length + " change" + (picked.length === 1 ? "" : "s") + " requested by voice on " + location.host + ".\n\n" +
      picked.map(function (c) { return "- **" + title(c) + "** — “" + c.text + "”" + ((c.files || []).length ? " (" + c.files.join(", ") + ")" : ""); }).join("\n");
    return { title: t.length > 72 ? t.slice(0, 69) + "…" : t, body: body, draft: true, ids: picked.map(function (c) { return c.id; }) };
  }

  // C2 · compose, maximized
  function viewCompose() {
    var dr = S.draft;
    var titleIn = h("input", { value: dr.title, oninput: function (e) { dr.title = e.target.value; } });
    var bodyIn = h("textarea", { oninput: function (e) { dr.body = e.target.value; } });
    bodyIn.value = dr.body;
    return h("div", { class: "max" }, [
      h("div", { class: "mhd" }, [h("span", { class: "t", text: "New " + (dr.draft ? "draft " : "") + "pull request" }), h("span", { class: "sp" }), h("span", { class: "x", text: "×", onclick: function () { S.view = "review"; render(); } })]),
      h("div", { class: "form" }, [
        h("div", { class: "field" }, [h("span", { class: "lab", text: "TITLE" }), titleIn]),
        h("div", { class: "field" }, [h("span", { class: "lab", text: "DESCRIPTION" }), bodyIn]),
        h("div", { style: "display:flex;align-items:center;gap:12px" }, [
          h("span", { class: "muted", text: "The loop makes a branch, one commit per change in your name, pushes to " + forgeHost() + " and opens the pull request as you." }),
          h("span", { style: "flex:1" }),
          h("span", { class: "sw" + (dr.draft ? " on" : ""), onclick: function () { dr.draft = !dr.draft; render(); } }, [h("i"), h("span", { text: "Draft" })]),
        ]),
        h("div", { style: "display:flex;justify-content:flex-end;gap:8px;padding-top:4px" }, [
          h("button", { class: "b", style: "flex:none;padding:12px 18px;font-size:14px", text: "Cancel", onclick: function () { S.view = "review"; render(); } }),
          h("button", { class: "b primary", style: "flex:none;padding:12px 18px;font-size:14px", text: "Send Pull Request", disabled: !S.me, onclick: function () {
            S.pr = { lines: [], state: "running", at: new Date().toISOString(), count: dr.ids.length, draft: dr.draft };
            S.view = "sending"; render(); setDot();
            api("/__ai/pr", { method: "POST", body: dr }).then(function (r) { S.pr.id = r.id; }, function (e) { S.pr.state = "failed"; S.pr.lines.push({ line: String(e.message || e), kind: "bad" }); render(); setDot(); });
          } }),
        ]),
      ]),
    ]);
  }

  // C3 · the agent sends it (the same ghost terminal)
  function viewSending() {
    var pr = S.pr || { lines: [] };
    var lines = [
      h("span", { class: "meta", text: "loop · PR · spawned " + (pr.at ? clock(pr.at) : "") }),
      h("span", { class: "p", text: "> open a " + (pr.draft ? "draft " : "") + "PR with " + pr.count + " selected change" + (pr.count === 1 ? "" : "s") }),
      h("span", { text: " " }),
    ].concat(pr.lines.map(function (l) { return termLine({ line: l.line, kind: l.kind }); }));
    if (pr.state === "running") lines.push(h("span", { class: "cur", text: "✻ working" }));
    return stage([h("div", { class: "ghost" }, [
      h("div", { class: "ghd" }, [h("span", { class: "t", text: "Sending pull request" }), h("span", { class: "badge", text: "LOOP" }), h("span", { class: "muted", text: pr.at ? elapsed(pr.at) : "" })]),
      h("div", { class: "term" }, lines),
      pr.state === "failed" ? h("div", { class: "gft", style: "display:flex;gap:8px" }, [h("button", { class: "b", text: "Back to changes", onclick: function () { S.view = "review"; render(); setDot(); } })]) : null,
    ])]);
  }

  // C4 · opened
  function viewOpened() {
    var pr = S.pr || {};
    return h("div", { class: "scrim", onclick: function (e) { if (e.target === e.currentTarget) backFromPr(); } }, [h("div", { class: "big" }, [
      h("span", { class: "ico", html: I.pr }),
      h("div", { style: "display:flex;flex-direction:column;gap:8px" }, [
        h("h2", { text: (pr.draft ? "Draft pull" : "Pull") + " request #" + pr.number + " opened" }),
        h("span", { class: "sub", text: pr.title || "" }),
      ]),
      h("div", { class: "kvs" }, [
        h("div", { class: "kv" }, [h("span", { text: "Branch" }), h("span", { class: "v mono", text: pr.branch || "" })]),
        h("div", { class: "kv" }, [h("span", { text: "Changes" }), h("span", { class: "v", text: pr.count + " · " + (pr.files || 0) + " file" + (pr.files === 1 ? "" : "s") })]),
      ]),
      h("div", { class: "btns", style: "width:100%" }, [
        h("a", { class: "b primary", href: pr.url, target: "_blank", text: "View on Forgejo" }),
        h("button", { class: "b", text: "Back to changes", onclick: backFromPr }),
      ]),
    ])]);
  }
  function backFromPr() { S.view = "list"; S.pr = null; refresh(); render(); setDot(); }

  // Models: which model each kind of work uses, changed live on the loop
  function openModels() {
    S.view = "models"; render();
    api("/__ai/settings").then(function (m) { S.models = m; render(); }, toast);
  }
  function viewModels() {
    var m = S.models;
    var back = function () { S.view = "status"; S.modelsDraft = null; S.micDraft = null; render(); };
    if (!m) return card([h("div", { class: "hd" }, [h("span", { class: "back", text: "‹", onclick: back }), h("span", { class: "t", text: "Settings" })]), h("p", { class: "muted", text: "loading…" })]);
    var draft = S.modelsDraft || (S.modelsDraft = Object.assign({}, m.settings));
    var mic = S.micDraft || (S.micDraft = ai.micSettings ? ai.micSettings() : { silenceSec: 45, maxMin: 10, vad: true });
    var numField = function (label, key, min, max, hint) {
      var input = h("input", { class: "num", type: "number", min: String(min), max: String(max), value: String(mic[key]), oninput: function (e) { mic[key] = Math.min(max, Math.max(min, Number(e.target.value) || min)); } });
      return h("div", { class: "srow" }, [h("span", { class: "k", text: label }), input, h("span", { class: "v", text: hint })]);
    };
    var field = function (label, key, choices, hint) {
      var list = h("datalist", { id: "ai-" + key }, (choices || []).map(function (c) { return h("option", { value: c }); }));
      var input = h("input", { list: "ai-" + key, value: draft[key] || "", style: "font-weight:400;font-size:12px", oninput: function (e) { draft[key] = e.target.value; } });
      return h("div", { class: "field" }, [h("span", { class: "lab", text: label }), input, list, hint ? h("span", { class: "muted", text: hint }) : null]);
    };
    var smart = h("div", { class: "field" }, [h("span", { class: "lab", text: "SMART AGENT (bigger changes, escalations)" }), h("div", { style: "display:flex;gap:14px;flex-wrap:wrap" }, m.choices.smart.map(function (c) {
      return h("span", { class: "sw" + (draft.smart === c ? " on" : ""), onclick: function () { draft.smart = c; render(); } }, [h("i"), h("span", { text: c === "none" ? "fast lane only" : c })]);
    }))]);
    return card([
      h("div", { class: "hd" }, [h("span", { class: "back", text: "‹", onclick: back }), h("span", { class: "t", text: "Settings" }), h("span", { class: "x", text: "×", onclick: close })]),
      h("div", { class: "scroll" }, [
        cfg.mic ? h("div", { class: "sect" }, [
          h("span", { class: "lab", text: "MICROPHONE" }),
          numField("Silence", "silenceSec", 10, 600, "seconds without speech before the mic turns itself off"),
          numField("Session", "maxMin", 1, 120, "minutes at most for one session"),
          h("span", { class: "sw" + (mic.vad ? " on" : ""), onclick: function () { mic.vad = !mic.vad; render(); } }, [h("i"), h("span", { text: "Detect speech in the page (Silero)" })]),
          h("p", { class: "muted", text: "A live banner and a ● LIVE tab title show while the mic is on; a beep and a 10 s countdown come before it stops by itself." }),
        ]) : null,
        h("div", { class: "sect" }, [
          h("span", { class: "lab", text: "WHEN THE FAST AGENT FAILS" }),
          h("span", { class: "sw" + (draft.autoRetry !== false ? " on" : ""), onclick: function () { draft.autoRetry = draft.autoRetry === false; render(); } }, [h("i"), h("span", { text: "Hand it to a smarter agent automatically" })]),
        ]),
        field("FAST LANE (every change starts here)", "flashModel", m.choices.flash, "provider/model as opencode names it"),
        smart,
        draft.smart === "claude" ? field("CLAUDE MODEL", "claudeModel", m.choices.claude) : null,
        draft.smart === "claude" ? field("CLAUDE EFFORT", "claudeEffort", m.choices.claudeEffort, "empty = the model's default") : null,
        draft.smart === "codex" ? field("CODEX MODEL", "codexModel", m.choices.codex, "empty = the CLI's default") : null,
        cfg.mic ? field("HEARING (speech to text)", "sttModel", m.choices.stt, "empty = the speech server's own") : null,
        field("VOICE MODEL (text to speech)", "ttsModel", m.choices.tts),
        field("VOICE", "ttsVoice", m.choices.voices),
        !m.lanes.claude && !m.lanes.codex ? h("p", { class: "muted", text: "This loop runs without a smart agent: start it with --claude-cmd or --codex-cmd to offer one." }) : null,
      ]),
      h("div", { class: "btns" }, [
        h("button", { class: "b", text: "Cancel", onclick: back }),
        h("button", { class: "b primary", text: "Save", onclick: function () {
          if (ai.setMicSettings) ai.setMicSettings(mic);
          api("/__ai/settings", { method: "POST", body: draft }).then(function (r) { S.models = r; S.modelsDraft = null; S.micDraft = null; toast("settings saved"); back(); }, toast);
        } }),
      ]),
    ]);
  }

  // ------------------------------------------------------------- data flow
  var toastTimer;
  function toast(msg) {
    msg = msg && msg.message ? msg.message : String(msg);
    S.hearing = msg; S.hover = true; render();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { S.hover = false; S.hearing = ""; render(); }, 4000);
  }
  function refresh() {
    return api("/__ai/changes").then(function (list) { S.changes = list; setDot(); }, function () {});
  }
  ai.on(function (m) {
    if (m.ai === "mic") { setDot(); return; }
    if (m.ai === "status") {
      var c = S.changes.find(function (x) { return x.id === m.id; });
      if (m.change) {
        if (c) { var keep = { plus: c.plus, minus: c.minus, phase: c.phase }; Object.assign(c, m.change); if (!m.change.plus) { c.plus = keep.plus; c.minus = keep.minus; } }
        else { c = m.change; S.changes.push(c); }
        c.phase = m.msg;
        if (m.phase !== "working") refresh(); else setDot();
      } else if (c) { c.phase = m.msg; if (m.phase !== "working" && c.status === "running") refresh(); else render(); }
      else refresh();
      if (m.phase === "heard") {
        if (m.held) S.held = { text: m.held, at: Date.now() };
        S.hearing = m.msg.replace(/^heard:?\s*/i, ""); setTimeout(function () { if (S.hearing === m.msg.replace(/^heard:?\s*/i, "")) { S.hearing = ""; render(); } }, 8000);
      }
    } else if (m.ai === "hearing") {
      S.hearing = m.text; render();
    } else if (m.ai === "pr" && S.pr) {
      if (m.line) S.pr.lines.push({ line: m.line, kind: m.kind || "" });
      if (m.state) S.pr.state = m.state;
      if (m.state === "done") { Object.assign(S.pr, m.result || {}); S.view = "opened"; refresh(); }
      render(); setDot();
    } else if (m.ai === "toast") {
      toast(m.msg);
    }
  });
  window.__aiWidgetShow = toast;
  // for an automated check: click the first element matching a selector inside the widget, read its text
  window.__aiWidgetDo = function (sel) { var el = root.querySelector(sel); if (el) el.click(); return !!el; };
  window.__aiWidgetText = function (sel) { var el = sel ? root.querySelector(sel) : ui; return el ? el.textContent : null; };
  window.__aiWidgetView = function () { return { open: S.open, view: S.view, dot: S.dot, me: S.me && { name: S.me.name, forge: S.me.forge }, current: S.current, mic: ai.micState ? ai.micState() : null }; };

  // --------------------------------------------------------- identity (A)
  function identityFromPage() {
    try {
      var raw = localStorage.getItem("dcl:auth:identity:v1");
      if (!raw) return null;
      var id = JSON.parse(raw);
      if (!id || !id.signer || !id.ephemeral || !id.ephemeral.privateKey || !Array.isArray(id.authChain)) return null;
      if (id.expiration && Date.parse(id.expiration) < Date.now()) return null;
      return id;
    } catch (e) { return null; }
  }
  var whoAt = 0;
  function whoAmI() {
    if (Date.now() - whoAt < 4000) return Promise.resolve();
    whoAt = Date.now();
    return api("/__ai/me").then(function (m) {
      if (!m.address) { S.me = null; sessionStorage.removeItem("ai-widget-me"); login(); return; }
      if (S.me) { S.me.name = m.name; S.me.forge = m.forge || null; sessionStorage.setItem("ai-widget-me", JSON.stringify(S.me)); render(); }
    }, function () {});
  }
  function login() {
    S.identity = identityFromPage();
    if (!S.identity) { setDot(); return; }
    var saved = null;
    try { saved = JSON.parse(sessionStorage.getItem("ai-widget-me") || "null"); } catch (e) { saved = null; }
    if (saved && saved.address === String(S.identity.signer).toLowerCase() && saved.token) { S.me = saved; window.__aiToken = saved.token; setDot(); whoAmI(); return; }
    api("/__ai/challenge").then(function (ch) {
      return import("https://esm.sh/ethers@6.13.4").then(function (ethers) {
        var w = new ethers.Wallet(S.identity.ephemeral.privateKey);
        return w.signMessage(ch.challenge).then(function (sig) {
          var chain = S.identity.authChain.concat([{ type: "ECDSA_SIGNED_ENTITY", payload: ch.challenge, signature: sig }]);
          return api("/__ai/login", { method: "POST", body: { id: ch.id, chain: chain } });
        });
      });
    }).then(function (me) {
      S.me = me; window.__aiToken = me.token; sessionStorage.setItem("ai-widget-me", JSON.stringify(me)); setDot();
    }, function (e) { S.me = null; toast("sign-in: " + (e.message || e)); setDot(); });
  }
  addEventListener("storage", function (e) { if (e.key === "dcl:auth:identity:v1") login(); });
  var forgeOrigin = cfg.forge ? new URL(cfg.forge).origin : null;
  addEventListener("message", function (e) {
    if (!forgeOrigin || e.origin !== forgeOrigin || !e.data || e.data.dclAuth !== "challenge") return;
    var id = identityFromPage();
    if (!id) { toast("sign in to Decentraland on this site first"); return; }
    var src = e.source;
    import("https://esm.sh/ethers@6.13.4").then(function (ethers) {
      var w = new ethers.Wallet(id.ephemeral.privateKey);
      return w.signMessage(e.data.challenge).then(function (sig) {
        var chain = id.authChain.concat([{ type: "ECDSA_SIGNED_ENTITY", payload: e.data.challenge, signature: sig }]);
        src.postMessage({ dclAuth: "chain", chain: chain }, e.origin);
      });
    }).catch(function (x) { toast("forge sign-in: " + (x.message || x)); });
  });
  function forgeLogin(then) {
    if (!cfg.forge) return;
    var w = window.open(cfg.forge + "/user/oauth2/decentraland", "ai-forge-login", "popup,width=480,height=640");
    if (!w) { toast("the browser blocked the Forgejo window"); return; }
    var t = setInterval(function () { try { if (w.closed) { clearInterval(t); if (then) then(); } } catch (x) { clearInterval(t); } }, 800);
  }

  // The explorer's own connection dot (its ConnectionBadge, preference dcl.settings.connectionStatus)
  // sits in the same corner and looks alike; this dot takes its place unless someone has chosen
  // the explorer's explicitly since.
  try { if (localStorage.getItem("dcl.settings.connectionStatus") === null) localStorage.setItem("dcl.settings.connectionStatus", "0"); } catch (e) {}
  refresh();
  login();
  setInterval(function () { if (S.open || running().length) refresh(); }, 5000);
  setInterval(function () { if (typing() || S.editing) return; if ((S.open && (S.view === "request" || S.view === "sending" || S.view === "list" || S.view === "first" || S.view === "status")) || (S.hover && running().length) || ai.micOn()) render(); }, 1000);
})(window.__aiWidgetConfig || {});
