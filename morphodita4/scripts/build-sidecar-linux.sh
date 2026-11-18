#!/bin/sh
set -eu
PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
SIDECAR_BUILD_DIR=$(mktemp -d /tmp/morphodita-sidecar.XXXXXX)
curl --fail --location --proto '=https' --tlsv1.2 \
  'https://codeload.github.com/ufal/morphodita/tar.gz/refs/tags/v1.11.3' \
  --output "$SIDECAR_BUILD_DIR/upstream.tar.gz"
printf '%s  %s\n' '1e75bc319f94d5f9ba6e381c940111d72c18a82970ac55d296ca26c64098bfd7' "$SIDECAR_BUILD_DIR/upstream.tar.gz" | sha256sum --check
tar -xzf "$SIDECAR_BUILD_DIR/upstream.tar.gz" -C "$SIDECAR_BUILD_DIR"
patch --batch --forward -p1 -d "$SIDECAR_BUILD_DIR/morphodita-1.11.3" < "$PROJECT_ROOT/third_party/morphodita/loopback.patch"
make -C "$SIDECAR_BUILD_DIR/morphodita-1.11.3/src" -j"${SIDECAR_BUILD_JOBS:-4}" server
install -m755 "$SIDECAR_BUILD_DIR/morphodita-1.11.3/src/rest_server/morphodita_server" \
  "$PROJECT_ROOT/morphodita4/src-tauri/binaries/morphodita-server-x86_64-unknown-linux-gnu"
sha256sum "$PROJECT_ROOT/morphodita4/src-tauri/binaries/morphodita-server-x86_64-unknown-linux-gnu"
printf 'Build source retained at %s\n' "$SIDECAR_BUILD_DIR"
