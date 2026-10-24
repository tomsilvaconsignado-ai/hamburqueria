// Cabeçalhos CORS compartilhados pelas Edge Functions chamadas pelo navegador.
// SITE_URL pode conter caminho (ex.: GitHub Pages em /hamburqueria); CORS usa só a origem.
const siteUrl = Deno.env.get('SITE_URL');
const allowedOrigin = siteUrl ? new URL(siteUrl).origin : '*';

export const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
