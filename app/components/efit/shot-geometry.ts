import type { EfitGeometry, EfitManifest, EfitShotId, EfitShotManifest } from './types';

export type EfitGeometryCatalog = Pick<EfitManifest, 'geometry' | 'geometries' | 'shots'>;

export function resolveShotManifest(
  manifest: Pick<EfitManifest, 'shots'> | null | undefined,
  shot: EfitShotId | EfitShotManifest | null | undefined,
): EfitShotManifest | null {
  if (!manifest || shot === null || shot === undefined) return null;
  if (typeof shot === 'object') return shot;
  return manifest.shots.find((candidate) => candidate.shot === shot) ?? null;
}

/**
 * Resolves the exact limiter/grid contract for a shot. An unknown geometryId
 * returns null instead of silently applying another dataset's limiter.
 */
export function resolveShotGeometry(
  manifest: EfitGeometryCatalog | null | undefined,
  shot: EfitShotId | EfitShotManifest | null | undefined,
): EfitGeometry | null {
  if (!manifest) return null;
  const shotManifest = resolveShotManifest(manifest, shot);
  if (!shotManifest) return null;
  if (!shotManifest.geometryId) return manifest.geometry;
  if (manifest.geometry.geometryId === shotManifest.geometryId) return manifest.geometry;
  return manifest.geometries?.find((geometry) => geometry.geometryId === shotManifest.geometryId) ?? null;
}

export function efitShotOptionLabel(
  shot: EfitShotManifest,
  formatFrames: (count: number) => string = (count) => `${count.toLocaleString('zh-CN')} 帧`,
): string {
  const displayableFrames = shot.frames.filter((frame) => frame.quality.state !== 'invalid' && frame.quality.state !== 'missing').length;
  return `#${shot.shot} · ${formatFrames(displayableFrames)}`;
}
