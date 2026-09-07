import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import SiteNav from '../components/SiteNav';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, resolveLocale } from '../i18n/config';
import SimulationStudio from './SimulationStudio';
import './simulation-studio.css';
import './platform/platform.css';
export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const en = (resolveLocale(store.get(LOCALE_COOKIE_NAME)?.value) ?? DEFAULT_LOCALE) === 'en';
  return { title: en ? 'Simulations · FUSE, TORAX & CHERAB–Raysect' : '仿真模拟 · FUSE、TORAX 与 CHERAB–Raysect', description: en ? 'Explore traceable simulations, transport trajectories and connected engine workflows.' : '探索可追溯的仿真结果、输运时序与多引擎协同研究。', alternates: { canonical: '/simulations' } };
}
export default async function SimulationsPage({ searchParams }: { searchParams: Promise<{ engine?: string }> }) {
  const params = await searchParams;
  const engine = ['torax', 'workflow', 'diagnostics'].includes(params?.engine ?? '') ? params.engine : 'fuse';
  return <div className="simulationPage"><SiteNav active="simulations" /><SimulationStudio initialEngine={engine} /></div>;
}
