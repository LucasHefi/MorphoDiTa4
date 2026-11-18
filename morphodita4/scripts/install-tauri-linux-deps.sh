#!/usr/bin/env bash
# GitHub Ubuntu runner only: bounded, noninteractive installation of build headers.
set -euo pipefail
packages=(libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf)
options=(-o Acquire::Retries=2 -o Acquire::http::Timeout=25 -o Acquire::https::Timeout=25 -o Dpkg::Use-Pty=0)
install_packages() {
  timeout 300s sudo env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt-get "${options[@]}" install -y --no-install-recommends "${packages[@]}"
}
# Hosted images usually already have usable Ubuntu indices. Avoid refreshing
# unrelated third-party repositories when the required packages are available.
if install_packages; then
  exit 0
fi
# Refresh Ubuntu's own index on Ubuntu 24.04; do not change runner source files.
if [[ -f /etc/apt/sources.list.d/ubuntu.sources ]]; then
  options+=(-o Dir::Etc::sourcelist=/etc/apt/sources.list.d/ubuntu.sources -o Dir::Etc::sourceparts=-)
fi
timeout 180s sudo env DEBIAN_FRONTEND=noninteractive apt-get "${options[@]}" update
install_packages
