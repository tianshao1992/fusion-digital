export type AgentCanvasLocale = 'zh-CN' | 'en';

export function canvasStorageKey(locale: AgentCanvasLocale) {
  return `fusiondigital.agent-canvas.v1.${locale === 'en' ? 'en' : 'zh-CN'}`;
}

export function canPersistCanvasDraft(loadedKey: string | null, currentKey: string) {
  return loadedKey === currentKey;
}
