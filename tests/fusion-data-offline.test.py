"""Optional exporter QA: requires the isolated numpy/h5py export environment."""
import importlib.util
import unittest
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location("offline_imas", Path(__file__).resolve().parents[1] / "scripts/fusion-data/extract-offline-imas.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class OfflineSamplingTests(unittest.TestCase):
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
