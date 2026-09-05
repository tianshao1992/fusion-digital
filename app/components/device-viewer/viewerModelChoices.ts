import type {
  DeviceAnonymousShardBundle,
  DeviceComponentBundle,
  DeviceManifest,
  DeviceWebModelVariant,
} from '../deviceManifest';

export type MonolithicViewerModel = DeviceWebModelVariant & { delivery: 'monolithic' };
export type ViewerModelChoice = MonolithicViewerModel | DeviceComponentBundle | DeviceAnonymousShardBundle;

export type InitialViewerModelChoice = {
  model: ViewerModelChoice | null;
  declaredDefault: ViewerModelChoice | null;
  autoPreviewApplied: boolean;
  anonymousHighDetailRequiresExplicitAction: boolean;
  anonymousHighOnly: boolean;
};

/**
 * Normalises every reviewed delivery shape into the choices rendered by the
 * viewer. Anonymous shards remain a transport-level quality choice: they are
 * never converted into component identities or an assembly tree.
 */
export function viewerModelChoices(manifest: DeviceManifest | null): ViewerModelChoice[] {
  if (!manifest) return [];
  const compatibilityModels = manifest.assets.webModel ? [{
    ...manifest.assets.webModel,
    id: 'standard',
    label: '标准',
    quality: 'preview' as const,
    default: true,
  }] : [];
  const monolithic = (manifest.assets.webModels ?? compatibilityModels)
    .map((asset) => ({ ...asset, delivery: 'monolithic' as const }));
  return [
    ...monolithic,
    ...(manifest.assets.componentBundles ?? []),
    ...(manifest.assets.shardBundles ?? []),
  ];
}

export function isAnonymousShardChoice(
  choice: ViewerModelChoice | null | undefined,
): choice is DeviceAnonymousShardBundle {
  return choice?.delivery === 'shards';
}

export function isAnonymousVisualizationManifest(manifest: DeviceManifest | null): boolean {
  return Boolean(manifest?.assets.shardBundles?.length);
}

/**
 * Existing device packages keep their declared/default and constrained-device
 * behaviour. Legacy anonymous packages with a preview still start at that
 * preview and require an explicit high-detail action. A reviewed high-only
 * anonymous package starts its sole shard bundle automatically on capable
 * desktops, while constrained devices keep the same explicit launch gate.
 */
export function initialViewerModelChoice(
  choices: readonly ViewerModelChoice[],
  preferPreviewForConstrainedDevice: boolean,
): InitialViewerModelChoice {
  const preview = choices.find((asset) => asset.quality === 'preview') ?? null;
  const declaredDefault = choices.find((asset) => 'default' in asset && asset.default === true)
    ?? preview
    ?? choices[0]
    ?? null;
  const anonymousShard = choices.find(isAnonymousShardChoice) ?? null;
  const anonymousHighOnly = Boolean(anonymousShard && !preview);
  if (anonymousShard) {
    return {
      model: preview ?? anonymousShard,
      declaredDefault,
      autoPreviewApplied: false,
      anonymousHighDetailRequiresExplicitAction: Boolean(preview || preferPreviewForConstrainedDevice),
      anonymousHighOnly,
    };
  }
  const autoPreviewApplied = Boolean(
    preferPreviewForConstrainedDevice
      && preview
      && declaredDefault
      && preview.id !== declaredDefault.id,
  );
  return {
    model: autoPreviewApplied ? preview : declaredDefault,
    declaredDefault,
    autoPreviewApplied,
    anonymousHighDetailRequiresExplicitAction: false,
    anonymousHighOnly: false,
  };
}

export function requestedAnonymousQuality(
  choice: ViewerModelChoice,
  userInitiatedHighDetail: boolean,
): 'preview' | 'high' {
  return isAnonymousShardChoice(choice) && userInitiatedHighDetail ? 'high' : 'preview';
}
