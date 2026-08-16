# ITER browser-visualization release record

## Authorization basis

On 2026-08-15, the project owner explicitly authorized this project to create
and publish an ITER visualization derivative for the FusionDigital web
workbench. This record captures that project-owner instruction. It does not
claim endorsement, certification, or authorship by the ITER Organization.

## Authorized public scope

Only a deliberately simplified browser-visualization derivative may be
published. The release may contain a stable component tree, decimated triangle
meshes, display materials, bounds, hashes, and performance metadata needed by
the viewer. It must not contain or expose source STEP/STP, B-Rep topology,
authoritative dimensions, manufacturing tolerances, hidden source metadata,
private filesystem paths, or source-download credentials.

The visualization is for interactive inspection and performance evaluation. It
is not an engineering-authoritative ITER model and must not be used for
manufacturing, dimensional verification, CAE, safety decisions, or reverse
engineering of the private source package.

## Release gates

A public release is allowed only when all of the following are true:

1. Every advertised component has a stable ID and an explicit availability
   state. The UI must not claim an 18-component complete package while a source
   component or derived component is missing.
2. Public assets are generated into a new derivative directory; source files
   are never copied into the repository, `public/`, build output, or a release
   archive.
3. Each published asset is content-hashed and declared by an allow-listed
   manifest with byte, triangle, vertex, bounds, and LOD metadata.
4. Geometry validation covers finite positions and normals, valid indices,
   non-degenerate triangles, bounded decoded memory, and stable component
   mapping across LODs.
5. The compact fallback GLB is not published. Browser geometry is delivered
   only through the reviewed 18-file high-detail component bundle; each shard
   remains content-addressed, independently bounded, and fail-closed.
6. The public catalog labels the package as a visualization derivative and
   keeps the source package private.

## Change control

Any later use of the source package for engineering delivery, redistribution of
source CAD, or a claim of official/authoritative ITER geometry is outside this
authorization record and requires a separate documented approval.
