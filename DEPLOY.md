# Deploying this fork to gev.beric.ca

This is Eric's fork of [bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view).
The fork retains the Docker deployment and persistent proxy caches. Upstream
now supplies preview-server API parity and a separate server-side Google key.
The local compatibility changes are:

- `GOOGLE_PLACES_API_KEY` remains an alias for upstream's
  `GOOGLE_MAPS_SERVER_API_KEY`; the upstream name takes precedence when both
  are set, then the browser key is the fallback.
- The standalone Vite config honors `HOST` and `PREVIEW_PORT` for preview.
- Compose explicitly allows the `gev-app` and `gev.beric.ca` Host headers.
  Binding to all interfaces retains upstream's Host-header checks.
- Compose sets `GEV_PUBLIC_ORIGIN=https://gev.beric.ca`. Upstream's same-site
  gate refuses any request with proxy headers, and beric-gate adds them, so
  voice, HUD summaries, Places and Mapillary all returned 403. With the
  variable set, `server/providers/common/same-site.js` tolerates proxy headers
  and requires the browser's Origin to equal that value. The credential panel
  and `/mcp` still refuse proxied requests.
  The same variable makes `server/providers/common/rate-limit.js` key the
  per-client limits on beric-gate's `X-Gate-User` instead of the socket
  address, which is the gate's for every request.
- The runtime image includes upstream's `build/`, `server/`, and `scripts/`
  modules, which the Vite config and API providers now import.

## Where it runs

macmini-2018 (Omarchy, Docker; ssh alias `macmini-ts`), stack `/opt/stacks/gev`
(this repo rsynced there, `.env` added by hand). The container is `gev-app` on the
mini's `web` network with no host port and no Traefik labels. The public hostname
is a file-provider route in the NAS Traefik
(`homelab/services/traefik/dynamic/gev.yml`) to `beric-gate` on the mini
(`~/dev/homelab/services/beric-gate`, LAN port 3020), which enforces the
email-invite gate, roles and the anonymous mode, then proxies to
`http://gev-app:4173`.

## Keys

- GCP project `gev-beric` (billing: My Billing Account 1). Two API keys:
  the browser key (Map Tiles API only, referrers `https://gev.beric.ca/*`) goes
  in `GOOGLE_MAPS_API_KEY` and is baked into the bundle at build time; the
  server key (Places API New + Street View Static, no referrer restriction)
  goes in `GOOGLE_PLACES_API_KEY`.
- `OPENAI_API_KEY` powers voice and HUD summaries. beric-gate only lets
  members reach those routes; anonymous visitors never spend it.
- `OPENSKY_AUTH_MODE=anon` works without an account (rate-limited).
- Not wired yet (layers stay empty or simulated): `FIRMS_MAP_KEY`,
  `TOMTOM_API_KEY`, `AISSTREAM_API_KEY`, `CESIUM_ION_TOKEN`. All free-tier
  signups; drop them into the mini's `.env` and recreate the container.

## Ship

```bash
cd ~/dev/web-apps/gods-eye-view
rsync -az --delete --exclude node_modules --exclude dist --exclude .git --exclude .env --exclude /cache --exclude /.gev-cache ./ macmini-ts:/opt/stacks/gev/
ssh macmini-ts 'cd /opt/stacks/gev && docker compose up -d --build'
```

`./cache` on the mini is bind-mounted to `/app/.gev-cache` so the proxy caches
(terrain heights, TomTom, adsbdb) survive a recreate; the terrain upstream is
slow enough that a cold cache alone produced 502s. The rsync excludes `/cache`
because the repo has no such folder, so `--delete` would otherwise wipe it.

The image build (`npm ci` + `vite build`) runs on the mini and takes a few
minutes; `GOOGLE_MAPS_API_KEY` must be in `.env` before the build because it is
a build arg.

## Keeping up with upstream

```bash
# One-time setup if upstream is not already configured:
# git remote add upstream https://github.com/bilawalsidhu/gods-eye-view.git
git fetch upstream && git merge upstream/main
```

When merging, retain the deployment files and compatibility changes above
alongside upstream's provider and security updates.
