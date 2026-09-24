import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import manifest from '../public/data/exl50u-mdsplus-snapshot-v1/manifest.json' with { type: 'json' };

// Vite infers HTTP Content-Encoding from .gz. These reviewed gzip files are
// application payloads: browsers must receive their original bytes for hashing.
// Production asset delivery is unchanged; this is an exact-allowlist dev route.
export function fusionDataPreview(): Plugin {
  const prefix = '/data/exl50u-mdsplus-snapshot-v1/';
  if (manifest.shots.some(({ path }) => !/^shot-\d+(?:\.exl50u-imas-\d{8}-r\d+)?\.jsonl\.gz$/.test(path))) {
    throw new Error('Invalid FusionData preview asset path');
  }
  const allowed = new Map(manifest.shots.map(({ path }) => [`${prefix}${path}`, `${prefix.slice(1)}${path}`]));
  allowed.set('/device-data/exl50u-fieldlines-v1/index.json', 'data/exl50u-fieldlines-v1/index.json');
  for (const [shot, count] of [[21066, 49], [21138, 51]]) for (let part = 0; part < count; part++) {
    const name = `shot-${shot}-part-${String(part).padStart(3, '0')}.jsonl.gz`;
    allowed.set(`/device-data/exl50u-fieldlines-v1/${name}`, `data/exl50u-fieldlines-v1/${name}`);
  }
  return {
    name: 'fusion-data-raw-gzip-preview',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
        const filename = allowed.get(pathname);
        if (!filename || !['GET', 'HEAD'].includes(request.method ?? '')) return next();
        const file = resolve(server.config.root, 'public', filename);
        void stat(file).then(({ size }) => {
          response.setHeader('Content-Type', filename.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/gzip');
          response.setHeader('Content-Length', size);
          response.setHeader('Cache-Control', 'no-store');
          response.setHeader('X-Content-Type-Options', 'nosniff');
          response.removeHeader('Content-Encoding');
          if (request.method === 'HEAD') return response.end();
          createReadStream(file).on('error', () => response.destroy()).pipe(response);
        }).catch(() => { response.statusCode = 404; response.end('Not found'); });
      });
    },
  };
}
