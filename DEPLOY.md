# Deploying this fork to gev.beric.ca

This is Eric's fork of [bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view).
Upstream is unchanged except for three things, all in `vite.config.js` and `.env.example`:

- `withPreviewParity()` mounts every `/api` proxy on `vite preview` too, so the
  built `dist/` can be served by the same config in a container.
- `googleServerKey()` lets the server-side Google calls (Places, Street View) use
  `GOOGLE_PLACES_API_KEY`, so the browser key stays HTTP-referrer restricted.
- An explicit `preview` block (host, `PREVIEW_PORT`, allowedHosts).

## Where it runs

macmini-2018 (Ubuntu, Docker; ssh alias `macmini-ts`), stack `/opt/stacks/gev`
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
rsync -az --delete --exclude node_modules --exclude dist --exclude .git --exclude .env ./ macmini-ts:/opt/stacks/gev/
ssh macmini-ts 'cd /opt/stacks/gev && docker compose up -d --build'
```

`./cache` on the mini is bind-mounted to `/app/.gev-cache` so the proxy caches
(terrain heights, TomTom, adsbdb) survive a recreate; the terrain upstream is
slow enough that a cold cache alone produced 502s.

The image build (`npm ci` + `vite build`) runs on the mini and takes a few
minutes; `GOOGLE_MAPS_API_KEY` must be in `.env` before the build because it is
a build arg.

## Keeping up with upstream

```bash
git remote add upstream https://github.com/bilawalsidhu/gods-eye-view.git
git fetch upstream && git merge upstream/main
```

The patches above are small and live at the bottom of `vite.config.js`; merge
conflicts there are expected to be trivial.
