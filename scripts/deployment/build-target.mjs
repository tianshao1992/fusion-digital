export const PUBLIC_ANONYMOUS_MODE = 'public-anonymous';
export const SITES_BUILD_TARGET = 'sites';
export const ALIYUN_BUILD_TARGETS = Object.freeze([
  'aliyun-hk',
  'aliyun-mainland',
  'aliyun-vm',
]);

export function validateDeploymentBuildTarget(target, mode) {
  const supportedTargets = new Set([SITES_BUILD_TARGET, ...ALIYUN_BUILD_TARGETS]);
  if (!supportedTargets.has(target)) {
    throw new Error(`Unsupported FUSIONDIGITAL_BUILD_TARGET: ${target}.`);
  }
  if (ALIYUN_BUILD_TARGETS.includes(target) && mode !== PUBLIC_ANONYMOUS_MODE) {
    throw new Error(
      `Aliyun VM builds require NEXT_PUBLIC_FUSIONDIGITAL_MODE=${PUBLIC_ANONYMOUS_MODE}.`,
    );
  }
  return {
    target,
    isSites: target === SITES_BUILD_TARGET,
    isAliyunVm: ALIYUN_BUILD_TARGETS.includes(target),
  };
}
