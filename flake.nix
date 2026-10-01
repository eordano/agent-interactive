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
    };
}
