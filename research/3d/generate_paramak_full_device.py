"""Generate FusionDigital's public 360-degree Tokamak demonstration CAD.

This model is deliberately generic. It is not ITER, EXL-50U, or an
engineering-authority device model. Geometry is expressed in millimetres.

Validated authoring environment for the published 2026-08-12 asset:
Python 3.12.13, Paramak 0.9.11, CadQuery 2.8.0, cadquery-ocp 7.9.3.1.1.
"""

from pathlib import Path

import cadquery as cq
import paramak


OUT = Path(__file__).resolve().parent / "paramak-full-device-demo.step"


# A full toroidal lower-divertor placeholder intersected with the radial build.
divertor_profile = [(300, -700), (300, -90), (430, -90), (430, -700)]
divertor_lower = (
    cq.Workplane("XZ", origin=(0, 0, 0))
    .polyline(divertor_profile)
    .close()
    .revolve(360)
)

# A representative 24-coil TF array at 15-degree spacing.
tf_array = paramak.toroidal_field_coil_rectangle(
    horizontal_start_point=(10, 520),
    vertical_mid_point=(860, 0),
    thickness=50,
    distance=40,
    rotation_angle=360,
    with_inner_leg=True,
    azimuthal_placement_angles=list(range(0, 360, 15)),
)

extra_cut_shapes = [tf_array]

# Four PF coils and their cases, revolved through the complete device.
for case_thickness, height, width, center_point in zip(
    [10, 15, 15, 10],
    [20, 50, 50, 20],
    [20, 50, 50, 20],
    [(730, 370), (810, 235), (810, -235), (730, -370)],
):
    extra_cut_shapes.append(
        paramak.poloidal_field_coil(
            height=height,
            width=width,
            center_point=center_point,
            rotation_angle=360,
        )
    )
    extra_cut_shapes.append(
        paramak.poloidal_field_coil_case(
            coil_height=height,
            coil_width=width,
            casing_thickness=case_thickness,
            rotation_angle=360,
            center_point=center_point,
        )
    )

reactor = paramak.tokamak(
    radial_build=[
        (paramak.LayerType.GAP, 10),
        (paramak.LayerType.SOLID, 30),
        (paramak.LayerType.SOLID, 50),
        (paramak.LayerType.SOLID, 10),
        (paramak.LayerType.SOLID, 60),
        (paramak.LayerType.SOLID, 60),
        (paramak.LayerType.SOLID, 20),
        (paramak.LayerType.GAP, 60),
        (paramak.LayerType.PLASMA, 300),
        (paramak.LayerType.GAP, 60),
        (paramak.LayerType.SOLID, 20),
        (paramak.LayerType.SOLID, 60),
        (paramak.LayerType.SOLID, 60),
        (paramak.LayerType.SOLID, 10),
    ],
    vertical_build=[
        (paramak.LayerType.SOLID, 10),
        (paramak.LayerType.SOLID, 50),
        (paramak.LayerType.SOLID, 50),
        (paramak.LayerType.SOLID, 20),
        (paramak.LayerType.GAP, 60),
        (paramak.LayerType.PLASMA, 650),
        (paramak.LayerType.GAP, 60),
        (paramak.LayerType.SOLID, 20),
        (paramak.LayerType.SOLID, 50),
        (paramak.LayerType.SOLID, 50),
        (paramak.LayerType.SOLID, 10),
    ],
    triangularity=0.55,
    rotation_angle=360,
    extra_cut_shapes=extra_cut_shapes,
    extra_intersect_shapes=[divertor_lower],
)

reactor.save(str(OUT))
print(f"Saved {OUT}")
