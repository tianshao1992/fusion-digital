# Public Paramak digital-prototype source

`generate_paramak_full_device.py` is the exact geometry-generation source for
the public 360-degree Tokamak demonstration package. It is deliberately generic
and does not contain ITER, EXL-50U, material, sensor or CAE engineering data.

Validated authoring environment for the 2026-08-12 package:

- Python 3.12.13
- Paramak 0.9.11
- CadQuery 2.8.0
- cadquery-ocp 7.9.3.1.1

The STEP-to-GLB derivative used the FusionDigital controlled CAD converter
0.1.0, based on `CadQuery Assembly.importStep`, OpenCascade tessellation and
glTF 2.0 export, with linear tolerance 0.1 source units and angular tolerance
0.1 radians. Asset hashes and these settings are recorded in
`public/models/paramak-full-device/model-manifest.json`.

The generated geometry is illustrative only. Re-running the pipeline is a
geometry/provenance reproduction step, not an engineering validation.
