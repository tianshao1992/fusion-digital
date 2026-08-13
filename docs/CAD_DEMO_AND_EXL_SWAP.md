# CAD demo and EXL-50U device-package swap

## Multi-device catalog

The public `/digital-prototype` route now presents one licence-aware catalog for Paramak, EXL-50U and ITER. Paramak is the only online geometry package because its generator and derivative are redistributable. The detected EXL-50U 2026-upgrade assembly remains `controlled-local` until written public-display authority and a reviewed desensitized derivative are recorded. ITER remains `restricted-local` and its geometry is never requested by the public route. The browser-safe catalog is `public/models/device-catalog.json`; it contains no local path, signed URL, source CAD or restricted derivative.

Switch and overlay are separate capabilities. Public switching may show the metadata and authority state of every device, but overlay accepts only online packages with an approved common coordinate frame. The local controlled workbench may compare the three sources without copying their geometry into this repository or the deployment archive.

## One-day demonstrator boundary

The public CAD demo is a browser interaction and data-contract prototype, not a PLM, CAE post-processor or engineering authority. It deliberately uses the MIT-licensed Paramak model already stored in the repository. It provides:

- lazy loading with a static poster and WebGL fallback;
- a searchable assembly tree driven by stable part IDs;
- 3D picking, selection highlighting, hide/show, isolate, reset, wireframe and one X clipping plane;
- a part property panel and visible public-data disclaimer;
- browser-safe provenance, unit, coordinate-frame, access-classification and asset hashes.

It does **not** contain or download ITER engineering CAD. It does not claim that the Paramak geometry represents ITER, EXL-50U or any operating device. It does not run CAE, display measured fields or make engineering/safety decisions.

## DeviceManifest contract

The authoring schema is [`public/models/device-manifest.schema.json`](../public/models/device-manifest.schema.json). The viewer loads one manifest before it loads geometry. Important fields are:

| Field | Purpose |
| --- | --- |
| `devicePackage.kind`, `authority` | Distinguish a public demonstrator from controlled engineering data and declare authority. |
| `access` | Classification, redistribution right and engineering-use statement. Public viewer rejects non-`PUBLIC` packages. |
| `coordinateSystem` | Linear unit, up axis, handedness and source-to-web scale. |
| `assets` | Browser GLB, optional source CAD/poster, byte size and SHA-256 provenance. |
| `systems[].parts[]` | System taxonomy, stable part ID, human label, exact GLB node name and engineering tag. |
| `generator` | Tool/version/repository/licence provenance. |
| `disclaimer` | Human-readable applicability boundary. |

The JSON manifest is browser-safe metadata. It must not carry restricted dimensions, materials, sensor locations, analysis parameters, signed URLs, internal object-store keys or solver credentials.

## Swapping to EXL-50U

1. Export a **desensitized browser derivative** from the approved EXL-50U CAD baseline. Preserve the authoritative source in PLM/PDM; do not place it in `public/`.
2. Clean the assembly, remove hidden/sensitive detail, assign persistent engineering part IDs, tessellate, create LODs and export GLB. Keep each selectable item as a named node.
3. Create a new device folder and manifest, for example `/models/exl-50u-public-demo/model-manifest.json`, conforming to schema 1.1.
4. Replace every Paramak system/part entry with the approved EXL-50U taxonomy. `parts[].nodeName` must match the GLB node name; `parts[].id` and `engineeringTag` should remain stable across geometry revisions.
5. Set the real unit/frame conversion and recompute every asset SHA-256/byte count. Declare licence, classification and engineering-use rights explicitly.
6. Change only the viewer's `MANIFEST_URL` (or make it a server-approved route parameter). The tree, selection, clipping and property UI do not need to be rewritten.
7. Before deployment, verify classification, visual leakage, geometry/metadata mapping, load performance, mobile fallback, licence, and review approval.

For a controlled engineering workspace, do not use a public URL switch. Resolve the approved package server-side after authentication and authorization, issue short-lived asset URLs, log access and enforce the selected revision/baseline.

## Public versus controlled asset isolation

| Public community site | Controlled engineering workspace |
| --- | --- |
| Open Paramak or formally approved desensitized derivative | Authoritative or engineering-reference EXL-50U CAD/CAE data |
| Anonymous access; only `PUBLIC` manifests | SSO, role/project/baseline authorization and audit |
| CDN/static GLB and public provenance | Private object store/PLM references and expiring signed delivery |
| No internal geometry, material, sensor or CAE parameters | Native CAD, mesh, materials, boundary conditions, fields and validation evidence |
| Educational interaction only | Version-pinned engineering workflows, V&V and review gates |

The same UI contract can serve both environments, but the asset resolver, access control and data store must remain separate. Never copy a controlled package into the public site's `public/` directory.
