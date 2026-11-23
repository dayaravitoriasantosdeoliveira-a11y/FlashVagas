(() => {
  const body = document.body;
  const focus = body?.dataset?.focus || 'inicio';
  const titles = {
    inicio:'Início',
    oportunidades:'Oportunidades',
    candidaturas:'Candidaturas',
    perfil:'Meu perfil',
    curriculo:'Meu currículo',
    certificados:'Certificados',
    mensagens:'Mensagens',
    criar:'Criar oportunidade',
    avisos:'Avisos',
    alunos:'Alunos'
  };
  document.querySelectorAll('.sidebar-nav a[data-route]').forEach(a => {
    a.classList.toggle('active', a.dataset.route === focus);
  });
  document.querySelectorAll('.main-nav a[data-route]').forEach(a => {
    a.classList.toggle('active', a.dataset.route === focus);
  });
  if (body.classList.contains('app-page') && titles[focus]) {
    const base = body.querySelector('.sidebar-brand small')?.textContent?.trim() || 'FlashVagas';
    document.title = `EduWork | ${titles[focus]} · ${base}`;
  }
  body.classList.add('ui-ready');
})();
