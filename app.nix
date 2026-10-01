{
  lib,
  stdenv,
  rustPlatform,
  fetchurl,
  cargo-tauri,
  pkg-config,
  wrapGAppsHook3,
  webkitgtk_4_1,
  gtk3,
  libsoup_3,
  glib-networking,
  gsettings-desktop-schemas,
  dbus,
  openssl,
  agent-interactive,
}:

let
  ghostty-web = fetchurl {
    url = "https://registry.npmjs.org/ghostty-web/-/ghostty-web-0.4.0.tgz";
    hash = "sha512-0puDBik2qapbD/QQBW9o5ZHfXnZBqZWx/ctBiVtKZ6ZLds4NYb+wZuw1cRLXZk9zYovIQ908z3rvFhexAvc5Hg==";
  };
in
rustPlatform.buildRustPackage {
  pname = "agent-interactive-app";
  version = "0.1.0";
  src = lib.fileset.toSource {
    root = ./app;
    fileset = lib.fileset.unions [
      ./app/icon.svg
      ./app/src-tauri/Cargo.toml
      ./app/src-tauri/Cargo.lock
      ./app/src-tauri/build.rs
      ./app/src-tauri/tauri.conf.json
      ./app/src-tauri/capabilities
      ./app/src-tauri/src
      ./app/web/index.html
      ./app/web/app.js
      ./app/web/style.css
    ];
  };
  cargoRoot = "src-tauri";
  buildAndTestSubdir = "src-tauri";
  cargoLock.lockFile = ./app/src-tauri/Cargo.lock;

  nativeBuildInputs = [
    cargo-tauri
    cargo-tauri.hook
    pkg-config
  ]
  ++ lib.optionals stdenv.hostPlatform.isLinux [ wrapGAppsHook3 ];
  buildInputs = lib.optionals stdenv.hostPlatform.isLinux [
    webkitgtk_4_1
    gtk3
    libsoup_3
    glib-networking
    gsettings-desktop-schemas
    dbus
    openssl
  ];

  env.AGENT_INTERACTIVE_CLI_DEFAULT = lib.getExe agent-interactive;

  postPatch = ''
    tar -xzf ${ghostty-web} -C "$TMPDIR"
    mkdir -p web/vendor
    cp "$TMPDIR"/package/dist/*.js "$TMPDIR"/package/LICENSE web/vendor/
    (cd src-tauri && cargo tauri icon ../icon.svg > /dev/null)
  '';

  passthru = { inherit agent-interactive; };
  meta = {
    description = "Set up and watch agent-interactive: every agent, the queue, and each Claude agent's terminal";
    mainProgram = "agent-interactive-app";
    platforms = [
      "x86_64-linux"
      "aarch64-darwin"
    ];
  };
}
