import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Color, Matrix4, Vector3, Mesh, MeshStandardMaterial } from 'three';
import { antennaPlacement, ICRF_MODEL } from '../app/components/device-viewer/icrfAntenna.ts';
import { ICRF_APPEARANCE, loadIcrfAntenna } from '../app/components/device-viewer/IcrfAntennaOverlay.ts';

test('outer limiter is user-confirmed R1350; inner geometry is not deformed', () => {
  const result = antennaPlacement();
  assert.ok(Math.abs(result.outerRadiusMm - 1350) < 1e-7);
  assert.ok(Math.abs(result.innerRadiusMm - 1339.229233) < 1e-5);
  const transform = new Matrix4().fromArray(result.matrix);
  assert.ok(Math.abs(transform.determinant() - 1) < 1e-12);
  const radial = new Vector3(0, 0, 1).transformDirection(transform);
  assert.ok(radial.distanceTo(new Vector3(.5, 0, Math.sqrt(3) / 2)) < 1e-12);
  const centre = new Vector3(-.2797425440528398, -.0798140159306009, .2).applyMatrix4(transform);
  assert.ok(Math.abs(centre.y) < 1e-12);
  assert.ok(Math.abs((Math.atan2(-centre.z, centre.x) * 180 / Math.PI + 360) % 360 - 300) < 1e-10);
});

test('all slider radii use cylindrical surface registration with rigid radial movement', () => {
  const reference = antennaPlacement();
  for (const radius of [1100, 1250, 1350, 1421, 1600]) {
    const placement = antennaPlacement(radius);
    assert.ok(Math.abs(placement.outerRadiusMm - radius) < 1e-7);
    assert.deepEqual(placement.matrix.slice(0, 12), reference.matrix.slice(0, 12));
    assert.equal(placement.matrix[13], reference.matrix[13]);
    assert.ok(Math.abs((placement.matrix[14] - reference.matrix[14])
      - Math.sqrt(3) * (placement.matrix[12] - reference.matrix[12])) < 1e-12);
  }
  for (const invalid of [NaN, Infinity, -1, 1099, 1601]) assert.throws(() => antennaPlacement(invalid));
});

test('fine GLB verifies, decodes all 25 meshes, moves without a new fetch, and disposes once', async () => {
  const bytes = await readFile(new URL(`../public${ICRF_MODEL.path}`, import.meta.url));
  assert.equal(bytes.length, ICRF_MODEL.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), ICRF_MODEL.sha256);
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => { fetches++; return new Response(bytes); };
  try {
    const overlay = await loadIcrfAntenna(new AbortController().signal);
    let meshes = 0, triangles = 0, disposed = 0, bodies = 0, limiters = 0, materialsDisposed = 0;
    const materials = new Set<MeshStandardMaterial>();
    overlay.root.traverse((node) => {
      if (!(node as Mesh).isMesh) return;
      const mesh = node as Mesh;
      meshes++;
      triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
      mesh.geometry.addEventListener('dispose', () => disposed++);
      const isLimiter = mesh.name.includes('限制器');
      if (isLimiter) limiters++; else bodies++;
      const style = ICRF_APPEARANCE[isLimiter ? 'limiter' : 'body'];
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        assert.ok(material instanceof MeshStandardMaterial);
        if (!materials.has(material)) material.addEventListener('dispose', () => materialsDisposed++);
        materials.add(material);
        assert.ok(material.color.equals(new Color(style.color)));
        assert.ok(material.emissive.equals(new Color(style.emissive)));
        assert.equal(material.metalness, style.metalness);
        assert.equal(material.roughness, style.roughness);
        assert.equal(material.emissiveIntensity, style.emissiveIntensity);
        assert.equal(material.opacity, 1);
        assert.equal(material.transparent, false);
        assert.equal(material.depthTest, true);
        assert.equal(material.depthWrite, true);
        assert.equal(material.clippingPlanes, null);
      }
    });
    assert.equal(meshes, 25);
    assert.equal(bodies, 9);
    assert.equal(limiters, 16);
    assert.equal(triangles, ICRF_MODEL.triangles);
    overlay.setOptions({ visible: true, radiusMm: 1350 });
    overlay.setOptions({ visible: false, radiusMm: 1410 });
    assert.equal(overlay.root.visible, false);
    assert.equal(overlay.root.userData.radiusMm, 1410);
    assert.equal(fetches, 1);
    overlay.dispose(); overlay.dispose();
    assert.equal(disposed, 25);
    assert.equal(materialsDisposed, materials.size);
    assert.equal(overlay.root.children.length, 0);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(loadIcrfAntenna(controller.signal));
    assert.equal(fetches, 1);
    globalThis.fetch = async () => new Response(new Uint8Array(bytes.length));
    await assert.rejects(loadIcrfAntenna(new AbortController().signal), /digest|SHA|sha|hash/i);
  } finally { globalThis.fetch = originalFetch; }
});
