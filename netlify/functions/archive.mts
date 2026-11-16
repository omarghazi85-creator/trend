/**
 * Read-only, bounded archive proxy for the static ArabiaTrend preview.
 * Never writes to WordPress, schedules work, or exposes credentials.
 */
const URL_ORIGIN = 'https://arabiatrend.com';
const UPSTREAM = URL_ORIGIN + '/wp-json/atn-light/v1/archive?limit=100&page=1';
export default async (request: Request): Promise<Response> => {
  if (request.method !== 'GET') return new Response('method_not_allowed', {status:405});
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(UPSTREAM, {
      method:'GET', signal:controller.signal,
      headers:{accept:'application/json'}
    });
    if (!response.ok) throw new Error('upstream_unavailable');
    const json:unknown = await response.json();
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('invalid_archive_json');
    const data = json as Record<string,unknown>;
    if (data.scope !== 'latest_archived_pages_only' || !Array.isArray(data.items)) throw new Error('invalid_archive_shape');
    const items = data.items.filter((item):item is Record<string,unknown> => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      const p=item as Record<string,unknown>;
      return typeof p.title==='string' && typeof p.link==='string'
        && typeof p.country==='string' && typeof p.kind==='string'
        && typeof p.date==='string' && typeof p.date_iso==='string'
        && p.link.startsWith(URL_ORIGIN+'/trend-archive/');
    }).slice(0,100).map(p=>({
      title:(p.title as string).slice(0,240),
      link:p.link,
      country:p.country,
      kind:p.kind,
      date:p.date,
      date_iso:p.date_iso
    }));
    return Response.json({scope:'latest_archived_pages_only',items,available_in_window:data.total_in_window ?? items.length},{
      headers:{'cache-control':'public, max-age=300, s-maxage=600', 'x-content-type-options':'nosniff'}
    });
  } catch {
    return Response.json({error:'archive_temporarily_unavailable',items:[]},{status:503,headers:{'cache-control':'no-store'}});
  } finally {
    clearTimeout(timer);
  }
};
