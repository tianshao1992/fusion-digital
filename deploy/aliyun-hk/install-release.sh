#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "usage: $0 <bundle.tgz> <release-id> <sha256> <config-dir>" >&2
  exit 2
}

[[ $# -eq 4 ]] || usage

BUNDLE=$1
RELEASE=$2
EXPECTED_SHA256=$3
CONFIG_DIR=$4

[[ $RELEASE =~ ^[0-9a-f]{7,40}$ ]] || usage
[[ $EXPECTED_SHA256 =~ ^[0-9a-fA-F]{64}$ ]] || usage
[[ -f $BUNDLE ]] || { echo "bundle not found: $BUNDLE" >&2; exit 1; }
[[ -f $CONFIG_DIR/server.mjs ]] || { echo "server.mjs not found" >&2; exit 1; }
[[ -f $CONFIG_DIR/fusiondigital.service ]] || { echo "systemd unit not found" >&2; exit 1; }
[[ -f $CONFIG_DIR/nginx.conf ]] || { echo "nginx config not found" >&2; exit 1; }

printf '%s  %s\n' "${EXPECTED_SHA256,,}" "$BUNDLE" | sha256sum --check --strict -

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg nginx certbot python3-certbot-nginx

install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" \
  > /etc/apt/sources.list.d/nodesource.list
apt-get update
apt-get install -y nodejs
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 13)) process.exit(1)'

if ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
  if [[ ! -e /swapfile ]]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile
fi
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness=10' > /etc/sysctl.d/90-fusiondigital.conf
sysctl --system >/dev/null

if ! getent passwd fusiondigital >/dev/null; then
  adduser --system --group --home /srv/fusiondigital fusiondigital
fi
usermod -aG fusiondigital www-data

install -d -m 0750 -o root -g fusiondigital /srv/fusiondigital /srv/fusiondigital/releases
TARGET="/srv/fusiondigital/releases/$RELEASE"
[[ ! -e $TARGET ]] || { echo "release already exists: $TARGET" >&2; exit 1; }
install -d -m 0750 -o root -g fusiondigital "$TARGET"
tar -xzf "$BUNDLE" -C "$TARGET"
install -d -m 0750 "$TARGET/deploy/aliyun-hk"
install -m 0640 "$CONFIG_DIR/server.mjs" "$TARGET/deploy/aliyun-hk/server.mjs"
install -m 0640 "$CONFIG_DIR/README.md" "$TARGET/deploy/aliyun-hk/README.md"
install -m 0640 "$CONFIG_DIR/fusiondigital.service" "$TARGET/deploy/aliyun-hk/fusiondigital.service"
install -m 0640 "$CONFIG_DIR/nginx.conf" "$TARGET/deploy/aliyun-hk/nginx.conf"

test -f "$TARGET/dist/server/index.js"
test -f "$TARGET/dist/server/ssr/index.js"
test -f "$TARGET/node_modules/vinext/dist/server/prod-server.js"
ITER_DIR="$TARGET/dist/client/models/iter-high-detail-v1"
test "$(find "$ITER_DIR" -maxdepth 1 -type f | wc -l)" -eq 18
test "$(find "$ITER_DIR" -maxdepth 1 -type f -printf '%s\n' | awk '{ total += $1 } END { print total + 0 }')" -eq 98507692

chown -R root:fusiondigital "$TARGET"
find "$TARGET" -type d -exec chmod 750 {} +
find "$TARGET" -type f -exec chmod 640 {} +
ln -sfn "$TARGET" /srv/fusiondigital/current

install -m 0644 "$TARGET/deploy/aliyun-hk/fusiondigital.service" /etc/systemd/system/fusiondigital.service
install -m 0644 "$TARGET/deploy/aliyun-hk/nginx.conf" /etc/nginx/sites-available/fusiondigital
ln -sfn /etc/nginx/sites-available/fusiondigital /etc/nginx/sites-enabled/fusiondigital
rm -f /etc/nginx/sites-enabled/default

systemctl daemon-reload
systemctl enable --now fusiondigital
nginx -t
systemctl restart nginx

curl -fsS -o /dev/null -H 'Host: fusiondigital.club' http://127.0.0.1/
systemctl is-active --quiet fusiondigital
systemctl is-active --quiet nginx

echo "FusionDigital release $RELEASE is ready on HTTP."
