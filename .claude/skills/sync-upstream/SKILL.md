---
name: sync-upstream
description: Bring Eric's gods-eye-view fork up to date with bilawalsidhu/gods-eye-view, verify it, push it to origin (BaruchEric/gods-eye-view) and redeploy gev.beric.ca on the Mac mini. Use when Eric says "sync with origin", "sync with upstream", "pull main", "pull upstream", "update the fork", "catch up with bilawal", "redeploy gev", or asks whether the fork or the live site is behind.
---

# Sync the fork with upstream

The fork has three copies that drift apart:

| Copy | Where |
|---|---|
| upstream | `upstream/main`, github.com/bilawalsidhu/gods-eye-view |
| origin | `origin/main`, github.com/BaruchEric/gods-eye-view (CI only, no deploy hook) |
| live | `/opt/stacks/gev` on macmini-2018 (`ssh macmini-ts`), served at gev.beric.ca behind beric-gate |

`sync.sh` in this folder does every step. Run it from the repo root:

```bash
.claude/skills/sync-upstream/sync.sh status   # how far behind each copy is
.claude/skills/sync-upstream/sync.sh all      # merge, gates, push, deploy
```

`all` exits early when origin and the mini already run HEAD. Use the single
steps (`merge`, `gates`, `push`, `deploy`) to resume after a failure.

## Authorization

Invoking this skill with a sync request ("sync", "update the fork") is Eric's
go-ahead to push main to origin and redeploy. For a question ("is the fork
behind?"), run `status` only and report.

## When a step fails

- **Exit 2 on merge.** Upstream conflicts with fork changes. Keep the fork
  compatibility changes listed in `DEPLOY.md` (Places key alias, preview
  `HOST`/`PREVIEW_PORT`, `GEV_ALLOWED_HOSTS`, `GEV_PUBLIC_ORIGIN` in
  `server/providers/common/same-site.js`, the Dockerfile's runtime copies),
  take upstream for everything else, commit, then run `gates`.
- **Gates.** Upstream CI runs the same checks, so a failure usually means a
  bad conflict resolution. The log path is printed next to the failing gate.
  Two allocation microbenchmarks skip on Node 26; that is expected locally.
- **Deploy unhealthy.** The script prints the last 30 log lines. Roll back with
  `ssh macmini-ts 'cd /opt/stacks/gev && docker tag gev-app:rollback-<stamp> gev-app:local && docker compose up -d --no-build --force-recreate'`.
  Each deploy keeps only the newest rollback image.

## Things that bit before

- `rsync --delete` without `--exclude /cache` wiped the mini's proxy cache,
  and a cold terrain cache causes 502s. The script excludes it.
- `bun install` writes `bun.lock` even with `--no-save`. Upstream uses
  `package-lock.json`, so the script deletes the untracked `bun.lock`.
- `layer-token:check` needs `--base-ref origin/main`; bare, it prints usage
  and exits 1.
- Upstream's same-site gate 403s every proxied request, which silently broke
  voice, HUD summaries and Places behind beric-gate. A container health check
  and a page load do not catch it, so `deploy` probes the gated API with
  beric-gate's headers and fails if the gate refuses it.
- The mini records the deployed commit in `/opt/stacks/gev/.deployed-rev`.

## Report

End with what merged (commit count, notable upstream areas), gate results,
the CI run for the push (`gh run list -R BaruchEric/gods-eye-view -L 1`), and
the deploy status.
