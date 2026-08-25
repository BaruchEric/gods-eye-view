# Deploying this fork to gev.beric.ca

This is Eric's fork of [bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view).
Upstream is unchanged except for three things, all in `vite.config.js` and `.env.example`:

- `withPreviewParity()` mounts every `/api` proxy on `vite preview` too, so the
  built `dist/` can be served by the same config in a container.
- `googleServerKey()` lets the server-side Google calls (Places, Street View) use
  `GOOGLE_PLACES_API_KEY`, so the browser key stays HTTP-referrer restricted.
- An explicit `preview` block (host, `PREVIEW_PORT`, allowedHosts).

## Where it runs

QNAP Container Station, stack `/share/Arik/compose/gev` (this repo rsynced there,
`.env` added by hand). The container is `gev-app` on the shared `web` network with
no Traefik labels. The public hostname is routed by `beric-gate`
(`~/dev/homelab/services/beric-gate`), which enforces the email-invite gate,
roles and the anonymous mode, then proxies to `http://gev-app:4173`.

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
  signups; drop them into the NAS `.env` and recreate the container.

## Ship

```bash
NAS=~/.claude/plugins/cache/homelab/homelab/0.1.0/skills/qnap-nas/scripts/nas
cd ~/dev/web-apps/gods-eye-view
$NAS push ./ /share/Arik/compose/gev/            # rsync (node_modules, dist, .git excluded by the nas script? no: pass --exclude, see below)
$NAS compose -f /share/Arik/compose/gev/docker-compose.yml up -d --build
```

Use `rsync -a --exclude node_modules --exclude dist --exclude .git ...` if the
push helper is not available. The image build (`npm ci` + `vite build`) runs on
the NAS and takes a few minutes; `GOOGLE_MAPS_API_KEY` must be in `.env` before
the build because it is a build arg.

## Keeping up with upstream

```bash
git remote add upstream https://github.com/bilawalsidhu/gods-eye-view.git
git fetch upstream && git merge upstream/main
```

The patches above are small and live at the bottom of `vite.config.js`; merge
conflicts there are expected to be trivial.
