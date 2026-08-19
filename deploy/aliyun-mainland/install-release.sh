#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "usage: $0 <bundle.tgz> <full-release-sha> <sha256>" >&2
  echo "       $0 --validate-archive-only <bundle.tgz>" >&2
  exit 2
}

validate_release_archive() {
  local bundle=$1
  local path_listing
  local metadata_listing
  local entry
  local entry_type

  [[ -f $bundle ]] || { echo "bundle not found: $bundle" >&2; return 1; }
  command -v tar >/dev/null || { echo "missing prerequisite: tar" >&2; return 1; }

  # Capture each listing so a corrupt archive's non-zero tar status cannot be
  # hidden by process substitution. Escape control characters in names before
  # applying the path checks.
  if ! path_listing=$(LC_ALL=C tar --quoting-style=escape -tzf "$bundle"); then
    echo "unable to list release archive" >&2
    return 1
  fi
  if ! metadata_listing=$(LC_ALL=C tar --quoting-style=escape -tvzf "$bundle"); then
    echo "unable to inspect release archive entry types" >&2
    return 1
  fi
  [[ -n $path_listing && -n $metadata_listing ]] || {
    echo "release archive is empty" >&2
    return 1
  }

  while IFS= read -r entry; do
    [[ -n $entry && $entry != /* && $entry != ".." && $entry != ../* \
      && $entry != */.. && $entry != */../* ]] || {
      echo "unsafe archive entry path: $entry" >&2
      return 1
    }
  done <<< "$path_listing"

  while IFS= read -r entry; do
    entry_type=${entry:0:1}
    [[ $entry_type == "-" || $entry_type == "d" ]] || {
      echo "unsafe archive entry type '$entry_type'; only regular files and directories are allowed" >&2
      return 1
    }
  done <<< "$metadata_listing"
}

if [[ ${1:-} == "--validate-archive-only" ]]; then
  [[ $# -eq 2 ]] || usage
  validate_release_archive "$2"
  echo "release archive contains only safe paths, regular files, and directories"
  exit 0
fi

[[ $# -eq 3 ]] || usage
if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

BUNDLE=$1
RELEASE=$2
EXPECTED_SHA256=${3,,}
RELEASES_ROOT=/srv/fusiondigital/releases
CURRENT=/srv/fusiondigital/current
TARGET="$RELEASES_ROOT/$RELEASE"
PENDING="$RELEASES_ROOT/.${RELEASE}.install.$$"
NEXT_LINK="${CURRENT}.next.$$"
NGINX_CONFIG=/etc/nginx/conf.d/fusiondigital.conf
SERVICE_CONFIG=/etc/systemd/system/fusiondigital.service
CONFIG_BACKUP_DIR=""
BUNDLE_SNAPSHOT_DIR=""
PREVIOUS=""
HAD_NGINX_CONFIG=false
HAD_SERVICE_CONFIG=false
FUSIONDIGITAL_WAS_ACTIVE=false
FUSIONDIGITAL_WAS_ENABLED=false
NGINX_WAS_ACTIVE=false
NGINX_WAS_ENABLED=false
TRANSACTION_ACTIVE=false

rollback_transaction() {
  echo "rolling back current link, Nginx configuration, systemd unit, and service state" >&2
  set +e

  rm -f -- "$NEXT_LINK"
  if [[ -n $PREVIOUS && -d $PREVIOUS ]]; then
    ln -s "$PREVIOUS" "$NEXT_LINK"
    mv -Tf "$NEXT_LINK" "$CURRENT"
  else
    rm -f -- "$CURRENT"
  fi

  if $HAD_NGINX_CONFIG; then
    cp -a "$CONFIG_BACKUP_DIR/nginx.conf" "$NGINX_CONFIG"
  else
    rm -f -- "$NGINX_CONFIG"
  fi
  if $HAD_SERVICE_CONFIG; then
    cp -a "$CONFIG_BACKUP_DIR/fusiondigital.service" "$SERVICE_CONFIG"
  else
    rm -f -- "$SERVICE_CONFIG"
  fi

  systemctl daemon-reload || echo "warning: systemd daemon-reload failed during rollback" >&2
  if $FUSIONDIGITAL_WAS_ENABLED; then
    systemctl enable fusiondigital >/dev/null 2>&1 \
      || echo "warning: could not restore fusiondigital enablement" >&2
  else
    systemctl disable fusiondigital >/dev/null 2>&1 || true
  fi
  if $NGINX_WAS_ENABLED; then
    systemctl enable nginx >/dev/null 2>&1 \
      || echo "warning: could not restore nginx enablement" >&2
  else
    systemctl disable nginx >/dev/null 2>&1 || true
  fi

  if $FUSIONDIGITAL_WAS_ACTIVE; then
    systemctl restart fusiondigital \
      || echo "warning: previous fusiondigital service did not restart" >&2
  else
    systemctl stop fusiondigital >/dev/null 2>&1 || true
  fi
  if nginx -t; then
    if $NGINX_WAS_ACTIVE; then
      systemctl restart nginx \
        || echo "warning: previous nginx service did not restart" >&2
    else
      systemctl stop nginx >/dev/null 2>&1 || true
    fi
  else
    echo "warning: restored Nginx configuration failed validation; running process was left untouched" >&2
  fi
}

cleanup_on_exit() {
  local status=$?
  trap - EXIT
  if $TRANSACTION_ACTIVE; then
    rollback_transaction
  fi
  set +e
  rm -f -- "$NEXT_LINK"
  if [[ -n $PENDING && -d $PENDING ]]; then
    rm -rf -- "$PENDING"
  fi
  if [[ -n $CONFIG_BACKUP_DIR && $CONFIG_BACKUP_DIR == /tmp/fusiondigital-config.* ]]; then
    rm -rf -- "$CONFIG_BACKUP_DIR"
  fi
  if [[ -n $BUNDLE_SNAPSHOT_DIR && $BUNDLE_SNAPSHOT_DIR == /tmp/fusiondigital-bundle.* ]]; then
    rm -rf -- "$BUNDLE_SNAPSHOT_DIR"
  fi
  exit "$status"
}

[[ $RELEASE =~ ^[0-9a-f]{40}([0-9a-f]{24})?$ ]] || usage
[[ $EXPECTED_SHA256 =~ ^[0-9a-f]{64}$ ]] || usage
[[ -f $BUNDLE ]] || { echo "bundle not found: $BUNDLE" >&2; exit 1; }
trap cleanup_on_exit EXIT
for command in node nginx systemctl curl tar sha256sum find awk realpath \
  readlink getent cp mv install chown chmod ln rm mktemp wc sleep stat flock; do
  command -v "$command" >/dev/null || {
    echo "missing prerequisite: $command; run bootstrap-alinux3.sh first" >&2
    exit 1
  }
done
getent passwd fusiondigital >/dev/null || {
  echo "fusiondigital runtime user is missing; run bootstrap-alinux3.sh first" >&2
  exit 1
}
getent passwd nginx >/dev/null || {
  echo "nginx runtime user is missing; run bootstrap-alinux3.sh first" >&2
  exit 1
}

# Serialize every mutable deployment surface. The descriptor remains open for
# the whole process, so EXIT rollback also runs while the lock is held.
exec 9>/run/lock/fusiondigital-deploy.lock
flock -n 9 || {
  echo "another FusionDigital deployment is already running" >&2
  exit 1
}

# A root-owned, non-link, non-writable-by-others source prevents an unprivileged
# process from swapping bundle contents while the private snapshot is made.
[[ -f $BUNDLE && ! -L $BUNDLE ]] || {
  echo "bundle must be a regular file, not a symbolic link: $BUNDLE" >&2
  exit 1
}
BUNDLE_UID=$(stat -Lc '%u' -- "$BUNDLE")
BUNDLE_MODE=$(stat -Lc '%a' -- "$BUNDLE")
[[ $BUNDLE_UID == 0 ]] || {
  echo "bundle must be owned by root" >&2
  exit 1
}
BUNDLE_MODE_OCTAL=$((8#$BUNDLE_MODE))
(( (BUNDLE_MODE_OCTAL & 07022) == 0 )) || {
  echo "bundle must not have special bits or group/world write permissions" >&2
  exit 1
}

BUNDLE_SNAPSHOT_DIR=$(mktemp -d /tmp/fusiondigital-bundle.XXXXXX)
chmod 0700 "$BUNDLE_SNAPSHOT_DIR"
BUNDLE_SNAPSHOT="$BUNDLE_SNAPSHOT_DIR/release.tgz"
install -m 0600 "$BUNDLE" "$BUNDLE_SNAPSHOT"

printf '%s  %s\n' "$EXPECTED_SHA256" "$BUNDLE_SNAPSHOT" | sha256sum --check --strict -
validate_release_archive "$BUNDLE_SNAPSHOT"

install -d -m 0750 -o root -g fusiondigital "$RELEASES_ROOT"
[[ ! -e $TARGET && ! -L $TARGET ]] \
  || { echo "release already exists: $TARGET" >&2; exit 1; }
[[ ! -e $PENDING && ! -L $PENDING ]] \
  || { echo "pending release already exists: $PENDING" >&2; exit 1; }
if [[ -e $CURRENT && ! -L $CURRENT ]]; then
  echo "$CURRENT exists but is not a symbolic link" >&2
  exit 1
fi
if [[ -L $CURRENT ]]; then
  PREVIOUS=$(readlink -f -- "$CURRENT")
  [[ -n $PREVIOUS && -d $PREVIOUS && $PREVIOUS == "$RELEASES_ROOT/"* ]] || {
    echo "current release link does not resolve inside $RELEASES_ROOT" >&2
    exit 1
  }
fi

install -d -m 0750 -o root -g fusiondigital "$PENDING"
tar --no-same-owner --no-same-permissions -xzf "$BUNDLE_SNAPSHOT" -C "$PENDING"

# Defense in depth after extraction: links, devices, sockets, FIFOs and any
# other special files are forbidden. Regular files must also have link count 1.
UNSAFE_EXTRACTED=$(find -P "$PENDING" -mindepth 1 ! -type f ! -type d -print -quit)
[[ -z $UNSAFE_EXTRACTED ]] || {
  echo "unsafe extracted special file: $UNSAFE_EXTRACTED" >&2
  exit 1
}
MULTILINK_EXTRACTED=$(find -P "$PENDING" -mindepth 1 -type f -links +1 -print -quit)
[[ -z $MULTILINK_EXTRACTED ]] || {
  echo "unsafe extracted hard-linked file: $MULTILINK_EXTRACTED" >&2
  exit 1
}
PENDING_REAL=$(realpath -e -- "$PENDING")
while IFS= read -r -d '' extracted; do
  EXTRACTED_REAL=$(realpath -e -- "$extracted")
  [[ $EXTRACTED_REAL == "$PENDING_REAL/"* ]] || {
    echo "extracted path escapes pending release: $extracted -> $EXTRACTED_REAL" >&2
    exit 1
  }
done < <(find -P "$PENDING" -mindepth 1 \( -type f -o -type d \) -print0)

test -f "$PENDING/dist/server/index.js"
test -f "$PENDING/dist/server/ssr/index.js"
test -f "$PENDING/node_modules/vinext/dist/server/prod-server.js"
test -f "$PENDING/deploy/aliyun-mainland/server.mjs"
test -f "$PENDING/deploy/aliyun-mainland/fusiondigital.service"
test -f "$PENDING/deploy/aliyun-mainland/nginx.conf"
test -f "$PENDING/.fusiondigital-release.json"

node -e '
  const fs = require("node:fs");
  const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const allowedTargets = new Set(["aliyun-mainland", "aliyun-vm"]);
  if (
    manifest.schemaVersion !== 2
    || manifest.commitSha !== process.argv[2]
    || manifest.mode !== "public-anonymous"
    || !allowedTargets.has(manifest.buildTarget)
    || manifest.deploymentProfile !== "aliyun-mainland-pre-icp"
  ) process.exit(1);
' "$PENDING/.fusiondigital-release.json" "$RELEASE"

ITER_DIR="$PENDING/dist/client/models/iter-high-detail-v1"
test -d "$ITER_DIR"
ITER_COUNT=$(find "$ITER_DIR" -maxdepth 1 -type f | wc -l)
ITER_BYTES=$(find "$ITER_DIR" -maxdepth 1 -type f -printf '%s\n' \
  | awk '{ total += $1 } END { print total + 0 }')
[[ $ITER_COUNT -eq 18 ]] || {
  echo "ITER file count mismatch: expected 18, observed $ITER_COUNT" >&2
  exit 1
}
[[ $ITER_BYTES -eq 98507692 ]] || {
  echo "ITER byte count mismatch: expected 98507692, observed $ITER_BYTES" >&2
  exit 1
}

chown -R root:fusiondigital "$PENDING"
find "$PENDING" -type d -exec chmod 750 {} +
find "$PENDING" -type f -exec chmod 640 {} +
mv "$PENDING" "$TARGET"
PENDING=""

# Back up every mutable deployment surface and its service state before the
# first configuration write. Any subsequent error activates the EXIT rollback.
CONFIG_BACKUP_DIR=$(mktemp -d /tmp/fusiondigital-config.XXXXXX)
if [[ -e $NGINX_CONFIG || -L $NGINX_CONFIG ]]; then
  [[ -f $NGINX_CONFIG && ! -L $NGINX_CONFIG ]] || {
    echo "existing Nginx configuration is not a regular file" >&2
    exit 1
  }
  cp -a "$NGINX_CONFIG" "$CONFIG_BACKUP_DIR/nginx.conf"
  HAD_NGINX_CONFIG=true
fi
if [[ -e $SERVICE_CONFIG || -L $SERVICE_CONFIG ]]; then
  [[ -f $SERVICE_CONFIG && ! -L $SERVICE_CONFIG ]] || {
    echo "existing systemd unit is not a regular file" >&2
    exit 1
  }
  cp -a "$SERVICE_CONFIG" "$CONFIG_BACKUP_DIR/fusiondigital.service"
  HAD_SERVICE_CONFIG=true
fi
systemctl is-active --quiet fusiondigital && FUSIONDIGITAL_WAS_ACTIVE=true
systemctl is-enabled --quiet fusiondigital 2>/dev/null && FUSIONDIGITAL_WAS_ENABLED=true
systemctl is-active --quiet nginx && NGINX_WAS_ACTIVE=true
systemctl is-enabled --quiet nginx 2>/dev/null && NGINX_WAS_ENABLED=true

TRANSACTION_ACTIVE=true
install -m 0644 "$TARGET/deploy/aliyun-mainland/nginx.conf" "$NGINX_CONFIG"
install -m 0644 "$TARGET/deploy/aliyun-mainland/fusiondigital.service" "$SERVICE_CONFIG"
nginx -t
systemctl daemon-reload

ln -s "$TARGET" "$NEXT_LINK"
mv -Tf "$NEXT_LINK" "$CURRENT"
systemctl enable fusiondigital nginx >/dev/null
systemctl restart fusiondigital
systemctl restart nginx

wait_for_health() {
  local attempts=${FUSIONDIGITAL_HEALTH_ATTEMPTS:-30}
  local delay=${FUSIONDIGITAL_HEALTH_DELAY_SECONDS:-1}
  local attempt
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if systemctl is-active --quiet fusiondigital \
      && systemctl is-active --quiet nginx \
      && curl -fsS -o /dev/null -H 'Host: fusiondigital.club' http://127.0.0.1/; then
      return 0
    fi
    sleep "$delay"
  done
  return 1
}

if ! wait_for_health; then
  echo "new release did not become healthy; restoring the previous deployment transaction" >&2
  journalctl -u fusiondigital -n 80 --no-pager >&2 || true
  exit 1
fi

TRANSACTION_ACTIVE=false
echo "FusionDigital mainland staging release $RELEASE is healthy on HTTP."
echo "Production DNS was not changed; 39.96.61.9 remains pre-ICP staging only."
