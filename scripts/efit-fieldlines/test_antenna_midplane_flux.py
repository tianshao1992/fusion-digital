import math
import unittest
import numpy as np
from scipy.interpolate import RectBivariateSpline
from types import SimpleNamespace

from antenna_midplane_flux import build_antenna_midplane_flux, midplane_lcfs_intervals


class MidplaneFluxTests(unittest.TestCase):
    def test_rectangle_and_horizontal_vertex(self):
        boundary = [[.3, -1], [1.35, -1], [1.35, 1], [.3, 1]]
        self.assertEqual(midplane_lcfs_intervals(boundary), [[.3, 1.35]])
        self.assertEqual(midplane_lcfs_intervals(boundary, 2), [])
        self.assertEqual(midplane_lcfs_intervals(boundary, 1), [[.3, 1.35]])

    def test_concave_polygon_multiple_intervals(self):
        boundary = [[0, 0], [3, 0], [3, 3], [2, 3], [2, 1], [1, 1], [1, 3], [0, 3]]
        self.assertEqual(midplane_lcfs_intervals(boundary, 2), [[0, 1], [2, 3]])
        self.assertEqual(midplane_lcfs_intervals(boundary, .5), [[0, 3]])

    def test_closed_outline(self):
        open_outline = [[.3, -1], [1.35, -1], [1.35, 1], [.3, 1]]
        self.assertEqual(midplane_lcfs_intervals(open_outline + open_outline[:1]), midplane_lcfs_intervals(open_outline))

    def test_flux_outside_lcfs_is_retained_but_outside_grid_is_null(self):
        r, z = np.linspace(.2, 1.5, 32), np.linspace(-1.9, 1.9, 32)
        psi = 2 * r[:, None] ** 2 + 3 * z[None, :]
        field = SimpleNamespace(r=r, z=z, psi=RectBivariateSpline(r, z, psi), psi_axis=.5, psi_span=-.25)
        profile = build_antenna_midplane_flux(field, [[.3, -1], [1.35, -1], [1.35, 1], [.3, 1]])
        self.assertEqual(len(profile["psiWb"]), 501)
        self.assertAlmostEqual(profile["psiWb"][250], 2 * 1.35 ** 2, places=9)
        self.assertAlmostEqual(profile["psiWb"][300], 2 * 1.4 ** 2, places=9)
        self.assertIsNone(profile["psiWb"][-1])
        self.assertEqual(profile["lcfsIntervalsRM"], [[.3, 1.35]])
        self.assertEqual(profile["psiBoundaryWb"], .25)

    def test_outside_z_domain(self):
        r, z = np.linspace(.2, 2.2, 5), np.linspace(-1, 1, 5)
        field = SimpleNamespace(r=r, z=z, psi=RectBivariateSpline(r, z, r[:, None] + z[None, :]), psi_axis=0, psi_span=1)
        profile = build_antenna_midplane_flux(field, [[.3, -1], [1.35, -1], [1.35, 1], [.3, 1]], z_m=2)
        self.assertTrue(all(value is None for value in profile["psiWb"]))


if __name__ == "__main__":
    unittest.main()
