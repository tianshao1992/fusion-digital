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
