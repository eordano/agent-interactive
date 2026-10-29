{
  lib,
  stdenvNoCC,
  rustPlatform,
  deno,
  ripgrep,
  git,
  curl,
  makeWrapper,
  fetchurl,
}:

let
  # The in-page voice detectors, served by the loop itself under /__ai/vad/ so a page never loads
  # them from a third-party CDN: TEN VAD (the WASM build of TEN-framework/ten-vad, 16 kHz, 16 ms hops,
  # Apache-2.0 with Agora's deployment conditions) first, Silero VAD v5 through onnxruntime-web when
  # the page cannot run it.
  ten-vad-rev = "d68ab71c8d5fbd8f98e97ae7c9986af76b5d72b1";
  ten-vad-js = fetchurl {
    url = "https://raw.githubusercontent.com/TEN-framework/ten-vad/${ten-vad-rev}/lib/Web/ten_vad.js";
    hash = "sha256-athARDDB+zO1kQAyuXHhpPHUyjyb92/kVvC13NnpfH4=";
  };
  ten-vad-wasm = fetchurl {
    url = "https://raw.githubusercontent.com/TEN-framework/ten-vad/${ten-vad-rev}/lib/Web/ten_vad.wasm";
    hash = "sha256-HsC5ZAaDmH4VpOVOTOVkKyRHxuXYKxvoibUJnHVDT8M=";
  };
  vad-web = fetchurl {
    url = "https://registry.npmjs.org/@ricky0123/vad-web/-/vad-web-0.0.22.tgz";
    hash = "sha256-y/rXmEhP3LoCgIfrNkahm4FSZq8EOqebJEFdtPoKHPo=";
  };
  onnxruntime-web = fetchurl {
    url = "https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-1.14.0.tgz";
    hash = "sha256-LsjlzMbA5RU2IyDRBauFvqU5il3h61yjMSYN8EICFbI=";
  };
  agent-pty = rustPlatform.buildRustPackage {
    pname = "agent-pty";
    version = "0.1.0";
    src = lib.fileset.toSource {
      root = ./pty;
      fileset = lib.fileset.unions [
        ./pty/Cargo.toml
        ./pty/Cargo.lock
        ./pty/src
      ];
    };
    cargoLock.lockFile = ./pty/Cargo.lock;
    meta.mainProgram = "agent-pty";
  };
in
stdenvNoCC.mkDerivation {
  pname = "agent-interactive";
  version = "0.1.0";
  src = lib.fileset.toSource {
    root = ./.;
    fileset = lib.fileset.unions [
      ./agent-interactive.ts
      ./widget.js
      ./mic-guard.js
      ./vad-turns.js
    ];
  };
  nativeBuildInputs = [ makeWrapper ];
  dontConfigure = true;
  dontBuild = true;
  installPhase = ''
    runHook preInstall
    install -Dm644 agent-interactive.ts $out/share/agent-interactive/agent-interactive.ts
    install -Dm644 widget.js $out/share/agent-interactive/widget.js
    install -Dm644 mic-guard.js $out/share/agent-interactive/mic-guard.js
    install -Dm644 vad-turns.js $out/share/agent-interactive/vad-turns.js
    mkdir -p vad-src $out/share/agent-interactive/vad
    install -m644 ${ten-vad-js} $out/share/agent-interactive/vad/ten_vad.js
    install -m644 ${ten-vad-wasm} $out/share/agent-interactive/vad/ten_vad.wasm
    tar -xzf ${vad-web} -C vad-src
    tar -xzf ${onnxruntime-web} -C vad-src --one-top-level=ort --strip-components=1
    for f in bundle.min.js vad.worklet.bundle.min.js silero_vad_v5.onnx silero_vad_legacy.onnx; do
      install -m644 vad-src/package/dist/$f $out/share/agent-interactive/vad/$f
    done
    for f in ort.min.js ort-wasm-simd.wasm ort-wasm.wasm ort-wasm-simd-threaded.wasm ort-wasm-threaded.wasm ort-wasm-threaded.worker.js; do
      install -m644 vad-src/ort/dist/$f $out/share/agent-interactive/vad/$f
    done
    makeWrapper ${lib.getExe deno} $out/bin/agent-interactive \
      --add-flags "run --allow-net --allow-read --allow-write --allow-run --allow-env" \
      --add-flags "$out/share/agent-interactive/agent-interactive.ts" \
      --prefix PATH : ${
        lib.makeBinPath [
          agent-pty
          ripgrep
          git
          curl
        ]
      }
    ln -s ${lib.getExe agent-pty} $out/bin/agent-pty
    runHook postInstall
  '';
  doInstallCheck = true;
  installCheckPhase = ''
    export HOME=$TMPDIR DENO_DIR=$TMPDIR/deno
    $out/bin/agent-interactive --help | grep '^USAGE' > /dev/null
    $out/bin/agent-pty --help | grep '^usage: agent-pty' > /dev/null
  '';
  passthru = { inherit agent-pty; };
  meta = {
    description = "Say a change to a web page, see it hot-reload, hear one sentence back";
    mainProgram = "agent-interactive";
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
  };
}
