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
  return { title: en ? 'Simulation Engines · FUSE, TORAX, FGE & DINA' : '仿真引擎 · FUSE、TORAX、FGE 与 DINA', description: en ? 'Explore traceable transport, control and diagnostic simulations with connected engine workflows.' : '探索可追溯的输运、控制与诊断仿真，以及多引擎数据接口。', alternates: { canonical: '/simulations' } };
}
export default async function SimulationsPage({ searchParams }: { searchParams: Promise<{ engine?: string }> }) {
  const params = await searchParams;
  const engine = ['torax', 'fge', 'dina', 'workflow', 'diagnostics'].includes(params?.engine ?? '') ? params.engine : 'fuse';
  return <div className="simulationPage"><SiteNav active="simulations" /><SimulationStudio initialEngine={engine} /></div>;
}
