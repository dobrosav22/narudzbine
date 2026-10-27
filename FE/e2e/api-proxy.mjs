// Local-only HTTPS front for the synthetic backend (BE/operations/README.md "Synthetic developer API").
//
// The backend's browser transport needs https origins, `__Host-` Secure cookies and same-site
// (schemeful) web/API origins, while the synthetic backend listens on plain http loopback. This
// proxy terminates TLS with the web dev server's self-signed localhost certificate:
//
//   browser mode (default, port 18443): passes Origin/Cookie through — what apps/web uses.
//   native mode  (--native, port 18444): strips Origin and cookies so the Expo *web* build can
//     exercise the NATIVE bearer transport from a browser (real devices never need this), and
//     answers CORS for the Expo web origin itself.
//
// Usage: node e2e/api-proxy.mjs [--native] [--target http://127.0.0.1:18080] [--port N]
import { createServer } from 'node:https';
import { request } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const native = args.includes('--native');
const target = new URL(option('--target', process.env.API_TARGET ?? 'http://127.0.0.1:18080'));
const port = Number(option('--port', native ? 18444 : 18443));
if (!['127.0.0.1', 'localhost', '::1'].includes(target.hostname)) throw new Error('Only a loopback backend may be proxied.');

const certificates = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'certificates');
const keyFile = join(certificates, 'localhost-key.pem');
const certFile = join(certificates, 'localhost.pem');
if (!existsSync(keyFile)) {
  throw new Error(`No dev certificate at ${keyFile}. Run "pnpm dev:cert" (openssl) to create it.`);
}

const NATIVE_DROP = new Set(['origin', 'cookie', 'referer']);

createServer({ key: readFileSync(keyFile), cert: readFileSync(certFile) }, (incoming, outgoing) => {
  const origin = incoming.headers.origin;
  if (native && incoming.method === 'OPTIONS') {
    // The Expo web dev origin is not a backend browser origin; answer its preflight locally.
    outgoing.writeHead(204, {
      'Access-Control-Allow-Origin': origin ?? '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': incoming.headers['access-control-request-headers'] ?? 'Content-Type,Authorization',
      'Access-Control-Max-Age': '300',
    });
    outgoing.end();
    return;
  }
  const headers = { ...incoming.headers, host: target.host };
  if (native) for (const name of NATIVE_DROP) delete headers[name];
  const upstream = request(
    { hostname: target.hostname, port: target.port, path: incoming.url, method: incoming.method, headers },
    (response) => {
      const responseHeaders = { ...response.headers };
      if (native) {
        delete responseHeaders['set-cookie'];
        responseHeaders['access-control-allow-origin'] = origin ?? '*';
        responseHeaders['access-control-expose-headers'] = 'X-Request-Id, Retry-After, Location, Content-Disposition';
      }
      outgoing.writeHead(response.statusCode ?? 502, responseHeaders);
      response.pipe(outgoing);
    },
  );
  upstream.on('error', (error) => {
    outgoing.writeHead(502, { 'Content-Type': 'application/problem+json' });
    outgoing.end(JSON.stringify({ type: 'about:blank', title: 'Local proxy could not reach the backend', status: 502, code: 'SERVICE_UNAVAILABLE', requestId: '', errors: [], detail: String(error.message) }));
  });
  incoming.pipe(upstream);
}).listen(port, 'localhost', () => {
  console.log(`API proxy (${native ? 'native' : 'browser'}) https://localhost:${port} -> ${target.origin}`);
});
