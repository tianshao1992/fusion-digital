'use client';

import { useMemo, useState } from 'react';
import { useI18n } from '../i18n';
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

const sourceTypeLabelsEn: Record<string, string> = {
  'journal-article': 'Journal article',
  preprint: 'Preprint',
  'conference-paper': 'Conference paper',
  'conference-material': 'Conference material',
  'official-project-page': 'Official project page',
  'official-documentation': 'Official documentation',
  'official-source': 'Official source',
};

const codeStatusLabelsEn: Record<AICodeStatus, string> = {
  'official-direct': 'Official direct implementation',
  'official-enabling': 'Official enabling framework',
  'commercial-enabling': 'Commercial enabling software',
  'community-reproduction': 'Community reproduction',
  'not-public': 'Not publicly available',
};

const codeStatusDescriptionsEn: Record<AICodeStatus, string> = {
  'official-direct': 'Code or weights published by the authors or project and directly associated with this work.',
  'official-enabling': 'An official repository that supports the workflow but is not the complete implementation reported in the paper.',
  'commercial-enabling': 'Commercial or proprietary software enabled the work; this does not make the model, configuration or training assets public.',
  'community-reproduction': 'A third-party reproduction or related implementation, distinct from the authors\' original implementation.',
  'not-public': 'No verifiable public implementation was identified, or the implementation remains internal or closed source.',
};

const evidenceLabelsEn = {
  E0: 'Concept / method', E1: 'Simulation validation', E2: 'Offline facility data',
  E3: 'Real-time / HIL / shadow', E4: 'Facility closed-loop experiment',
} as const;

const evidenceDescriptionsEn = {
  E0: 'A method, architecture or plan without sufficient numerical or facility evidence.',
  E1: 'Validated in a high-fidelity, integrated or synthetic-data environment.',
  E2: 'Trained or independently tested using historical data from a fusion facility.',
  E3: 'Integrated with a real-time system, hardware-in-the-loop test or shadow workflow without direct closed-loop authority.',
  E4: 'Closed-loop actuation affected an actuator or experimental trajectory on a fusion facility.',
} as const;

const deploymentLabelsEn = {
  D1: 'Concept / route', D2: 'Offline research prototype', D3: 'Facility pilot',
  D4: 'Operational workflow', D5: 'Safety-critical / sustained plant operation',
} as const;

const ENGLISH_ABSTRACT_PENDING = 'Expert-reviewed English abstract pending; consult the cited original source.';
const ENGLISH_TITLE_PENDING = 'Expert-reviewed English title pending; consult the cited original source.';
const HAN = /[\u3400-\u9fff]/u;

function verifiedEnglish(value: unknown, fallback = ENGLISH_ABSTRACT_PENDING) {
  const text = String(value ?? '').trim();
  return text && !HAN.test(text) ? text : fallback;
}

function conciseName(value: unknown, fallback = 'Name unavailable in a verified English source') {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  if (!HAN.test(text)) return text;
  const prefix = text.split(/[：:]/u)[0].trim();
  return prefix && !HAN.test(prefix) ? prefix : fallback;
}

function primaryDomainOf(item: (typeof aiResearchItems)[number]) {
  return item.primaryDomain ?? item.domain;
}

function associatedDomainsOf(item: (typeof aiResearchItems)[number]) {
  return Array.from(new Set([primaryDomainOf(item), ...(item.relatedDomains ?? [])]));
}

function sourceTypeLabel(sourceType: string | undefined, en: boolean) {
  if (!sourceType) return en ? 'Not specified' : '未标注';
  return en
    ? (sourceTypeLabelsEn[sourceType] ?? verifiedEnglish(sourceType, 'Source type not specified'))
    : (sourceTypeLabels[sourceType] ?? sourceType);
}

function isCommercialArtifact(repo: (typeof aiResearchItems)[number]['code'][number]) {
  const artifactType = repo.artifactType?.toLocaleLowerCase('en-US') ?? '';
  const access = repo.access?.toLocaleLowerCase('en-US') ?? '';
  return repo.status === 'commercial-enabling'
    || artifactType.includes('commercial')
    || ['commercial', 'proprietary', 'licensed'].some((token) => access.includes(token));
}

function searchableText(item: (typeof aiResearchItems)[number], en: boolean) {
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
    ...item.papers.flatMap((paper) => [paper.title, paper.venue, paper.sourceType, sourceTypeLabel(paper.sourceType, en)]),
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
  const { locale } = useI18n();
  const en = locale === 'en';
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
      return !normalizedQuery || searchableText(item, en).includes(normalizedQuery);
    });
  }, [query, domain, codeStatus, evidence, en]);

  const resetFilters = () => {
    setQuery('');
    setDomain('all');
    setCodeStatus('all');
    setEvidence('all');
  };

  return (
    <div className="researchCatalog">
      <div className="catalogToolbar" aria-label={en ? 'Research-atlas filters' : '研究图谱筛选器'}>
        <label className="catalogSearch">
          <span>{en ? 'Search work, facility, organization, problem or code' : '检索工作、装置、机构、问题或代码'}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={en ? 'For example: TCV, disruption prediction, TORAX, surrogate model…' : '例如：TCV、破裂预测、TORAX、代理模型……'}
          />
        </label>

        <fieldset className="catalogDomainFilters">
          <legend>{en ? 'Nine knowledge domains' : '九个知识域'}</legend>
          <button className={domain === 'all' ? 'isActive' : ''} onClick={() => setDomain('all')} type="button">
            {en ? 'All' : '全部'} <b>{aiResearchItems.length}</b>
          </button>
          {allDomains.map((key) => (
            <button
              className={domain === key ? 'isActive' : ''}
              onClick={() => setDomain(key)}
              type="button"
              key={key}
            >
              {en ? domainMeta[key].en : domainMeta[key].short} <b>{domainCounts[key]}</b>
            </button>
          ))}
        </fieldset>

        <div className="catalogSelects">
          <label>
            <span>{en ? 'Code relationship' : '代码关联'}</span>
            <select value={codeStatus} onChange={(event) => setCodeStatus(event.target.value as 'all' | AICodeStatus)}>
              <option value="all">{en ? 'All availability states' : '全部开放状态'}</option>
              {allCodeStatuses.map((key) => <option value={key} key={key}>{en ? codeStatusLabelsEn[key] : codeStatusMeta[key].label}</option>)}
            </select>
          </label>
          <label>
            <span>{en ? 'Validation evidence' : '验证证据'}</span>
            <select value={evidence} onChange={(event) => setEvidence(event.target.value as 'all' | AIEvidenceLevel)}>
              <option value="all">{en ? 'All evidence levels' : '全部证据等级'}</option>
              {allEvidenceLevels.map((key) => <option value={key} key={key}>{key} · {en ? evidenceLabelsEn[key] : evidenceMeta[key].label}</option>)}
            </select>
          </label>
          <button className="catalogReset" onClick={resetFilters} type="button">{en ? 'Clear filters' : '清除筛选'}</button>
        </div>
      </div>

      <div className="catalogResultBar" aria-live="polite">
        <p>{en ? 'Showing' : '显示'} <strong>{filtered.length}</strong> / {aiResearchItems.length} {en ? 'verified records' : '项已核验工作'}</p>
        <span>{en ? 'Each project appears once; domain counts and filters include both primary and associated domains.' : '同一项目只显示一次；领域数量与筛选同时计入主域和关联域。'}</span>
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
                    <span className="researchDomain">{meta.index} / {en ? meta.en : meta.label}</span>
                  </div>
                  <span className={`evidenceBadge evidence-${item.evidenceLevel.toLowerCase()}`} title={en ? evidenceDescriptionsEn[item.evidenceLevel] : evidenceMeta[item.evidenceLevel].description}>
                    {item.evidenceLevel} · {en ? evidenceLabelsEn[item.evidenceLevel] : evidenceMeta[item.evidenceLevel].label}
                  </span>
                </header>

                <div className="researchDomainMap" aria-label={en ? 'Knowledge domains and deployment level' : '知识域与部署层级'}>
                  <span className="domainRelation primary"><b>{en ? 'Primary' : '主域'}</b>{en ? meta.en : meta.label}</span>
                  <span className="domainRelation related">
                    <b>{en ? 'Associated' : '关联域'}</b>{relatedDomains.length > 0 ? relatedDomains.map((key) => en ? domainMeta[key].en : domainMeta[key].label).join(' · ') : (en ? 'None' : '暂无')}
                  </span>
                  <span
                    className="deploymentBadge"
                    title={en ? (item.deploymentLevel ? deploymentLabelsEn[item.deploymentLevel] : 'Deployment level is not specified in the source data.') : (item.deploymentLevel ? deploymentMeta[item.deploymentLevel].description : '源数据未标注部署等级。')}
                  >
                    <b>{en ? 'Deployment' : '部署'}</b>{item.deploymentLevel ? `${item.deploymentLevel} · ${en ? deploymentLabelsEn[item.deploymentLevel] : deploymentMeta[item.deploymentLevel].label}` : (en ? 'Not specified' : '未标注')}
                  </span>
                </div>

                <div className="researchIdentity">
                  <p>{item.year} · {en ? verifiedEnglish(item.organization, 'Organization details: consult the cited source') : item.organization}</p>
                  <h3>{en ? verifiedEnglish(item.papers[0]?.title, ENGLISH_TITLE_PENDING) : item.title}</h3>
                  <div className="deviceChips" aria-label={en ? 'Facilities used, targeted or evaluated' : '适配或验证装置'}>
                    {item.devices.map((device) => <span key={device}>{en ? conciseName(device, 'Facility details in cited source') : device}</span>)}
                  </div>
                </div>

                <dl className="researchCore">
                  <div><dt>{en ? 'Research problem' : '解决问题'}</dt><dd>{en ? verifiedEnglish(item.problem) : item.problem}</dd></div>
                  <div><dt>{en ? 'Technical approach' : '技术路径'}</dt><dd>{en ? verifiedEnglish(item.approach) : item.approach}</dd></div>
                  <div><dt>{en ? 'Validation evidence' : '验证证据'}</dt><dd>{en ? verifiedEnglish(item.evidence) : item.evidence}</dd></div>
                </dl>

                <details className="researchDetails">
                  <summary>{en ? 'View papers, code, data and limitations' : '查看论文、代码、数据与局限'}</summary>
                  <div className="researchDetailGrid">
                    <section>
                      <h4>{en ? 'Papers and primary sources' : '相关论文'}</h4>
                      <ul>
                        {item.papers.map((paper) => (
                          <li key={`${item.id}-${paper.url}`}>
                            <ExternalLink href={paper.url}>{en ? verifiedEnglish(paper.title, ENGLISH_TITLE_PENDING) : paper.title}</ExternalLink>
                            <span>{en ? verifiedEnglish(paper.venue, 'Venue not specified') : paper.venue} · {paper.year} · {en ? 'Source: ' : '来源：'}<i className="paperSourceType">{sourceTypeLabel(paper.sourceType, en)}</i></span>
                          </li>
                        ))}
                      </ul>
                    </section>
                    <section>
                      <h4>{en ? 'Code and software relationship' : '相关代码'}</h4>
                      <ul>
                        {item.code.map((repo, codeIndex) => (
                          <li key={`${item.id}-code-${codeIndex}`}>
                            {repo.url ? <ExternalLink href={repo.url}>{en ? conciseName(repo.name, 'Software asset') : repo.name}</ExternalLink> : <b>{en ? conciseName(repo.name, 'Software asset') : repo.name}</b>}
                            <span className={`codeStatus code-${repo.status}`} title={en ? codeStatusDescriptionsEn[repo.status] : codeStatusMeta[repo.status].description}>{en ? codeStatusLabelsEn[repo.status] : codeStatusMeta[repo.status].label}</span>
                            {(repo.artifactType || repo.access || isCommercialArtifact(repo)) && (
                              <span className="codeArtifactFacts">
                                {repo.artifactType && <span>{en ? 'Type: ' : '类型：'}{en ? verifiedEnglish(repo.artifactType, 'Not specified') : repo.artifactType}</span>}
                                {repo.access && <span>{en ? 'Access: ' : '访问：'}{en ? verifiedEnglish(repo.access, 'Not specified') : repo.access}</span>}
                                {isCommercialArtifact(repo) && <strong className="commercialFlag">{en ? 'Commercial / proprietary software' : '商业 / 专有软件'}</strong>}
                              </span>
                            )}
                            <p>{en ? verifiedEnglish(repo.relationship) : repo.relationship}</p>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>
                  <dl className="researchEvidenceNotes">
                    <div><dt>{en ? 'Data' : '数据'}</dt><dd>{en ? verifiedEnglish(item.data) : item.data}</dd></div>
                    <div><dt>{en ? 'Maturity' : '成熟度'}</dt><dd>{en ? verifiedEnglish(item.maturity) : item.maturity}</dd></div>
                    <div><dt>{en ? 'Principal limitations' : '主要局限'}</dt><dd>{en ? verifiedEnglish(item.limitations) : item.limitations}</dd></div>
                  </dl>
                  <div className="researchTags">{item.tags.filter((tag) => !en || !HAN.test(tag)).map((tag) => <span key={tag}>#{tag}</span>)}</div>
                </details>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="catalogEmpty">
          <h3>{en ? 'No records match the current filters' : '没有符合当前筛选条件的条目'}</h3>
          <p>{en ? 'Broaden the query or adjust the code and evidence filters.' : '可以减少关键词，或切换代码与证据等级。'}</p>
          <button type="button" onClick={resetFilters}>{en ? 'View all records' : '查看全部工作'}</button>
        </div>
      )}
    </div>
  );
}
