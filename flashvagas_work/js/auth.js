const client = window.supabaseClient;

function setMessage(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text || '';
}

function isPage(file) {
  return window.location.pathname.endsWith('/' + file) || window.location.pathname.endsWith(file);
}

function normalizeProfile(p) {
  if (!p) return null;
  return {
    ...p,
    name: (p.nome ?? p.name ?? '').trim(),
    class_name: p.turma ?? p.class_name ?? null,
    registration: p.matricula ?? p.registration ?? null,
    avatar_url: p.foto ?? p.avatar_url ?? null,
    created_at: p.criado_em ?? p.created_at ?? null,
    role: ['coordinator','coordenador'].includes(String(p.role || '').trim().toLowerCase()) ? 'coordinator' : 'student'
  };
}

async function getCurrentProfile(sessionUser = null) {
  let user = sessionUser;
  if (!user) {
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    user = data.user || null;
  }
  if (!user) return null;

  const { data, error } = await client.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  if (data) {
    const normalized = normalizeProfile(data);
    if (!normalized.name || /^(estudante|student)$/i.test(normalized.name)) {
      const fallbackName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || '';
      if (fallbackName) {
        const { data: repaired, error: repairError } = await client.from('profiles').update({ nome: fallbackName }).eq('id', user.id).select('*').single();
        if (!repairError && repaired) return normalizeProfile(repaired);
        normalized.name = fallbackName;
      }
    }
    return normalized;
  }

  // Se o trigger ainda não criou o perfil (por exemplo, quando a confirmação
  // de e-mail está ativada), recuperamos a função salva no metadata do Auth.
  const pendingGoogleRole = sessionStorage.getItem('eduwork_google_role');
  const metadataRole = (pendingGoogleRole === 'coordinator' || user.user_metadata?.role === 'coordinator') ? 'coordinator' : 'student';
  const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || (metadataRole === 'coordinator' ? 'Coordenação' : 'Estudante');
  const className = metadataRole === 'student' ? (user.user_metadata?.class_name || null) : null;

  const result = await client.from('profiles').upsert({
    id: user.id,
    nome: name,
    email: user.email || '',
    turma: className,
    role: metadataRole === 'coordinator' ? 'Coordinator' : 'Student'
  }, { onConflict: 'id' }).select('*').single();
  if (result.error) throw result.error;
  return normalizeProfile(result.data);
}

async function routeByRole() {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const target = profile.role === 'coordinator' ? 'coordenador.html' : 'aluno.html';
  if (!isPage(target)) window.location.replace(target);
  return profile;
}

let authRedirecting = false;

async function requireAuth(expectedRole = null) {
  try {
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    if (!data.user) {
      if (!authRedirecting && !isPage('index.html')) {
        authRedirecting = true;
        window.location.replace('index.html');
      }
      return null;
    }
    const profile = await getCurrentProfile(data.user);
    if (!profile) return null;
    if (expectedRole && profile.role !== expectedRole) {
      const target = profile.role === 'coordinator' ? 'coordenador.html' : 'aluno.html';
      if (!isPage(target) && !authRedirecting) {
        authRedirecting = true;
        window.location.replace(target);
      }
      return null;
    }
    return profile;
  } catch (error) {
    console.error('Autenticação/perfil:', error);
    return null;
  }
}

async function logout() {
  await client.auth.signOut();
  window.location.replace('index.html');
}

function setupLogin() {
  const loginForm = document.getElementById('loginForm');
  if (!loginForm) return;

  let selectedRole = 'student';
  const tabs = document.querySelectorAll('.tab[data-role]');
  const googleBtn = document.getElementById('googleBtn');
  const signupForm = document.getElementById('signupForm');
  const signupBox = document.getElementById('signupBox');
  const showSignup = document.getElementById('showSignup');
  const showLogin = document.getElementById('showLogin');
  const signupTypeLabel = document.getElementById('signupTypeLabel');
  const signupClassWrap = document.getElementById('signupClassWrap');
  const signupSubmit = document.getElementById('signupSubmit');
  const signupNote = document.getElementById('signupNote');
  const signupHint = document.getElementById('signupHint');

  const updateSignupForRole = () => {
    const coordinator = selectedRole === 'coordinator';
    if (signupTypeLabel) signupTypeLabel.textContent = coordinator ? 'cadastro da coordenação' : 'cadastro de estudante';
    if (signupHint) signupHint.textContent = coordinator ? 'Acesse o espaço da coordenação ou crie uma conta de coordenação.' : 'Ainda não tem conta? Cadastre-se gratuitamente.';
    if (signupClassWrap) signupClassWrap.classList.toggle('hidden', coordinator);
    const classInput = document.getElementById('signupClass');
    if (classInput) classInput.required = false;
    if (signupSubmit) signupSubmit.textContent = coordinator ? 'Criar conta da coordenação' : 'Criar minha conta';
    if (signupNote) signupNote.textContent = coordinator
      ? 'A conta da coordenação não precisa informar turma.'
      : 'Preencha seus dados para criar sua conta de estudante.';
  };

  const setSignupVisible = (visible) => {
    if (!signupBox) return;
    signupBox.classList.toggle('hidden', !visible);
    updateSignupForRole();
    if (visible) document.getElementById('signupName')?.focus();
  };

  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      selectedRole = tab.dataset.role || 'student';
      setMessage('loginMessage', '');
      updateSignupForRole();
    });
  });

  showSignup?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setSignupVisible(true);
  });

  showLogin?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setSignupVisible(false);
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = loginForm.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    setMessage('loginMessage', 'Verificando seus dados...');

    const email = document.getElementById('email')?.value.trim() || '';
    const password = document.getElementById('password')?.value || '';

    try {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const profile = await getCurrentProfile();
      if (!profile) throw new Error('Perfil não encontrado');
      if (profile.role !== selectedRole) {
        await client.auth.signOut();
        setMessage('loginMessage', selectedRole === 'coordinator' ? 'Esta conta é de estudante.' : 'Esta conta é de coordenador.');
        return;
      }
      window.location.replace(profile.role === 'coordinator' ? 'coordenador.html' : 'aluno.html');
    } catch (error) {
      console.error('Login:', error);
      const raw = String(error?.message || '').toLowerCase();
      const networkFailure = /failed to fetch|networkerror|load failed|err_name_not_resolved|fetch/i.test(raw);
      setMessage('loginMessage', raw.includes('invalid login') || raw.includes('invalid credentials')
        ? 'E-mail ou senha incorretos.'
        : networkFailure
          ? 'Falha de DNS/conexão com o Supabase (' + window.EDUWORK_CONFIG?.SUPABASE_URL + '). Confira se a URL em js/config.js é exatamente a exibida em Supabase > Project Settings > API e se o projeto está ativo. Isso não é corrigido apenas pelo CSS.'
          : (error?.message || 'Não foi possível entrar. Confira os dados.'));
    } finally {
      if (button) button.disabled = false;
    }
  });

  updateSignupForRole();

  googleBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (googleBtn.disabled) return;
    googleBtn.disabled = true;
    sessionStorage.setItem('eduwork_google_pending', '1');
    sessionStorage.setItem('eduwork_google_role', selectedRole);
    setMessage('loginMessage', 'Abrindo o Google...');

    try {
      // O Google volta para esta mesma página. O código PKCE será trocado
      // manualmente quando a página retornar, evitando a falha de corrida.
      const redirectTo = window.location.origin + window.location.pathname;
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          scopes: 'openid email profile',
          // Sempre abre o seletor de contas do Google, mesmo que
          // já exista uma conta Google conectada no navegador.
          queryParams: { prompt: 'select_account' }
        }
      });
      if (error) throw error;
    } catch (error) {
      console.error('Google OAuth — diagnóstico completo:', {message:error?.message, name:error?.name, error, origin:window.location.origin, path:window.location.pathname});
      sessionStorage.removeItem('eduwork_google_pending');
      sessionStorage.removeItem('eduwork_google_role');
      const detail = String(error?.message || error || '');
      setMessage('loginMessage', /failed to fetch|networkerror|load failed|fetch/i.test(detail)
        ? 'Falha de conexão com o Supabase (' + window.EDUWORK_CONFIG?.SUPABASE_URL + '). Confira a URL em Supabase > Project Settings > API e se o projeto está ativo; depois tente novamente.'
        : 'O Google não pôde ser aberto. Confira a configuração do provedor Google e as URLs de redirecionamento no Supabase.');
      googleBtn.disabled = false;
    }
  });

  signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = signupForm.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    setMessage('signupMessage', 'Criando sua conta...');

    const name = document.getElementById('signupName')?.value.trim() || '';
    const email = document.getElementById('signupEmail')?.value.trim() || '';
    const password = document.getElementById('signupPassword')?.value || '';
    const className = document.getElementById('signupClass')?.value.trim() || '';

    try {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { data: { full_name: name, class_name: selectedRole === 'student' ? className : null, role: selectedRole } }
      });
      if (error) throw error;

      if (data.session && data.user) {
        const { error: profileError } = await client.from('profiles').upsert({
          id: data.user.id,
          nome: name,
          email,
          turma: selectedRole === 'student' ? className : null,
          role: selectedRole === 'coordinator' ? 'Coordinator' : 'Student'
        }, { onConflict: 'id' });
        if (profileError) throw profileError;
        window.location.replace(selectedRole === 'coordinator' ? 'coordenador.html' : 'aluno.html');
      } else {
        setMessage('signupMessage', selectedRole === 'coordinator' ? 'Conta da coordenação criada! Verifique seu e-mail para confirmar e depois entre.' : 'Conta criada! Verifique seu e-mail para confirmar e depois entre.');
        signupForm.reset();
      }
    } catch (error) {
      console.error('Cadastro:', error);
      const raw = error?.message || '';
      if (raw.toLowerCase().includes('already') || raw.toLowerCase().includes('registered')) {
        setMessage('signupMessage', 'Este e-mail já possui uma conta.');
      } else if (raw.toLowerCase().includes('password')) {
        setMessage('signupMessage', 'A senha precisa ter pelo menos 6 caracteres.');
      } else {
        const friendly = raw.toLowerCase();
        if (friendly.includes('database error') || friendly.includes('trigger') || friendly.includes('profiles')) {
          setMessage('signupMessage', 'A conta não pôde ser finalizada pelo banco. Execute o SQL 01-ajuste-final.sql no Supabase e tente novamente.');
        } else if (friendly.includes('rate limit') || friendly.includes('too many')) {
          setMessage('signupMessage', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
        } else {
          setMessage('signupMessage', 'Não foi possível criar a conta. Confira os dados.');
        }
      }
    } finally {
      if (button) button.disabled = false;
    }
  });

  // O Supabase JS conclui automaticamente o retorno PKCE porque
  // detectSessionInUrl está ativado no config.js. O listener abaixo faz
  // apenas o redirecionamento depois que a sessão estiver pronta.
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('logoutBtn')?.addEventListener('click', logout);
  if (!window.supabaseClient) {
    setMessage('loginMessage', 'Não foi possível carregar o sistema. Verifique a conexão com o Supabase.');
    return;
  }
  setupLogin();

  // Fallback para provedores que concluem a sessão antes do script terminar.
  client.auth.onAuthStateChange(async (event, session) => {
    if (event !== 'SIGNED_IN' || !session?.user) return;
    const pending = sessionStorage.getItem('eduwork_google_pending') === '1';
    const hasCode = new URLSearchParams(window.location.search).has('code');
    if (!pending && !hasCode) return;
    sessionStorage.removeItem('eduwork_google_pending');
    sessionStorage.removeItem('eduwork_google_role');
    try {
      await routeByRole();
    } catch (err) {
      console.error('Falha no redirecionamento após autenticação:', err);
    }
  });
});
