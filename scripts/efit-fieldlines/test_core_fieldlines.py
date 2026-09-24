"""Analytic numerical acceptance tests; no source data or Site access."""
import math
import unittest
import numpy as np

from core_fieldlines import AxisymmetricCoreField, FieldDomainError, TraceSettings, trace_core_line, to_web_world


def helical_field(total_wb=True, sign=1):
    r, z = np.linspace(.5, 2, 65), np.linspace(-12, 12, 65)
    rr, zz = np.meshgrid(r, z)
    unit = 2 * math.pi if total_wb else 1
    return AxisymmetricCoreField(r, z, unit * .15 * rr ** 2, 0, unit, [0, 1], [.6, .6],
                                 flux_unit="Wb" if total_wb else "Wb/rad", poloidal_sign=sign)


def circular_field():
    r, z = np.linspace(.4, 1.6, 81), np.linspace(-.6, .6, 81)
    rr, zz = np.meshgrid(r, z)
    rho2 = (rr - 1) ** 2 + zz ** 2
    psi = .5 * (rho2 + .5 * rho2 ** 2)
    return AxisymmetricCoreField(r, z, psi, 0, .5 * (.5 ** 2 + .5 * .5 ** 4), [0, 1], [.6, .6],
                                 flux_unit="Wb/rad", poloidal_sign=1)


class CoreFieldlineTests(unittest.TestCase):
    def test_pure_toroidal_analytic_circle_and_signed_F(self):
        r, z = np.linspace(.5, 2, 9), np.linspace(-1, 1, 9)
        field = AxisymmetricCoreField(r, z, np.full((9, 9), .5), 0, 1, [0, 1], [-.6, -.6], flux_unit="Wb/rad", poloidal_sign=1)
        result = trace_core_line(field, [1.2, .1, .2], 1)
        self.assertTrue(result.accepted, result.metadata())
        self.assertEqual(result.termination, "toroidal-turn-limit")
        self.assertAlmostEqual(result.length_m, 2 * math.pi * 1.2, places=10)
        np.testing.assert_allclose(result.cylindrical_r_phi_z[:, 0], 1.2, atol=1e-12)
        np.testing.assert_allclose(result.cylindrical_r_phi_z[:, 2], .2, atol=1e-12)
        self.assertAlmostEqual(result.cylindrical_r_phi_z[-1, 1], .1 - 2 * math.pi, places=10)

    def test_helical_analytic_pitch_and_arclength(self):
        field = helical_field()
        seed = np.array([1.2, .3, -.1])
        result = trace_core_line(field, seed, 1)
        self.assertTrue(result.accepted, result.metadata())
        points = result.cylindrical_r_phi_z
        np.testing.assert_allclose(points[:, 0], seed[0], atol=1e-10)
        np.testing.assert_allclose(points[:, 2] - seed[2], .3 * seed[0] ** 2 / .6 * (points[:, 1] - seed[1]), atol=1e-10)
        np.testing.assert_allclose(field.components(1.2, .3), [0, .5, .3], atol=1e-12)
        expected_length = 2 * math.pi * math.hypot(1.2, .3 * 1.2 ** 2 / .6)
        self.assertAlmostEqual(result.length_m, expected_length, places=9)

    def test_Wb_and_Wb_per_rad_agree(self):
        total, per_radian = helical_field(True), helical_field(False)
        for r in [.6, 1.1, 1.8]:
            np.testing.assert_allclose(total.components(r, .1), per_radian.components(r, .1), atol=1e-12)

    def test_poloidal_sign_is_explicit_not_guessed(self):
        np.testing.assert_allclose(helical_field(sign=-1).components(1.2, .3), [0, .5, -.3], atol=1e-12)

    def test_axis_connected_seeds_and_flux_conservation(self):
        field = circular_field()
        for psi_n in [.25, .5, .75, .90, .97]:
            seed = field.outboard_seed(1, 0, psi_n)
            self.assertGreater(seed[0], 1)
            self.assertAlmostEqual(field.psi_n(seed[0], seed[2]), psi_n, places=10)
            result = trace_core_line(field, seed, 1)
            self.assertTrue(result.accepted, result.metadata())
            self.assertLess(result.max_psi_n_drift, 1e-5)

    def test_forward_backward_reversibility(self):
        field = circular_field()
        seed = field.outboard_seed(1, 0, .7)
        settings = TraceSettings(max_length_m=3, max_toroidal_turns=2, rtol=1e-10, atol=1e-12, max_step_m=.03)
        forward = trace_core_line(field, seed, 1, settings)
        backward = trace_core_line(field, forward.cylindrical_r_phi_z[-1], -1, settings)
        self.assertTrue(forward.accepted and backward.accepted)
        np.testing.assert_allclose(backward.cylindrical_r_phi_z[-1], seed, atol=2e-8)

    def test_tighter_integrator_converges(self):
        field = circular_field()
        seed = field.outboard_seed(1, 0, .75)
        results = []
        for rtol, step in [(1e-3, .5), (1e-7, .08), (1e-11, .015)]:
            result = trace_core_line(field, seed, 1, TraceSettings(max_length_m=3, max_toroidal_turns=2, rtol=rtol, atol=rtol * .01, max_step_m=step, max_psi_n_drift=.05))
            self.assertTrue(result.accepted, result.metadata())
            results.append(result)
        coarse = np.linalg.norm(results[0].cylindrical_r_phi_z[-1] - results[2].cylindrical_r_phi_z[-1])
        fine = np.linalg.norm(results[1].cylindrical_r_phi_z[-1] - results[2].cylindrical_r_phi_z[-1])
        self.assertLess(fine, coarse / 10)

    def test_raw_descending_psi_profile_preserves_values(self):
        r, z = np.linspace(.5, 2, 9), np.linspace(-1, 1, 9)
        field = AxisymmetricCoreField.from_raw_psi_profile(r, z, np.full((9, 9), .5), 1, 0, [1, .5, 0], [.6, .7, .8], flux_unit="Wb", poloidal_sign=1)
        self.assertAlmostEqual(field.components(1, 0)[1], .7)

    def test_domain_finite_shape_and_missing_convention_fail_closed(self):
        with self.assertRaises(FieldDomainError):
            helical_field().components(.1, 0)
        with self.assertRaises(FieldDomainError):
            helical_field().components(1.2, 15)
        field = circular_field()
        with self.assertRaises(FieldDomainError):
            field.components(1.59, .59)
        result = trace_core_line(field, [1.59, 0, .59], 1)
        self.assertFalse(result.accepted)
        self.assertEqual(len(result.cylindrical_r_phi_z), 0)

    def test_bounded_compute_and_output(self):
        field = circular_field()
        seed = field.outboard_seed(1, 0, .5)
        result = trace_core_line(field, seed, 1, TraceSettings(max_evaluations=7))
        self.assertFalse(result.accepted)
        self.assertEqual(result.termination, "integration-evaluation-budget")
        self.assertLessEqual(result.evaluations, 8)
        result = trace_core_line(field, seed, 1, TraceSettings(max_steps=2))
        self.assertFalse(result.accepted)
        self.assertEqual(result.termination, "integration-step-budget")
        with self.assertRaises(ValueError):
            TraceSettings(output_points=513).validate()

    def test_flux_drift_rejection_emits_no_vertices(self):
        field = circular_field()
        true_components = field.components
        # Deliberately inconsistent field tests that drift rejection really fires.
        def wrong_components(r, z):
            br, bp, bz = true_components(r, z)
            return br + .1, bp, bz
        field.components = wrong_components
        result = trace_core_line(field, field.outboard_seed(1, 0, .5), 1)
        self.assertFalse(result.accepted)
        self.assertEqual(result.termination, "flux-drift-limit")
        self.assertEqual(len(result.cylindrical_r_phi_z), 0)

    def test_LCFS_mask_rejects_flux_equivalent_outside_region(self):
        r, z = np.linspace(.5, 2, 9), np.linspace(-1, 1, 9)
        field = AxisymmetricCoreField(r, z, np.full((9, 9), .5), 0, 1, [0, 1], [.6, .6], flux_unit="Wb/rad", poloidal_sign=1,
                                     core_boundary_rz=[[.6, -.5], [1.4, -.5], [1.4, .5], [.6, .5]])
        self.assertTrue(field.inside_core_boundary(1, 0))
        self.assertFalse(field.inside_core_boundary(1.6, 0))
        self.assertAlmostEqual(field.psi_n(1.6, 0), .5)
        with self.assertRaises(FieldDomainError):
            field.components(1.6, 0)
        result = trace_core_line(field, [1.6, 0, 0], 1)
        self.assertFalse(result.accepted)
        self.assertEqual(result.termination, "outside-source-core-LCFS")

    def test_world_transform_preserves_handed_cylindrical_basis(self):
        np.testing.assert_allclose(to_web_world([[1, 0, .3], [1, math.pi / 2, .3]]), [[1, .3, 0], [0, .3, -1]], atol=1e-12)


if __name__ == "__main__":
    unittest.main(verbosity=2)
