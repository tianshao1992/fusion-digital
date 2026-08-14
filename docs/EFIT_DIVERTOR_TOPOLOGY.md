# EXL-50U EFIT divertor-topology derivative

## Purpose and scope

`shot-18303-topology.bin` is a browser-oriented sidecar for the existing shot-18303
contour binary. It adds the topology needed to interpret diverted phases while preserving
the reviewed `EXL50EF1` contour contract. The sidecar contains only compact, derived
geometry:

- at most two X-point records per frame;
- at most four open separatrix branches per frame;
- at most four branch/limiter intersection records per frame; and
- per-frame topology kind, confidence role, validity counts and quality flags.

It does **not** contain the 129×129 psi grid, source G-EQDSK records, the private archive,
or enough source state to rerun EFIT. The sidecar is a visualization derivative, not an
engineering-authoritative equilibrium product.

## Scientific interpretation

The source G-EQDSK records do not include explicit X-point or strike-point fields. Every
topology record is therefore derived from the reviewed reconstruction:

1. An X-point candidate is a saddle of the reconstructed poloidal-flux field found by a
   local quadratic fit. A candidate is published only when its normalized flux is near the
   boundary flux and it is spatially consistent with the supplied LCFS polyline.
2. A **primary** X point meets the strict boundary-flux tolerance. A **secondary** X point
   is retained as near-null evidence with a looser tolerance; it must not be presented as a
   strict second null.
3. A separatrix branch follows the active boundary level `psiN = 1` away from the primary
   X point. Secondary near-null candidates are markers only and never generate a branch.
   Each branch remains an open polyline. The browser must not close it or revolve it into a
   fabricated plasma surface.
4. A displayed “strike point” is an exact segment intersection between a traced branch and
   the published 13-point limiter outline. Because that outline is a coarse vessel/limiter
   proxy rather than a detailed divertor-target CAD surface, the UI and documentation call
   it a **limiter intersection proxy**. Missing intersections remain missing; they are not
   extrapolated.

Axisymmetry turns an R-Z X point into an X-line when shown in the 3D tokamak view. The 2D
chart may label the poloidal location `X1`/`X2`; the 3D overlay may render the corresponding
toroidal ring, but neither representation adds new measured information.

Topology labels are deliberately conservative:

- `upper-single-null` / `lower-single-null`: one primary X point on the named side;
- `double-null`: reserved for a future, independently approved two-primary-X / dRsep
  criterion; this release does not assign strict double-null labels;
- `near-double-null`: one primary and one secondary X point on opposite sides;
- `limited`: no accepted active X point after derivation gates; and
- `partial`: accepted evidence exists but does not support a complete label.

The source-grid spacing establishes a nonzero position-uncertainty floor. Sub-cell marker
placement is useful for smooth animation, but it must not be interpreted as sub-grid
measurement accuracy. Low-current, small-flux-span, non-converged, ambiguous or incomplete
frames carry explicit flags and should be shown with a caution state.

## Delivery and governance

The only public route for the sidecar is:

`/device-data/exl50u-efit/shot-18303-topology.bin`

The Worker maps that exact path to the build asset, permits only `GET` and `HEAD`, preserves
single-file byte ranges, and applies same-origin, inline, private/no-store, no-referrer and
nosniff headers. `/data/exl50u-efit/*`, unknown sidecars, directory requests and write
methods fail closed. Browser delivery is not DRM: a user who can render a byte range can
also save it. Protection rests on publishing only the approved derivative and excluding
the source flux grid and raw files.

The sidecar header binds it to the corresponding contour binary by shot number, frame
count and a prefix of the base binary SHA-256. A client must reject a sidecar whose magic,
schema version, dimensions, frame stride, time stamp or base-binary binding does not match
the active contour package. Counts and valid-point fields are bounds, not hints; malformed
values must fail closed.

## Recommended next improvements

1. Replace fixed-step branch following with adaptive Runge-Kutta integration along the
   flux-contour tangent, followed by a bounded projection back to the target flux level.
   Track each branch continuously from the X-point Hessian eigenvectors so that identities
   do not swap between adjacent animation frames.
2. Add per-branch residual, arc-length, step-rejection and limiter-intersection diagnostics
   to the private validation report. Publish only compact confidence categories required by
   the UI.
3. Validate limiter intersections against an authorized, versioned divertor-target
   geometry. Until that geometry exists, retain the “limiter intersection proxy” wording.
4. Add temporal hysteresis to topology classification and flag transitions rather than
   smoothing across source time gaps. Never synthesize a missing EFIT frame.
5. Maintain golden checks for representative shot-18303 limited, single-null,
   near-double-null and double-null frames, including X-point flux residuals, side of the
   magnetic axis, branch endpoint provenance and base-binary hash binding.
