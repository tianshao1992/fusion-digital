const PUBLIC_ROOT = "public/";

export const POSTBUILD_PRUNED_GIT_ASSET_RULES = Object.freeze([
  Object.freeze({
    id: "paramak-tokamak-demo",
    kind: "directory",
    publicPath: "public/models/paramak-tokamak-demo/",
    forbiddenCatalogToken: "/models/paramak-tokamak-demo/",
  }),
  Object.freeze({
    id: "exl50u-secure-preview",
    kind: "directory",
    publicPath: "public/models/exl50u-secure-preview/",
    forbiddenCatalogToken: "/models/exl50u-secure-preview/",
  }),
  Object.freeze({
    id: "paramak-full-device.step",
    kind: "file",
    publicPath: "public/models/paramak-full-device/paramak-full-device.step",
  }),
  Object.freeze({
    id: "fusion-knowledge-index.client-copy",
    kind: "file",
    publicPath: "public/data/fusion-knowledge-index.json",
  }),
]);

export function postbuildPrunedGitAssetRule(id) {
  const rule = POSTBUILD_PRUNED_GIT_ASSET_RULES.find((candidate) => candidate.id === id);
  if (!rule) throw new Error(`Unknown postbuild-pruned Git asset rule: ${id}`);
  return rule;
}

export function postbuildPrunedDistPath(rule) {
  if (!rule?.publicPath?.startsWith(PUBLIC_ROOT)) {
    throw new Error("Postbuild-pruned Git asset path must stay under public/");
  }
  return rule.publicPath.slice(PUBLIC_ROOT.length);
}

export function isPostbuildPrunedGitAssetPath(relativePublicPath) {
  return POSTBUILD_PRUNED_GIT_ASSET_RULES.some((rule) => (
    rule.kind === "file"
      ? relativePublicPath === rule.publicPath
      : relativePublicPath.startsWith(rule.publicPath)
  ));
}
