"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type ProviderId = "openai" | "anthropic" | "deepseek" | "kimi";
type DefaultProvider = ProviderId | "retrieval";

type ProviderRecord = {
  id: ProviderId;
  label: string;
  defaultModel: string;
  model: string;
  region: string | null;
  configured: boolean;
  available: boolean;
  keyHint: string | null;
  updatedAt: string | null;
  source: string | null;
};

type CredentialData = {
  defaultProvider: DefaultProvider | null;
  providers: ProviderRecord[];
};

type Feedback = { kind: "success" | "error"; message: string } | null;

const PROVIDERS: ReadonlyArray<Pick<ProviderRecord, "id" | "label" | "defaultModel">> = [
  { id: "openai", label: "OpenAI", defaultModel: "gpt-5.6-terra" },
  { id: "anthropic", label: "Anthropic Claude", defaultModel: "claude-sonnet-5" },
  { id: "deepseek", label: "DeepSeek", defaultModel: "deepseek-v4-flash" },
  { id: "kimi", label: "Kimi / Moonshot", defaultModel: "kimi-k3" },
];

const EMPTY_KEYS: Record<ProviderId, string> = {
  openai: "",
  anthropic: "",
  deepseek: "",
  kimi: "",
};

function isProviderId(value: unknown): value is ProviderId {
  return value === "openai" || value === "anthropic" || value === "deepseek" || value === "kimi";
}

function normalizeProvider(input: unknown, fallback: (typeof PROVIDERS)[number]): ProviderRecord {
  const value = input && typeof input === "object" ? input as Partial<ProviderRecord> : {};
  const source = typeof value.source === "string" ? value.source.slice(0, 40) : null;
  return {
    id: fallback.id,
    label: typeof value.label === "string" && value.label.trim() ? value.label.trim().slice(0, 80) : fallback.label,
    defaultModel: typeof value.defaultModel === "string" && value.defaultModel.trim()
      ? value.defaultModel.trim().slice(0, 120)
      : fallback.defaultModel,
    model: typeof value.model === "string" && value.model.trim()
      ? value.model.trim().slice(0, 120)
      : fallback.defaultModel,
    region: typeof value.region === "string" ? value.region.slice(0, 40) : null,
    configured: value.configured === true,
    available: value.available === true,
    keyHint: typeof value.keyHint === "string" ? value.keyHint.slice(0, 80) : null,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
    source,
  };
}

function normalizeCredentialData(input: unknown): CredentialData {
  const value = input && typeof input === "object" ? input as Partial<CredentialData> : {};
  const incoming = Array.isArray(value.providers) ? value.providers : [];
  const providers = PROVIDERS.map((fallback) => normalizeProvider(
    incoming.find((item) => item && typeof item === "object" && (item as { id?: unknown }).id === fallback.id),
    fallback,
  ));
  const defaultProvider = value.defaultProvider === "retrieval" || isProviderId(value.defaultProvider)
    ? value.defaultProvider
    : "retrieval";
  return { defaultProvider, providers };
}

async function apiData<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => null) as {
    data?: T;
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    throw new Error(payload?.error?.message || `模型连接服务暂时不可用（${response.status}）`);
  }
  if (!payload || !("data" in payload)) throw new Error("模型连接服务返回了无法识别的数据");
  return payload.data as T;
}

function sourceLabel(source: string | null, configured: boolean) {
  if (!configured) return "未连接";
  if (source === "personal" || source === "user" || source === "byok") return "个人 API";
  if (source === "platform" || source === "site" || source === "environment") return "站点服务";
  return "已配置";
}

function isPersonalSource(source: string | null) {
  return source === "personal" || source === "user" || source === "byok";
}

function formatUpdatedAt(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "尚无更新时间";
  return `更新于 ${new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))}`;
}

export default function LlmCredentialManager() {
  const [providers, setProviders] = useState<ProviderRecord[]>([]);
  const [models, setModels] = useState<Record<ProviderId, string>>(() => Object.fromEntries(
    PROVIDERS.map((provider) => [provider.id, provider.defaultModel]),
  ) as Record<ProviderId, string>);
  const [regions, setRegions] = useState<Record<ProviderId, string>>({
    openai: "",
    anthropic: "",
    deepseek: "",
    kimi: "cn",
  });
  const [apiKeys, setApiKeys] = useState<Record<ProviderId, string>>(EMPTY_KEYS);
  const [defaultProvider, setDefaultProvider] = useState<DefaultProvider>("retrieval");
  const [savedDefaultProvider, setSavedDefaultProvider] = useState<DefaultProvider>("retrieval");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<ProviderId | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const applyData = useCallback((raw: unknown) => {
    const data = normalizeCredentialData(raw);
    setProviders(data.providers);
    setModels(Object.fromEntries(data.providers.map((provider) => [provider.id, provider.model || provider.defaultModel])) as Record<ProviderId, string>);
    setRegions(Object.fromEntries(data.providers.map((provider) => [
      provider.id,
      provider.id === "kimi" && provider.region === "international" ? "international" : provider.id === "kimi" ? "cn" : "",
    ])) as Record<ProviderId, string>);
    const nextDefault = data.defaultProvider ?? "retrieval";
    setDefaultProvider(nextDefault);
    setSavedDefaultProvider(nextDefault);
  }, []);

  const loadCredentials = useCallback(async (signal?: AbortSignal) => {
    const data = await apiData<CredentialData>("/api/account/llm-credentials", { signal });
    if (!signal?.aborted) applyData(data);
  }, [applyData]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      void loadCredentials(controller.signal)
        .catch((reason) => {
          if ((reason as Error).name !== "AbortError") {
            setFeedback({ kind: "error", message: reason instanceof Error ? reason.message : "无法读取模型连接" });
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    });
    return () => controller.abort();
  }, [loadCredentials]);

  const configuredProviders = useMemo(
    () => new Set(providers.filter((provider) => provider.available).map((provider) => provider.id)),
    [providers],
  );

  async function refreshAfterMutation() {
    const data = await apiData<CredentialData>("/api/account/llm-credentials");
    applyData(data);
  }

  async function saveProvider(event: FormEvent<HTMLFormElement>, provider: ProviderRecord) {
    event.preventDefault();
    if (busy) return;
    const apiKey = apiKeys[provider.id];
    if (!apiKey) {
      setFeedback({ kind: "error", message: `请输入 ${provider.label} 的新 API 密钥。` });
      return;
    }
    setBusy(`${provider.id}:save`);
    setFeedback(null);
    setConfirmingDelete(null);
    try {
      await apiData<unknown>(`/api/account/llm-credentials/${provider.id}`, {
        method: "PUT",
        body: JSON.stringify({
          apiKey,
          model: models[provider.id].trim() || provider.defaultModel,
          ...(provider.id === "kimi" ? { region: regions.kimi } : {}),
        }),
      });
      await refreshAfterMutation();
      setFeedback({ kind: "success", message: `${provider.label} 的个人配置已加密保存。密钥不会再次显示。` });
    } catch (reason) {
      setFeedback({ kind: "error", message: reason instanceof Error ? reason.message : "保存模型连接失败" });
    } finally {
      setApiKeys((current) => ({ ...current, [provider.id]: "" }));
      setBusy(null);
    }
  }

  async function removeProvider(provider: ProviderRecord) {
    if (busy) return;
    setBusy(`${provider.id}:delete`);
    setFeedback(null);
    try {
      await apiData<unknown>(`/api/account/llm-credentials/${provider.id}`, { method: "DELETE" });
      await refreshAfterMutation();
      setFeedback({ kind: "success", message: `${provider.label} 的个人密钥已删除。` });
    } catch (reason) {
      setFeedback({ kind: "error", message: reason instanceof Error ? reason.message : "删除模型连接失败" });
    } finally {
      setApiKeys((current) => ({ ...current, [provider.id]: "" }));
      setConfirmingDelete(null);
      setBusy(null);
    }
  }

  async function saveDefaultProvider() {
    if (busy || defaultProvider === savedDefaultProvider) return;
    setBusy("default");
    setFeedback(null);
    try {
      await apiData<unknown>("/api/account/llm-credentials", {
        method: "PATCH",
        body: JSON.stringify({ defaultProvider }),
      });
      await refreshAfterMutation();
      const selected = defaultProvider === "retrieval"
        ? "仅检索"
        : providers.find((provider) => provider.id === defaultProvider)?.label ?? defaultProvider;
      setFeedback({ kind: "success", message: `默认服务已设为${selected}。` });
    } catch (reason) {
      setDefaultProvider(savedDefaultProvider);
      setFeedback({ kind: "error", message: reason instanceof Error ? reason.message : "保存默认服务失败" });
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <section id="ai-models" className="llmCredentialManager llmCredentialLoading" aria-live="polite" aria-busy="true">
      <span aria-hidden="true" />
      <div><b>正在读取你的模型连接</b><small>密钥内容不会返回到浏览器。</small></div>
    </section>;
  }

  if (!providers.length) {
    return <section id="ai-models" className="llmCredentialManager llmCredentialUnavailable" aria-labelledby="llm-credentials-title">
      <div><p>02 / PERSONAL MODEL APIS</p><h2 id="llm-credentials-title">AI 模型连接</h2><span role="alert">{feedback?.message || "暂时无法读取模型连接。"}</span></div>
      <button type="button" onClick={() => { setLoading(true); setFeedback(null); void loadCredentials().catch((reason) => setFeedback({ kind: "error", message: reason instanceof Error ? reason.message : "无法读取模型连接" })).finally(() => setLoading(false)); }}>重新加载</button>
    </section>;
  }

  return <section id="ai-models" className="llmCredentialManager" aria-labelledby="llm-credentials-title" aria-busy={Boolean(busy)}>
    <header className="llmCredentialHeader">
      <div>
        <p>02 / PERSONAL MODEL APIS</p>
        <h2 id="llm-credentials-title">管理你的大模型 API</h2>
        <span>每个账户独立保存自己的连接。个人密钥由服务端加密，写入后不会重新显示。</span>
      </div>
      <div className="llmDefaultProvider">
        <label htmlFor="llm-default-provider">默认服务</label>
        <div>
          <select id="llm-default-provider" value={defaultProvider} onChange={(event) => setDefaultProvider(event.target.value as DefaultProvider)} disabled={Boolean(busy)}>
            <option value="retrieval">仅检索（不调用模型）</option>
            {providers.map((provider) => <option key={provider.id} value={provider.id} disabled={!provider.available}>{provider.label} · {provider.available ? provider.model : provider.configured ? "加密服务不可用" : "未配置"}</option>)}
          </select>
          <button type="button" onClick={() => void saveDefaultProvider()} disabled={Boolean(busy) || defaultProvider === savedDefaultProvider}>保存默认项</button>
        </div>
      </div>
    </header>

    <div className="llmCredentialBoundary">
      <b>发送边界</b>
      <p>调用模型时，当前问题、有限轮次对话和站内检索证据会发送给你选择的供应商。请遵守对应供应商的数据与隐私政策。</p>
      <span>浏览器不保存 API 密钥</span><span>服务端加密并按用户隔离</span><span>删除后停止后续调用</span>
    </div>

    <div className="llmProviderGrid">
      {providers.map((provider, index) => {
        const personal = isPersonalSource(provider.source);
        const saving = busy === `${provider.id}:save`;
        const deleting = busy === `${provider.id}:delete`;
        const keyHelpId = `llm-key-help-${provider.id}`;
        return <article className="llmProviderCard" data-configured={provider.configured ? "true" : "false"} key={provider.id}>
          <header>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div><h3>{provider.label}</h3><small>{sourceLabel(provider.source, provider.configured)}</small></div>
            <b>{provider.source === "personal" && provider.configured
              ? provider.available ? "已保存" : "待启用"
              : provider.available ? "站点可用" : "未配置"}</b>
          </header>

          <form onSubmit={(event) => void saveProvider(event, provider)}>
            <label htmlFor={`llm-model-${provider.id}`}><span>模型 ID</span>
              <input id={`llm-model-${provider.id}`} value={models[provider.id]} onChange={(event) => setModels((current) => ({ ...current, [provider.id]: event.target.value.slice(0, 120) }))} maxLength={120} pattern="[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}" autoCapitalize="none" spellCheck={false} disabled={Boolean(busy)} />
            </label>
            {provider.id === "kimi" ? <label htmlFor="llm-region-kimi"><span>服务地区</span>
              <select id="llm-region-kimi" value={regions.kimi} onChange={(event) => setRegions((current) => ({ ...current, kimi: event.target.value }))} disabled={Boolean(busy)}>
                <option value="cn">中国区 · moonshot.cn</option>
                <option value="international">国际区 · moonshot.ai</option>
              </select>
            </label> : null}
            <label className="llmSecretField" htmlFor={`llm-key-${provider.id}`}><span>新的 API 密钥</span>
              <input id={`llm-key-${provider.id}`} type="password" value={apiKeys[provider.id]} onChange={(event) => setApiKeys((current) => ({ ...current, [provider.id]: event.target.value.slice(0, 512) }))} maxLength={512} required autoComplete="new-password" autoCapitalize="none" spellCheck={false} aria-describedby={keyHelpId} disabled={Boolean(busy)} />
            </label>
            <small id={keyHelpId}>{provider.configured
              ? `${provider.keyHint ? `密钥标识 · •••• ${provider.keyHint}。` : "已有密钥已保存。"}更新模型或替换连接时，请重新输入密钥。`
              : "只用于本次保存；提交成功后输入框立即清空。"}</small>
            <button className="llmSaveProvider" type="submit" disabled={Boolean(busy)}>{saving ? "正在加密保存…" : personal ? "保存并替换密钥" : provider.configured ? "改用个人 API" : "保存个人配置"}</button>
          </form>

          <footer>
            <span>{formatUpdatedAt(provider.updatedAt)}</span>
            {personal ? <button type="button" className="llmDeleteProvider" onClick={() => setConfirmingDelete(provider.id)} disabled={Boolean(busy)}>删除个人密钥</button> : null}
          </footer>

          {confirmingDelete === provider.id ? <div className="llmDeleteConfirm" role="group" aria-label={`确认删除 ${provider.label} 个人密钥`}>
            <p>确认删除？后续调用将回退到站点服务或仅检索。</p>
            <div><button type="button" onClick={() => setConfirmingDelete(null)} disabled={deleting}>取消</button><button type="button" autoFocus onClick={() => void removeProvider(provider)} disabled={deleting}>{deleting ? "正在删除…" : "确认删除"}</button></div>
          </div> : null}
        </article>;
      })}
    </div>

    <p className={`llmCredentialFeedback${feedback ? ` is-${feedback.kind}` : ""}`} role={feedback?.kind === "error" ? "alert" : "status"} aria-live="polite" aria-atomic="true">{feedback?.message || " "}</p>
    <p className="llmConfiguredSummary">当前可选服务 · {configuredProviders.size} / {providers.length}　个人密钥只属于当前登录账户。</p>
  </section>;
}
