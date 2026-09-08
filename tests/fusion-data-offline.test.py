"""Optional exporter QA: requires the isolated numpy/h5py export environment."""
import importlib.util
import unittest
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location("offline_imas", Path(__file__).resolve().parents[1] / "scripts/fusion-data/extract-offline-imas.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class OfflineSamplingTests(unittest.TestCase):
    def test_outline_extrema_ignore_padding_and_preserve_real_geometry(self):
        r = np.array([[.3, 1.3, .8, .8, -9e40], [.4, 1.4, .9, .9, 999]])
        z = np.array([[0., 0., .95, -.95, -9e40], [0., 0., 1., -1., 999]])
        sizes = np.array([[4], [4]])
        result = module.boundary_parameters(r, z, sizes, sizes)
        np.testing.assert_allclose(result, [[1.3, .3, 1.9], [1.4, .4, 2.]])

    def test_invalid_outline_does_not_become_a_smaller_plasma(self):
        r = np.tile([.3, 1.3, .8, .8], (8, 1))
        z = np.tile([0., 0., .95, -.95], (8, 1))
        sizes = np.full((8, 1), 4)
        zsizes = sizes.copy()
        r[0, 0] = -9e40
        z[1, 0] = np.nan
        r[2, :] = .8
        z[3, :] = 0
        sizes[4] = 2
        zsizes[5] = 3
        sizes[6] = zsizes[6] = 5
        r[7, 0] = np.inf
        self.assertTrue(np.isnan(module.boundary_parameters(r, z, sizes, zsizes)).all())

    def test_mismatched_outline_arrays_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "boundary array dimensions"):
            module.boundary_parameters(np.zeros((2, 4)), np.zeros((2, 3)), np.ones((2, 1)), np.ones((2, 1)))

    def test_small_signal_is_lossless(self):
        np.testing.assert_array_equal(module.sample_indices(np.arange(723)), np.arange(723))

    def test_large_signal_budget_and_endpoints(self):
        indices = module.sample_indices(np.arange(8000))
        self.assertLessEqual(len(indices), 800)
        self.assertEqual(indices[0], 0)
        self.assertEqual(indices[-1], 7999)
        self.assertTrue(np.all(np.diff(indices) > 0))

    def test_single_null_and_gap_boundaries_survive(self):
        values = np.arange(8000, dtype=float)
        values[27] = np.nan
        values[203:403] = np.nan
        values[900] = np.inf
        indices = set(module.sample_indices(values).tolist())
        self.assertTrue({26, 27, 28, 202, 203, 402, 403, 899, 900, 901}.issubset(indices))
        self.assertLessEqual(len(indices), 800)

    def test_excessive_missing_transitions_fail_closed(self):
        values = np.arange(8000, dtype=float)
        values[::2] = np.nan
        with self.assertRaisesRegex(ValueError, "publication budget"):
            module.sample_indices(values)


if __name__ == "__main__":
    unittest.main()
