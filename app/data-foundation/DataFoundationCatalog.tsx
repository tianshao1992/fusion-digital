'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { useI18n } from '../i18n';
import {
  accessMeta,
  dataCategoryMeta,
  dataFoundationRecords,
  dataLayerMeta,
  maturityMeta,
  type AccessClass,
  type DataCategory,
  type DataLayer,
} from './dataFoundation';

type FilterValue<T extends string> = T | 'all';

const sourceTypeEn = {
  'official-docs': 'Official documentation',
  'official-repository': 'Official repository',
  'data-portal': 'Data portal',
  'journal-paper': 'Primary paper',
  'technical-report': 'Technical report',
  standard: 'Standard',
} as const;

export default function DataFoundationCatalog() {
  const { locale } = useI18n();
  const en = locale === 'en';
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FilterValue<DataCategory>>('all');
  const [access, setAccess] = useState<FilterValue<AccessClass>>('all');
  const [layer, setLayer] = useState<FilterValue<DataLayer>>('all');

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(en ? 'en' : 'zh-CN');
    return dataFoundationRecords.filter((record) => {
      if (category !== 'all' && record.category !== category) return false;
      if (access !== 'all' && record.access !== access) return false;
      if (layer !== 'all' && !record.layers.includes(layer)) return false;
      if (!needle) return true;
      const text = [
        record.name,
        en ? record.organizationEn : record.organization,
        en ? record.scopeEn : record.scope,
        en ? record.objectsEn : record.objects,
        ...record.interfaces,
        ...record.technologies,
        ...record.devices,
      ].join(' ').toLocaleLowerCase(en ? 'en' : 'zh-CN');
      return text.includes(needle);
    });
  }, [access, category, en, layer, query]);

  const categories = Object.keys(dataCategoryMeta) as DataCategory[];
  const accesses = Object.keys(accessMeta) as AccessClass[];
  const layers = Object.keys(dataLayerMeta) as DataLayer[];

  return <section id="catalog" className="dataCatalog" aria-labelledby="data-catalog-title">
    <div className="dataSectionHead">
      <p className="dataEyebrow">05 / {en ? 'EVIDENCE CATALOGUE' : '证据目录'}</p>
      <h2 id="data-catalog-title">{en ? 'Platforms, archives, standards, databases, reports and code' : '平台、档案、标准、数据库、报告与代码'}</h2>
      <p>{en ? 'Every record separates openness from maturity and states what the cited evidence does not establish. Filters describe the evidence catalogue, not a procurement shortlist.' : '每条记录分别标注开放性与成熟度，并说明来源尚不能证明什么。筛选结果是证据目录，不是采购短名单。'}</p>
    </div>
    <div className="dataFilters" role="search">
      <label><span>{en ? 'Search' : '搜索'}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={en ? 'Platform, device, standard or interface…' : '平台、装置、标准或接口…'} /></label>
      <label><span>{en ? 'Class' : '类别'}</span><select value={category} onChange={(event) => setCategory(event.target.value as FilterValue<DataCategory>)}><option value="all">{en ? 'All classes' : '全部类别'}</option>{categories.map((item) => <option value={item} key={item}>{en ? dataCategoryMeta[item].en : dataCategoryMeta[item].zh}</option>)}</select></label>
      <label><span>{en ? 'Access' : '访问'}</span><select value={access} onChange={(event) => setAccess(event.target.value as FilterValue<AccessClass>)}><option value="all">{en ? 'All access levels' : '全部访问级别'}</option>{accesses.map((item) => <option value={item} key={item}>{en ? accessMeta[item].en : accessMeta[item].zh}</option>)}</select></label>
      <label><span>{en ? 'Layer' : '层级'}</span><select value={layer} onChange={(event) => setLayer(event.target.value as FilterValue<DataLayer>)}><option value="all">{en ? 'All layers' : '全部层级'}</option>{layers.map((item) => <option value={item} key={item}>{dataLayerMeta[item].no} · {en ? dataLayerMeta[item].shortEn : dataLayerMeta[item].short}</option>)}</select></label>
      <output aria-live="polite">{filtered.length} / {dataFoundationRecords.length}</output>
    </div>
    <div className="dataRecordGrid">
      {filtered.map((record, index) => <article className="dataRecord" key={record.id} style={{ '--record-color': dataCategoryMeta[record.category].color } as CSSProperties}>
        <header>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <div><b>{en ? dataCategoryMeta[record.category].en : dataCategoryMeta[record.category].zh}</b><small>{en ? maturityMeta[record.maturity].en : maturityMeta[record.maturity].zh}</small></div>
        </header>
        <h3>{record.name}</h3>
        <p className="dataRecordOrg">{en ? record.organizationEn : record.organization} · {en ? record.regionEn : record.region}</p>
        <p>{en ? record.scopeEn : record.scope}</p>
        <dl>
          <div><dt>{en ? 'Data objects' : '数据对象'}</dt><dd>{en ? record.objectsEn : record.objects}</dd></div>
          <div><dt>{en ? 'Interfaces' : '接口'}</dt><dd>{record.interfaces.join(' · ')}</dd></div>
          <div><dt>{en ? 'Technology' : '技术'}</dt><dd>{record.technologies.join(' · ')}</dd></div>
          <div><dt>{en ? 'Facilities / scope' : '装置/范围'}</dt><dd>{record.devices.join(' · ')}</dd></div>
          <div><dt>{en ? 'Access' : '访问'}</dt><dd>{en ? accessMeta[record.access].en : accessMeta[record.access].zh}</dd></div>
        </dl>
        <div className="dataLayerTags">{record.layers.map((item) => <span key={item}>{dataLayerMeta[item].no} · {en ? dataLayerMeta[item].shortEn : dataLayerMeta[item].short}</span>)}</div>
        <details><summary>{en ? 'Applicability boundary and primary evidence' : '适用边界与一手证据'}</summary><p>{en ? record.boundaryEn : record.boundary}</p><ul>{record.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer"><span>{en ? source.labelEn : source.label}</span><small>{en ? sourceTypeEn[source.type] : ({ 'official-docs': '官方文档', 'official-repository': '官方仓库', 'data-portal': '数据门户', 'journal-paper': '原始论文', 'technical-report': '技术报告', standard: '标准' } as const)[source.type]} ↗</small></a></li>)}</ul></details>
      </article>)}
    </div>
    {filtered.length === 0 && <p className="dataEmpty" role="status">{en ? 'No evidence records match the current filters.' : '没有证据条目符合当前筛选条件。'}</p>}
  </section>;
}
