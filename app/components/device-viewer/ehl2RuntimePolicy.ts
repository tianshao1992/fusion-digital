export const EHL2_VIEWER_ID = 'ehl-2-preliminary';
export const EHL2_MANIFEST_URL = '/models/ehl2-preliminary-v1/model-manifest.json';
export const EHL2_MIN_VIEWPORT_WIDTH = 651;
export const EHL2_MIN_DEVICE_MEMORY_GIB = 4;

export type Ehl2LoadBlockReason = 'mobile' | 'narrow-viewport' | 'save-data' | 'low-memory';

export type Ehl2RuntimeHints = {
  viewportWidth: number;
  saveData: boolean;
  deviceMemoryGiB?: number;
  userAgent?: string;
  userAgentDataMobile?: boolean;
  maxTouchPoints?: number;
};

export type Ehl2RuntimePolicy = {
  allowed: boolean;
  reasons: Ehl2LoadBlockReason[];
};

export function isEhl2ViewerSession(viewerId: string, manifestUrl: string) {
  return viewerId === EHL2_VIEWER_ID || manifestUrl === EHL2_MANIFEST_URL;
}

export function isMobileRuntime(hints: Pick<Ehl2RuntimeHints, 'userAgent' | 'userAgentDataMobile' | 'maxTouchPoints'>) {
  if (hints.userAgentDataMobile === true) return true;
  const userAgent = hints.userAgent ?? '';
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(userAgent)
    || (/Macintosh/i.test(userAgent) && (hints.maxTouchPoints ?? 0) > 1);
}

/**
 * EHL-2 currently has one reviewed 2.47M-triangle derivative and no lower LOD.
 * Fail closed on constrained clients instead of treating that asset as a mobile preview.
 */
export function evaluateEhl2RuntimePolicy(hints: Ehl2RuntimeHints): Ehl2RuntimePolicy {
  const reasons: Ehl2LoadBlockReason[] = [];
  if (isMobileRuntime(hints)) reasons.push('mobile');
  if (!Number.isFinite(hints.viewportWidth) || hints.viewportWidth < EHL2_MIN_VIEWPORT_WIDTH) reasons.push('narrow-viewport');
  if (hints.saveData) reasons.push('save-data');
  if (typeof hints.deviceMemoryGiB === 'number'
    && (!Number.isFinite(hints.deviceMemoryGiB) || hints.deviceMemoryGiB < EHL2_MIN_DEVICE_MEMORY_GIB)) {
    reasons.push('low-memory');
  }
  return { allowed: reasons.length === 0, reasons };
}
