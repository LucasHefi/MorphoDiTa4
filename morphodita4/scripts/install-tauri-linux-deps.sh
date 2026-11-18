#!/usr/bin/env bash
# Ubuntu hosted runners can select a regional mirror with very low throughput.
# Use the signed official Ubuntu archive for this invocation only.
set -euo pipefail
ci_ubuntu_codename=$(. /etc/os-release; printf '%s' "${VERSION_CODENAME:-}")
[[ "$ci_ubuntu_codename" =~ ^[a-z]+$ ]] || { echo 'Expected an Ubuntu release codename' >&2; exit 1; }
ci_ubuntu_sources=$(mktemp /tmp/morphodita-ubuntu-XXXXXX.sources)
trap 'rm -f "$ci_ubuntu_sources"' EXIT
cat > "$ci_ubuntu_sources" <<EOF
Types: deb
URIs: https://archive.ubuntu.com/ubuntu
Suites: $ci_ubuntu_codename ${ci_ubuntu_codename}-updates ${ci_ubuntu_codename}-backports
Components: main restricted universe multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg

Types: deb
URIs: https://security.ubuntu.com/ubuntu
Suites: ${ci_ubuntu_codename}-security
Components: main restricted universe multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
EOF
packages=(libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf)
options=(-o Acquire::Retries=2 -o Acquire::ForceIPv4=true -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 -o Acquire::Languages=none -o Dpkg::Use-Pty=0
         -o "Dir::Etc::sourcelist=$ci_ubuntu_sources" -o Dir::Etc::sourceparts=-)
timeout --kill-after=15s 240s sudo env DEBIAN_FRONTEND=noninteractive apt-get "${options[@]}" update
timeout --kill-after=15s 900s sudo env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt-get "${options[@]}" install -y --no-install-recommends "${packages[@]}"
