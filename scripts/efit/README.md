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
