{
  description = "agent-interactive: say a change to a web page and watch the agents make it";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-darwin"
      ];
      forAll = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      packages = forAll (pkgs: rec {
        agent-interactive = pkgs.callPackage ./default.nix { };
        app = pkgs.callPackage ./app.nix { inherit agent-interactive; };
        default = agent-interactive;
      });

      devShells = forAll (pkgs: {
        default = pkgs.mkShell {
          packages =
            with pkgs;
            [
              deno
              ripgrep
              git
              curl
              nodejs
              cargo
              rustc
              cargo-tauri
              pkg-config
            ]
            ++ pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [
              webkitgtk_4_1
              gtk3
              libsoup_3
              glib-networking
              gsettings-desktop-schemas
              dbus
              openssl
            ];
          shellHook = ''
            export AGENT_INTERACTIVE_CLI="$PWD/agent-interactive.ts"
            export PATH="$PWD/pty/target/release:$PATH"
          '';
        };
      });
    };
}
