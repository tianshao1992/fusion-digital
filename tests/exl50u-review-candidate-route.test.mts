import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseDeviceCatalog } from '../app/digital-prototype/deviceCatalog';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('EXL-50U review route is isolated from the formal metadata-only catalog card', async () => {
  const [reviewRaw, formal, page] = await Promise.all([
    readFile(join(ROOT, 'public/models/exl50u-general-assembly-review-candidate.json'), 'utf8').then(JSON.parse),
    readFile(join(ROOT, 'public/models/device-catalog.json'), 'utf8').then(JSON.parse),
    readFile(join(ROOT, 'app/review/exl50u-general-assembly/page.tsx'), 'utf8'),
  ]);
  const review = parseDeviceCatalog(reviewRaw);
  assert.equal(review.devices.length, 1);
  assert.equal(review.devices[0].availability, 'review-candidate');
  assert.match(review.devices[0].statement, /USER_VISUAL_REVIEW_REQUIRED/u);
  assert.match(review.devices[0].statement, /productionEligible=false/u);
  assert.equal(
    review.devices[0].viewer.manifestEndpoint,
    '/device-assets/exl50u-general-assembly/v1/model-manifest.json',
  );
  const formalCard = formal.devices.find((device: { id?: string }) => device.id === 'exl50u-general-assembly-20260630');
  assert.equal(formalCard.viewer.mode, 'metadata-only');
  assert.equal(formalCard.viewer.manifestEndpoint, null);
  assert.equal(formalCard.delivery, 'local-only');
  assert.match(page, /视觉验收中/u);
  assert.match(page, /productionEligible=false/u);
});
