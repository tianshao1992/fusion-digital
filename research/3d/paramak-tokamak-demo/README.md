# Paramak Tokamak web demo

This directory records the reproducible source and presentation pipeline for the homepage 3D demo. The geometry is generated from the Paramak 0.9.11 example `tokamak_with_pf_tf_magnets_divertor.py`.

It is a generic, parametric, 180-degree Tokamak cutaway. It is **not** an engineering model of EXL-50U, ITER, or any other specific device. Do not use it for manufacturing, dimensional verification, physics calculations, or safety decisions.

## Provenance

- Repository: <https://github.com/fusion-energy/paramak/tree/0.9.11>
- Fixed source: <https://raw.githubusercontent.com/fusion-energy/paramak/0.9.11/examples/tokamak_with_pf_tf_magnets_divertor.py>
- Paramak paper: <https://pmc.ncbi.nlm.nih.gov/articles/PMC7983317/>
- Upstream license: MIT; see `PARAMAK-LICENSE.txt`.
- Source script SHA-256: `9C48447EAC5E67BA7D79163140850EDD387A3B92786AF42817E6F85D01620E9B`

## Rebuild outline

Use Python 3.12 and install the fixed generator version in an isolated environment:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install paramak==0.9.11 cadquery==2.8.0
.\.venv\Scripts\python.exe .\tokamak_with_pf_tf_magnets_divertor.py
```

The official example saves STEP. For the web asset, load the same script with `runpy`, retrieve `my_reactor`, and call CadQuery Assembly export for STEP and GLB with `tolerance=0.1` and `angularTolerance=0.1`. Then run:

```powershell
python .\normalize_glb_units.py <path-to-glb>
python .\render_poster.py
```

`normalize_glb_units.py` adds a 0.001 root scale because the source CAD coordinates are millimetres while glTF uses metres. The original vertex coordinates remain unchanged. `render_poster.py` only assigns restrained presentation colors and lighting; it does not add simulated field data.

The deployed files and their hashes are recorded in `public/models/paramak-tokamak-demo/model-manifest.json`.
