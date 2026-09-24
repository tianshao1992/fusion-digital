# EXL-50U ICRF antenna — geometry and positioning

## Scope

Adds one independent antenna attachment to the existing EXL-50U upgraded CAD and EFIT
workspace. Does not replace/duplicate the device, change equilibrium limiter geometry,
implement magnetic field tracing, or send hardware commands. No HCN changes are included.

User-confirmed installation (2026-09-24): 300° midplane window; **outer limiter
surface R = 1350 mm** by default. The assembly translates radially as a rigid body.
GUI R is the actual minimum cylindrical radius of the outer pair's midplane section,
not an axis-aligned bounding-box position. Slider 1100–1600 mm is a display exploration
range, not a mechanical stroke, collision clearance or operating safety envelope.

## Asset / provenance

- User-provided `200mm宽度电流带组装图双馈口.stp`, 2,162,493 bytes.
- Source SHA-256 `dc405f1a502abea146ab53dce07983b57e045757d6ae76e0f68173b9936a28da`.
- Autodesk Inventor 2022 AP214; export timestamp 2026-03-07 is not installation date.
- OpenCascade via occt-import-js 0.0.23, requested absolute deviation 0.10 mm,
  angular deviation 0.25 rad; source unit contexts resolved to mm, then exported in metres.
- 25 mesh instances, 753,384 vertices, 1,374,440 triangles; all straps, screens,
  housings, feeds and four limiter rail assemblies retained. No decimation/quantization.
- Meshopt lossless compression: 17,625,344 bytes; SHA-256
  `f897f661495308c5a9eacb654c56e8e7f6f0b383cb9320d90316269aff35e466`.
- Decoded positions/normals byte-equal to the uncompressed counterpart; all triangle
  topology/winding retained. Uncompressed Khronos Validator: 0 errors / 0 warnings.
- CAD grey/orange/green/yellow appearance retained, solid opacity; colours do not
  identify material properties. Original STEP and private intermediate exports are not public.

## Coordinates and limits of registration

World metres: `[R cos φ, Z, −R sin φ]`, consistent with the existing EFIT and diagnostic
viewer. CAD +Z is radial outward / feed side, CAD +Y is vertical, CAD −X is the
right-handed transverse direction. CAD centre X = −279.742544 mm and midplane
Y = −79.814016 mm are inferred from geometry, **not installation-survey datums**.
These orientation/centring assumptions remain visible in the GUI for later survey review.

Calibration contains 458 actual mesh/midplane intersection segments. Minimise
`sqrt((x−centreX)² + (z+d)²)` over segment interiors and solve d for the outer pair.
At the default d = 1148.483677 mm: outer R = 1350 mm, inner R = 1339.229233 mm.
Do not force all four limiter rails to the same R or alter their relative shape.
All four rails belong to one antenna assembly; their contact points need not each be at φ300°.

The attachment has its own abort/disposal lifecycle and SHA-verified loader. Radial
changes update its matrix only, without re-fetching CAD, rebuilding EFIT, or mutating
host visibility/opacity. Host slicing deliberately does not cut the antenna. The
"Inspect antenna" camera looks from the plasma-facing side; use normal device views
to return to full-device context. Switching devices disposes its GPU resources.

## Acceptance

`npx tsx --test tests/icrf-antenna.test.mts` covers surface registration, rigid
right-handed transforms, φ300 / midplane alignment, input bounds, exact asset hash,
full triangle count, no-refetch moves, cancellation, corrupted payload rejection and
idempotent disposal. Browser checks additionally cover dark/light themes, hide/show,
reset, camera framing and EFIT playback. Geometry fit is a display validation, not a
collision or RF-performance certification.
