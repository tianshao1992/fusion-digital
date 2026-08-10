'use client';

import { useMemo, useState } from 'react';
import {
  aiResearchItems,
  codeStatusMeta,
  deploymentMeta,
  domainMeta,
  evidenceMeta,
  type AICodeStatus,
  type AIDomain,
  type AIEvidenceLevel,
} from './aiResearch';

const allDomains = Object.keys(domainMeta) as AIDomain[];
const allCodeStatuses = Object.keys(codeStatusMeta) as AICodeStatus[];
const allEvidenceLevels = Object.keys(evidenceMeta) as AIEvidenceLevel[];

const sourceTypeLabels: Record<string, string> = {
  'journal-article': '期刊论文',
  preprint: '预印本',
  'conference-paper': '会议论文',
  'conference-material': '会议材料',
  'official-project-page': '官方项目页',
  'official-documentation': '官方文档',
  'official-source': '官方来源',
};

function primaryDomainOf(item: (typeof aiResearchItems)[number]) {
  return item.primaryDomain ?? item.domain;
}

function associatedDomainsOf(item: (typeof aiResearchItems)[number]) {
  return Array.from(new Set([primaryDomainOf(item), ...(item.relatedDomains ?? [])]));
}

function sourceTypeLabel(sourceType?: string) {
  return sourceType ? (sourceTypeLabels[sourceType] ?? sourceType) : '未标注';
}

function isCommercialArtifact(repo: (typeof aiResearchItems)[number]['code'][number]) {
  const artifactType = repo.artifactType?.toLocaleLowerCase('en-US') ?? '';
  const access = repo.access?.toLocaleLowerCase('en-US') ?? '';
  return repo.status === 'commercial-enabling'
    || artifactType.includes('commercial')
    || ['commercial', 'proprietary', 'licensed'].some((token) => access.includes(token));
}

function searchableText(item: (typeof aiResearchItems)[number]) {
  return [
    item.title,
    item.projectId,
    item.parentProjectId,
    item.deploymentLevel,
    item.organization,
    item.problem,
    item.approach,
    item.evidence,
    item.data,
    item.maturity,
    item.limitations,
    ...item.devices,
    ...item.tags,
    ...associatedDomainsOf(item).flatMap((key) => [key, domainMeta[key].label, domainMeta[key].en]),
    ...item.papers.flatMap((paper) => [paper.title, paper.venue, paper.sourceType, sourceTypeLabel(paper.sourceType)]),
    ...item.code.flatMap((repo) => [
      repo.name,
      repo.relationship,
      repo.status,
      codeStatusMeta[repo.status].label,
      repo.artifactType,
      repo.access,
      isCommercialArtifact(repo) ? '商业软件 专有软件 commercial proprietary' : '',
    ]),
  ]
    .join(' ')
    .toLocaleLowerCase('zh-CN');
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}<span aria-hidden="true"> ↗</span>
    </a>
  );
}

export default function AIResearchCatalog() {
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState<'all' | AIDomain>('all');
  const [codeStatus, setCodeStatus] = useState<'all' | AICodeStatus>('all');
  const [evidence, setEvidence] = useState<'all' | AIEvidenceLevel>('all');

  const domainCounts = useMemo(
    () =>
      Object.fromEntries(
        allDomains.map((key) => [key, aiResearchItems.filter((item) => associatedDomainsOf(item).includes(key)).length]),
      ) as Record<AIDomain, number>,
    [],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
    return aiResearchItems.filter((item) => {
      if (domain !== 'all' && !associatedDomainsOf(item).includes(domain)) return false;
      if (codeStatus !== 'all' && !item.code.some((repo) => repo.status === codeStatus)) return false;
      if (evidence !== 'all' && item.evidenceLevel !== evidence) return false;
      return !normalizedQuery || searchableText(item).includes(normalizedQuery);
    });
  }, [query, domain, codeStatus, evidence]);

  const resetFilters = () => {
    setQuery('');
    setDomain('all');
    setCodeStatus('all');
    setEvidence('all');
  };

  return (
    <div className="researchCatalog">
      <div className="catalogToolbar" aria-label="研究图谱筛选器">
        <label className="catalogSearch">
          <span>检索工作、装置、机构、问题或代码</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="例如：TCV、破裂预测、TORAX、代理模型……"
          />
        </label>

        <fieldset className="catalogDomainFilters">
          <legend>九个知识域</legend>
          <button className={domain === 'all' ? 'isActive' : ''} onClick={() => setDomain('all')} type="button">
            全部 <b>{aiResearchItems.length}</b>
          </button>
          {allDomains.map((key) => (
            <button
              className={domain === key ? 'isActive' : ''}
              onClick={() => setDomain(key)}
              type="button"
              key={key}
            >
              {domainMeta[key].short} <b>{domainCounts[key]}</b>
            </button>
          ))}
        </fieldset>

        <div className="catalogSelects">
          <label>
            <span>代码关联</span>
            <select value={codeStatus} onChange={(event) => setCodeStatus(event.target.value as 'all' | AICodeStatus)}>
              <option value="all">全部开放状态</option>
              {allCodeStatuses.map((key) => <option value={key} key={key}>{codeStatusMeta[key].label}</option>)}
            </select>
          </label>
          <label>
            <span>验证证据</span>
            <select value={evidence} onChange={(event) => setEvidence(event.target.value as 'all' | AIEvidenceLevel)}>
              <option value="all">全部证据等级</option>
              {allEvidenceLevels.map((key) => <option value={key} key={key}>{key} · {evidenceMeta[key].label}</option>)}
            </select>
          </label>
          <button className="catalogReset" onClick={resetFilters} type="button">清除筛选</button>
        </div>
      </div>

      <div className="catalogResultBar" aria-live="polite">
        <p>显示 <strong>{filtered.length}</strong> / {aiResearchItems.length} 项已核验工作</p>
        <span>同一项目只显示一次；领域数量与筛选同时计入主域和关联域。</span>
      </div>

      {filtered.length > 0 ? (
        <div className="researchCards">
          {filtered.map((item, index) => {
            const primaryDomain = primaryDomainOf(item);
            const relatedDomains = associatedDomainsOf(item).filter((key) => key !== primaryDomain);
            const meta = domainMeta[primaryDomain];
            return (
              <article className="researchCard" key={item.id} style={{ '--domain-accent': meta.color } as React.CSSProperties}>
                <header className="researchCardHeader">
                  <div>
                    <span className="researchOrdinal">{String(index + 1).padStart(2, '0')}</span>
                    <span className="researchDomain">{meta.index} / {meta.label}</span>
                  </div>
                  <span className={`evidenceBadge evidence-${item.evidenceLevel.toLowerCase()}`} title={evidenceMeta[item.evidenceLevel].description}>
                    {item.evidenceLevel} · {evidenceMeta[item.evidenceLevel].label}
                  </span>
                </header>

                <div className="researchDomainMap" aria-label="知识域与部署层级">
                  <span className="domainRelation primary"><b>主域</b>{meta.label}</span>
                  <span className="domainRelation related">
                    <b>关联域</b>{relatedDomains.length > 0 ? relatedDomains.map((key) => domainMeta[key].label).join(' · ') : '暂无'}
                  </span>
                  <span
                    className="deploymentBadge"
                    title={item.deploymentLevel ? deploymentMeta[item.deploymentLevel].description : '源数据未标注部署等级。'}
                  >
                    <b>部署</b>{item.deploymentLevel ? `${item.deploymentLevel} · ${deploymentMeta[item.deploymentLevel].label}` : '未标注'}
                  </span>
                </div>

                <div className="researchIdentity">
                  <p>{item.year} · {item.organization}</p>
                  <h3>{item.title}</h3>
                  <div className="deviceChips" aria-label="适配或验证装置">
                    {item.devices.map((device) => <span key={device}>{device}</span>)}
                  </div>
                </div>

                <dl className="researchCore">
                  <div><dt>解决问题</dt><dd>{item.problem}</dd></div>
                  <div><dt>技术路径</dt><dd>{item.approach}</dd></div>
                  <div><dt>验证证据</dt><dd>{item.evidence}</dd></div>
                </dl>

                <details className="researchDetails">
                  <summary>查看论文、代码、数据与局限</summary>
                  <div className="researchDetailGrid">
                    <section>
                      <h4>相关论文</h4>
                      <ul>
                        {item.papers.map((paper) => (
                          <li key={`${item.id}-${paper.url}`}>
                            <ExternalLink href={paper.url}>{paper.title}</ExternalLink>
                            <span>{paper.venue} · {paper.year} · 来源：<i className="paperSourceType">{sourceTypeLabel(paper.sourceType)}</i></span>
                          </li>
                        ))}
                      </ul>
                    </section>
                    <section>
                      <h4>相关代码</h4>
                      <ul>
                        {item.code.map((repo, codeIndex) => (
                          <li key={`${item.id}-code-${codeIndex}`}>
                            {repo.url ? <ExternalLink href={repo.url}>{repo.name}</ExternalLink> : <b>{repo.name}</b>}
                            <span className={`codeStatus code-${repo.status}`}>{codeStatusMeta[repo.status].label}</span>
                            {(repo.artifactType || repo.access || isCommercialArtifact(repo)) && (
                              <span className="codeArtifactFacts">
                                {repo.artifactType && <span>类型：{repo.artifactType}</span>}
                                {repo.access && <span>访问：{repo.access}</span>}
                                {isCommercialArtifact(repo) && <strong className="commercialFlag">商业 / 专有软件</strong>}
                              </span>
                            )}
                            <p>{repo.relationship}</p>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>
                  <dl className="researchEvidenceNotes">
                    <div><dt>数据</dt><dd>{item.data}</dd></div>
                    <div><dt>成熟度</dt><dd>{item.maturity}</dd></div>
                    <div><dt>主要局限</dt><dd>{item.limitations}</dd></div>
                  </dl>
                  <div className="researchTags">{item.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
                </details>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="catalogEmpty">
          <h3>没有符合当前筛选条件的条目</h3>
          <p>可以减少关键词，或切换代码与证据等级。</p>
          <button type="button" onClick={resetFilters}>查看全部工作</button>
        </div>
      )}
    </div>
  );
}
