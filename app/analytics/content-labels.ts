import snapshot from "@/public/data/fusion-knowledge-graph.json";
import { analyticsPublicIdDigest } from "./contracts";

const knowledgeLabels = new Map(
  snapshot.nodes.map((node) => [analyticsPublicIdDigest(node.id), node.label] as const),
);

const fixedLabels = new Map<string, string>([
  ["section:community", "社区与协作"],
  ["section:domains", "专业领域"],
  ["section:prototype-workspace", "数字样机工作台"],
  ["section:resources", "开放资源"],
  ["prototype-device:paramak-full-device", "Paramak 全装置样机"],
  ["prototype-device:exl-50u-2026-upgrade", "EXL-50U 2026 升级样机"],
  ["prototype-device:ehl-2-preliminary", "EHL-2 初步设计样机"],
  ["prototype-device:iter-educational-model", "ITER 教学模型"],
]);

export function analyticsContentDisplayLabel(contentKey: string | null): string | null {
  if (!contentKey) return null;
  const fixed = fixedLabels.get(contentKey);
  if (fixed) return fixed;
  if (contentKey.startsWith("efit-shot:")) return `EFIT 炮号 ${contentKey.slice("efit-shot:".length)}`;
  if (contentKey.startsWith("knowledge-node:")) {
    const digest = contentKey.slice("knowledge-node:".length);
    return knowledgeLabels.get(digest) ?? `知识节点 ${digest.slice(0, 8)}`;
  }
  if (contentKey.startsWith("search:")) return contentKey.slice("search:".length);
  return contentKey;
}
