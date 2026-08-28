"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  HOME_ANALYTICS_SECTIONS,
  classifyAnalyticsReferrerHost,
  normalizeAnalyticsContentKey,
  normalizeAnalyticsPath,
  type AnalyticsDeviceClass,
  type AnalyticsEventInput,
  type AnalyticsReferrerSource,
} from "./contracts";
import {
  ANALYTICS_CONTENT_EVENT,
  type AnalyticsContentDetail,
} from "./client";

const VISITOR_STORAGE_KEY = "fusiondigital.analytics.visitor.v1";
const SESSION_STORAGE_KEY = "fusiondigital.analytics.session.v1";
const SESSION_IDLE_MS = 30 * 60 * 1_000;

type ActiveView = {
  path: string;
  contentKey: string | null;
  startedAt: number;
};

export default function AnalyticsTracker({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const activeRef = useRef<ActiveView | null>(null);
  const initialReferrerRef = useRef<AnalyticsReferrerSource | null | undefined>(undefined);

  useEffect(() => {
    if (!enabled || analyticsOptedOut()) return;

    const trackLocation = () => {
      const path = approvedPath(window.location.pathname);
      if (!path) return;
      flushEngagement(activeRef.current);
      const contentKey = approvedHashContent(path, window.location.hash);
      activeRef.current = { path, contentKey, startedAt: Date.now() };
      sendAnalyticsEvent({
        eventType: "page_view",
        path,
        contentKey,
        referrerSource: initialReferrer(initialReferrerRef),
      });
    };

    const handleContent = (event: Event) => {
      const detail = (event as CustomEvent<AnalyticsContentDetail>).detail;
      if (!detail || typeof detail.kind !== "string" || typeof detail.id !== "string") return;
      const path = approvedPath(window.location.pathname);
      if (!path) return;
      let contentKey: string | null;
      try {
        contentKey = normalizeAnalyticsContentKey(`${detail.kind}:${detail.id}`);
      } catch {
        return;
      }
      if (!contentKey) return;
      flushEngagement(activeRef.current);
      activeRef.current = { path, contentKey, startedAt: Date.now() };
      sendAnalyticsEvent({ eventType: "content_view", path, contentKey });
    };

    const handleHidden = () => {
      if (document.visibilityState !== "hidden") return;
      flushEngagement(activeRef.current);
      activeRef.current = null;
    };

    const handleVisible = () => {
      if (document.visibilityState !== "visible" || activeRef.current) return;
      const path = approvedPath(window.location.pathname);
      if (path) activeRef.current = {
        path,
        contentKey: approvedHashContent(path, window.location.hash),
        startedAt: Date.now(),
      };
    };

    trackLocation();
    window.addEventListener("hashchange", trackLocation);
    window.addEventListener(ANALYTICS_CONTENT_EVENT, handleContent);
    window.addEventListener("pagehide", handleHidden);
    document.addEventListener("visibilitychange", handleHidden);
    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      flushEngagement(activeRef.current);
      activeRef.current = null;
      window.removeEventListener("hashchange", trackLocation);
      window.removeEventListener(ANALYTICS_CONTENT_EVENT, handleContent);
      window.removeEventListener("pagehide", handleHidden);
      document.removeEventListener("visibilitychange", handleHidden);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [enabled, pathname]);

  return null;
}

function sendAnalyticsEvent(input: {
  eventType: AnalyticsEventInput["eventType"];
  path: string;
  contentKey?: string | null;
  referrerSource?: AnalyticsEventInput["referrerSource"];
  durationMs?: number | null;
}): void {
  if (analyticsOptedOut()) return;
  const identity = analyticsIdentity();
  if (!identity) return;
  const event: AnalyticsEventInput = {
    eventId: randomOpaqueId(),
    eventType: input.eventType,
    visitorId: identity.visitorId,
    sessionId: identity.sessionId,
    path: input.path,
    contentKey: input.contentKey ?? null,
    referrerSource: input.referrerSource ?? null,
    deviceClass: deviceClass(),
    durationMs: input.durationMs ?? null,
  };
  void fetch("/api/analytics/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    keepalive: true,
  }).catch(() => undefined);
}

function flushEngagement(active: ActiveView | null): void {
  if (!active) return;
  const durationMs = Math.min(30 * 60 * 1_000, Date.now() - active.startedAt);
  if (durationMs < 1_000) return;
  sendAnalyticsEvent({
    eventType: "engagement",
    path: active.path,
    contentKey: active.contentKey,
    durationMs,
  });
  active.startedAt = Date.now();
}

function analyticsIdentity(): { visitorId: string; sessionId: string } | null {
  try {
    const visitorStored = JSON.parse(localStorage.getItem(VISITOR_STORAGE_KEY) ?? "null") as {
      id?: unknown;
    } | null;
    const visitorId = validOpaqueId(visitorStored?.id)
      ? visitorStored.id
      : randomOpaqueId();
    if (visitorStored?.id !== visitorId) {
      localStorage.setItem(VISITOR_STORAGE_KEY, JSON.stringify({ id: visitorId }));
    }

    const now = Date.now();
    const sessionStored = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) ?? "null") as {
      id?: unknown;
      lastActivity?: unknown;
    } | null;
    const reusable = validOpaqueId(sessionStored?.id)
      && typeof sessionStored?.lastActivity === "number"
      && now - sessionStored.lastActivity < SESSION_IDLE_MS;
    const sessionId = reusable ? sessionStored.id as string : randomOpaqueId();
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ id: sessionId, lastActivity: now }));
    return { visitorId, sessionId };
  } catch {
    return { visitorId: randomOpaqueId(), sessionId: randomOpaqueId() };
  }
}

function analyticsOptedOut(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return true;
  const privacyNavigator = navigator as Navigator & { globalPrivacyControl?: boolean };
  return navigator.doNotTrack === "1" || privacyNavigator.globalPrivacyControl === true;
}

function approvedPath(value: string): string | null {
  try {
    return normalizeAnalyticsPath(value);
  } catch {
    return null;
  }
}

function approvedHashContent(path: string, hash: string): string | null {
  if (path !== "/" || !hash.startsWith("#")) return null;
  const section = hash.slice(1).toLocaleLowerCase("en-US");
  return HOME_ANALYTICS_SECTIONS.has(section) ? `section:${section}` : null;
}

function initialReferrer(ref: { current: AnalyticsReferrerSource | null | undefined }): AnalyticsReferrerSource | null {
  if (ref.current !== undefined) return ref.current;
  try {
    const url = new URL(document.referrer);
    ref.current = url.origin === window.location.origin
      ? null
      : classifyAnalyticsReferrerHost(url.hostname);
  } catch {
    ref.current = null;
  }
  return ref.current;
}

function deviceClass(): AnalyticsDeviceClass {
  const width = window.innerWidth;
  if (!Number.isFinite(width)) return "other";
  if (width < 720) return "mobile";
  if (width < 1100) return "tablet";
  return "desktop";
}

function randomOpaqueId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function validOpaqueId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,64}$/u.test(value);
}
