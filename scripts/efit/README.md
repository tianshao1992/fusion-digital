# EXL-50U EFIT browser derivation

This directory converts the reviewed private `EFIT数据.zip` directly into browser-safe,
fixed-layout contour binaries. It never extracts source g-files into the repository and it
does not publish the original 129×129 flux grid.

Requirements: Python 3.10+, NumPy and contourpy. Run from the repository root:

```powershell
python scripts/efit/derive_exl50u.py --archive "C:\path\to\reviewed-efit.zip"
node --test tests/efit-data.test.mjs
```

For repeat runs, set `EXL50U_EFIT_ARCHIVE` to the private archive path and omit
`--archive`. Do not commit the source archive or a workstation-specific absolute path.

The converter refuses a source whose SHA-256 differs from the reviewed archive unless
`--allow-unknown-source` is explicitly supplied after a new data review. Output is written
atomically to `public/data/exl50u-efit/`.

The files remain physically under `public/data/exl50u-efit/`, but the application must fetch
them only through the Worker allow-list route `/device-data/exl50u-efit/`; direct
`/data/exl50u-efit/*` access is intentionally blocked.

The delivery allow-list contains exactly six paths: `index.json`, the four reviewed contour
binaries (`18301`, `18303`, `18304`, `18308`), and the reviewed
`shot-18303-topology.bin` sidecar. The topology sidecar adds derived X points, open
separatrix branches and limiter-intersection proxies without changing the stable contour
binary layout. It does not contain the source psi grid or a raw G-EQDSK/g-file.

The allow-list accepts `GET`, `HEAD`, and single-file byte range requests. Responses are
same-origin, inline, private/no-store, no-referrer and nosniff. Unknown filenames, non-read
methods, and every direct `/data/exl50u-efit/*` request fail closed with `404`. These controls
reduce unintended discovery and caching; they cannot prevent a user from saving bytes that
the browser is authorized to receive. The build must contain no source ZIP, HDF5,
G-EQDSK/g-file, or full flux grid. See
[`docs/EFIT_DIVERTOR_TOPOLOGY.md`](../../docs/EFIT_DIVERTOR_TOPOLOGY.md) for the scientific
and delivery boundaries of the sidecar.

See the generated `index.json` for the complete little-endian binary layout, units,
quality-bit dictionary, time gaps and per-frame byte offsets.

## Adding another shot

The browser does not infer shots from filenames. A new shot is admitted only after the
converter's reviewed-shot table and the Worker allow-list are updated together. The normal
extension flow is:

1. audit the new G-EQDSK set, time units, convergence fields and source rights;
2. add the shot and expected frame count to `EXPECTED_SHOTS` in the converter;
3. regenerate the immutable contour/index package and review its SHA-256 values;
4. add exactly the reviewed contour and, when present, topology-sidecar paths to
   `controlledEfitAssets` in `worker/index.ts`;
5. run `npm test`, which checks source leakage, byte ranges, data quality and the UI contract.

The viewer reads the `shots[]` catalog dynamically, so no React component change is needed.
Frames are selected by their real `timeMs`; gaps are surfaced to the operator and no missing
source frame is synthesized. The current CAD/EFIT registration is visualization-provisional.
A versioned, landmark-validated transform is required before claiming engineering alignment.

## Topology graph v2 pipeline

`derive_topology_graph_v2.py` is the device-agnostic successor used for reviewed G-EQDSK
series with arbitrary limiter/divertor outlines. It retains closed flux surfaces and expresses
active topology as nodes, resolved constant-flux branch edges, canonical wall intersections,
wall arcs and regions. The graph does not assume two X points or four legs, so future X-point
target, Super-X, snowflake and other multi-null families can be represented without changing
the core identity model.

The workflow is deliberately two-stage. `build-candidate` writes only below the private
`work/efit-new-data-private` review root. `publish-reviewed` accepts only the reviewed source
digests and exact six-shot inventory, revalidates every frame, strips candidate-only metadata,
rebuilds deterministic gzip chunks and writes the single public catalog at
`public/data/exl50u-efit-v2/index.json`. The public command also verifies that the four v1 base
binaries are byte-for-byte unchanged.

```powershell
python scripts/efit/derive_topology_graph_v2.py audit `
  --archive "C:\private\reviewed.zip" `
  --report "C:\workspace\work\efit-new-data-private\audit\report.json"

python scripts/efit/derive_topology_graph_v2.py build-candidate `
  --archive "C:\private\reviewed.zip" `
  --expected-sha256 <approved-digest> `
  --device-id EXL-50U `
  --shot <shot-number> `
  --output "C:\workspace\work\efit-new-data-private\candidates\shot-<shot>"

python scripts/efit/derive_topology_graph_v2.py publish-reviewed `
  --candidate "C:\workspace\work\efit-new-data-private\candidates\set-a" `
  --candidate "C:\workspace\work\efit-new-data-private\candidates\set-b" `
  --confirm-derived-publication
```

Public graph chunks are 16-frame deterministic gzip files. The Worker must return the raw
compressed bytes with `Content-Type: application/gzip` and omit `Content-Encoding`; the client
checks the compressed-byte SHA-256 before using `DecompressionStream`. A closed flux surface
contains 128 unique equal-arc samples and closes implicitly from its last point to its first.
In contrast, the canonical limiter coordinate list repeats its first point explicitly, and all
wall segment indices refer to that canonical list.

The reviewed publisher keeps private candidates at full precision, then encodes public graph
floats and matching timeline-summary scalars with decimal `ROUND_HALF_EVEN` at eight fractional
digits (`-0` becomes `0`). Geometry coordinates are deliberately exempt so their exact F64LE
hashes and canonical segment indices remain unchanged. The catalog's
`distributionPolicy.numericQuantization` object is the machine-readable encoding contract.

The exact contracts are documented in
[`docs/EFIT_TOPOLOGY_GRAPH_V2.md`](../../docs/EFIT_TOPOLOGY_GRAPH_V2.md) and validated by the
JSON Schemas under [`docs/schemas`](../../docs/schemas). Run:

```powershell
python -m unittest discover -s scripts/efit/tests -v
```
