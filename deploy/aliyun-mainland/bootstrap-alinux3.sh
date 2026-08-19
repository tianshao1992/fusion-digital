#!/usr/bin/env bash

set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

# This profile is intentionally pinned to the image tested on 2026-08-19:
# Alibaba Cloud Linux 3 (OpenAnolis Edition), x86_64, dnf, nginx 1.24.0,
# Node.js 24.19.0 and npm 11.17.0.
source /etc/os-release
if [[ ${ID:-} != "alinux" || ${VERSION_ID:-} != 3* ]]; then
  echo "unsupported OS: expected Alibaba Cloud Linux 3, observed ${PRETTY_NAME:-unknown}" >&2
  exit 1
fi
if [[ $(uname -m) != "x86_64" ]]; then
  echo "unsupported architecture: expected x86_64" >&2
  exit 1
fi
if command -v getenforce >/dev/null && [[ $(getenforce) == "Enforcing" ]]; then
  echo "SELinux enforcing mode has not been qualified for this staging profile" >&2
  exit 1
fi

dnf install -y ca-certificates curl tar gzip nginx

NODE_SETUP=$(mktemp /tmp/fusiondigital-nodesource-24.XXXXXX.sh)
cleanup() {
  rm -f "$NODE_SETUP"
}
trap cleanup EXIT
curl -fsSL https://rpm.nodesource.com/setup_24.x -o "$NODE_SETUP"
bash "$NODE_SETUP"
dnf install -y nodejs

EXPECTED_NODE_VERSION=24.19.0
ACTUAL_NODE_VERSION=$(node -p 'process.versions.node')
if [[ $ACTUAL_NODE_VERSION != "$EXPECTED_NODE_VERSION" ]]; then
  echo "Node.js version mismatch: expected $EXPECTED_NODE_VERSION, observed $ACTUAL_NODE_VERSION" >&2
  echo "Review and update the qualified version before continuing." >&2
  exit 1
fi

if ! getent group fusiondigital >/dev/null; then
  groupadd --system fusiondigital
fi
if ! getent passwd fusiondigital >/dev/null; then
  useradd --system --gid fusiondigital --create-home --home-dir /srv/fusiondigital \
    --shell /sbin/nologin fusiondigital
fi
getent passwd nginx >/dev/null || { echo "nginx runtime user is missing" >&2; exit 1; }
usermod -aG fusiondigital nginx

install -d -m 0750 -o root -g fusiondigital \
  /srv/fusiondigital /srv/fusiondigital/releases

nginx -t
systemctl enable --now nginx

echo "Qualified mainland staging prerequisites are ready."
echo "OS: ${PRETTY_NAME}; kernel: $(uname -r)"
echo "Node: $(node --version); npm: $(npm --version); $(nginx -v 2>&1)"
