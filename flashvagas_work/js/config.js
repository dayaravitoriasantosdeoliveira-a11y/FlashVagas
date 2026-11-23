// Configuração pública do Supabase. Use somente a URL e a chave publicável do SEU projeto.
// Não coloque service_role, senha ou chaves secretas neste arquivo.
window.EDUWORK_CONFIG = {
  SUPABASE_URL: "https://oozqjfhvijumvkoupuzu.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_dIiroAjAqAcqiMvxVKMHHQ_5CMX92oh"
};

(() => {
  const cfg = window.EDUWORK_CONFIG;
  const validUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.SUPABASE_URL || '');
  if (!validUrl || !cfg.SUPABASE_PUBLISHABLE_KEY) {
    console.error('[FlashVagas] Configuração do Supabase ausente ou inválida. Confira js/config.js.');
    window.EDUWORK_CONFIG_ERROR = 'A configuração do Supabase está incompleta. Confira js/config.js.';
    return;
  }
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('[FlashVagas] Biblioteca Supabase não carregou. Verifique a conexão e o bloqueio de CDN.');
    window.EDUWORK_CONFIG_ERROR = 'A biblioteca de conexão não carregou. Verifique a internet e recarregue a página.';
    return;
  }
  window.supabaseClient = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } }
  );
})();
