# EXL-50U public snapshot exporter

This directory contains the offline exporter for the reviewed `/fusion-data`
snapshot. It is intentionally a release-time data step, not browser runtime
code. The browser must never receive an internal API address or credential.

## Export

Run from the repository root on a machine that can reach the read-only internal
catalog and signal API:

```powershell
$env:FUSIONDATA_INTERNAL_API_BASE = "http://<internal-readonly-api>"
$env:FUSIONDATA_LOCAL_ADDRESS = "<optional-local-interface>"
npm run data:export-exl50u -- --shots 20831,20833,20835,20836 --snapshot-id exl50u-mdsplus-20260901-r1
```

The exporter:

- validates each shot through the dataset catalog before reading signals;
- accepts only valid, recommended and published dataset versions;
- reads only the fixed signal allowlist in the script;
- preserves missing samples and never interpolates or fabricates values;
- writes deterministic raw-gzip shot files and a content-addressed manifest;
- rejects private network addresses, storage paths, task IDs and credentials in
  the public payload.

The generated directory is
`public/data/exl50u-mdsplus-snapshot-v1/`. After export, run the FusionData
tests, refresh the tracked runtime-asset lock, then deploy the same commit and
the same bytes to both public endpoints.

## Offline IMAS capture expansion (2026-09-08)

The platform now retains the four original gzip payloads **byte-for-byte** and
adds 29 shots: 21066–21071, 21074–21085, 21093–21103. The duplicated 21103 log
entry does not create an invented 21104. Batch dates are experiment-log dates,
not timestamps inferred from signal data.

1. On the private capture machine, install `numpy` and `h5py` in an isolated
   Python environment. No HDF5 runtime is needed by the website.
2. Run `extract-offline-imas.py --capture-root <private-capture-directory>
   --shots <comma-separated-pulses> --output <private-staging-json>`.
3. Run `node scripts/fusion-data/publish-offline-imas.mjs <private-staging-json>
   exl50u-imas-20260908-r1 <canonical-UTC-export-time>`.

Extraction checks the local verified download manifest (full-file SHA-256 and
bytes) against each shot's captured catalog. Only valid, recommended, published
occurrence-0 H5 datasets are accepted. Versions may differ **between IDS in the
same shot**. The website therefore shows versions per signal, not a single run
label for the whole shot.

### Published signals

| Signal | IDS / H5 field | Index | Unit |
| --- | --- | --- | --- |
| Plasma current | magnetics / `ip[]&data` | 0 | A |
| C12 / CS current | pf_active / `coil[]&current&data` | 12 (zero-based, CS) | A |
| TF C00 current | tf / `coil[]&current&data` | 0 | A |
| Probe EMB000 Jsat | langmuir_probes / `embedded[]&j_i_saturation&data` | 0 | A/m² |
| Equilibrium current | equilibrium / `time_slice[]&global_quantities&ip` | — | A |
| Magnetic axis R/Z | equilibrium / `time_slice[]&global_quantities&magnetic_axis&r` / `&z` | — | m |

Time is seconds from each IDS's `time`, except the embedded probe which uses
its own `embedded[]&time[0]`. No resampling onto another IDS clock, scale changes,
smoothing or interpolation is performed. Publication uses at most 800 original
indices per signal, preserving endpoints and every finite/null transition.
NaN, infinity and IMAS undefined real sentinels become null. This display
subsample is **not suitable for authoritative peak or controller-performance
claims**; the complete original 445 H5 files remain in the private capture.

28 new shots contain all seven signals. **21096 has no recommended equilibrium
dataset in the captured catalog** and publishes only the four diagnostic
signals. Previous shots retain their existing four-signal scope. No LCFS, 2D
equilibrium field, controller reference/action trace or quality-bit product is
included. Quality is explicitly unknown, not inferred from catalog approval.

New signals are labelled **offline IMAS H5 extraction**, not MDSplus mirror
data. Each includes a source H5 hash, numerical field, channel index, time
field, occurrence/run and canonical sample hash. Public JSON contains no
internal addresses, H5 userblocks, source storage locations, credentials or
staff identities. User-log targets and narrative results are not measurements.

The catalog is small and loaded first; only the selected shot and optional
comparison are fetched, independently cancellable, with an eight-shot cache.
Failed comparisons do not disable the main view. Out-of-window cursors show
no sample; unlike-unit signals are not overlaid. The browser verifies gzip,
content and sample hashes before displaying a curve.

Validation: `npx tsx --test tests/fusion-data.test.mts`, optional offline
extractor tests in `tests/fusion-data-offline.test.py`, full `npm run check`,
and all 33 shot paths in the formal paired-release shared-content contract.
