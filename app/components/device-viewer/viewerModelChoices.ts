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
 * behaviour. A manifest with anonymous shards is deliberately different:
 * preview is always the initial choice, independent of device capability or a
 * mistakenly ambitious authoring default. High detail can only be reached by
 * a later user action in the viewer.
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
  const anonymousHighDetailRequiresExplicitAction = choices.some(isAnonymousShardChoice);
  if (anonymousHighDetailRequiresExplicitAction) {
    return {
      model: preview,
      declaredDefault,
      autoPreviewApplied: false,
      anonymousHighDetailRequiresExplicitAction: true,
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
  };
}

export function requestedAnonymousQuality(
  choice: ViewerModelChoice,
  userInitiatedHighDetail: boolean,
): 'preview' | 'high' {
  return isAnonymousShardChoice(choice) && userInitiatedHighDetail ? 'high' : 'preview';
}
