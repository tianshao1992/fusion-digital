type TooltipParams = {
  dataType?: string;
  data?: Record<string, unknown>;
};

const typeLabels: Record<string, { zh: string; en: string }> = {
  research: { zh: '研究工作', en: 'Research activity' }, paper: { zh: '论文', en: 'Publication' },
  code: { zh: '代码', en: 'Code asset' }, device: { zh: '装置', en: 'Fusion device' },
  tool: { zh: '工具', en: 'Modelling tool' }, task: { zh: '任务', en: 'Technical task' },
  organization: { zh: '机构', en: 'Organization' },
};

const domainLabels: Record<string, { zh: string; en: string }> = {
  physics: { zh: '物理模拟', en: 'Physics modelling' }, engineering: { zh: '工程仿真', en: 'Engineering simulation' },
  control: { zh: '集成控制', en: 'Integrated control' }, diagnostics: { zh: '诊断感知', en: 'Diagnostics and sensing' },
  ai: { zh: '智能原生', en: 'AI-native methods' }, facility: { zh: '装置', en: 'Fusion facilities' },
};

function text(value: unknown, fallback = '') {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
}

function escapeTooltip(value: unknown) {
  return text(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatKnowledgeGraphTooltip(params: unknown, locale: 'zh-CN' | 'en' = 'zh-CN') {
  const item = (params ?? {}) as TooltipParams;
  const data = item.data ?? {};
  if (item.dataType === 'edge') {
    const relation = text(data.relationLabel, text(data.relation, locale === 'en' ? 'Relation' : '关联'));
    return `<b>${escapeTooltip(relation)}</b><br/>${escapeTooltip(text(data.evidenceLabel, locale === 'en' ? 'Open an endpoint to inspect the evidence.' : '点击端点查看证据'))}`;
  }

  const label = text(data.entityLabel, text(data.name, locale === 'en' ? 'Unnamed entity' : '未命名实体'));
  const type = text(data.entityType);
  const domain = text(data.entityDomain);
  const description = text(data.entityDescription, locale === 'en' ? 'No detailed description is available.' : '暂无详细说明。');
  const degree = text(data.entityDegree, '0');
  const typeLabel = typeLabels[type]?.[locale === 'en' ? 'en' : 'zh'] ?? type;
  const domainLabel = domainLabels[domain]?.[locale === 'en' ? 'en' : 'zh'] ?? domain;
  const relationCount = locale === 'en' ? `${escapeTooltip(degree)} recorded relations` : `关联 ${escapeTooltip(degree)} 条`;
  return `<div style="max-width:300px;white-space:normal;line-height:1.55"><b>${escapeTooltip(label)}</b><br/>${escapeTooltip(typeLabel)} · ${escapeTooltip(domainLabel)}<br/><span>${escapeTooltip(description)}</span><br/>${relationCount}</div>`;
}
