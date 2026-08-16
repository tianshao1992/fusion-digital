# EFIT topology graph v2

## Contract boundary

The v2 package is a compact visualization derivative. It includes closed flux-surface
polylines, bounded critical-point evidence, resolved constant-flux branches, exact intersections
with a versioned canonical limiter outline, lightweight frame scalars and explicit unresolved
records. It excludes source archives, G-EQDSK records, the poloidal-flux grid and auxiliary
A-record payloads. It is not an engineering-authoritative equilibrium or CAD registration.

The one public catalog is `/device-data/exl50u-efit-v2/index.json`, backed by
`public/data/exl50u-efit-v2/index.json`. Its `shots[]` union contains legacy v1 descriptors and
v2 graph shots. Consumers dispatch on `sourceKind` and use each shot's `geometryId`; the legacy
13-point outline and the newer canonical limiter are intentionally separate geometries.

## Geometry identity

For graph-v2 data the source limiter is hashed as interleaved little-endian float64 values before
canonicalization. Canonicalization removes non-finite and consecutive duplicate points, chooses
counter-clockwise orientation, rotates to the lexicographically smallest `(R,Z)` point and adds
an explicit closing coordinate. The catalog records both hashes and point counts. Every
`wallSegment` refers to `limiterRzM[i] -> limiterRzM[i+1]` in this canonical list, and the
publisher reprojects every intersection to that declared segment within tolerance.

Closed flux surfaces use a different sampling contract: `pointsRzM` contains 128 unique
equal-arc samples and `closed: true` means an implicit final-to-first edge. A consumer must not
reject a surface because the first point is not repeated.

## Critical points and active topology

The current reviewed defaults apply these independent gates before deriving active topology:

- `|Ip| >= 50 kA`, `|psiBoundary - psiAxis| >= 0.005 Wb/rad`, and `ICONVR == 2`;
- a saddle from a bounded 5x5 source-cell quadratic fit with fit RMS no greater than `0.01`;
- `|psiN - 1| <= 0.002` for a boundary X point, or at most `0.02` for near-boundary evidence;
- LCFS distance no greater than two source-grid diagonals for a boundary point or four for a
  near-boundary candidate; and
- resolved branch points remain inside the source grid and have maximum `psiN` residual no
  greater than `0.002`.

Only boundary X points have `activeBranchEligible: true`. Near-boundary points are marker-only
evidence and never create active branches or regions. A resolved branch terminates at a canonical
wall intersection, another accepted boundary X point or a validated self-loop. Missing arms are
serialized under `unresolvedArms` with `extrapolated: false`; open-field physical face
classification stays under `unresolvedRegions` until independently reviewed. This fail-closed
graph model supports more than two X points and does not infer USN/LSN labels or fabricate a
strict double-null state.

The browser may add an orange **display-only** divertor polygon without changing that physical
classification. The closure gate requires exactly one active primary boundary X point, no
unresolved arm on that point, exactly two published open branches to distinct published wall
nodes, and exactly one published wall arc that forms a simple finite polygon excluding the
magnetic axis. Both branch and wall-arc endpoints must agree with their referenced nodes. If any
condition is missing or ambiguous, the frame remains wireframe-only. This polygon is not a SOL
field, heat-flux estimate, density/temperature fill or inferred USN/LSN label.

Auxiliary A-record X/strike fields are not used to create active topology in this release. Their
reviewed status flags indicate an error state, so they may only be retained as separately marked
candidate evidence after cross-checking against G-EQDSK flux.

## Stable identities

- `shotId` is stable for the device and shot number.
- `reconstructionDigest` binds the ordered shot/time, source byte length and source G-record
  SHA-256; `reconstructionId` contains its prefix.
- `frameId` binds the reconstruction and exact source `timeMs`.
- `nodeId`, `edgeId`, `wallArcId`, `regionId` and unresolved IDs are deterministic within a
  frame.
- `geometryId` binds the canonical limiter representation and remains independent of a shot.

No missing frame is interpolated. `availableTimesMs`, `frames[]` and chunk mappings must agree
exactly and remain strictly increasing.

## Reviewed-publication numeric encoding

Private candidate records retain the derivation's full floating-point precision. Immediately
before public JSON serialization, the publisher rounds every floating-point value in graph-v2
frame chunks to eight decimal places using decimal `ROUND_HALF_EVEN`, normalizes negative zero to
positive zero, and applies the identical operation to continuous values in the corresponding
`shots[].frames` summaries. The absolute error introduced into any one serialized value is at
most `5e-9` in that field's declared SI unit; independently quantized `(R,Z)` coordinates have a
Euclidean displacement bound of `sqrt(2) * 5e-9 m`, approximately `7.0711e-9 m`.

Integer time/index/count values, booleans, strings, nulls, legacy-v1 assets, algorithm thresholds,
and catalog structural metadata are not quantized. Limiter geometry coordinates are also excluded
so `geometryId`, `canonicalSha256F64LE`, `sourceLimiterSha256F64LE`, and canonical segment indices
continue to bind the exact reviewed float64 geometry. The machine-readable declaration is
`distributionPolicy.numericQuantization` in the catalog. The publisher re-runs full frame
semantic validation after quantization and before compression.

## Chunk and HTTP transport

Each immutable chunk contains at most 16 newline-delimited JSON frame records and is compressed
with gzip level 9 and `mtime=0`. The manifest SHA-256 and byte length refer to the compressed
bytes. The Worker returns those raw bytes with `Content-Type: application/gzip` and no
`Content-Encoding` header. The browser verifies the compressed bytes, then decompresses them and
validates the bounded frame contract. Setting HTTP `Content-Encoding: gzip` would make `fetch`
transparently decompress the response and break both hashing and the explicit decoder.

The schemas are:

- `docs/schemas/exl50u-efit-catalog-v2.schema.json`
- `docs/schemas/efit-topology-graph-v2.schema.json`

Unknown nested frame fields, duplicate JSON keys, non-finite numbers, source-grid fields,
workstation paths and archive names fail publication. Candidate manifest summaries are projected
through explicit public allowlists rather than copied.

## Review and publication

The audit and candidate commands are restricted to the private review root and impose ZIP member,
compression-ratio and cumulative decompression budgets before reading a member. The reviewed
publisher requires all six approved new shots exactly once, one approved geometry per shot, exact
frame counts, one explicitly reviewed candidate algorithm-source hash, the current publisher
source hash, the reviewed source digests and an explicit confirmation flag. It revalidates every
full-precision candidate frame, quantizes and revalidates the public record, and atomically replaces
only the locked v2 output directory. Committing and deployment remain separate human-reviewed
operations.
