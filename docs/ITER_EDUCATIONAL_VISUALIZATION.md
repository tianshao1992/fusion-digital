# ITER educational browser visualization

## Delivery contract

The public viewer publishes no compact fallback geometry. Its reviewed delivery
is an independently verified 18-file high-detail component bundle of
98,507,692 bytes (roughly 98.5 MB). Each file owns exactly one stable
`ITER_PART__*` identity, is Meshopt-compressed, declares its byte length,
SHA-256, triangle/vertex counts, decoded byte budget and metre-space bounds,
and remains below 24 MiB.
Positions use reviewed per-mesh normalized Int16 encoding, with local
quantization capsules where needed so valid triangles are not dropped. Normal
vectors use the encoder's verified normalized Int8 representation. The release
gate requires zero post-decode degenerate or duplicate triangles,
at most 300 mesh instances per shard, and at most 1,000 for the full bundle.

The large files do not enter the default Sites static archive. The manifest
exposes same-origin `/device-assets/iter-high-detail/v1/*` paths; the Worker
resolves only an exact allow-list to immutable, content-addressed assets.
Unknown paths fail closed. A hydrated internal deployment checks its verified
local copy first; otherwise the Worker uses the configured HTTPS release mirror.
The browser downloads high detail only after explicit user selection, uses at
most two concurrent transfers (one on lower-memory devices), verifies byte
length and SHA-256 before parsing, and reports a load failure rather than
silently substituting unreviewed geometry.

This is visualization geometry, not source CAD. Original EXL-50U or ITER
STEP/STP, B-Rep topology, PMI, authoritative dimensions, tolerances,
manufacturing metadata and private assembly records are not published to
GitHub, Codeup, Git LFS, intranet public downloads or cloud drives. Original
EFIT archives, G-files, psi grids and unredacted experimental data are also
outside this package.

## Reproducible asset recovery

`public/models/iter-public-simplified/model-manifest.json` is committed with the
site. The 18 GLB shards are external runtime assets and are independently locked
by `assets/runtime-assets.lock.json`; the lock records every immutable filename,
byte count and SHA-256. A complete local or internal deployment restores them
with:

```bash
npm run assets:hydrate -- --bundle iter-high-detail-v1 --source-dir "/reviewed/iter-high-detail-v1"
npm run assets:verify
```

An internal stable HTTPS mirror can be selected for the local recovery tool via
`FUSION_ASSET_BASE_URL`. A browser/cloud-drive package such as Baidu Netdisk is
downloaded and extracted manually, then imported without trusting its archive
name:

```bash
npm run assets:hydrate -- --source-dir "/path/to/extracted/iter-high-detail-v1"
npm run assets:verify
```

Sites is built from a clean checkout without the hydrated 18-file directory so
the static archive remains below its roughly 256 MiB limit. The Worker has no
default network source. It can use an explicitly configured
`ITER_HIGH_DETAIL_ASSET_BASE_URL` only when it exactly matches
`https://raw.githubusercontent.com/tianshao1992/fusion-physics-atlas-assets/<lowercase-40-hex-commit>/iter-high-detail-v1`.
Branches, tags, short SHAs, other repositories, redirects and final-URL drift are
rejected; ordinary GitHub Release URLs are therefore not valid runtime mirrors.
Internal self-contained deployments hydrate before build and use the local-first
path. Both modes expose the same reviewed same-origin routes and enforce the same
allow-list. See [runtime asset bootstrap](./ASSET_BOOTSTRAP.md) for Codeup SSH,
mirror staging, Baidu manual import and failure recovery.

## Analytic plasma proxy

The orange ITER plasma is a geometry-only educational proxy derived from the
nominal parameters in Table 2.1-1 of the IAEA/ITER *Summary of the ITER Final
Design Report* (ITER EDA Documentation Series No. 22):

- major radius `R0 = 6.2 m`;
- minor radius `a = 2.0 m`;
- `kappa95 = 1.70`, `delta95 = 0.33`;
- separatrix-reference values `kappa = 1.85`, `delta = 0.49`;
- nominal plasma current `15 MA`, toroidal field `5.3 T`, `q95 = 3.0`;
- nominal plasma volume `837 m3`.

The displayed 95% surface uses the Miller-style parameterization

```text
alpha = asin(delta)
R(theta) = R0 + a cos(theta + alpha sin(theta))
Z(theta) = kappa a sin(theta)
```

and revolves it with `(X,Y,Z)=(R cos(phi), R sin(phi), Z)`. The viewer's Y-up
right-handed map is `(x,y,z)=(X,Z,-Y)` in metres.

The separatrix-reference values are shown only as smooth poloidal reference
contours. They do not define an X point. This feature contains no psi grid,
magnetic axis, open separatrix branches, strike points, diagnostic constraints
or uncertainty, and must not be labelled EFIT, reconstructed equilibrium,
actual LCFS or actual separatrix.

Primary parameter source:
<https://www-pub.iaea.org/MTCD/Publications/PDF/ITER-EDA-DS-22.pdf>

Miller parameterization:
<https://doi.org/10.1063/1.872666>

No ITER Organization endorsement is implied.
