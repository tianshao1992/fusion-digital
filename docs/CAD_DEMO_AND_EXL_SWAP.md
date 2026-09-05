# CAD demo and EXL-50U device-package release

## Multi-device catalog

The public `/digital-prototype` route uses the licence-aware catalog in
`public/models/device-catalog.json`. Paramak, the EXL-50U 2026 upgrade, the EXL-50U integrated
general assembly, EHL-2 and ITER are separate device packages with separate provenance and
authority statements. The earlier state in which EXL-50U was represented only by raster
turntables and ITER was `metadata-only` is historical; it is not the active release contract.

The EXL-50U integrated general assembly is a public, anonymous, non-engineering visualization
derivative. Its runtime package contains exactly:

- one digest-named Meshopt preview GLB, loaded first; and
- twenty digest-named high-detail Meshopt GLBs, loaded serially only after explicit user intent.

The twenty high-detail files are anonymous transport shards. They are not systems, parts, a BOM,
or a source assembly tree. The package exposes no source labels, materials, PMI, dimension
annotations, authoritative dimension tables, local paths or source CAD. Approximate metre-scale
bounds are retained only for browser framing and must not be used for measurement or engineering
decisions.

ITER is also an online public visualization derivative. Its eighteen reviewed high-detail files and
the twenty-one EXL-50U general-assembly files are external runtime bundles; neither bundle is stored
in the application Git repository.

Switch and overlay remain separate capabilities. Public switching may show each device's metadata
and authority state. Overlay is allowed only for packages with an approved common comparison frame;
the EXL-50U general assembly is not overlay-eligible.

## Demonstrator boundary

The public CAD experience is a browser interaction and data-contract demonstrator, not a PLM, a CAE
post-processor or an engineering authority. Depending on the selected approved package, it provides:

- lazy loading with a preview or static fallback;
- selection, visibility/isolation, opacity and clipping supported by that package;
- browser-safe provenance, access classification, byte counts and SHA-256 digests; and
- explicit source-authority and non-engineering-use notices.

It does not contain or download engineering-authoritative EXL-50U, EHL-2 or ITER CAD. It does not
claim that Paramak represents an operating device, run CAE, display unlabelled measured fields, or
make engineering or safety decisions.

## DeviceManifest contract

The authoring schema is
[`public/models/device-manifest.schema.json`](../public/models/device-manifest.schema.json). The
viewer loads a manifest before geometry. For the EXL-50U general assembly, schema `1.4` fixes the
following structure:

| Field | Purpose |
| --- | --- |
| `devicePackage.kind`, `authority` | Declare a public simplified derivative with illustrative authority. |
| `access` | Require `PUBLIC`, redistribution allowed and engineering use forbidden. |
| `coordinateSystem` | Record display units and axes without claiming dimensional authority. |
| `assets.webModel` | Declare the one preview path, bytes, SHA-256, geometry metrics and bounds. |
| `assets.shardBundles[0]` | Declare the one high-detail bundle and its exactly twenty anonymous shards. |
| `derivationEvidence` | Record the exact v8 seven-key evidence: selected attempt, anonymous source cleaning, sloppy preview visual LOD with `selectedTargetTriangleRatio = 0.03` and `simplifierNormalizedErrorLimit = 0.02`, high QEM fixed to attempt ratios `0.70/0.65`, independent output cleaning, high partition and zero-missing coverage, including only the canonical visual-QA receipt rather than private source identities. |
| `systems` | Expose only the anonymous visualization grouping required by the viewer. |
| `generator`, `disclaimer` | Record the public projection pipeline and non-engineering-use boundary. |

The manifest must not contain `assets.sourceCad`, restricted dimensions, materials, sensor locations,
analysis parameters, signed URLs, internal object-store keys or solver credentials.

## Activating or replacing the EXL-50U general assembly

1. Keep the authoritative STEP/CAD, BOM, PMI and source assembly metadata in the controlled
   engineering environment. They must never enter the application repository, public asset
   repository, Sites archive or Hong Kong release.
2. Export and review the anonymous public derivative. The accepted release must contain one preview
   and twenty high-detail transport shards, with every route, byte count and SHA-256 derived from the
   reviewed files. Its exact v8 evidence must fix sloppy `previewVisualLod` to target ratio 0.03 and
   simplifier max error 0.02, and distinguish it from `highQem` fixed to attempt ratios 0.70/0.65,
   close each tier's independent `outputCleaning`, and reconcile `highPartition` geometry chunks with
   the decoded GLBs. High QEM must retain at least
   `floor(0.98 * selectedTargetTriangleRatio * sourceInputCleaning.sanitizedTriangles)` aggregate
   triangles; this floor does not apply to the sloppy preview. The canonical ten-view gate must report silhouette IoU >= 0.97 and normalized
   depth p99 <= 0.02. Twenty is the transport-shard count, not necessarily the geometry-chunk count.
   Keep the complete visual report, QEM evidence, source manifest, `geometryAccounting`, source
   paths/digests and definition/occurrence IDs outside both repositories; publish only anonymous
   evidence and receipt SHA-256 values. The total twenty-one-file package remains capped at 300 MiB.
3. Publish those twenty-one GLBs under
   `exl50u-general-assembly-v1/` in an immutable asset-repository commit. The same asset commit must
   also contain the locked `iter-high-detail-v1/` bundle used by that application release.
4. Project only `model-manifest.json` and `PUBLICATION-NOTICE.md` into
   `public/models/exl50u-general-assembly-v1/`; activate the catalog, generate the exact Worker
   allow-list and refresh `assets/runtime-assets.lock.json`.
5. Commit the manifest, notice, catalog, generated allow-list and runtime lock atomically in the same
   application commit. Removing the manifest to fall back to the historical `metadata-only` state is
   not a valid release shortcut.
6. Run tracked-asset checks without hydrated GLBs, then hydrate and verify both external bundles in a
   separate complete-asset workspace before release testing.

For Hong Kong production, both external bundles are hydrated into the immutable release and served
locally. For OpenAI Sites, neither bundle enters the static archive: the Worker fetches only exact
allow-listed digest paths from two raw GitHub roots. Both roots must use the same 40-character asset
commit SHA, and successful GLB responses use `Cache-Control: public, max-age=31536000, immutable`.
Branches, tags, short SHAs, redirects and client-selected upstream URLs are rejected.

## Public versus controlled asset isolation

| Public community site | Controlled engineering workspace |
| --- | --- |
| Approved Paramak or desensitized visualization derivatives | Authoritative or engineering-reference EXL-50U CAD/CAE data |
| Anonymous access; only `PUBLIC` manifests | SSO, role/project/baseline authorization and audit |
| Digest-locked static GLB and public provenance | Private object store/PLM references and expiring delivery |
| No source CAD, BOM, PMI, source assembly tree, materials or CAE parameters | Native CAD, mesh, materials, boundary conditions, fields and validation evidence |
| Educational interaction only | Version-pinned engineering workflows, V&V and review gates |

The UI contract may serve both environments, but the asset resolver, access control and data store
must remain separate. Never copy a controlled package into the public site's `public/` directory or
into the external public asset repository.
