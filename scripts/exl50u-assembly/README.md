# EXL-50U integrated-assembly derivative pipeline

This directory defines the reproducible conversion contract for a future
public, simplified EXL-50U integrated-assembly card. It contains tooling and a
public resource profile only. It does **not** contain source CAD, private STEP
labels, a BOM, author metadata, local source paths, or a publishable device
asset.

The method deliberately follows the reviewed EXL-50U and EHL-2 browser-model
workflows:

```text
private CAD
  -> private system-level STEP exports preserving the common assembly origin
  -> streaming source audit
  -> bounded XCAF tessellation in metres
  -> one reviewed QEM pass per definition and LOD
  -> delivered-Float32 geometry cleanup
  -> raw system GLBs + role-bound private provenance records
  -> one eight-node preview GLB + one eight-node high GLB + aggregate records
  -> Float32 POSITION + Int8 NORMAL + EXT_meshopt_compression
  -> encoded-artifact records
  -> exact runtime geometry, provenance and privacy QA
```

The important difference is at ingestion: an oversized whole-device STEP is
never the normal conversion input. Export one private STEP per approved public
system from the authoritative CAD workstation. Each export must retain the
same world placement and common origin; it must not be re-centred. Do not
export PMI, drawings, BOM tables, author metadata, or source filesystem paths.
The browser derivative retains the common-origin geometry's approximate metre
scale for visual framing. That does not publish PMI, dimension annotations or
authoritative dimension tables, and the resulting coordinates must not be used
for measurement, design or manufacturing.

The private mapping from source files to the generic public system IDs in
`profile.public.json` stays beside the source evidence and never enters Git or
a release archive.

The source audit hash and reviewed profile hash are carried into each system
record. Aggregation verifies all eight role-specific records and emits a device
record; Meshopt verifies that record and emits one final encoding record. The
runtime QA command verifies the complete chain. Renaming a preview file to
`high`, substituting a system file, or editing an intermediate therefore fails
before publication.

## Fixed delivery choices

- Preview and high are independent derivatives from each system STEP. Preview
  is never reduced from an already reduced high asset.
- A definition receives at most one QEM pass for a given role. Later chunk and
  aggregate stages remove only invalid or duplicate Float32-delivered faces.
- Position remains non-normalized Float32 so thin diagnostic geometry does not
  collapse on a device-wide Int16 grid. Normals use normalized signed Int8 and
  Meshopt provides transport compression.
- The source contract is metre-scale, right-handed and Z-up. Browser delivery
  is metre-scale, right-handed and Y-up using `(x, y, z) -> (x, z, -y)`.
- One compact whole-device preview is the initial download. High is a second,
  user-selected whole-device LOD, matching the current EXL-50U/EHL-2 runtime
  path. System files remain private build intermediates, not public shards.
- Public node names, colors and triangle budgets come only from the strict
  public profile; the build CLI cannot override them.

## Private Windows build sequence

Use the pinned environment recorded in `environment.win-64.yml`. Create it
outside every Git checkout, set `FUSIONDIGITAL_CADQUERY_ENV` to that environment
directory on each build machine, and resolve it once for the session:

```powershell
if ([string]::IsNullOrWhiteSpace($env:FUSIONDIGITAL_CADQUERY_ENV)) {
  throw 'FUSIONDIGITAL_CADQUERY_ENV must name the private CadQuery environment'
}
$FusionCadEnv = (Resolve-Path -LiteralPath $env:FUSIONDIGITAL_CADQUERY_ENV).Path
```

All audit, scratch, raw and review outputs below must likewise resolve outside
every Git checkout.

1. Before any CAD import, verify that the authoritative workstation produced
   the complete, canonical eight-system export set and that it is still bound
   to the reviewed source audit and private plan:

   ```powershell
   conda run -p $FusionCadEnv `
     python scripts/exl50u-assembly/verify_export_set.py `
     D:\private\system-export-plan.private.json `
     D:\private\exports `
     --source-audit D:\private\source-audit.private.json `
     --output D:\private\audit\export-set.audit.private.json
   ```

   The verifier is streaming-only: it does not load CAD. It accepts reviewed
   AP214 or AP242 exports, requires the exact eight generic filenames, rejects
   symlinks, extra STEP files, duplicate content, files above the system-input
   ceiling, changed source/plan hashes and any export contract that permits
   re-centring or private metadata. The report remains private. A PASS proves
   file/format/contract readiness; common-origin geometry still requires the
   later spatial and visual review.

2. Prepare one immutable private run envelope from that exact PASS report. The
   command rescans all eight exports, binds the expected byte counts and
   SHA-256 digests, creates strict per-system audits, and writes the run
   manifest last:

   ```powershell
   conda run -p $FusionCadEnv `
     python scripts/exl50u-assembly/prepare_private_run.py `
     D:\private\audit\export-set.audit.private.json `
     D:\private\exports `
     D:\private\runs\exl50u-ga-20260901-001
   ```

   The run directory must not already exist and its parent must already exist
   outside every Git checkout. A run without
   `private-run.manifest.json` is incomplete and must not be consumed. The
   manifest and generated audits contain generic public identities and hashes,
   but no source path or private top-level label. All systems and both roles
   begin in `PENDING`; this command cannot assert common-origin or visual PASS.

3. Build preview and high independently through the mandatory watchdog. The
   output filename is part of the contract:

   ```powershell
   conda run -p $FusionCadEnv `
     python scripts/exl50u-assembly/run_system_build.py `
      D:\private\exports\host-system.step `
      D:\private\runs\exl50u-ga-20260901-001\audits\host-system.audit.private.json `
     D:\private\derived\host-system.preview.raw.glb `
     D:\private\scratch\host-preview `
     --system-id host-system --role preview

   conda run -p $FusionCadEnv `
     python scripts/exl50u-assembly/run_system_build.py `
      D:\private\exports\host-system.step `
      D:\private\runs\exl50u-ga-20260901-001\audits\host-system.audit.private.json `
     D:\private\derived\host-system.high.raw.glb `
     D:\private\scratch\host-high `
     --system-id host-system --role high
   ```

   On Windows the runner assigns the gated CAD worker and every descendant to
   a kill-on-close Job Object before CAD import starts. It enforces a 48 GiB
   aggregate committed-memory ceiling by default, plus a 0.5-second RSS
   diagnostic watchdog, 12 GiB minimum available memory, elapsed-time and
   scratch-disk limits. On POSIX it fails closed unless an inherited
   `RLIMIT_AS` can be installed. The worker also rejects any individual STEP
   larger than its fixed system-input ceiling before OCCT import. A stopped or
   failed run retains its private scratch evidence and never overwrites an
   existing output.

   Every successful command writes a matching private record next to the raw
   artifact, for example
   `host-system.preview.build.private.json`. Keep the pair together. Preview
   and high records are not interchangeable.

4. After all eight systems pass, assemble each role without another QEM pass:

   ```powershell
   conda run -p $FusionCadEnv `
     python scripts/exl50u-assembly/assemble_device.py `
     scripts/exl50u-assembly/profile.public.json `
     D:\private\derived `
     D:\private\review\device.preview.raw.glb --role preview
   ```

   Repeat with `--role high` and `device.high.raw.glb`. The input and output
   directories must not overlap. The aggregator requires and verifies all
   eight matching system records before it creates
   `device.<role>.build.private.json`; aggregate budget failure leaves neither
   the final GLB nor its record.

5. Encode each aggregate candidate atomically. Existing outputs are never
   replaced:

   ```powershell
   node scripts/exl50u-assembly/meshopt_encode.mjs `
     D:\private\review\device.preview.raw.glb `
     D:\private\review\device.preview.meshopt.glb
   ```

   For a device preview/high input the encoder requires the matching aggregate
   record and atomically creates
   `device.<role>.meshopt.build.private.json`. Raw input, encoded output and all
   records remain outside every Git checkout.

6. Run profile-derived QA; it has no unbounded/default mode:

   ```powershell
   node scripts/exl50u-assembly/qa_runtime.mjs `
     scripts/exl50u-assembly/profile.public.json preview `
     D:\private\review\device.preview.meshopt.glb
   ```

   Repeat with role `high`. QA automatically verifies both private device
   records. It checks exact glTF field whitelists, complete scene/resource/BIN
   reachability, stable node ownership, node-to-color/material mapping,
   per-system and aggregate triangle budgets, file and decoded-memory budgets,
   encoding and extensions, finite/non-singular world transforms, indices,
   world bounds, degenerate and duplicate faces, and private metadata/path/CAD
   leakage. Unused resources, unknown metadata, non-zero padding and
   unconsumed BIN bytes are hard failures.

7. After **both** roles pass, create a reviewed candidate release outside Git.
   This step also requires a private common-origin and visual-review receipt;
   it does not update the application, Worker, Nginx, runtime lock or public
   directory:

   ```powershell
   node scripts/exl50u-assembly/stage_public_candidate.mjs `
     --candidate D:\private\review `
     --review D:\private\review\general-assembly.review.private.json `
     --release D:\private\release-candidates\exl50u-general-assembly-v1 `
     --as-of 2026-09-01
   ```

   The review receipt has the exact schema below. It intentionally contains
   no reviewer identity, private source label or source path:

   ```json
   {
     "schemaVersion": "fusiondigital.private-exl50u-general-assembly-review.v1",
     "profileSha256": "<64 uppercase hex>",
     "artifacts": {
       "preview": { "basename": "device.preview.meshopt.glb", "bytes": 1, "sha256": "<64 uppercase hex>" },
       "high": { "basename": "device.high.meshopt.glb", "bytes": 1, "sha256": "<64 uppercase hex>" }
     },
     "commonOrigin": {
       "status": "PASS",
       "reviewedSystemIds": ["host-system", "heating-system", "auxiliary-system", "power-system", "control-system", "infrastructure", "measurement-reference", "diagnostics-system"],
       "coordinateFrame": "authoritative-common-assembly-origin",
       "worldPlacementsPreserved": true,
       "recentered": false
     },
     "visualReview": {
       "status": "PASS",
       "reviewedSystemIds": ["host-system", "heating-system", "auxiliary-system", "power-system", "control-system", "infrastructure", "measurement-reference", "diagnostics-system"],
       "reviewedAgainst": "authoritative-cad",
       "noMissingSystems": true,
       "noOrphanedGeometry": true,
       "noGrossIntersections": true
     }
   }
   ```

   The staged GLBs use immutable SHA-256 filenames. Generated metadata is
   explicitly marked `CANDIDATE_NOT_RELEASED`; a separate reviewed integration
   change must generalize the external runtime-asset contract and install the
   exact Worker/Nginx allowlist before the card can become loadable.

## Publication boundary

Passing scripts is necessary but not sufficient for publication. A candidate
still needs side-by-side visual review against the authoritative CAD, common-
origin verification across all systems, a content-hashed manifest, asset-lock
and fail-closed Worker/Nginx routes, tests, build and release evidence. Only
then may reviewed derivatives be copied into `public/` and exposed through the
new digital-prototype card.

The original STEP and all private audit/scratch/raw files must never be copied
into `public/`, `.openai/`, a Sites archive, an Aliyun release archive, GitHub
or Codeup.

Published visualization coordinates and bounds retain an approximate metre
scale for appearance review; they are not an engineering-dimensional authority.
Publication excludes PMI, dimension annotations and authoritative dimension
tables, rather than claiming that browser-visible geometry is scale-free.

The monolithic whole-device STEP is intentionally not converted by this
pipeline. Until the eight authoritative, common-origin system exports exist,
there is no publishable assembly GLB and the product card must not claim that
the integrated assembly is available.
