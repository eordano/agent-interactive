#!/usr/bin/env bash
# What the app needs before a build that git does not hold: ghostty-web (the
# terminal) at a pinned version checked against npm's sha512, and the icons
# made from icon.svg. The Nix build does the same from app.nix.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION=0.4.0
SHA512=0puDBik2qapbD/QQBW9o5ZHfXnZBqZWx/ctBiVtKZ6ZLds4NYb+wZuw1cRLXZk9zYovIQ908z3rvFhexAvc5Hg==
VENDOR="$HERE/web/vendor"
if [ "$(cat "$VENDOR/VERSION" 2>/dev/null)" != "$VERSION" ]; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  curl -fsSL "https://registry.npmjs.org/ghostty-web/-/ghostty-web-$VERSION.tgz" -o "$tmp/gw.tgz"
  got="$(openssl dgst -sha512 -binary "$tmp/gw.tgz" | base64 -w0 2>/dev/null || openssl dgst -sha512 -binary "$tmp/gw.tgz" | base64)"
  [ "$got" = "$SHA512" ] || { echo "prepare: ghostty-web $VERSION does not match its pinned sha512 (got $got)" >&2; exit 1; }
  tar xzf "$tmp/gw.tgz" -C "$tmp"
  mkdir -p "$VENDOR"
  cp "$tmp"/package/dist/*.js "$tmp/package/LICENSE" "$VENDOR/"
  echo "$VERSION" > "$VENDOR/VERSION"
fi
if [ ! -f "$HERE/src-tauri/icons/icon.png" ] || [ "$HERE/icon.svg" -nt "$HERE/src-tauri/icons/icon.png" ]; then
  (cd "$HERE/src-tauri" && cargo tauri icon ../icon.svg >/dev/null)
fi
