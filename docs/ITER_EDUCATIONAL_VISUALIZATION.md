# ITER educational browser visualization

## Delivery contract

The public viewer keeps the compact all-part preview as its compatibility and
low-resource path. The optional high-detail mode is an independently verified
18-file component bundle of roughly 100 MB. Each file owns exactly one stable
`ITER_PART__*` identity, is Meshopt-compressed, declares its byte length,
SHA-256, triangle/vertex counts, decoded byte budget and metre-space bounds,
and remains below 24 MiB.
Positions use reviewed per-mesh normalized Int16 encoding, with local
quantization capsules where needed so valid triangles are not dropped. Normal
vectors use the encoder's verified normalized Int8 representation. The release
gate requires zero post-decode degenerate or duplicate triangles,
at most 300 mesh instances per shard, and at most 1,000 for the full bundle.

The large files do not enter the Sites static archive. The manifest exposes
same-origin `/device-assets/iter-high-detail/v1/*` paths; the Worker resolves only
an exact allow-list to immutable, content-addressed release assets. Unknown
paths fail closed. The browser downloads high detail only after explicit user
selection, uses at most two concurrent transfers (one on lower-memory devices),
verifies byte length and SHA-256 before parsing, and falls back to the compact
preview if any component fails.

This is visualization geometry, not source CAD. STEP/STP, B-Rep topology, PMI,
authoritative dimensions, tolerances and manufacturing metadata are not
published.

## Analytic plasma proxy

The orange ITER plasma is a geometry-only educational proxy derived from the
nominal parameters in Table 2.1-1 of the IAEA/ITER *Summary of the ITER Final
Design Report* (ITER EDA Documentation Series No. 22):

- major radius `R0 = 6.2 m`;
- minor radius `a = 2.0 m`;
- `kappa95 = 1.70`, `delta95 = 0.33`;
- separatrix-reference values `kappa = 1.85`, `delta = 0.49`;
- nominal plasma current `15 MA`, toroidal field `5.3 T`, `q95 = 3.0`;
- nominal plasma volume `837 m3`.

The displayed 95% surface uses the Miller-style parameterization

```text
alpha = asin(delta)
R(theta) = R0 + a cos(theta + alpha sin(theta))
Z(theta) = kappa a sin(theta)
```

and revolves it with `(X,Y,Z)=(R cos(phi), R sin(phi), Z)`. The viewer's Y-up
right-handed map is `(x,y,z)=(X,Z,-Y)` in metres.

The separatrix-reference values are shown only as smooth poloidal reference
contours. They do not define an X point. This feature contains no psi grid,
magnetic axis, open separatrix branches, strike points, diagnostic constraints
or uncertainty, and must not be labelled EFIT, reconstructed equilibrium,
actual LCFS or actual separatrix.

Primary parameter source:
<https://www-pub.iaea.org/MTCD/Publications/PDF/ITER-EDA-DS-22.pdf>

Miller parameterization:
<https://doi.org/10.1063/1.872666>

No ITER Organization endorsement is implied.
