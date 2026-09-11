import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

const routeExpectations = [
  ['app/page.tsx', 'See the device.'],
  ['app/physics/page.tsx', 'Physics simulation'],
  ['app/engineering/page.tsx', 'Engineering simulation'],
  ['app/control/page.tsx', 'Integrated control is not every loop in one program'],
  ['app/diagnostics/page.tsx', 'Diagnostics &amp; sensing'],
  ['app/ai/page.tsx', 'AI for fusion'],
  ['app/facilities/page.tsx', 'Global fusion facilities'],
  ['app/platform/page.tsx', 'Platform architecture'],
  ['app/account/page.tsx', 'This deployment is the public anonymous edition'],
  ['app/research-review/page.tsx', 'The public site displays published material only'],
  ['app/search/page.tsx', 'Papers, code &amp; answers'],
  ['app/knowledge-graph/page.tsx', 'Knowledge graph'],
  ['app/roadmap/page.tsx', 'Development roadmap'],
];

test('all principal routes expose a deliberate English rendering branch', async () => {
  for (const [file, marker] of routeExpectations) {
    const source = await read(file);
    assert.match(source, /StaticLocaleContent|locale\s*===?\s*['"]en['"]/, `${file} must select content by locale`);
    assert.ok(source.includes(marker), `${file} is missing its reviewed English marker: ${marker}`);
  }
});

test('server-rendered route metadata is locale-aware', async () => {
  const files = [
    'app/layout.tsx',
    'app/account/page.tsx',
    'app/control/page.tsx',
    'app/diagnostics/page.tsx',
    'app/knowledge-graph/page.tsx',
    'app/platform/page.tsx',
    'app/research-review/page.tsx',
    'app/roadmap/page.tsx',
    'app/search/page.tsx',
  ];
  for (const file of files) {
    const source = await read(file);
    assert.match(source, /generateMetadata/, `${file} must localize metadata`);
    assert.match(source, /LOCALE_COOKIE_NAME/, `${file} metadata must depend on the locale cookie`);
    assert.match(source, /resolveLocale/, `${file} metadata must normalize the locale`);
  }
});

test('editorial photographs are local, credited and bounded for delivery', async () => {
  const credits = JSON.parse(await read('public/photos/credits.json'));
  assert.equal(credits.photos.length, 2);
  for (const photo of credits.photos) {
    assert.match(photo.source, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    assert.match(photo.license_url, /^https:\/\/creativecommons\.org\/licenses\//);
    assert.ok(photo.author && photo.device && photo.changes);
    const image = await readFile(path.join(root, 'public/photos', photo.file));
    assert.equal(image.readUInt16BE(0), 0xffd8, 'documentary image is a JPEG, not a generated placeholder');
    assert.ok(image.length < 600_000, 'each editorial photo stays under 600 kB');
  }
  const home = await read('app/page.tsx');
  assert.match(home, /fetchPriority="high"/);
  assert.match(home, /loading="lazy"/);
  assert.match(home, /<FusionTwinSystemMap/);
  assert.match(home, /<PhaseOneRoadmap/);
  assert.match(home, /<MultiDeviceWorkspace/);
  assert.match(home, /knowledgeModules\.map/);
  assert.doesNotMatch(home, /https:\/\/upload\.wikimedia\.org/, 'page loads local images without a Wikimedia runtime dependency');
});

test('research catalogues never publish unreviewed Chinese prose in English mode', async () => {
  const files = [
    'app/ai/AIResearchCatalog.tsx',
    'app/control/ControlResearchCatalog.tsx',
    'app/diagnostics/DiagnosticsResearchCatalog.tsx',
  ];
  for (const file of files) {
    const source = await read(file);
    assert.match(source, /useI18n/, `${file} must read the active locale`);
    assert.match(source, /English (?:abstract|editorial review)/, `${file} must expose a reviewed-English fallback policy`);
    assert.match(source, /primary source/i, `${file} must retain primary-source access in English mode`);
  }
});

test('expert terminology uses physical and reconstruction semantics', async () => {
  const messages = await read('app/i18n/messages.ts');
  for (const term of [
    '3D assembly',
    'diagnostic coverage',
    'physics traces',
    'Physical shot time',
    'EFIT reconstruction timebase',
    'LCFS major-radius bounds (Rmin / Rmax)',
    'Vacuum toroidal field at Rcentr',
    'Major radius R / m',
    'High detail',
  ]) {
    assert.ok(messages.includes(term), `messages.ts is missing terminology: ${term}`);
  }
});

test('roadmap phase headers and gates receive the active language explicitly', async () => {
  const roadmap = await read('app/roadmap/page.tsx');
  assert.match(roadmap, /<PhaseHeader[^>]+en=\{en\}/);
  assert.match(roadmap, /<GateStrip[^>]+en=\{en\}/);
  assert.match(roadmap, /function PhaseHeader\([^)]*\ben\b/);
  assert.match(roadmap, /function GateStrip\([^)]*\ben\b/);
});
