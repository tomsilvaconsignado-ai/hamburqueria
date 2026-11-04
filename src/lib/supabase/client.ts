import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

// Link de "recuperar senha" do e-mail: o Supabase abre a sessão e avisa com PASSWORD_RECOVERY.
// O ouvinte é registrado aqui, junto com o cliente, para não perder o evento ao carregar a página.
let passwordRecovery =
  typeof window !== 'undefined' && /type=recovery/.test(window.location.hash + window.location.search);
supabase?.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') passwordRecovery = true;
});
export const isPasswordRecovery = () => passwordRecovery;
export const endPasswordRecovery = () => {
  passwordRecovery = false;
};
