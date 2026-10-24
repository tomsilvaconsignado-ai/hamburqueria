// Edge Function: administrador cria conta de funcionário (COZINHA ou ENTREGADOR).
//
// Criar usuário em auth.users exige a service_role, que nunca pode ir para o navegador.
// A função confere que quem chama é ADMIN ativo antes de criar a conta.
//
// Variáveis: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { corsHeaders, json } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: caller } = await admin.auth.getUser(jwt);
  if (!caller.user) return json({ error: 'Sessão inválida.' }, 401);

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role, is_active')
    .eq('id', caller.user.id)
    .maybeSingle();
  if (!callerProfile || callerProfile.role !== 'ADMIN' || !callerProfile.is_active) {
    return json({ error: 'Apenas administradores podem cadastrar funcionários.' }, 403);
  }

  let body: { email?: string; password?: string; full_name?: string; phone?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400);
  }

  const email = body.email?.trim().toLowerCase();
  const fullName = body.full_name?.trim();
  const phone = body.phone?.trim() ?? '';
  if (!email || !fullName) return json({ error: 'Nome e e-mail são obrigatórios.' }, 400);
  if (body.role !== 'KITCHEN' && body.role !== 'DELIVERY') {
    return json({ error: 'Função inválida. Apenas KITCHEN ou DELIVERY.' }, 400);
  }
  if (!body.password || body.password.length < 8) {
    return json({ error: 'A senha inicial precisa ter pelo menos 8 caracteres.' }, 400);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: body.password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone },
  });
  if (createError || !created.user) {
    return json({ error: createError?.message ?? 'Falha ao criar usuário.' }, 400);
  }

  // A trigger handle_new_user cria o perfil como CUSTOMER; aqui promovemos para a função da equipe
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .update({ role: body.role, full_name: fullName, phone, is_active: true, updated_at: new Date().toISOString() })
    .eq('id', created.user.id)
    .select('*')
    .single();
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: 'Falha ao configurar o perfil do funcionário.' }, 500);
  }

  await admin.from('audit_logs').insert({
    actor_id: caller.user.id,
    action: 'CREATE_STAFF_MEMBER',
    entity_type: 'profiles',
    entity_id: created.user.id,
    metadata: { email, role: body.role, name: fullName },
  });

  return json({ success: true, profile });
});
