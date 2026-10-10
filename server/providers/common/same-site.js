import { admitSameSiteRequest } from '../../../src/localRequestGate.mjs';

/**
 * Fork (gev.beric.ca): the app runs behind beric-gate, which adds forwarding
 * headers and replaces Host with the container name, so the upstream gate
 * refuses every request. GEV_PUBLIC_ORIGIN names the one public origin. When
 * it is set, this gate tolerates proxy headers and requires a present Origin
 * to equal that origin exactly; Sec-Fetch-Site is still checked. The
 * credential panel and /mcp keep refusing proxied requests.
 * @param {Record<string, string | undefined>} env
 * @returns {URL | null}
 */
export function configuredPublicOrigin(env = {}) {
  const raw = String(env.GEV_PUBLIC_ORIGIN || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return ['http:', 'https:'].includes(url.protocol)
      ? new URL(url.origin)
      : null;
  } catch {
    return null;
  }
}

/**
 * Cross-site request gate for cost-bearing and log endpoints. Feeds the
 * request to the pure, unit-tested `admitSameSiteRequest` and answers 403
 * itself when the request is refused. Returns true when it has already
 * responded (the caller returns); false when the handler should continue.
 * Refuses cross-site browser requests (foreign or opaque Origin, a
 * Sec-Fetch-Site other than same-origin/none, or reverse-proxy headers) while
 * keeping loopback non-browser tools and the HOST=0.0.0.0 LAN opt-in working.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean} True when a 403 was sent.
 */
export function admitSameSite(req, res, env = process.env) {
  const publicOrigin = configuredPublicOrigin(env);
  const verdict = publicOrigin
    ? admitSameSiteRequest({
        hostHeader: publicOrigin.host,
        protocol: publicOrigin.protocol,
        origin: req.headers?.origin,
        secFetchSite: req.headers?.['sec-fetch-site'],
      })
    : admitSameSiteRequest({
        hostHeader: req.headers?.host,
        protocol: req.socket?.encrypted ? 'https:' : 'http:',
        origin: req.headers?.origin,
        secFetchSite: req.headers?.['sec-fetch-site'],
        proxyHeaders: req.headers || {},
      });
  if (verdict.ok) return false;
  res.statusCode = verdict.status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ error: verdict.error }));
  return true;
}

/**
 * Wrap a middleware handler so cross-site requests are refused with 403
 * before the handler runs. Loopback tools and same-origin browser requests
 * pass straight through.
 * @param {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next?: Function) => unknown} handler
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next?: Function) => unknown}
 */
export function sameSiteGated(handler) {
  return (req, res, next) => {
    if (admitSameSite(req, res)) return undefined;
    return handler(req, res, next);
  };
}
