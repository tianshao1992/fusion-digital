# Third-party material and redistribution notice

FusionDigital links to and, in limited cases, reproduces or crops figures from scientific publications. Copyright and license remain with the respective authors and publishers unless explicitly stated otherwise.

## Original publication figures

Known publication-derived images are recorded in `research/assets/asset-manifest.csv`. The manifest is a maintenance aid, not legal clearance. Before redistributing this repository outside the approved collaboration group, verify the license and attribution of every row whose status is not explicitly approved.

The Royal Society Open Science article *An integrated digital framework for fusion power plant design* is identified in the project as CC BY 4.0. For arXiv/preprint figures, public access alone does not establish permission for every form of redistribution; retain attribution and confirm the author/publisher license.

## Model-generated explanatory figures

Files named `*-image2*.png` and the dark knowledge-domain illustrations are team-generated explanatory graphics. They are conceptual scientific diagrams, not outputs of the simulated codes or measurements they describe. Scientific labels, geometry and causal arrows require human domain review.

## Software names and trademarks

Tokamak, device, laboratory and software names are used for research identification. Ansys, Abaqus, COMSOL, MATLAB, Simulink and other commercial product names and trademarks belong to their respective owners. Listing a product does not imply endorsement, license ownership or permission to redistribute commercial models.

## Interactive chart runtime

Interactive scientific charts use Apache ECharts 6.1.0, distributed under the Apache License 2.0. ECharts renders the structured editorial datasets in the browser; it is not the source of the scientific classifications, planning scores or tool-performance assumptions shown by this project.

## Interactive Tokamak CAD demonstration

The homepage Tokamak model is generated from the Paramak 0.9.11 example `tokamak_with_pf_tf_magnets_divertor.py`. Paramak is distributed under the MIT License, copyright Fusion Energy and Paramak contributors; the upstream license text is retained beside the downloadable model. The model is generic parametric demonstration geometry, not an engineering model of EXL-50U, ITER, or any other specific device. Presentation colors identify broad model groups and do not encode measured fields or simulation results.

The interactive viewer uses Three.js, distributed under the MIT License. The complete upstream license text is retained at [`public/licenses/THREE-LICENSE.txt`](public/licenses/THREE-LICENSE.txt) and is publicly served at `/licenses/THREE-LICENSE.txt`. Model provenance, transformation details and SHA-256 hashes are recorded in `public/models/paramak-tokamak-demo/model-manifest.json` and `public/models/paramak-full-device/model-manifest.json`. The full-device demonstrator's exact generation source is retained at `research/3d/generate_paramak_full_device.py`.

## EXL-50U controlled visualization

The project operator has authorized web visualization of the supplied EXL-50U device model but has not authorized distribution of the source CAD, converted mesh, assembly tree, dimensions, or engineering metadata. The public website therefore receives only low-resolution, permanently watermarked raster previews under `public/models/exl50u-secure-preview/`. These include exterior, transparency, fixed X/Y/Z clipping, and cropped internal-view presets that were pre-rendered from the controlled model. They do not provide interactive geometry, selectable parts, clipping coordinates, engineering sections, or measurement data. These images are a presentation preview, not an engineering authority. Authorization to display the raster preview does not grant download, extraction, measurement, reverse-engineering, redistribution, sublicensing, or source-model access rights. The controlled CAD and GLB remain outside the public repository and deployment package.

The project operator subsequently and explicitly authorized public web delivery of a separate, aggressively simplified browser geometry derivative under `public/models/exl50u-interactive/`. This authorization applies only to that derivative. The original STEP/PPTX, B-Rep topology, dimensional annotations, full 1,518-definition/16,748-occurrence assembly tree, engineering materials and manufacturing tolerances remain private. The derivative merges the source assembly into twelve selectable system-level meshes, uses coarse tessellation and decimation, and is classified as illustrative rather than an engineering authority. Its manifest and [`public/licenses/EXL50U-PUBLIC-DERIVATIVE.txt`](public/licenses/EXL50U-PUBLIC-DERIVATIVE.txt) record the public-display boundary, hashes, byte size, coordinate conversion and prohibited engineering uses.

## Papers and datasets

The repository stores links and bibliographic metadata. It does not grant rights to republish linked papers or datasets. Do not add paywalled PDFs, restricted experimental data or partner materials without written authorization.

## Project licensing status

The repository currently has no general open-source license. Code, structured data, reports and images may require separate licensing decisions. Contact `tianshao1992@gmail.com` before external reuse.
