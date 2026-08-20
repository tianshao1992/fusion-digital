#!/usr/bin/env bash

set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

ADMIN_EMAIL=${1:-}
SSH_DROPIN=/etc/ssh/sshd_config.d/99-fusiondigital-bootstrap.conf

# Port 443 was used only as a temporary SSH bootstrap path. Reloading sshd
# keeps this already-established session alive while releasing the listener
# for Nginx HTTPS.
cat >"$SSH_DROPIN" <<'EOF'
Port 22
PermitRootLogin prohibit-password
PasswordAuthentication no
PubkeyAuthentication yes
EOF

/usr/sbin/sshd -t
systemctl reload ssh

if ss -H -ltn '( sport = :443 )' | grep -q .; then
  echo "TCP 443 is still occupied after reloading sshd" >&2
  ss -H -ltnp '( sport = :443 )' >&2 || true
  exit 1
fi

CERTBOT_ARGS=(
  certonly
  --nginx
  --non-interactive
  --agree-tos
  --keep-until-expiring
  --cert-name fusiondigital.club
  -d fusiondigital.club
  -d www.fusiondigital.club
)

if [[ -n $ADMIN_EMAIL ]]; then
  CERTBOT_ARGS+=(--email "$ADMIN_EMAIL")
else
  CERTBOT_ARGS+=(--register-unsafely-without-email)
fi

certbot "${CERTBOT_ARGS[@]}"
node /srv/fusiondigital/current/deploy/aliyun-hk/render-nginx-config.mjs \
  --require-tls \
  /srv/fusiondigital/current/deploy/aliyun-hk/nginx.conf \
  /etc/nginx/sites-available/fusiondigital
nginx -t
systemctl reload nginx
systemctl enable --now certbot.timer

curl -fsS --noproxy '*' --connect-timeout 2 --max-time 10 \
  --resolve fusiondigital.club:443:127.0.0.1 \
  -o /dev/null https://fusiondigital.club/
curl -fsS --noproxy '*' --connect-timeout 2 --max-time 10 \
  --resolve www.fusiondigital.club:443:127.0.0.1 \
  -o /dev/null https://www.fusiondigital.club/
HTTP_VERSION=$(curl -fsS --noproxy '*' --connect-timeout 2 --max-time 10 \
  --http2 --resolve fusiondigital.club:443:127.0.0.1 \
  -o /dev/null -w '%{http_version}' https://fusiondigital.club/)
test "$HTTP_VERSION" = 2

echo "HTTPS is active for fusiondigital.club and www.fusiondigital.club."
