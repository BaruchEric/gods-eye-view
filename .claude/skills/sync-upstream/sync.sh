#!/usr/bin/env bash
# Keep Eric's fork in step with bilawalsidhu/gods-eye-view and gev.beric.ca.
#
#   sync.sh status   fetch, then show main vs origin, upstream and the deployed rev
#   sync.sh merge    fast-forward main to origin/main, then merge upstream/main
#   sync.sh gates    bun install + format, boundaries, layer tokens, tests, build
#   sync.sh push     push main to origin (CI runs there)
#   sync.sh deploy   tag a rollback image, rsync to the mini, rebuild, wait healthy
#   sync.sh all      merge, gates, push, deploy (stops at the first failure)
#
# Exit codes: 0 ok, 1 failure, 2 merge conflict (resolve, commit, rerun "gates").
set -euo pipefail

HOST=macmini-ts
STACK=/opt/stacks/gev
cd "$(git rev-parse --show-toplevel)"

say() { printf '\n== %s\n' "$*"; }
die() { printf 'sync: %s\n' "$*" >&2; exit 1; }

require_clean_main() {
  [ "$(git branch --show-current)" = main ] || die "not on main"
  [ -z "$(git status --porcelain)" ] || die "working tree is dirty; commit or stash first"
}

deployed_rev() {
  ssh -o ConnectTimeout=10 "$HOST" "cat $STACK/.deployed-rev 2>/dev/null" || true
}

cmd_status() {
  git fetch -q origin
  git fetch -q upstream
  local o u d
  o=$(git rev-list --left-right --count main...origin/main)
  u=$(git rev-list --count main..upstream/main)
  d=$(deployed_rev)
  echo "main vs origin/main (ahead behind): $o"
  echo "upstream commits not in main:       $u"
  echo "HEAD:                               $(git rev-parse --short HEAD)"
  echo "deployed on the mini:               ${d:-unknown (no .deployed-rev yet)}"
}

cmd_merge() {
  require_clean_main
  git fetch -q origin
  git fetch -q upstream
  git merge -q --ff-only origin/main || die "main and origin/main have diverged; reconcile by hand"
  local n
  n=$(git rev-list --count main..upstream/main)
  if [ "$n" = 0 ]; then
    echo "upstream has nothing new"
    return 0
  fi
  say "merging $n upstream commits"
  if ! git merge --no-edit upstream/main; then
    git diff --name-only --diff-filter=U
    echo "sync: merge conflict. Keep the fork changes listed in DEPLOY.md, commit, then run gates." >&2
    exit 2
  fi
}

cmd_gates() {
  say "bun install"
  bun install --no-save
  # Upstream ships package-lock.json; bun writes bun.lock anyway, so drop it.
  if git ls-files --error-unmatch bun.lock >/dev/null 2>&1; then :; else rm -f bun.lock; fi

  local logs failed=0
  logs=$(mktemp -d)
  say "gates (logs in $logs)"
  bun run format:check >"$logs/format.log" 2>&1 & local p1=$!
  bun run check:boundaries >"$logs/boundaries.log" 2>&1 & local p2=$!
  bun run layer-token:check -- --base-ref origin/main >"$logs/tokens.log" 2>&1 & local p3=$!
  bun run build >"$logs/build.log" 2>&1 & local p4=$!
  for pair in format:$p1 boundaries:$p2 tokens:$p3 build:$p4; do
    local name=${pair%%:*} pid=${pair##*:}
    if wait "$pid"; then echo "pass  $name"; else echo "FAIL  $name ($logs/$name.log)"; failed=1; fi
  done
  # Tests run alone: the launcher tests have 30s timeouts that trip when the
  # build competes for the CPU.
  if bun run test >"$logs/test.log" 2>&1; then echo "pass  test"; else echo "FAIL  test ($logs/test.log)"; failed=1; fi
  grep -E '^ℹ (tests|pass|fail) ' "$logs/test.log" || true
  [ "$failed" = 0 ] || die "gates failed"
}

cmd_push() {
  require_clean_main
  git push origin main
}

cmd_deploy() {
  require_clean_main
  say "rollback tag"
  ssh "$HOST" bash -s <<'EOF'
set -euo pipefail
if docker image inspect gev-app:local >/dev/null 2>&1; then
  tag="rollback-$(docker image inspect -f '{{.Created}}' gev-app:local | cut -c1-16 | tr -d ':-')"
  docker tag gev-app:local "gev-app:$tag"
  echo "tagged gev-app:$tag"
  # Keep only the newest rollback image.
  docker images gev-app --format '{{.Tag}}' | grep '^rollback-' | sort -r | tail -n +2 |
    while read -r old; do docker rmi "gev-app:$old" >/dev/null && echo "removed gev-app:$old"; done
fi
EOF

  say "rsync to $HOST:$STACK"
  # /cache and /.deployed-rev exist only on the mini; --delete would remove them.
  rsync -az --delete --exclude node_modules --exclude dist --exclude .git --exclude .env \
    --exclude /cache --exclude /.gev-cache --exclude /.deployed-rev ./ "$HOST:$STACK/"

  say "docker compose up -d --build"
  ssh "$HOST" "cd $STACK && docker compose up -d --build 2>&1 | tail -5"

  say "waiting for healthy"
  ssh "$HOST" bash -s <<'EOF'
for _ in $(seq 1 36); do
  s=$(docker inspect -f '{{.State.Health.Status}}' gev-app 2>/dev/null || echo missing)
  [ "$s" = healthy ] && { echo healthy; exit 0; }
  sleep 5
done
echo "gev-app is $s after 3 minutes"; docker logs --tail 30 gev-app; exit 1
EOF

  say "probing the gated API with beric-gate's headers"
  # A healthy container can still 403 every cost endpoint behind the gate.
  # POST to nearby-places costs nothing: 405 means the same-site gate let it
  # through, 403 means it did not. The credential panel must stay closed
  # (preview never mounts it, so 404; a 403 is also fine).
  ssh "$HOST" "docker exec -i gev-app node --input-type=module" <<'EOF'
const headers = {
  origin: 'https://gev.beric.ca', 'sec-fetch-site': 'same-origin',
  'x-forwarded-host': 'gev.beric.ca', 'x-forwarded-proto': 'http',
  'x-forwarded-for': '100.64.0.7', 'content-type': 'application/json',
};
const post = (path) => fetch('http://localhost:4173' + path, { method: 'POST', headers, body: '{}' }).then((r) => r.status);
const places = await post('/api/google/nearby-places');
const keys = await post('/api/setup/keys');
console.log(`nearby-places -> ${places} (want 405), setup/keys -> ${keys} (want 403 or 404)`);
process.exit(places === 405 && [403, 404].includes(keys) ? 0 : 1);
EOF

  git rev-parse HEAD | ssh "$HOST" "cat > $STACK/.deployed-rev"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' https://gev.beric.ca/)
  echo "https://gev.beric.ca/ -> $code (401 is the beric-gate login, which is expected)"
  case $code in 200|302|401) ;; *) die "unexpected status from gev.beric.ca" ;; esac
}

case ${1:-status} in
  status) cmd_status ;;
  merge) cmd_merge ;;
  gates) cmd_gates ;;
  push) cmd_push ;;
  deploy) cmd_deploy ;;
  all)
    cmd_merge
    if [ "$(git rev-list --count origin/main..main)" = 0 ] && [ "$(deployed_rev)" = "$(git rev-parse HEAD)" ]; then
      echo "already in sync: origin and the mini both run $(git rev-parse --short HEAD)"
      exit 0
    fi
    cmd_gates; cmd_push; cmd_deploy ;;
  *) sed -n '2,11p' "$0"; exit 1 ;;
esac
