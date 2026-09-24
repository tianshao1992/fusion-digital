"""Independent analytic acceptance for full-poloidal coverage parameterization."""
import math
import unittest
import numpy as np
from core_fieldlines import AxisymmetricCoreField
from core_fieldlines_v2 import PoloidalTraceSettings, trace_core_poloidal_line, assess_q_consistency


def circular_analytic(k=.15, f=.6):
    r, z = np.linspace(.4, 1.6, 81), np.linspace(-.6, .6, 81)
    rr, zz = np.meshgrid(r, z)
    psi = .5*k*((rr-1)**2 + zz**2)
    theta = np.linspace(0,2*math.pi,257)
    boundary = np.column_stack((1+.51*np.cos(theta), .51*np.sin(theta)))
    return AxisymmetricCoreField(r,z,psi,0,.5*k*.5**2,[0,1],[f,f],flux_unit='Wb/rad',poloidal_sign=1,core_boundary_rz=boundary)


class FullPoloidalTests(unittest.TestCase):
    def test_analytic_circle_q_pitch_length_and_HFS(self):
        k,f=.15,.6
        field=circular_analytic(k,f)
        rho=.3
        seed=np.array([1+rho,.4,0])
        q=f/(k*math.sqrt(1-rho**2))
        for direction in [-1,1]:
            line=trace_core_poloidal_line(field,seed,direction,[1,0])
            self.assertTrue(line.accepted,line.metadata())
            self.assertEqual(line.termination,'poloidal-coverage-complete')
            self.assertAlmostEqual(line.poloidal_span_rad,math.pi,places=8)
            self.assertAlmostEqual(line.toroidal_span_rad,math.pi*q,places=6)
            self.assertAlmostEqual(line.length_m,math.pi*math.sqrt((f/k)**2+rho**2),places=7)
            self.assertAlmostEqual(line.poloidal_length_m,math.pi*rho,places=7)
            self.assertAlmostEqual(line.cylindrical_r_phi_z[-1,0],1-rho,places=8)
            self.assertAlmostEqual(line.cylindrical_r_phi_z[-1,2],0,places=8)
            self.assertLess(line.max_psi_n_drift,1e-7)
            self.assertLessEqual(line.max_delta_phi_rad,.12)
            self.assertLessEqual(line.max_world_chord_m,.06)

    def test_signed_F_rotation_and_reversibility(self):
        field=circular_analytic(f=-.6)
        seed=np.array([1.3,.4,0])
        plus=trace_core_poloidal_line(field,seed,1,[1,0])
        self.assertTrue(plus.accepted,plus.metadata())
        self.assertLess(plus.cylindrical_r_phi_z[-1,1],seed[1])
        back=trace_core_poloidal_line(field,plus.cylindrical_r_phi_z[-1],-1,[1,0])
        self.assertTrue(back.accepted,back.metadata())
        np.testing.assert_allclose(back.cylindrical_r_phi_z[-1],seed,atol=1e-7)
        rotated=trace_core_poloidal_line(field,seed+[0,math.pi/2,0],1,[1,0])
        self.assertTrue(rotated.accepted)
        np.testing.assert_allclose(rotated.cylindrical_r_phi_z[[0,-1]],plus.cylindrical_r_phi_z[[0,-1]]+[0,math.pi/2,0],atol=1e-7)

    def test_incomplete_budget_is_rejected_not_claimed_complete(self):
        field=circular_analytic()
        for options,expected in [
            ({'max_toroidal_turns':.1},'incomplete-toroidal-turn-budget'),
            ({'max_length_m':.1},'incomplete-3d-length-budget'),
            ({'max_poloidal_length_m':.1},'incomplete-poloidal-length-budget'),
            ({'max_output_points':16,'min_output_points':16},'complete-curve-output-budget'),
        ]:
            line=trace_core_poloidal_line(field,[1.3,0,0],1,[1,0],PoloidalTraceSettings(**options))
            self.assertFalse(line.accepted)
            self.assertEqual(line.termination,expected)
            self.assertEqual(len(line.cylindrical_r_phi_z),0)

    def test_pure_toroidal_cannot_claim_poloidal_coverage(self):
        r,z=np.linspace(.5,2,9),np.linspace(-1,1,9)
        field=AxisymmetricCoreField(r,z,np.full((9,9),.5),0,1,[0,1],[.6,.6],flux_unit='Wb/rad',poloidal_sign=1)
        line=trace_core_poloidal_line(field,[1.3,0,0],1,[1,0])
        self.assertFalse(line.accepted)
        self.assertEqual(line.termination,'vanishing-poloidal-field')

    def test_tolerance_convergence(self):
        field=circular_analytic()
        rho=.3
        exact=math.pi*.6/(.15*math.sqrt(1-rho*rho))
        errors=[]
        for tol,step in [(1e-4,.1),(1e-9,.01)]:
            line=trace_core_poloidal_line(field,[1+rho,0,0],1,[1,0],
                PoloidalTraceSettings(rtol=tol,atol=tol*.01,max_step_poloidal_m=step,max_psi_n_drift=.05,coverage_tolerance_rad=.01))
            self.assertTrue(line.accepted,line.metadata())
            errors.append(abs(line.toroidal_span_rad-exact))
        self.assertLess(errors[1],errors[0]/10)

    def test_q_consistency_sign_and_near_zero_absolute_allowance(self):
        from types import SimpleNamespace
        def result(q):
            return SimpleNamespace(accepted=True,poloidal_span_rad=math.pi,toroidal_span_rad=math.pi*q)
        comparison=assess_q_consistency(result(3),result(3),-3)
        self.assertTrue(comparison['accepted'])
        self.assertEqual(comparison['sourceQ'],-3)
        self.assertTrue(assess_q_consistency(result(.04),result(.04),.01)['accepted'])
        self.assertFalse(assess_q_consistency(result(.08),result(.08),.01)['accepted'])
        self.assertFalse(assess_q_consistency(result(3.2),result(3.2),3)['accepted'])

    def test_893ms_false_positive_small_flux_drift_is_rejected_by_q(self):
        from types import SimpleNamespace
        # Actual source benchmark 21138@893ms: tiny flux drift alone is NOT a
        # sufficient acceptance criterion. Fixed scalars make this regression
        # runnable without redistributing the private equilibrium.
        for traced,stored in [(.042204975740157975,19.92946669999996),(.06866771233107209,36.25295479999995)]:
            line=SimpleNamespace(accepted=True,poloidal_span_rad=math.pi,toroidal_span_rad=math.pi*traced,max_psi_n_drift=1.3e-6)
            comparison=assess_q_consistency(line,line,stored)
            self.assertFalse(comparison['accepted'])
            self.assertEqual(comparison['reason'],'source-q-inconsistent')
            self.assertGreater(comparison['relativeError'],.99)


if __name__=='__main__':
    unittest.main(verbosity=2)
