"""Independent physical invariants for the approximate free-free model."""
import importlib.util
from pathlib import Path
import unittest
import numpy as np

spec = importlib.util.spec_from_file_location('diagnostic', Path(__file__).resolve().parents[1]/'scripts/diagnostics/run_cherab.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class DiagnosticMath(unittest.TestCase):
    def test_density_and_temperature_scaling(self):
        baseline = worker.free_free([1000], [1e20])[0]
        self.assertGreater(baseline, 1e3)
        self.assertLess(baseline, 1e5)
        self.assertAlmostEqual(worker.free_free([1000], [2e20])[0]/baseline, 4)
        self.assertAlmostEqual(worker.free_free([4000], [1e20])[0]/baseline, 2)

    def test_invalid_plasma_is_not_zero_filled(self):
        for temperature, density in [(0, 1e20), (1000, -1), (float('nan'), 1e20), (1000, None)]:
            with self.assertRaises(ValueError):
                worker.free_free([temperature], [density])

    def test_uniform_radiance_normalization(self):
        self.assertLess(worker.baseline_check()['relativeError'], 1e-6)

    def test_bilinear_linear_gradient_integral(self):
        r, z = np.linspace(1, 2, 20), np.linspace(-1, 1, 24)
        values = np.tile(r, (len(z), 1))
        reference = worker.quadrature(r, z, values, [0])[0]
        self.assertAlmostEqual(reference, 1.5/(4*np.pi), places=12)
        self.assertLess(abs(worker.trace(r, z, values, [0])[0]/reference-1), 1e-6)


if __name__ == '__main__':
    unittest.main()
