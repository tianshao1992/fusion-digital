'use client';
import { useState } from 'react';
import { useI18n } from '../i18n';
import FuseWorkspace from './FuseWorkspace';
import TransportWorkspace from './platform/TransportWorkspace';
import EngineOverview from './platform/EngineOverview';
import DiagnosticWorkspace from './diagnostics/DiagnosticWorkspace';
import ControlWorkspace from './control/ControlWorkspace';
export default function SimulationStudio({ initialEngine = 'fuse' }: { initialEngine?: string }) {
  const { locale } = useI18n(); const en = locale === 'en';
  const [engine, setEngine] = useState(initialEngine);
  const [visited, setVisited] = useState([initialEngine]);
  function select(id: string) {
    setEngine(id);
    setVisited(previous => previous.includes(id) ? previous : [...previous, id]);
    const url = new URL(window.location.href); url.searchParams.set('engine', id);
    window.history.replaceState(null, '', url);
  }
  return <><nav className="engineNavigation" aria-label={en ? 'Simulation engines' : '仿真引擎'}>
    <div><span className="enginePlatformLabel">SIMULATION ENGINES</span><span>{en ? 'Explore · configure · connect' : '探索 · 配置 · 协同'}</span></div>
    <div className="engineSegments">{[['fuse', 'FUSE'], ['torax', 'TORAX'], ['fge', 'FGE'], ['dina', 'DINA'], ['diagnostics', 'CHERAB–Raysect'], ['workflow', en ? 'Engine collaboration' : '引擎协同']].map(([id, label]) => <button key={id} aria-pressed={engine === id} onClick={() => select(id)}>{label}</button>)}</div>
  </nav><div hidden={engine !== 'fuse'}>{visited.includes('fuse') && <FuseWorkspace />}</div><div hidden={engine !== 'torax'}>{visited.includes('torax') && <TransportWorkspace en={en} onFuse={() => select('fuse')} />}</div>{(['fge', 'dina'] as const).map(id => <div key={id} hidden={engine !== id}>{visited.includes(id) && <ControlWorkspace engine={id} en={en} />}</div>)}{engine === 'diagnostics' && <DiagnosticWorkspace en={en} />}{engine === 'workflow' && <EngineOverview en={en} onTorax={() => select('torax')} onFuse={() => select('fuse')} />}</>;
}
