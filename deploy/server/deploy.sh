#!/usr/bin/env bash
# Production deploy for diagnostic-center-system.
#
# Installed at /home/deploy/bin/deploy.sh, owned by root (the deploy user can
# run it but not change it). GitHub Actions reaches it only through the forced
# command in ~deploy/.ssh/authorized_keys, so the requested command arrives in
# SSH_ORIGINAL_COMMAND. Run by hand as the deploy user with arguments instead.
#
# This script never connects to the database. A release that adds Prisma
# migrations is refused until an admin has applied them by hand and listed
# them in $APPLIED_MIGRATIONS.
#
#   deploy <sha>    fetch, build, switch, health-check (auto-rollback on failure)
#   prepare <sha>   fetch and build only; does not touch the running site
#   rollback        switch back to the previous successful release
#   status          show the current release and recent history
set -Eeuo pipefail
umask 027

APP_ROOT=/home/deploy/diagnostic
REPO="$APP_ROOT/repo.git"
RELEASES="$APP_ROOT/releases"
SHARED="$APP_ROOT/shared"
CURRENT="$APP_ROOT/current"
HISTORY="$APP_ROOT/history.log"
APPLIED_MIGRATIONS="$APP_ROOT/applied-migrations.txt"
KEEP_RELEASES=3
WEB_PORT=3500 # must match ecosystem.config.cjs

export PATH=/usr/local/bin:/usr/bin:/bin
# Optional overrides (e.g. PATH for a non-system Node install).
[ -f "$APP_ROOT/deploy.env" ] && . "$APP_ROOT/deploy.env"

log() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"; }
die() { log "ERROR: $*"; exit 1; }
trap 'log "FAILED at line $LINENO: $BASH_COMMAND"' ERR

read -r ACTION ARG EXTRA <<<"${SSH_ORIGINAL_COMMAND:-$*}" || true
[ -z "${EXTRA:-}" ] || die "Unexpected arguments"

exec 9>"$APP_ROOT/.deploy.lock"
flock -n 9 || die "Another deploy is already running"

mkdir -p "$SHARED/logs"
exec > >(tee -a "$SHARED/logs/deploy-$(date -u +%Y%m%dT%H%M%SZ).log") 2>&1

valid_sha() { [[ "$1" =~ ^[0-9a-f]{40}$ ]] || die "Not a full commit SHA: $1"; }

link_shared() {
  local dir=$1
  [ -f "$SHARED/env/root.env" ] && ln -sfn "$SHARED/env/root.env" "$dir/.env"
  ln -sfn "$SHARED/env/api.env" "$dir/apps/api/.env"
  # NEXT_PUBLIC_* values are baked in at build time, so these must exist before building.
  [ -f "$SHARED/env/web.env" ] && ln -sfn "$SHARED/env/web.env" "$dir/apps/web/.env"
  [ -f "$SHARED/env/web.env.production" ] && ln -sfn "$SHARED/env/web.env.production" "$dir/apps/web/.env.production"
  mkdir -p "$dir/apps/api/public"
  ln -sfn "$SHARED/uploads" "$dir/apps/api/public/uploads"
}

build_release() {
  local sha=$1 dir="$RELEASES/$1"
  log "Fetching main"
  git --git-dir="$REPO" fetch --quiet --prune origin '+refs/heads/main:refs/remotes/origin/main'
  git --git-dir="$REPO" merge-base --is-ancestor "$sha" refs/remotes/origin/main \
    || die "$sha is not on origin/main"

  if [ -f "$dir/.build-ok" ]; then
    log "Release ${sha:0:7} already built, reusing it"
    return
  fi
  rm -rf "$dir"
  mkdir -p "$dir"
  git --git-dir="$REPO" archive "$sha" | tar -x -C "$dir"
  link_shared "$dir"

  log "Installing dependencies"
  (cd "$dir" && npm ci --no-audit --no-fund)
  log "Building API"
  (cd "$dir" && npm run build --workspace=apps/api)
  log "Building web"
  (cd "$dir" && npm run build --workspace=apps/web)
  touch "$dir/.build-ok"
}

migrations_in() {
  [ -d "$1/apps/api/prisma/migrations" ] || return 0
  find "$1/apps/api/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -printf '%f\n'
}

# Compares migration folders on disk only: anything in the new release that is
# neither in the live release nor listed as applied by hand blocks the deploy.
assert_no_new_migrations() {
  local dir=$1 live new
  live=$(readlink -f "$CURRENT" 2>/dev/null || true)
  if [ -z "$live" ] || [ ! -d "$live" ]; then
    log "No live release yet, skipping migration check (first deploy)"
    return
  fi
  new=$(comm -23 <(migrations_in "$dir" | sort -u) \
                 <({ migrations_in "$live"; cat "$APPLIED_MIGRATIONS" 2>/dev/null; } | sort -u))
  if [ -n "$new" ]; then
    log "This release adds database migrations:"
    printf '  %s\n' $new
    die "Deploys never change the database. Apply these by hand, add their names to $APPLIED_MIGRATIONS, then deploy again."
  fi
}

switch_to() {
  local dir=$1
  ln -sfn "$dir" "$APP_ROOT/current.tmp"
  mv -Tf "$APP_ROOT/current.tmp" "$CURRENT"
  pm2 startOrReload "$CURRENT/ecosystem.config.cjs" --update-env
  pm2 save --force >/dev/null
}

healthy() {
  local i api_port
  api_port=$(grep -E '^API_PORT=' "$SHARED/env/api.env" | head -1 | cut -d= -f2- | tr -d '"'\''[:space:]')
  for i in $(seq 1 30); do
    if curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1:${api_port:-4000}/health" \
      && curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1:${WEB_PORT}/login"; then
      return 0
    fi
    sleep 2
  done
  return 1
}

cleanup_releases() {
  local live
  live=$(readlink -f "$CURRENT")
  ls -1dt "$RELEASES"/*/ 2>/dev/null | sed 's:/$::' | grep -vxF "$live" \
    | tail -n +"$KEEP_RELEASES" | xargs -r rm -rf -- || true
}

deploy() {
  local sha=$1 dir="$RELEASES/$1" prev
  valid_sha "$sha"
  build_release "$sha"
  assert_no_new_migrations "$dir"

  prev=$(readlink -f "$CURRENT" 2>/dev/null || true)
  log "Switching to ${sha:0:7}"
  switch_to "$dir"
  if ! healthy; then
    log "Health check failed"
    if [ -n "$prev" ] && [ "$prev" != "$dir" ]; then
      log "Rolling back to $(basename "$prev")"
      switch_to "$prev"
      healthy && log "Rollback is healthy" || log "Rollback is ALSO unhealthy, check pm2 logs"
    fi
    die "Deploy of ${sha:0:7} failed"
  fi
  printf '%s %s\n' "$(date -u +%FT%TZ)" "$sha" >> "$HISTORY"
  cleanup_releases
  log "Deployed ${sha:0:7}"
}

rollback() {
  local live target
  live=$(basename "$(readlink -f "$CURRENT")")
  target=$(awk '{print $2}' "$HISTORY" 2>/dev/null | grep -vxF "$live" | tail -1 || true)
  [ -n "$target" ] && [ -f "$RELEASES/$target/.build-ok" ] || die "No previous release available"
  log "Rolling back ${live:0:7} -> ${target:0:7}"
  switch_to "$RELEASES/$target"
  healthy || die "Rolled-back release is unhealthy, check pm2 logs"
  printf '%s %s rollback\n' "$(date -u +%FT%TZ)" "$target" >> "$HISTORY"
  log "Rollback complete"
}

status() {
  log "Current: $(basename "$(readlink -f "$CURRENT" 2>/dev/null || echo none)")"
  tail -5 "$HISTORY" 2>/dev/null || true
  pm2 ls
}

case "${ACTION:-}" in
  deploy)   deploy "${ARG:-}" ;;
  prepare)  valid_sha "${ARG:-}"; build_release "$ARG"; log "Prepared ${ARG:0:7}" ;;
  rollback) rollback ;;
  status)   status ;;
  *)        die "Usage: deploy <sha> | prepare <sha> | rollback | status" ;;
esac
