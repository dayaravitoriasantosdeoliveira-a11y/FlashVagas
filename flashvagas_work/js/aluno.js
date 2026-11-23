let currentProfile=null, selectedCoordinator=null, chatChannel=null;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const competencyList=v=>Array.isArray(v)?v:(String(v??'').split(',').map(x=>x.trim()).filter(Boolean));
const date=v=>{if(!v)return 'Data a definir';const raw=String(v);const d=raw.length===10?new Date(raw+'T12:00:00-03:00'):new Date(raw);return Number.isNaN(d.getTime())?'Data a definir':new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'}).format(d);};
async function timeout(p,ms=9000){return Promise.race([p,new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),ms))]);}
function empty(t){return `<div class="empty-state"><strong>${esc(t)}</strong></div>`;}

function fillProfile(p){
  currentProfile=p; const first=(p.nome||p.name||p.email?.split('@')[0]||'estudante').trim().split(/\s+/)[0]||'estudante';
  $('studentName').textContent=first;$('profileName').textContent=p.nome||p.name||'Estudante';$('profileEmail').textContent=p.email||'';
  $('profileClass').textContent=(p.turma||p.class_name)?`Turma: ${p.turma||p.class_name}`:'Turma não informada';$('profileRegistration').textContent=(p.matricula||p.registration)?`Matrícula: ${p.matricula||p.registration}`:'Matrícula não informada';
  $('profileBio').textContent=p.bio||'Adicione uma apresentação curta no seu perfil.'; const initial=(p.nome||p.name||'A').charAt(0).toUpperCase();
  $('avatar').textContent=initial;$('resumeAvatar').textContent=initial;$('resumeName').textContent=p.nome||p.name||'Estudante';$('resumeContact').textContent=[p.email,p.turma||p.class_name].filter(Boolean).join(' · ');$('resumeBio').textContent=p.bio||'Ainda não há uma apresentação cadastrada.';$('resumeClass').textContent=p.turma||p.class_name||'Ensino médio';
  $('resumeFileName').textContent=p.resume_filename||'Nenhum currículo enviado.';
  $('editObjective').value=p.curriculo_objetivo||''; $('editExperience').value=p.experiencias||''; $('editCourses').value=p.cursos||''; $('editProjects').value=p.projetos||''; $('editAdditional').value=p.informacoes_adicionais||'';
  $('resumeFileRow').innerHTML=p.resume_filename?`<span>${esc(p.resume_filename)}</span><button class="text-btn" id="openResumeBtn">Abrir currículo</button>`:'';
  $('openResumeBtn')?.addEventListener('click',openOwnResume);
}

async function loadOpportunities(){
  const box=$('opportunityList');
  if(!box)return;
  if(box.dataset.loaded!=='true') box.innerHTML='<div class="empty-state">Carregando oportunidades...</div>';
  try{
    const {data,error}=await timeout(supabaseClient.rpc('get_student_opportunities_v3'),10000);
    if(error)throw error;
    const rows=(data||[]).filter(o=>!['deleted','removed','archived','cancelled','canceled'].includes(String(o.state||o.status||'').trim().toLowerCase()));
    $('statOpportunities').textContent=String(rows.filter(o=>o.state!=='completed').length);
    if(!rows.length){
      const emptyHTML='<div class="empty-state"><strong>Nenhuma oportunidade disponível no momento.</strong><small>Quando a Coordenação publicar uma nova atividade, ela aparecerá aqui.</small></div>';
      if(box.innerHTML!==emptyHTML) box.innerHTML=emptyHTML;
      box.dataset.loaded='true';
      return;
    }
    const nextHTML=rows.map(o=>{
      const state=String(o.state||'open');
      const mine=String(o.student_status||'');
      let action='';
      let stateText='';
      let stateClass='';
      if(mine==='approved'){
        action='<button class="secondary-btn" disabled>Selecionado ✓</button>';
        stateText='Sua atividade está em andamento.'; stateClass='in-progress';
      }else if(mine==='completed'){
        action='<button class="secondary-btn" disabled>Concluída ✓</button>';
        stateText='Atividade concluída.'; stateClass='completed';
      }else if(mine==='pending'){
        action='<button class="secondary-btn" disabled>Em análise</button>';
        stateText='Sua candidatura está em análise.'; stateClass='pending';
      }else if(mine==='rejected'){
        action=`<button class="secondary-btn apply-btn" data-id="${esc(o.id)}">Candidatar-se novamente →</button>`;
        stateText='Sua candidatura anterior não foi selecionada. Você pode tentar novamente.'; stateClass='rejected';
      }else if(state==='in_progress'){
        action='<button class="secondary-btn" disabled>Em andamento</button>';
        stateText='As vagas desta atividade já foram preenchidas.'; stateClass='in-progress';
      }else{
        action=`<button class="secondary-btn apply-btn" data-id="${esc(o.id)}">Quero me candidatar →</button>`;
      }
      return `<article class="opportunity-card ${stateClass}"><div class="opp-top"><span class="tag">${esc(o.setor||'Oportunidade')}</span><span class="opp-date">${date(o.data)}</span></div><h3>${esc(o.titulo||'Oportunidade')}</h3><p>${esc(o.descricao||'')}</p><div class="opp-meta"><span>Vagas: ${Number(o.vagas||1)} vaga(s)</span><span>Publicado em ${date(o.criado_em)}</span>${o.remuneracao?`<span>Remuneração: ${esc(o.remuneracao)}</span>`:''}</div>${stateText?`<div class="opp-state ${stateClass}">${esc(stateText)}</div>`:''}${action}</article>`;
    }).join('');
    if(box.innerHTML!==nextHTML){
      box.innerHTML=nextHTML;
      box.querySelectorAll('.apply-btn').forEach(btn=>btn.addEventListener('click',()=>apply(btn)));
    }
    box.dataset.loaded='true';
    await loadApplications();
  }catch(e){
    console.error('EduWork oportunidades:',e);
    $('statOpportunities').textContent='0';
    const errorHTML=`<div class="empty-state"><strong>Não foi possível carregar as oportunidades.</strong><small>${esc(e?.message||'Verifique a conexão com o Supabase.')}</small></div>`;
    if(box.innerHTML!==errorHTML) box.innerHTML=errorHTML;
    box.dataset.loaded='true';
  }
}

async function apply(b){
  if(!currentProfile?.id){alert('Sua sessão expirou. Entre novamente.');return;}
  b.disabled=true; b.textContent='Enviando...';
  try{
    const {data,error}=await timeout(supabaseClient.rpc('submit_application_v4',{p_opportunity_id:b.dataset.id}),10000);
    if(error)throw error;
    if(data?.success===false){
      if(data.already_applied){
        b.textContent='Candidatura enviada ✓';
        await loadApplications();
        return;
      }
      throw new Error(data.message||'Não foi possível enviar a candidatura.');
    }
    if(data?.success===true && data.already_applied){b.textContent='Candidatura enviada ✓';}else{b.textContent='Em análise ✓';}
    await Promise.all([loadStats(),loadOpportunities()]);
  }catch(e){
    console.error('Candidatura:',e);
    b.disabled=false;b.textContent='Tentar novamente';
    alert(`Não foi possível enviar a candidatura.\n\n${e?.message||'Erro ao salvar a candidatura.'}`);
  }
}

async function loadStats(){try{const [a,c]=await Promise.all([timeout(supabaseClient.from('applications').select('*',{count:'exact',head:true}).eq('student_id',currentProfile.id)),timeout(supabaseClient.rpc('eduwork_get_my_completions_v2'),10000)]);$('statApplications').textContent=a.count||0;$('statCertificates').textContent=(c.data||[]).length;}catch(e){console.error(e);}}
async function loadApplications(){
  const box=$('applicationList'); if(!box)return;
  try{
    const {data,error}=await timeout(supabaseClient.rpc('get_my_applications_v3'),10000);
    if(error)throw error;
    const {data:completedRows}=await timeout(supabaseClient.rpc('eduwork_get_my_completions_v2'),10000);
    const completedSet=new Set((completedRows||[]).map(c=>String(c.application_id)));
    let apps=(data||[]).map(a=>completedSet.has(String(a.id))?{...a,status:'completed'}:a);
    // Não exibir candidaturas órfãs: a vaga vinculada já foi removida pela coordenação.
    const opportunityIds=[...new Set(apps.map(a=>a.opportunity_id).filter(Boolean))];
    if(opportunityIds.length){
      const existing=await timeout(supabaseClient.from('opportunities').select('id,status').in('id',opportunityIds),10000);
      if(!existing.error){
        const activeIds=new Set((existing.data||[]).filter(o=>!['deleted','removed','archived','cancelled','canceled'].includes(String(o.status||'').trim().toLowerCase())).map(o=>String(o.id)));
        apps=apps.filter(a=>!a.opportunity_id||activeIds.has(String(a.opportunity_id)));
      }else{console.warn('Não foi possível validar as vagas das candidaturas:',existing.error.message);}
    }
    window.studentApplications=apps;
    $('statApplications').textContent=String(apps.filter(a=>['pending','approved'].includes(String(a.status||'').toLowerCase())).length);
    if(!apps.length){const emptyHTML=empty('Você ainda não enviou nenhuma candidatura.');if(box.innerHTML!==emptyHTML)box.innerHTML=emptyHTML;box.dataset.loaded='true';return;}
    const labels={pending:'Em análise',approved:'Selecionado',rejected:'Não selecionada',completed:'Concluída'};
    const nextHTML=apps.map(a=>`<article class="list-row"><div><strong>${esc(a.titulo||'Oportunidade')}</strong><small>${esc(a.setor||'')} · ${date(a.criado_em)}</small></div><span class="status-pill ${esc(String(a.status||'pending').toLowerCase())}">${labels[String(a.status||'pending').toLowerCase()]||'Em análise'}</span></article>`).join('');
    if(box.innerHTML!==nextHTML)box.innerHTML=nextHTML;
    box.dataset.loaded='true';
  }catch(e){console.error('Candidaturas:',e);window.studentApplications=[];const errorHTML=empty('Não foi possível carregar suas candidaturas.');if(box.innerHTML!==errorHTML)box.innerHTML=errorHTML;box.dataset.loaded='true';}
}

async function loadCertificates(){
  const box=$('certificateList'); if(!box)return;
  try{
    const {data,error}=await timeout(supabaseClient.rpc('eduwork_get_my_completions_v2'),10000);
    if(error)throw error;
    const rows=data||[]; $('statCertificates').textContent=String(rows.length);
    if(!rows.length){box.innerHTML='<div class="empty-state"><strong>Nenhum certificado ainda.</strong><small>Quando uma atividade for concluída, ele aparecerá aqui.</small></div>';return;}
    box.innerHTML=rows.map((c,i)=>`<article class="certificate-card"><div class="certificate-mark">✓</div><div class="certificate-info"><strong>${esc(c.title||'Atividade voluntária')}</strong><p>Certificado de participação</p><small>Emitido em ${date(c.issued_at)} · Código ${esc(c.code||'EduWork')}</small></div><button class="secondary-btn cert-btn" data-cert-index="${i}">Visualizar / PDF</button></article>`).join('');
    box.querySelectorAll('.cert-btn').forEach(btn=>btn.addEventListener('click',()=>{const c=rows[Number(btn.dataset.certIndex)];showCertificate({title:c.title||'Atividade voluntária',code:c.code||'EduWork',date:c.issued_at});}));
  }catch(e){console.error('Certificados:',e);$('statCertificates').textContent='0';box.innerHTML='<div class="empty-state"><strong>Não foi possível carregar os certificados.</strong><small>Atualize a página e tente novamente.</small></div>';}
}

function showCertificate(c){window.currentCertificateForPdf=c;$('certificatePaper').innerHTML=`<div class="certificate-paper"><div class="certificate-border"><span class="mini-label">EDUWORK · FLASHVAGAS</span><h1>Certificado de Participação</h1><p>Certificamos que</p><h2>${esc(currentProfile.nome||currentProfile.name||'Estudante')}</h2><p>prestou serviço voluntário à escola por meio do projeto <strong>FlashVagas</strong>, concluindo a atividade:</p><h3>${esc(c.title)}</h3><p class="certificate-date">Emitido em ${date(c.date)}</p><div class="certificate-sign"><span>Coordenação<br>EduWork</span><span>Código<br>${esc(c.code)}</span></div></div></div>`;$('certificateModal').classList.remove('hidden');}
function printCurrent(type){
  document.body.classList.remove('print-resume','print-certificate');
  document.body.classList.add(type==='certificate'?'print-certificate':'print-resume');
  requestAnimationFrame(()=>{
    setTimeout(()=>{
      window.print();
      setTimeout(()=>document.body.classList.remove('print-resume','print-certificate'),500);
    },80);
  });
}
async function printCertificate(){
  const c=window.currentCertificateForPdf;
  if(window.jspdf?.jsPDF && c){
    const {jsPDF}=window.jspdf;const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    doc.setDrawColor(195,66,113);doc.setLineWidth(2);doc.rect(12,12,273,173);
    doc.setTextColor(195,66,113);doc.setFontSize(11);doc.text('EDUWORK · FLASHVAGAS',148,30,{align:'center'});
    doc.setTextColor(35,40,48);doc.setFontSize(25);doc.text('Certificado de Participação',148,48,{align:'center'});
    doc.setFontSize(12);doc.text('Certificamos que',148,67,{align:'center'});
    doc.setTextColor(195,66,113);doc.setFontSize(22);doc.text(String(currentProfile.nome||currentProfile.name||'Estudante'),148,82,{align:'center'});
    doc.setTextColor(35,40,48);doc.setFontSize(12);doc.text('concluiu a atividade voluntária:',148,99,{align:'center'});
    doc.setFontSize(18);doc.text(String(c.title||'Atividade voluntária'),148,114,{align:'center'});
    doc.setFontSize(11);doc.text(`Emitido em ${date(c.date)}   ·   Código ${c.code||'EduWork'}`,148,133,{align:'center'});
    doc.setFontSize(10);doc.text('Coordenação · EduWork',72,160,{align:'center'});doc.text('EduWork FlashVagas',225,160,{align:'center'});
    doc.save(`certificado-${String(c.title||'eduwork').replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.pdf`);return;
  }
  printCurrent('certificate');
}
function printResume(){const extra=document.getElementById('resumeExtra');if(extra){const sections=[['Objetivo profissional',currentProfile.curriculo_objetivo],['Experiências',currentProfile.experiencias],['Cursos e formações complementares',currentProfile.cursos],['Projetos',currentProfile.projetos],['Informações adicionais',currentProfile.informacoes_adicionais]];extra.innerHTML=sections.filter(x=>x[1]).map(x=>`<div class="resume-extra-section"><h4>${esc(x[0])}</h4><p>${esc(x[1]).replace(/\n/g,'<br>')}</p></div>`).join('');}printCurrent('resume');}
async function loadSkills(){try{const [{data:all,error:aerr},{data:mine,error:merr}]=await Promise.all([timeout(supabaseClient.from('skills').select('id,nome').order('nome')),timeout(supabaseClient.from('student_skills').select('skill_id,nivel,skills(nome)').eq('student_id',currentProfile.id))]);if(aerr||merr)throw aerr||merr;const selected=new Set((mine||[]).map(x=>x.skill_id));$('skillOptions').innerHTML=(all||[]).map(s=>`<label class="skill-option"><input type="checkbox" value="${s.id}" data-name="${esc(s.nome)}" ${selected.has(s.id)?'checked':''}><span>${esc(s.nome)}</span></label>`).join('');const custom=competencyList(currentProfile.competencies);const html=[...(mine||[]).map(s=>s.skills?.nome),...custom].filter(Boolean).map(x=>`<span class="skill-chip">${esc(x)}</span>`).join('');$('skillsList').innerHTML=html||'<span class="muted">Nenhuma competência cadastrada ainda.</span>';$('resumeSkills').innerHTML=html||'<span class="muted">Nenhuma competência cadastrada ainda.</span>';}catch(e){console.error(e);$('skillsList').innerHTML='<span class="muted">Não foi possível carregar as competências.</span>';}}

async function saveProfile(e){e.preventDefault();const msg=$('profileMessage');msg.textContent='Salvando...';const name=$('editName').value.trim();const cls=$('editClass').value.trim()||null;const reg=$('editRegistration').value.trim()||null;const bio=$('editBio').value.trim()||null;const custom=$('editCustomSkills').value.split(',').map(x=>x.trim()).filter(Boolean);const objective=$('editObjective').value.trim()||null;const experience=$('editExperience').value.trim()||null;const courses=$('editCourses').value.trim()||null;const projects=$('editProjects').value.trim()||null;const additional=$('editAdditional').value.trim()||null;const selected=[...document.querySelectorAll('#skillOptions input:checked')].map(x=>x.value);const updates={nome:name,turma:cls,matricula:reg,bio,competencies:custom.join(', '),curriculo_objetivo:objective,experiencias:experience,cursos:courses,projetos:projects,informacoes_adicionais:additional};const {data,error}=await supabaseClient.from('profiles').update(updates).eq('id',currentProfile.id).select('*').single();if(error){console.error(error);msg.textContent='Não foi possível salvar o perfil.';return;}const {error:delErr}=await supabaseClient.from('student_skills').delete().eq('student_id',currentProfile.id);if(delErr){console.error(delErr);msg.textContent='Perfil salvo, mas houve erro nas competências.';return;}if(selected.length){const rows=selected.map(skill_id=>({student_id:currentProfile.id,skill_id,nivel:'Conhecimento'}));const {error:insErr}=await supabaseClient.from('student_skills').insert(rows);if(insErr)console.error(insErr);}currentProfile={...normalizeProfile(data),competencies:custom.join(', '),curriculo_objetivo:objective,experiencias:experience,cursos:courses,projetos:projects,informacoes_adicionais:additional};fillProfile(currentProfile);await loadSkills();msg.textContent='Perfil atualizado com sucesso!';setTimeout(()=> $('editProfileModal').classList.add('hidden'),600);}

async function uploadResume(file){if(!file)return;if(file.type!=='application/pdf'){alert('Envie seu currículo em PDF.');return;}if(file.size>8*1024*1024){alert('O currículo deve ter no máximo 8 MB.');return;}const path=`${currentProfile.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const {error}=await supabaseClient.storage.from('curriculos').upload(path,file,{upsert:false,contentType:'application/pdf'});if(error){console.error(error);alert('Não foi possível enviar o currículo.');return;}const {error:updateErr}=await supabaseClient.from('profiles').update({resume_path:path,resume_filename:file.name}).eq('id',currentProfile.id);if(updateErr){console.error(updateErr);return;}currentProfile.resume_path=path;currentProfile.resume_filename=file.name;fillProfile(currentProfile);alert('Currículo enviado com sucesso!');}
async function openOwnResume(){if(!currentProfile.resume_path)return;const {data,error}=await supabaseClient.storage.from('curriculos').createSignedUrl(currentProfile.resume_path,1800);if(error){console.error(error);alert('Não foi possível abrir o currículo.');return;}const frame=document.getElementById('resumePreviewFrame');const modal=document.getElementById('resumePreviewModal');if(frame&&modal){frame.src=data.signedUrl;modal.classList.remove('hidden');}else{window.open(data.signedUrl,'_blank');}}
async function removeResume(){if(!currentProfile.resume_path)return;await supabaseClient.storage.from('curriculos').remove([currentProfile.resume_path]);const {error}=await supabaseClient.from('profiles').update({resume_path:null,resume_filename:null}).eq('id',currentProfile.id);if(!error){currentProfile.resume_path=null;currentProfile.resume_filename=null;fillProfile(currentProfile);}}

async function loadCoordinators(){
  try{
    let c=null;
    const rpc=await supabaseClient.rpc('get_coordinator_profile_v2');
    if(!rpc.error){c=Array.isArray(rpc.data)?rpc.data[0]:rpc.data;}
    if(!c?.id){
      const direct=await supabaseClient.from('profiles').select('id,nome,email,role').order('criado_em',{ascending:true});
      if(!direct.error)c=(direct.data||[]).find(x=>['coordinator','coordenador'].includes(String(x.role||'').trim().toLowerCase()))||null;
    }
    if(!c?.id)throw new Error('Coordenação não encontrada.');
    selectedCoordinator=c;updateChatHeader();
    $('chatInput').disabled=false;$('chatForm').querySelector('button[type="submit"]').disabled=false;
    await loadChat();await subscribeChat();
  }catch(e){
    console.error('Coordenação:',e);selectedCoordinator=null;updateChatHeader();
    // O aluno pode digitar mesmo antes da sessão da coordenação ser localizada.
    $('chatInput').disabled=false;$('chatForm').querySelector('button[type="submit"]').disabled=false;
  }
}
function updateChatHeader(){if($('chatHeader'))$('chatHeader').textContent='Coordenação';}
function chatText(m){return m.apagada?'Mensagem apagada':(m.mensagem||'');}
function renderChatRows(rows){
  const box=$('chatMessages');
  if(!rows.length){box.innerHTML='<div class="chat-empty">Nenhuma mensagem ainda. Envie uma mensagem para a coordenação.</div>';return;}
  box.innerHTML=rows.map(m=>chatBubbleHTML(m)).join('');
  bindMessageActions();box.scrollTop=box.scrollHeight;
}
function chatBubbleHTML(m){
  const mine=m.remetente_id===currentProfile.id;
  const deleted=!!m.apagada;
  return `<div class="chat-bubble ${mine?'mine':'theirs'} ${deleted?'deleted':''}" data-message-id="${esc(m.id)}"><span>${esc(chatText(m))}${m.editado_em&&!deleted?' <em>(editada)</em>':''}</span><small>${new Date(m.criado_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'})}</small>${mine&&!deleted?`<div class="message-actions"><button type="button" class="msg-edit" data-id="${esc(m.id)}">Editar</button><button type="button" class="msg-delete" data-id="${esc(m.id)}">Excluir</button></div>`:''}</div>`;
}
function appendChatMessage(m){const box=$('chatMessages');if(!box||!m?.id||box.querySelector(`[data-message-id="${CSS.escape(String(m.id))}"]`))return;box.querySelector('.chat-empty')?.remove();box.insertAdjacentHTML('beforeend',chatBubbleHTML(m));bindMessageActions();box.scrollTop=box.scrollHeight;}
function bindMessageActions(){
  $('chatMessages')?.querySelectorAll('.msg-edit').forEach(b=>b.onclick=()=>editMessage(b.dataset.id));
  $('chatMessages')?.querySelectorAll('.msg-delete').forEach(b=>b.onclick=()=>deleteMessage(b.dataset.id));
}
async function loadChat(){
  if(!selectedCoordinator)return;
  const {data,error}=await supabaseClient.from('messages').select('id,remetente_id,destinatario_id,mensagem,criado_em,lida,editado_em,apagada').or(`and(remetente_id.eq.${currentProfile.id},destinatario_id.eq.${selectedCoordinator.id}),and(remetente_id.eq.${selectedCoordinator.id},destinatario_id.eq.${currentProfile.id})`).order('criado_em',{ascending:true});
  if(error){console.error('Chat:',error);return;}
  renderChatRows(data||[]);
  const unread=(data||[]).filter(m=>m.destinatario_id===currentProfile.id&&!m.lida&&!m.apagada).map(m=>m.id);
  if(unread.length)await supabaseClient.from('messages').update({lida:true}).in('id',unread).eq('destinatario_id',currentProfile.id);
}
async function subscribeChat(){
  if(chatChannel)await supabaseClient.removeChannel(chatChannel);if(!selectedCoordinator)return;
  chatChannel=supabaseClient.channel(`chat-${currentProfile.id}-${selectedCoordinator.id}`).on('postgres_changes',{event:'*',schema:'public',table:'messages'},payload=>{
    const m=payload.new||payload.old;if(!m)return;
    const same=(m.remetente_id===currentProfile.id&&m.destinatario_id===selectedCoordinator.id)||(m.remetente_id===selectedCoordinator.id&&m.destinatario_id===currentProfile.id);if(!same)return;
    loadChat();
  }).subscribe();
}
async function sendMessage(e){
  e.preventDefault();if(!selectedCoordinator)await loadCoordinators();if(!selectedCoordinator)return;
  const input=$('chatInput'),button=$('chatForm').querySelector('button[type="submit"]'),text=input.value.trim();if(!text)return;
  input.disabled=true;button.disabled=true;
  let {data,error}=await supabaseClient.rpc('send_message_v40',{p_destinatario_id:selectedCoordinator.id,p_mensagem:text});
  if(error){const direct=await supabaseClient.from('messages').insert({remetente_id:currentProfile.id,destinatario_id:selectedCoordinator.id,mensagem:text}).select('id,remetente_id,destinatario_id,mensagem,criado_em,lida,editado_em,apagada').single();data=direct.data;error=direct.error;}
  input.disabled=false;button.disabled=false;if(error){alert(`Não foi possível enviar a mensagem.\n\n${error.message}`);return;}if(data?.success===false){alert(data.message||'Não foi possível enviar a mensagem.');return;}input.value='';await loadChat();
}
async function editMessage(id){
  const el=document.querySelector(`[data-message-id="${CSS.escape(String(id))}"] span`);if(!el)return;const old=el.textContent.replace(/ \(editada\)$/,'');const next=prompt('Editar mensagem:',old);if(next===null)return;const text=next.trim();if(!text)return;
  const {data,error}=await supabaseClient.rpc('edit_message_v40',{p_message_id:id,p_mensagem:text});if(error){alert(`Não foi possível editar.\n\n${error.message}`);return;}if(data?.success===false){alert(data.message||'Não foi possível editar.');return;}await loadChat();
}
async function deleteMessage(id){if(!confirm('Excluir esta mensagem?'))return;const {data,error}=await supabaseClient.rpc('delete_message_v40',{p_message_id:id});if(error){alert(`Não foi possível excluir.\n\n${error.message}`);return;}if(data?.success===false){alert(data.message||'Não foi possível excluir.');return;}await loadChat();}
async function deleteAllMessages(){if(!selectedCoordinator)return;if(!confirm('Apagar todas as mensagens desta conversa?'))return;const {data,error}=await supabaseClient.rpc('clear_chat_v40',{p_other_user_id:selectedCoordinator.id});if(error){alert(`Não foi possível apagar a conversa.\n\n${error.message}`);return;}if(data?.success===false){alert(data.message||'Não foi possível apagar a conversa.');return;}await loadChat();}


async function loadNotifications(){
  try{
    const {data,error}=await timeout(supabaseClient.from('notifications').select('id,titulo,mensagem,lida,criado_em').eq('user_id',currentProfile.id).eq('lida',false).order('criado_em',{ascending:false}).limit(30));
    if(error)throw error;
    const rows=(data||[]).filter(n=>n.lida!==true);
    $('notificationCount').textContent=rows.length;
    $('notificationCount').classList.toggle('hidden',rows.length===0);
    const mark=$('markNotifications');
    if(mark){mark.classList.toggle('hidden',rows.length===0);mark.disabled=rows.length===0;}
    $('notificationList').innerHTML=rows.length?rows.map(n=>`<button class="notification-item unread" data-id="${n.id}"><strong>${esc(n.titulo||'Aviso da escola')}</strong><span>${esc(n.mensagem||'')}</span><small>${date(n.criado_em)}</small></button>`).join(''):'<div class="notification-empty">Nenhum aviso novo.</div>';
    boxifyNotifications();
  }catch(e){console.error('Notificações:',e);$('notificationList').innerHTML='<div class="notification-empty">Não foi possível carregar os avisos.</div>';}
}
async function markOneNotificationRead(id){
  const {data,error}=await supabaseClient.from('notifications').update({lida:true}).eq('id',id).eq('user_id',currentProfile.id).eq('lida',false).select('id');
  if(error){console.error('Não foi possível marcar o aviso como lido:',error);alert(`Não foi possível marcar o aviso como lido.\n\n${error.message}`);return false;}
  if(!data?.length){await loadNotifications();return true;}
  await loadNotifications();
  return true;
}
function boxifyNotifications(){
  $('notificationList')?.querySelectorAll('.notification-item').forEach(i=>i.addEventListener('click',async()=>{
    i.disabled=true;
    const ok=await markOneNotificationRead(i.dataset.id);
    if(!ok)i.disabled=false;
  }));
}

function applyPageFocus(){
  const hash=String(location.hash||'').replace('#','').trim();
  const focus=hash||document.body.dataset.focus||'inicio';
  document.body.dataset.focus=focus;
  if(!focus)return;
  const map={inicio:['inicio'],oportunidades:['oportunidades'],candidaturas:['candidaturas'],perfil:['perfil'],curriculo:['curriculo'],certificados:['certificados'],mensagens:['mensagens']};
  const keep=new Set(map[focus]||['inicio']);
  document.querySelectorAll('main.dashboard > section, main.dashboard > .updated-card').forEach(el=>{
    const id=el.id; if(id && (id==='inicio'||keep.has(id))) el.classList.toggle('route-hidden', !keep.has(id) && id!=='inicio');
    else if(id && !keep.has(id)) el.classList.add('route-hidden');
  });
  document.querySelectorAll('.sidebar-nav a').forEach(a=>a.classList.toggle('active',a.dataset.route===focus));
  const target=document.getElementById(focus);
  if(target && focus!=='inicio') setTimeout(()=>target.scrollIntoView({block:'start',behavior:'smooth'}),80);
}

function setupSidebar(){
  const logout=document.getElementById('sidebarLogout');
  logout?.addEventListener('click',()=>document.getElementById('logoutBtn')?.click());
  const links=[...document.querySelectorAll('.sidebar-nav a')];
  links.forEach(a=>a.addEventListener('click',()=>{links.forEach(x=>x.classList.remove('active'));a.classList.add('active');setTimeout(applyPageFocus,0);}));window.addEventListener('hashchange',applyPageFocus);
}

function setupUI(){
  const on=(id,event,handler)=>{const el=$(id);if(el)el.addEventListener(event,handler);};
  document.querySelectorAll('.brand[href^="#"]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const t=document.querySelector(a.getAttribute('href'));if(t)t.scrollIntoView({block:'start',behavior:'smooth'});}));
  on('notificationBtn','click',async()=>{await loadNotifications();$('notificationPanel')?.classList.toggle('hidden');});
  on('markNotifications','click',async()=>{const button=$('markNotifications');if(button)button.disabled=true;const {error}=await supabaseClient.from('notifications').update({lida:true}).eq('user_id',currentProfile.id).eq('lida',false).select('id');if(error){console.error('Não foi possível marcar os avisos como lidos:',error);alert(`Não foi possível marcar os avisos como lidos.\n\n${error.message}`);if(button)button.disabled=false;return;}await loadNotifications();$('notificationPanel')?.classList.remove('hidden');});
  on('editProfileBtn','click',()=>{ $('editName').value=currentProfile.nome||currentProfile.name||'';$('editClass').value=currentProfile.turma||currentProfile.class_name||'';$('editRegistration').value=currentProfile.matricula||currentProfile.registration||'';$('editBio').value=currentProfile.bio||'';$('editCustomSkills').value=competencyList(currentProfile.competencies).join(', ');$('editProfileModal')?.classList.remove('hidden');});
  on('closeProfileModal','click',()=> $('editProfileModal')?.classList.add('hidden'));
  on('profileForm','submit',saveProfile);
  on('resumeFile','change',e=>uploadResume(e.target.files[0]));
  on('printResumeBtn','click',printResume);
  on('removeResumeBtn','click',removeResume);
  on('chatForm','submit',sendMessage);on('deleteAllMessages','click',deleteAllMessages);
  on('closeCertificateModal','click',()=> $('certificateModal')?.classList.add('hidden'));
  on('certificateModal','click',e=>{if(e.target===$('certificateModal'))$('certificateModal').classList.add('hidden');});
  on('downloadCertificateBtn','click',printCertificate);
}

async function setupRealtime(){
  supabaseClient.channel(`notifications-${currentProfile.id}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:`user_id=eq.${currentProfile.id}`},()=>{loadNotifications();loadCertificates();loadStats();}).subscribe();
  supabaseClient.channel(`opportunities-student-${currentProfile.id}`).on('postgres_changes',{event:'*',schema:'public',table:'opportunities'},()=>loadOpportunities()).subscribe();
  window.__studentChatPoll=setInterval(()=>{if(document.visibilityState!=='visible')return;if(selectedCoordinator)loadChat();loadApplications();},30000);
  supabaseClient.channel(`applications-student-${currentProfile.id}`).on('postgres_changes',{event:'*',schema:'public',table:'applications',filter:`student_id=eq.${currentProfile.id}`},()=>{loadApplications();loadStats();}).subscribe();
}


function eduworkSmoothAnchors(){
  document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{const href=a.getAttribute('href');if(!href||href==='#')return;const t=document.querySelector(href);if(t){e.preventDefault();history.replaceState(null,'',href);t.scrollIntoView({behavior:'smooth',block:'start'});}}));
}
document.addEventListener('DOMContentLoaded',async()=>{currentProfile=await requireAuth('student');if(!currentProfile)return;fillProfile(currentProfile);setupUI();setupSidebar();eduworkSmoothAnchors();applyPageFocus();await Promise.all([loadOpportunities(),loadStats(),loadApplications(),loadCertificates(),loadSkills(),loadCoordinators(),loadNotifications()]);setupRealtime();});
