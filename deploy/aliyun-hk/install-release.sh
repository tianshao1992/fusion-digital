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
NGINX_CONFIG=/etc/nginx/sites-available/fusiondigital
NGINX_ENABLED=/etc/nginx/sites-enabled/fusiondigital
NGINX_DEFAULT=/etc/nginx/sites-enabled/default
SERVICE_CONFIG=/etc/systemd/system/fusiondigital.service
CONFIG_BACKUP_DIR=""
BUNDLE_SNAPSHOT_DIR=""
EFIT_HEADERS=""
EFIT_BODY=""
ITER_HEADERS=""
ASSET_HEADERS=""
PREVIOUS=""
HAD_NGINX_CONFIG=false
HAD_NGINX_ENABLED=false
HAD_NGINX_DEFAULT=false
HAD_SERVICE_CONFIG=false
FUSIONDIGITAL_WAS_ACTIVE=false
FUSIONDIGITAL_WAS_ENABLED=false
NGINX_WAS_ACTIVE=false
NGINX_WAS_ENABLED=false
TLS_WAS_CONFIGURED=false
TARGET_CREATED_BY_THIS_RUN=false
TRANSACTION_ACTIVE=false

rollback_transaction() {
  echo "restoring the previous Hong Kong deployment transaction" >&2
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
  if $HAD_NGINX_ENABLED; then
    rm -f -- "$NGINX_ENABLED"
    cp -a "$CONFIG_BACKUP_DIR/nginx-enabled" "$NGINX_ENABLED"
  else
    rm -f -- "$NGINX_ENABLED"
  fi
  if $HAD_NGINX_DEFAULT; then
    cp -a "$CONFIG_BACKUP_DIR/nginx-default" "$NGINX_DEFAULT"
  else
    rm -f -- "$NGINX_DEFAULT"
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
  local current_after_rollback=""
  local rollback_proven=false
  trap - EXIT
  if $TRANSACTION_ACTIVE; then
    rollback_transaction
    current_after_rollback=$(readlink -f -- "$CURRENT" 2>/dev/null || true)
    if [[ -n $PREVIOUS && $current_after_rollback == "$PREVIOUS" ]]; then
      rollback_proven=true
    elif [[ -z $PREVIOUS && ! -e $CURRENT && ! -L $CURRENT ]]; then
      rollback_proven=true
    fi
  fi
  set +e
  [[ -z $EFIT_HEADERS ]] || rm -f -- "$EFIT_HEADERS"
  [[ -z $EFIT_BODY ]] || rm -f -- "$EFIT_BODY"
  [[ -z $ITER_HEADERS ]] || rm -f -- "$ITER_HEADERS"
  [[ -z $ASSET_HEADERS ]] || rm -f -- "$ASSET_HEADERS"
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
  if [[ $status -ne 0 ]] && $TARGET_CREATED_BY_THIS_RUN \
    && [[ $TARGET == "$RELEASES_ROOT/$RELEASE" && -d $TARGET \
    && $TARGET != "$PREVIOUS" ]]; then
    current_after_rollback=$(readlink -f -- "$CURRENT" 2>/dev/null || true)
    if [[ $current_after_rollback == "$TARGET" ]]; then
      echo "warning: current still references failed release; retaining $TARGET" >&2
    elif ! $TRANSACTION_ACTIVE || $rollback_proven; then
      rm -rf -- "$TARGET"
    else
      echo "warning: rollback could not be proven; retaining failed release $TARGET" >&2
    fi
  fi
  exit "$status"
}

[[ $RELEASE =~ ^[0-9a-f]{40}([0-9a-f]{24})?$ ]] || usage
[[ $EXPECTED_SHA256 =~ ^[0-9a-f]{64}$ ]] || usage
[[ -f $BUNDLE ]] || { echo "bundle not found: $BUNDLE" >&2; exit 1; }
trap cleanup_on_exit EXIT

for command in install flock; do
  command -v "$command" >/dev/null || {
    echo "missing prerequisite before deployment lock: $command" >&2
    exit 1
  }
done
install -d -m 0755 /run/lock
exec 9>/run/lock/fusiondigital-deploy.lock
flock -n 9 || {
  echo "another FusionDigital deployment is already running" >&2
  exit 1
}

for command in node nginx systemctl curl tar sha256sum find awk realpath readlink \
  getent id cp mv install chown chmod ln rm mktemp wc sleep stat flock gzip cmp grep sort sed; do
  command -v "$command" >/dev/null || {
    echo "missing prerequisite: $command" >&2
    exit 1
  }
done
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 13)) process.exit(1)'
getent passwd fusiondigital >/dev/null || {
  echo "missing runtime user: fusiondigital; complete README section 3 first" >&2
  exit 1
}
id -Gn www-data | grep -qw fusiondigital || {
  echo "www-data must belong to the fusiondigital group; complete README section 3 first" >&2
  exit 1
}
[[ -f $BUNDLE && ! -L $BUNDLE ]] || {
  echo "bundle must be a regular file, not a symbolic link: $BUNDLE" >&2
  exit 1
}
BUNDLE_UID=$(stat -Lc '%u' -- "$BUNDLE")
BUNDLE_MODE=$(stat -Lc '%a' -- "$BUNDLE")
[[ $BUNDLE_UID == 0 ]] || { echo "bundle must be owned by root" >&2; exit 1; }
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

install -d -m 0750 -o root -g fusiondigital /srv/fusiondigital "$RELEASES_ROOT"
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
UNSAFE_EXTRACTED=$(find -P "$PENDING" -mindepth 1 ! -type f ! -type d -print -quit)
[[ -z $UNSAFE_EXTRACTED ]] || { echo "unsafe extracted special file: $UNSAFE_EXTRACTED" >&2; exit 1; }
MULTILINK_EXTRACTED=$(find -P "$PENDING" -mindepth 1 -type f -links +1 -print -quit)
[[ -z $MULTILINK_EXTRACTED ]] || { echo "unsafe extracted hard-linked file: $MULTILINK_EXTRACTED" >&2; exit 1; }
PENDING_REAL=$(realpath -e -- "$PENDING")
while IFS= read -r -d '' EXTRACTED; do
  EXTRACTED_REAL=$(realpath -e -- "$EXTRACTED")
  [[ $EXTRACTED_REAL == "$PENDING_REAL/"* ]] || {
    echo "extracted path escapes pending release: $EXTRACTED -> $EXTRACTED_REAL" >&2
    exit 1
  }
done < <(find -P "$PENDING" -mindepth 1 \( -type f -o -type d \) -print0)

test -f "$PENDING/dist/server/index.js"
test -f "$PENDING/dist/server/ssr/index.js"
test -f "$PENDING/node_modules/vinext/dist/server/prod-server.js"
test -f "$PENDING/deploy/aliyun-hk/server.mjs"
test -f "$PENDING/deploy/aliyun-hk/fusiondigital.service"
test -f "$PENDING/deploy/aliyun-hk/nginx.conf"
test -f "$PENDING/deploy/aliyun-hk/render-nginx-config.mjs"
test -f "$PENDING/deploy/aliyun-hk/certbot-nginx-support.mjs"
test -f "$PENDING/deploy/aliyun-hk/direct-execution.mjs"
test -f "$PENDING/deploy/aliyun-hk/analytics-collector.mjs"
test -f "$PENDING/deploy/aliyun-hk/analytics-store.mjs"
test -f "$PENDING/deploy/aliyun-hk/install-analytics-forwarder.sh"
test -f "$PENDING/deploy/aliyun-hk/fusiondigital-analytics-collector.service"
test -f "$PENDING/deploy/aliyun-hk/fusiondigital-analytics.logrotate"
test -f "$PENDING/.fusiondigital-release.json"
node -e '
  const fs = require("node:fs");
  const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (
    manifest.schemaVersion !== 2
    || manifest.commitSha !== process.argv[2]
    || manifest.mode !== "public-anonymous"
    || manifest.buildTarget !== "aliyun-hk"
    || manifest.deploymentProfile !== "aliyun-hk-production"
  ) process.exit(1);
' "$PENDING/.fusiondigital-release.json" "$RELEASE"

ITER_DIR="$PENDING/dist/client/models/iter-high-detail-v1"
test "$(find "$ITER_DIR" -maxdepth 1 -type f | wc -l)" -eq 18
test "$(find "$ITER_DIR" -maxdepth 1 -type f -printf '%s\n' | awk '{ total += $1 } END { print total + 0 }')" -eq 98507692
test -f "$PENDING/dist/client/data/exl50u-efit/index.json"
test -f "$PENDING/dist/client/data/exl50u-efit-v2/index.json"

ASSET_DIR="$PENDING/dist/client/assets"
PRECOMPRESSED_COUNT=0
while IFS= read -r -d '' ASSET_FILE; do
  test -f "$ASSET_FILE.gz"
  gzip -cd -- "$ASSET_FILE.gz" | cmp -s -- "$ASSET_FILE" -
  PRECOMPRESSED_COUNT=$((PRECOMPRESSED_COUNT + 1))
done < <(find "$ASSET_DIR" -type f \( -name '*.js' -o -name '*.css' \) -size +1023c -print0)
test "$PRECOMPRESSED_COUNT" -gt 0

chown -R root:fusiondigital "$PENDING"
find "$PENDING" -type d -exec chmod 750 {} +
find "$PENDING" -type f -exec chmod 640 {} +
chmod 750 "$PENDING/deploy/aliyun-hk/finalize-https.sh" \
  "$PENDING/deploy/aliyun-hk/install-release.sh" \
  "$PENDING/deploy/aliyun-hk/install-analytics-forwarder.sh"
mv "$PENDING" "$TARGET"
TARGET_CREATED_BY_THIS_RUN=true
PENDING=""
ITER_DIR="$TARGET/dist/client/models/iter-high-detail-v1"

CONFIG_BACKUP_DIR=$(mktemp -d /tmp/fusiondigital-config.XXXXXX)
if [[ -e $NGINX_CONFIG || -L $NGINX_CONFIG ]]; then
  [[ -f $NGINX_CONFIG && ! -L $NGINX_CONFIG ]] || {
    echo "existing Nginx configuration is not a regular file" >&2
    exit 1
  }
  cp -a "$NGINX_CONFIG" "$CONFIG_BACKUP_DIR/nginx.conf"
  HAD_NGINX_CONFIG=true
  grep -Eq '^[[:space:]]*listen[[:space:]]+[^;]*443[^;]*ssl' "$NGINX_CONFIG" \
    && TLS_WAS_CONFIGURED=true
fi
if [[ -e $SERVICE_CONFIG || -L $SERVICE_CONFIG ]]; then
  [[ -f $SERVICE_CONFIG && ! -L $SERVICE_CONFIG ]] || {
    echo "existing systemd unit is not a regular file" >&2
    exit 1
  }
  cp -a "$SERVICE_CONFIG" "$CONFIG_BACKUP_DIR/fusiondigital.service"
  HAD_SERVICE_CONFIG=true
fi
if [[ -L $NGINX_ENABLED ]]; then
  cp -a "$NGINX_ENABLED" "$CONFIG_BACKUP_DIR/nginx-enabled"
  HAD_NGINX_ENABLED=true
elif [[ -e $NGINX_ENABLED ]]; then
  echo "existing enabled Nginx entry is not a symbolic link" >&2
  exit 1
fi
if [[ -e $NGINX_DEFAULT || -L $NGINX_DEFAULT ]]; then
  cp -a "$NGINX_DEFAULT" "$CONFIG_BACKUP_DIR/nginx-default"
  HAD_NGINX_DEFAULT=true
fi
systemctl is-active --quiet fusiondigital && FUSIONDIGITAL_WAS_ACTIVE=true
systemctl is-enabled --quiet fusiondigital 2>/dev/null && FUSIONDIGITAL_WAS_ENABLED=true
systemctl is-active --quiet nginx && NGINX_WAS_ACTIVE=true
systemctl is-enabled --quiet nginx 2>/dev/null && NGINX_WAS_ENABLED=true

TRANSACTION_ACTIVE=true
install -m 0644 "$TARGET/deploy/aliyun-hk/fusiondigital.service" "$SERVICE_CONFIG"
RENDER_ARGS=(
  "$TARGET/deploy/aliyun-hk/nginx.conf"
  "$NGINX_CONFIG"
)
if $TLS_WAS_CONFIGURED; then
  RENDER_ARGS=(--require-tls "${RENDER_ARGS[@]}")
fi
node "$TARGET/deploy/aliyun-hk/render-nginx-config.mjs" "${RENDER_ARGS[@]}"
ln -sfn "$NGINX_CONFIG" "$NGINX_ENABLED"
rm -f "$NGINX_DEFAULT"
nginx -t
systemctl daemon-reload

ln -s "$TARGET" "$NEXT_LINK"
mv -Tf "$NEXT_LINK" "$CURRENT"
systemctl enable fusiondigital nginx >/dev/null
systemctl restart fusiondigital
systemctl restart nginx

TLS_IS_CONFIGURED=false
ORIGIN_URL=http://127.0.0.1
ORIGIN_CURL_ARGS=(--noproxy '*' --connect-timeout 2 --max-time 10 -H 'Host: fusiondigital.club')
if grep -Eq '^[[:space:]]*listen 443 ssl http2;' "$NGINX_CONFIG"; then
  TLS_IS_CONFIGURED=true
  ORIGIN_URL=https://fusiondigital.club
  ORIGIN_CURL_ARGS=(
    --noproxy '*'
    --connect-timeout 2
    --max-time 10
    --resolve fusiondigital.club:443:127.0.0.1
  )
fi

wait_for_health() {
  local attempts=${FUSIONDIGITAL_HEALTH_ATTEMPTS:-30}
  local delay=${FUSIONDIGITAL_HEALTH_DELAY_SECONDS:-1}
  local attempt
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if systemctl is-active --quiet fusiondigital \
      && systemctl is-active --quiet nginx \
      && curl -fsS -o /dev/null "${ORIGIN_CURL_ARGS[@]}" "$ORIGIN_URL/"; then
      return 0
    fi
    sleep "$delay"
  done
  return 1
}

if ! wait_for_health; then
  echo "new release did not become healthy" >&2
  journalctl -u fusiondigital -n 80 --no-pager >&2 || true
  exit 1
fi

curl -fsS -o /dev/null "${ORIGIN_CURL_ARGS[@]}" \
  "$ORIGIN_URL/device-data/exl50u-efit/index.json"

EFIT_GZIP_FILE=$(find "$TARGET/dist/client/data/exl50u-efit-v2" -maxdepth 1 -type f -name '*.jsonl.gz' -printf '%f\n' | LC_ALL=C sort | sed -n '1p')
test -n "$EFIT_GZIP_FILE"
EFIT_HEADERS=$(mktemp)
EFIT_BODY=$(mktemp)
curl -fsS -D "$EFIT_HEADERS" -o "$EFIT_BODY" "${ORIGIN_CURL_ARGS[@]}" \
  -H 'Accept-Encoding: gzip' -H 'Range: bytes=0-1023' \
  "$ORIGIN_URL/device-data/exl50u-efit-v2/$EFIT_GZIP_FILE"
grep -Eq '^HTTP/[0-9.]+ 206' "$EFIT_HEADERS"
grep -Eiq '^Content-Range: bytes 0-1023/' "$EFIT_HEADERS"
grep -Eiq '^Content-Type: application/gzip' "$EFIT_HEADERS"
! grep -Eiq '^Content-Encoding:' "$EFIT_HEADERS"
node -e '
  const body = require("node:fs").readFileSync(process.argv[1]);
  if (body.length < 2 || body[0] !== 0x1f || body[1] !== 0x8b) process.exit(1);
' "$EFIT_BODY"

ITER_FILE=$(find "$ITER_DIR" -maxdepth 1 -type f -name '*.high.meshopt.glb' -printf '%f\n' | LC_ALL=C sort | sed -n '1p')
test -n "$ITER_FILE"
ITER_HEADERS=$(mktemp)
curl -fsS -D "$ITER_HEADERS" -o /dev/null "${ORIGIN_CURL_ARGS[@]}" \
  -H 'Range: bytes=0-1023' \
  "$ORIGIN_URL/device-assets/iter-high-detail/v1/$ITER_FILE"
grep -Eq '^HTTP/[0-9.]+ 206' "$ITER_HEADERS"
grep -Eiq '^Content-Range: bytes 0-1023/' "$ITER_HEADERS"

DIRECT_DATA_STATUS=$(curl -sS -o /dev/null -w '%{http_code}' "${ORIGIN_CURL_ARGS[@]}" \
  "$ORIGIN_URL/data/exl50u-efit/index.json")
test "$DIRECT_DATA_STATUS" = 404

ASSET_FILE=$(find "$TARGET/dist/client/assets" -type f -name '*.js' -size +1023c -printf '%P\n' | LC_ALL=C sort | sed -n '1p')
test -n "$ASSET_FILE"
ASSET_HEADERS=$(mktemp)
curl -fsS -D "$ASSET_HEADERS" -o /dev/null "${ORIGIN_CURL_ARGS[@]}" \
  -H 'Accept-Encoding: gzip' "$ORIGIN_URL/assets/$ASSET_FILE"
grep -Eiq '^Content-Encoding: gzip' "$ASSET_HEADERS"

if $TLS_IS_CONFIGURED; then
  HTTP_VERSION=$(curl -fsS --noproxy '*' --connect-timeout 2 --max-time 10 \
    --http2 --resolve fusiondigital.club:443:127.0.0.1 \
    -o /dev/null -w '%{http_version}' https://fusiondigital.club/)
  test "$HTTP_VERSION" = 2
fi

[[ -f /etc/fusiondigital/analytics.env && ! -L /etc/fusiondigital/analytics.env ]] || {
  echo "root-only analytics secrets must be provisioned before a production release" >&2
  exit 1
}
FUSIONDIGITAL_DEPLOY_LOCK_HELD=1 \
  "$TARGET/deploy/aliyun-hk/install-analytics-forwarder.sh"

TRANSACTION_ACTIVE=false
echo "FusionDigital Hong Kong release $RELEASE is healthy with controlled assets and analytics."
