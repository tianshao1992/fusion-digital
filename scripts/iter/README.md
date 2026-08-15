# ITER private preview pipeline

This directory contains the reproducible, fail-closed pipeline for an ITER
whole-device web preview candidate. It never writes to `public/`, never copies
STEP into the repository, and restricts generated files to the private task
workspace under `work/iter-cad-private/derived-candidates/`.
The only delivery tier built here is one 18-of-18 preview: 400k target
triangles, a recommended 7 MiB transfer budget and a hard 8 MiB cap. No
high-LOD package is generated.

Run from the site repository:

```powershell
py -3 scripts/iter/build_private_iter_preview.py `
  --target-triangles 400000 `
  --max-bytes 8388608
```

The pipeline uses:

1. the existing 17 registered GLBs plus the selective, device-frame divertor
   STL recovered from the complete STEP assembly;
2. a guarded direct contiguous-buffer decoder for the six very large GLBs,
   with VTK import for smaller inputs; both paths bake the reviewed transform
   into device metres and use a two-stage grid/QuadricClustering then
   volume-preserving QuadricDecimation reduction;
3. the reviewed `(x,y,z) -> (x,z,-y)` CAD-to-web coordinate map for the
   divertor and one stable `ITER_PART__<id>` node for each of all 18 parts;
4. glTF-Transform 4.4.2 with Meshopt and KHR mesh quantization;
5. hash, bytes, triangle/vertex, bounds, exact stable-node/mesh ownership,
   post-Meshopt decoded geometry, validator and memory-budget gates. Decoded
   geometry bytes count each referenced accessor once, even when several
   primitives intentionally share it.

Interrupted runs resume by default. A staged component is skipped only after
its GLB container, stable node, triangle count, finite bounds, byte count,
SHA-256 and source/script/tool/target/transform/reduction fingerprint are
revalidated; pass `--no-resume` to force a rebuild. Memory checks
sum the complete launcher/runtime process tree and terminate the full tree if
either the 8 GiB worker ceiling or 3 GiB system-free floor is crossed.

The official print STL is not used because its component-specific local frame
cannot be registered by one shared transform. Instead, a selective OpenCascade
transfer recovers three exact cassette assemblies from the complete STEP file;
its coarse STL bounds agree with the streaming STEP assembly evidence within
3.20 mm. The candidate remains private and requires a separate distribution
review and browser QA before any explicit public integration step.

To refresh derived manifest statistics without touching the GLB geometry:

```powershell
py -3 scripts/iter/build_private_iter_preview.py --refresh-manifest-only
```
