#!/bin/sh
# Linux cross-build; models are downloaded in Settings after license consent.
set -eu
APP_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$APP_ROOT"
sh scripts/build-sidecar-windows.sh
npm run version:check
export CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER=x86_64-w64-mingw32-gcc
export CC_x86_64_pc_windows_gnu=x86_64-w64-mingw32-gcc
export CXX_x86_64_pc_windows_gnu=x86_64-w64-mingw32-g++-posix
npm run tauri -- build --target x86_64-pc-windows-gnu --bundles nsis
