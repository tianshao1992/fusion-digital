"""Render the generated Paramak GLB into a deterministic homepage poster.

Requires VTK (installed transitively by CadQuery/Paramak). The script maps
glTF mesh names to restrained FusionDigital presentation colors; it does not
alter the source geometry or add simulated field data.
"""

from __future__ import annotations

import json
import struct
from pathlib import Path

import vtk


ROOT = Path(__file__).resolve().parents[3]
MODEL = ROOT / "public/models/paramak-tokamak-demo/paramak-tokamak-demo.glb"
OUTPUT = ROOT / "public/models/paramak-tokamak-demo/paramak-tokamak-demo-poster.png"


def mesh_primitive_names(path: Path) -> list[str]:
    payload = path.read_bytes()
    json_length = struct.unpack_from("<I", payload, 12)[0]
    document = json.loads(payload[20 : 20 + json_length])
    names: list[str] = []
    for mesh in document.get("meshes", []):
        names.extend([mesh.get("name", "unnamed")] * len(mesh.get("primitives", [])))
    return names


def style_for(name: str) -> tuple[tuple[float, float, float], float, float, bool]:
    if name == "plasma":
        return (1.0, 0.31, 0.055), 0.05, 0.18, False
    if name.startswith("toroidal_field_coil"):
        return (0.16, 0.78, 0.72), 0.58, 0.28, False
    if "poloidal_field_coil_case" in name:
        return (0.25, 0.18, 0.42), 0.65, 0.32, False
    if name.startswith("poloidal_field_coil"):
        return (0.60, 0.30, 0.90), 0.38, 0.24, False
    if name.startswith("extra_intersect"):
        return (0.93, 0.33, 0.10), 0.42, 0.31, False
    layer_palette = {
        "layer_1": (0.18, 0.24, 0.23),
        "layer_2": (0.25, 0.34, 0.31),
        "layer_3": (0.30, 0.41, 0.37),
        "layer_4": (0.19, 0.29, 0.29),
        "layer_5": (0.12, 0.19, 0.20),
    }
    return layer_palette.get(name, (0.22, 0.27, 0.27)), 0.78, 0.30, False


def main() -> None:
    renderer = vtk.vtkRenderer()
    renderer.GradientBackgroundOn()
    renderer.SetBackground(0.008, 0.019, 0.016)
    renderer.SetBackground2(0.025, 0.075, 0.061)

    window = vtk.vtkRenderWindow()
    window.SetOffScreenRendering(1)
    window.SetSize(1600, 900)
    window.SetMultiSamples(8)
    window.AddRenderer(renderer)

    importer = vtk.vtkGLTFImporter()
    importer.SetFileName(str(MODEL))
    importer.SetRenderWindow(window)
    importer.Update()

    names = mesh_primitive_names(MODEL)
    actors = renderer.GetActors()
    actors.InitTraversal()
    for index in range(actors.GetNumberOfItems()):
        actor = actors.GetNextActor()
        name = names[index] if index < len(names) else "unnamed"
        color, metallic, roughness, show_edges = style_for(name)
        prop = actor.GetProperty()
        prop.SetInterpolationToPBR()
        prop.SetColor(*color)
        prop.SetMetallic(metallic)
        prop.SetRoughness(roughness)
        prop.SetEdgeVisibility(show_edges)
        prop.SetEdgeColor(0.10, 0.34, 0.30)
        prop.SetLineWidth(0.35)
        if name == "plasma":
            prop.SetAmbient(0.72)
            prop.SetDiffuse(0.72)

    key = vtk.vtkLight()
    key.SetPosition(1550, -1900, 2100)
    key.SetFocalPoint(0, 260, 0)
    key.SetColor(0.73, 1.0, 0.91)
    key.SetIntensity(1.8)
    renderer.AddLight(key)

    rim = vtk.vtkLight()
    rim.SetPosition(-1500, 1150, 400)
    rim.SetFocalPoint(0, 260, 0)
    rim.SetColor(1.0, 0.29, 0.06)
    rim.SetIntensity(1.15)
    renderer.AddLight(rim)

    xmin, xmax, ymin, ymax, zmin, zmax = renderer.ComputeVisiblePropBounds()
    center = ((xmin + xmax) / 2, (ymin + ymax) / 2, (zmin + zmax) / 2)
    span = max(xmax - xmin, ymax - ymin, zmax - zmin)
    camera = renderer.GetActiveCamera()
    camera.SetPosition(
        center[0] + span * 1.18,
        center[1] - span * 1.48,
        center[2] + span * 0.69,
    )
    camera.SetFocalPoint(*center)
    camera.SetViewUp(0, 0, 1)
    camera.SetViewAngle(31)
    renderer.ResetCameraClippingRange()

    window.Render()
    image_filter = vtk.vtkWindowToImageFilter()
    image_filter.SetInput(window)
    image_filter.SetScale(1)
    image_filter.SetInputBufferTypeToRGBA()
    image_filter.ReadFrontBufferOff()
    image_filter.Update()

    writer = vtk.vtkPNGWriter()
    writer.SetFileName(str(OUTPUT))
    writer.SetInputConnection(image_filter.GetOutputPort())
    writer.Write()
    print(f"Rendered {OUTPUT}")


if __name__ == "__main__":
    main()
