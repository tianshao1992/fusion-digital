import unittest
import numpy as np
from core_fieldlines import AxisymmetricCoreField
from efit_core_contours import closed_core_contours


class CoreContoursTests(unittest.TestCase):
    def test_independent_closed_circle_contours(self):
        r = np.linspace(.2, 2.2, 65)
        z = np.linspace(-1, 1, 65)
        psi = (r[None, :] - 1) ** 2 + z[:, None] ** 2
        angle = np.linspace(0, 2 * np.pi, 257)
        boundary = np.column_stack((1 + .7 * np.cos(angle), .7 * np.sin(angle)))
        field = AxisymmetricCoreField(r, z, psi, 0, .49, [0, 1], [.5, .5], flux_unit="Wb", poloidal_sign=1, core_boundary_rz=boundary)
        contours = closed_core_contours(field, [1, 0], boundary)
        self.assertEqual(len(contours), 5)
        for contour in contours:
            points = np.asarray(contour["pointsRzM"]).reshape(-1, 2)
            self.assertLessEqual(len(points), 256)
            self.assertTrue(contour["closed"])
            np.testing.assert_array_equal(points[0], points[-1])
            drift = np.max(abs(((points[:, 0] - 1) ** 2 + points[:, 1] ** 2) / .49 - contour["psiN"]))
            self.assertLess(drift, 1e-4)


if __name__ == "__main__":
    unittest.main()
