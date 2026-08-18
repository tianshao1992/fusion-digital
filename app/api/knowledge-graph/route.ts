import { queryKnowledgeGraph } from '@/app/knowledge-graph/data';

export const dynamic = 'force-dynamic';

const integer = (value: string | null, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = queryKnowledgeGraph({
    q: url.searchParams.get('q') ?? '',
    domain: url.searchParams.get('domain') ?? 'all',
    type: url.searchParams.get('type') ?? 'all',
    device: url.searchParams.get('device') ?? '',
    focus: url.searchParams.get('focus') ?? '',
    depth: integer(url.searchParams.get('depth'), url.searchParams.has('focus') ? 1 : 0),
    limit: integer(url.searchParams.get('limit'), 350),
    locale: url.searchParams.get('locale') ?? 'zh-CN',
  });
  return Response.json(result, {
    headers: {
      'Cache-Control': 'public, max-age=60, s-maxage=600, stale-while-revalidate=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
