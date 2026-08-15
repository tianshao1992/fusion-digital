import Link from 'next/link';
import { knowledgeModules } from './modules';

export default function KnowledgeModuleHub() {
  return <section className="knowledgeModuleHub" id="modules" aria-labelledby="knowledge-modules-title">
    <header>
      <div><p className="kgEyebrow">TEN RESEARCH MODULES</p><h2 id="knowledge-modules-title">十大知识模块</h2></div>
      <nav aria-label="知识模块辅助视图"><Link href="/knowledge-graph/system-map">系统关系图</Link><Link href="/knowledge-graph/roadmap">建设路线</Link></nav>
    </header>
    <div className="knowledgeModuleGrid">
      {knowledgeModules.map((item) => <Link href={`/knowledge-graph/modules/${item.id}`} key={item.id} className="knowledgeModuleCard">
        <span>{item.number}</span>
        <div><small>{item.keyword}</small><h3>{item.title}</h3><p>{item.summary}</p></div>
        <b data-status={item.status}>{item.status}</b><i aria-hidden="true">→</i>
      </Link>)}
    </div>
  </section>;
}
