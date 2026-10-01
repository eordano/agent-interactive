{
  lib,
  stdenvNoCC,
  rustPlatform,
  deno,
  ripgrep,
  git,
  curl,
  makeWrapper,
}:

let
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
    fileset = ./agent-interactive.ts;
  };
  nativeBuildInputs = [ makeWrapper ];
  dontConfigure = true;
  dontBuild = true;
  installPhase = ''
    runHook preInstall
    install -Dm644 agent-interactive.ts $out/share/agent-interactive/agent-interactive.ts
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
    $out/bin/agent-interactive --help | grep -q '^USAGE'
    $out/bin/agent-pty --help | grep -q '^usage: agent-pty'
  '';
  passthru = { inherit agent-pty; };
  meta = {
    description = "Say a change to a web page, see it hot-reload, hear one sentence back";
    mainProgram = "agent-interactive";
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
  };
}
