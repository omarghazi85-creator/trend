/** Health endpoint: does not wake WordPress, perform DB work, or reveal config. */
export default async (request: Request): Promise<Response> => {
  if (request.method !== 'GET') return new Response('method_not_allowed', {status:405});
  return Response.json({service:'arabiatrend-worker',version:'0.1.0',mode:'idle',wordpressWrites:'disabled_by_default'}, {headers:{'cache-control':'public, max-age=300'}});
};