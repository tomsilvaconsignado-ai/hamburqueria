// Gera os modelos de e-mail do login (Supabase Auth) com a identidade da loja.
//   node supabase/templates/build.mjs            → grava os .html nesta pasta + emails.json
//   SUPABASE_ACCESS_TOKEN=sbp_... node supabase/templates/build.mjs --publicar
//                                                 → também envia para o projeto (API de gerenciamento)
// Variáveis {{ .X }} são do Supabase e ficam como estão. Ao trocar o nome da loja, rode de novo.
import fs from 'fs';

const PROJECT_REF = 'cxnpkjsgdmwzkuzvcjoz';
const STORE = 'Nobre Burger';
const CITY = 'Aracaju · SE';
const SITE = 'https://tomsilvaconsignado-ai.github.io/hamburqueria/';
const LOGO = `${SITE}icons/icon-192.png`;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Layout comum: cabeçalho escuro com a marca, cartão branco, botão laranja/vermelho e rodapé. */
function layout({ preheader, title, intro, button, url = '{{ .ConfirmationURL }}', after = '', code = '' }) {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f1ec;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.08)">
  <tr><td style="background:#0d0f15;padding:24px;text-align:center">
    <img src="${LOGO}" width="56" height="56" alt="" style="border-radius:14px;display:inline-block">
    <div style="font-size:24px;font-weight:900;letter-spacing:2px;color:#ffffff;margin-top:8px">${esc(STORE.toUpperCase())}</div>
    <div style="font-size:11px;letter-spacing:3px;color:#f59e0b;font-weight:bold">HAMBÚRGUER ARTESANAL</div>
  </td></tr>
  <tr><td style="height:5px;background:linear-gradient(90deg,#f59e0b,#f97316,#dc2626);background-color:#f97316"></td></tr>
  <tr><td style="padding:28px 28px 8px">
    <h1 style="margin:0 0 12px;font-size:22px;color:#111827">${esc(title)}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#374151">${intro}</p>
    ${button ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center" style="padding:4px 0 20px">
      <a href="${url}" style="display:inline-block;background:#dc2626;background-image:linear-gradient(90deg,#ea580c,#dc2626);color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 28px;border-radius:14px">${esc(button)}</a>
    </td></tr></table>` : ''}
    ${code ? `<p style="margin:0 0 20px;text-align:center"><span style="display:inline-block;font-size:30px;letter-spacing:8px;font-weight:900;color:#111827;background:#fff7ed;border:2px dashed #f59e0b;border-radius:14px;padding:12px 20px">${code}</span></p>` : ''}
    ${after}
    ${button ? `<p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#6b7280">Se o botão não abrir, copie e cole este endereço no navegador:<br><a href="${url}" style="color:#ea580c;word-break:break-all">${url}</a></p>` : ''}
  </td></tr>
  <tr><td style="padding:16px 28px 28px">
    <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af">Não foi você? Pode ignorar este e-mail com segurança: nada muda na sua conta.</p>
  </td></tr>
  <tr><td style="background:#0d0f15;padding:18px;text-align:center;font-size:12px;color:#9ca3af">
    🍔 <strong style="color:#ffffff">${esc(STORE)}</strong> · ${esc(CITY)}<br>
    <a href="${SITE}" style="color:#f59e0b;text-decoration:none">Fazer um pedido</a>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}

const note = (text) => `<p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:#374151;background:#fff7ed;border-left:4px solid #f59e0b;padding:10px 12px;border-radius:8px">${text}</p>`;

// Notificações de segurança (sem botão)
const notice = (title, text) =>
  layout({ preheader: title, title, intro: text, button: '', after: note(`Se não foi você, fale com a ${esc(STORE)} ou troque sua senha em <a href="${SITE}recuperar-senha" style="color:#ea580c">Recuperar senha</a>.`) });

export const EMAILS = {
  confirmation: {
    subject: `Confirme seu cadastro na ${STORE} 🍔`,
    html: layout({
      preheader: 'Falta só um clique para ativar sua conta.',
      title: 'Bem-vindo! Confirme seu e-mail',
      intro: `Que bom ter você por aqui! Toque no botão para ativar sua conta na <strong>${esc(STORE)}</strong> e acompanhar seus pedidos, salvar endereço e pedir mais rápido.`,
      button: 'Confirmar meu e-mail',
      after: note('O link vale por 1 hora.'),
    }),
  },
  recovery: {
    subject: `Redefina sua senha · ${STORE}`,
    html: layout({
      preheader: 'Crie uma senha nova em poucos segundos.',
      title: 'Vamos criar uma senha nova?',
      intro: 'Recebemos um pedido para redefinir a senha da sua conta. Toque no botão e escolha a senha nova.',
      button: 'Criar senha nova',
      after: note('O link vale por 1 hora e só pode ser usado uma vez.'),
    }),
  },
  magic_link: {
    subject: `Seu link de acesso · ${STORE}`,
    html: layout({
      preheader: 'Entre na sua conta com um toque.',
      title: 'Seu link de acesso',
      intro: 'Toque no botão para entrar na sua conta, sem precisar de senha.',
      button: 'Entrar na minha conta',
      after: note('O link vale por 1 hora e só pode ser usado uma vez.'),
    }),
  },
  invite: {
    subject: `Você foi convidado para a equipe da ${STORE}`,
    html: layout({
      preheader: 'Ative seu acesso ao painel da loja.',
      title: 'Bem-vindo à equipe!',
      intro: `Você foi convidado para usar o sistema da <strong>${esc(STORE)}</strong> (painel, cozinha ou entregas). Toque no botão para ativar seu acesso e criar sua senha.`,
      button: 'Aceitar convite',
    }),
  },
  email_change: {
    subject: `Confirme seu novo e-mail · ${STORE}`,
    html: layout({
      preheader: 'Confirme a troca do e-mail da sua conta.',
      title: 'Confirme seu novo e-mail',
      intro: 'Recebemos um pedido para trocar o e-mail da sua conta de <strong>{{ .Email }}</strong> para <strong>{{ .NewEmail }}</strong>. Toque no botão para confirmar.',
      button: 'Confirmar novo e-mail',
    }),
  },
  reauthentication: {
    subject: `{{ .Token }} é seu código de verificação · ${STORE}`,
    html: layout({
      preheader: 'Seu código de verificação.',
      title: 'Seu código de verificação',
      intro: 'Use o código abaixo para confirmar que é você:',
      button: '',
      code: '{{ .Token }}',
    }),
  },
  password_changed_notification: {
    subject: `Sua senha foi alterada · ${STORE}`,
    html: notice('Sua senha foi alterada', 'A senha da sua conta (<strong>{{ .Email }}</strong>) acabou de ser alterada.'),
  },
  email_changed_notification: {
    subject: `O e-mail da sua conta foi alterado · ${STORE}`,
    html: notice('O e-mail da sua conta foi alterado', 'O e-mail da sua conta foi trocado de <strong>{{ .OldEmail }}</strong> para <strong>{{ .Email }}</strong>.'),
  },
  phone_changed_notification: {
    subject: `O telefone da sua conta foi alterado · ${STORE}`,
    html: notice('O telefone da sua conta foi alterado', 'O telefone da conta <strong>{{ .Email }}</strong> foi alterado.'),
  },
  identity_linked_notification: {
    subject: `Nova forma de entrar na sua conta · ${STORE}`,
    html: notice('Nova forma de entrar na sua conta', 'Uma nova forma de login foi ligada à conta <strong>{{ .Email }}</strong>.'),
  },
  identity_unlinked_notification: {
    subject: `Forma de entrar removida da sua conta · ${STORE}`,
    html: notice('Forma de entrar removida', 'Uma forma de login foi removida da conta <strong>{{ .Email }}</strong>.'),
  },
  mfa_factor_enrolled_notification: {
    subject: `Nova verificação adicionada à sua conta · ${STORE}`,
    html: notice('Nova verificação adicionada', 'Um novo método de verificação foi adicionado à conta <strong>{{ .Email }}</strong>.'),
  },
  mfa_factor_unenrolled_notification: {
    subject: `Verificação removida da sua conta · ${STORE}`,
    html: notice('Verificação removida', 'Um método de verificação foi removido da conta <strong>{{ .Email }}</strong>.'),
  },
};

const dir = new URL('./', import.meta.url);
const payload = {};
for (const [name, { subject, html }] of Object.entries(EMAILS)) {
  fs.writeFileSync(new URL(`${name}.html`, dir), html);
  payload[`mailer_subjects_${name}`] = subject;
  payload[`mailer_templates_${name}_content`] = html;
}
fs.writeFileSync(new URL('emails.json', dir), JSON.stringify(payload, null, 2) + '\n');
console.log(`${Object.keys(EMAILS).length} modelos gerados.`);

if (process.argv.includes('--publicar')) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('Defina SUPABASE_ACCESS_TOKEN (token pessoal sbp_...).');
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  console.log('Publicação:', res.status, res.ok ? 'ok' : (await res.text()).slice(0, 300));
}
