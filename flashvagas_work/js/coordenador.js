let coordProfile=null, selectedStudent=null, coordChatChannel=null, coordInboxChannel=null;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const date=v=>{if(!v)return 'Data a definir';const raw=String(v);const d=raw.length===10?new Date(raw+'T12:00:00-03:00'):new Date(raw);return Number.isNaN(d.getTime())?'Data a definir':new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'}).format(d);};
const skills=v=>Array.isArray(v)?v:(String(v??'').split(',').map(x=>x.trim()).filter(Boolean));
function showToast(message,type='success'){let el=$('eduToast');if(!el){el=document.createElement('div');el.id='eduToast';el.className='edu-toast';document.body.appendChild(el);}el.textContent=message;el.dataset.type=type;el.classList.add('show');clearTimeout(window.__eduToastTimer);window.__eduToastTimer=setTimeout(()=>el.classList.remove('show'),3200);}

async function loadCoordinatorData(){await Promise.all([loadStats(),loadOpportunities(),loadApplications(),loadStudents()]);}
async function loadStats(){try{const [{count:a},{data:profiles},{count:o}]=await Promise.all([supabaseClient.from('applications').select('*',{count:'exact',head:true}).in('status',['pending','approved']),supabaseClient.from('profiles').select('id,role'),supabaseClient.from('opportunities').select('*',{count:'exact',head:true}).eq('criado_por',coordProfile.id).neq('status','deleted')]);const students=(profiles||[]).filter(p=>String(p.role||'').trim().toLowerCase()==='student');$('coordApps').textContent=a||0;$('coordStudents').textContent=students.length;$('coordOpps').textContent=o||0;}catch(e){console.error('Stats:',e);}}

async function loadOpportunities(){
  const box=$('coordOpportunityList'); if(!box)return;
  let {data,error}=await supabaseClient.from('opportunities').select('*').eq('criado_por',coordProfile.id);
  if(error){({data,error}=await supabaseClient.from('opportunies').select('*').eq('criado_por',coordProfile.id));}
  data=(data||[]).filter(o=>!['deleted','removed','archived','cancelled','canceled'].includes(String(o.status||o.state||'').trim().toLowerCase()));
  if(error||!data?.length){box.innerHTML='<div class="empty-state">Você ainda não publicou oportunidades.</div>';return;}
  data=data.slice().sort((a,b)=>new Date(b.criado_em||b.created_at||0)-new Date(a.criado_em||a.created_at||0));
  box.innerHTML=data.map(o=>`<article class="opportunity-card"><div class="opp-top"><span class="tag">${esc(o.setor||o.area||'Oportunidade')}</span><span class="status-dot">${String(o.status||'open').toLowerCase().includes('closed')||String(o.status||'').toLowerCase().includes('fech')?'Fechada':'Aberta'}</span></div><h3>${esc(o.titulo||o.title||'Oportunidade')}</h3><p>${esc(o.descricao||o.description||'')}</p><div class="opp-meta"><span>D: ${date(o.data||o.date)}</span><span>Vagas: ${o.vagas||o.slots||1} vaga(s)</span>${o.remuneracao?`<span>Remuneração: ${esc(o.remuneracao)}</span>`:''}</div><div class="admin-actions"><button class="secondary-btn edit-opp" data-id="${esc(o.id)}">Editar vaga</button><button class="text-btn delete-opp" data-id="${esc(o.id)}">Remover vaga</button></div></article>`).join('');
  box.querySelectorAll('.edit-opp').forEach(b=>b.addEventListener('click',()=>openEditOpportunity(data.find(o=>String(o.id)===String(b.dataset.id)))));
  box.querySelectorAll('.delete-opp').forEach(b=>b.addEventListener('click',()=>deleteOpportunity(b.dataset.id)));
}
async function deleteOpportunity(id){
  if(!confirm('Remover esta oportunidade? Ela deixará de aparecer para os estudantes.'))return;
  // Primeiro tenta excluir de verdade. Se houver candidaturas vinculadas ou a política
  // do banco impedir a exclusão física, marca a publicação como removida.
  const removed=await supabaseClient.from('opportunities').delete().eq('id',id).eq('criado_por',coordProfile.id).select('id');
  if(removed.error){
    const archived=await supabaseClient.from('opportunities').update({status:'deleted'}).eq('id',id).eq('criado_por',coordProfile.id).select('id');
    if(archived.error||!archived.data?.length){
      const reason=archived.error?.message||removed.error.message||'A vaga não foi encontrada ou você não tem permissão para removê-la.';
      alert(`Não foi possível remover a vaga.\n\n${reason}`);
      return;
    }
  }else if(!removed.data?.length){
    const archived=await supabaseClient.from('opportunities').update({status:'deleted'}).eq('id',id).eq('criado_por',coordProfile.id).select('id');
    if(archived.error||!archived.data?.length){
      alert(`Não foi possível remover a vaga.\n\n${archived.error?.message||'A vaga não foi encontrada ou você não tem permissão para removê-la.'}`);
      return;
    }
  }
  showToast('Oportunidade removida.');
  await loadCoordinatorData();
}
function openEditOpportunity(o){if(!o)return;$('editOppId').value=o.id;$('editOppTitle').value=o.titulo||'';$('editOppArea').value=o.setor||'';$('editOppDescription').value=o.descricao||'';$('editOppDate').value=o.data||'';$('editOppSlots').value=o.vagas||1;$('editOppRemuneracao').value=o.remuneracao||'';$('editOppMessage').textContent='';$('editOpportunityModal').classList.remove('hidden');}
async function saveEditedOpportunity(e){e.preventDefault();const id=$('editOppId').value,msg=$('editOppMessage');const updates={titulo:$('editOppTitle').value.trim(),setor:$('editOppArea').value.trim()||null,descricao:$('editOppDescription').value.trim(),data:$('editOppDate').value||null,vagas:Number($('editOppSlots').value)||1,remuneracao:$('editOppRemuneracao').value.trim()||null};msg.textContent='Salvando...';const {error}=await supabaseClient.from('opportunities').update(updates).eq('id',id).eq('criado_por',coordProfile.id);if(error){msg.textContent=`Não foi possível salvar: ${error.message}`;return;}msg.textContent='Alterações salvas!';$('editOpportunityModal').classList.add('hidden');await loadCoordinatorData();}

async function loadApplications(){
  const box=$('coordApplicationList'); if(!box)return;
  box.innerHTML='<div class="empty-state">Carregando candidaturas...</div>';
  let {data,error}=await supabaseClient.rpc('get_coordinator_applications_v2');
  if(error){
    console.warn('RPC get_coordinator_applications_v2 indisponível; usando consulta direta:',error.message);
    const base=await supabaseClient.from('applications').select('id,student_id,opportunity_id,status,curriculum_snapshot,created_at').order('created_at',{ascending:false});
    if(base.error){console.error('Candidaturas:',base.error);box.innerHTML=`<div class="empty-state"><strong>Não foi possível carregar as candidaturas.</strong><small>${esc(base.error.message)}</small></div>`;return;}
    const rows=base.data||[], studentIds=[...new Set(rows.map(x=>x.student_id).filter(Boolean))], oppIds=[...new Set(rows.map(x=>x.opportunity_id).filter(Boolean))];
    const [pr,op]=await Promise.all([studentIds.length?supabaseClient.from('profiles').select('id,nome,email,turma,bio,competencies,resume_path,resume_filename').in('id',studentIds):Promise.resolve({data:[]}),oppIds.length?supabaseClient.from('opportunities').select('id,titulo').in('id',oppIds):Promise.resolve({data:[]})]);
    if(pr.error||op.error){const err=pr.error||op.error;box.innerHTML=`<div class="empty-state"><strong>Não foi possível montar as candidaturas.</strong><small>${esc(err.message)}</small></div>`;return;}
    const profiles=new Map((pr.data||[]).map(x=>[x.id,x])), opps=new Map((op.data||[]).map(x=>[x.id,x]));
    data=rows.map(a=>{const p=profiles.get(a.student_id)||{},o=opps.get(a.opportunity_id)||{},snap=a.curriculum_snapshot||{};return {...a,...snap,nome:p.nome||snap.nome,email:p.email||snap.email,turma:p.turma||snap.turma,bio:p.bio||snap.bio,competencies:p.competencies||snap.competencies,resume_path:p.resume_path||snap.resume_path,resume_filename:p.resume_filename||snap.resume_filename,titulo:o.titulo||'Oportunidade'};});
    error=null;
  }
  const {data:completedRows}=await supabaseClient.rpc('eduwork_get_completed_application_ids_v2');
  const completedSet=new Set((completedRows||[]).map(c=>String(c.application_id)));
  const normalized=(data||[]).map(a=>completedSet.has(String(a.id))?{...a,status:'completed'}:a);
  const rows=normalized.filter(a=>String(a.status||'').toLowerCase()!=='completed');
  if(!rows.length){box.innerHTML='<div class="empty-state">Ainda não há candidaturas.</div>';return;}
  const labels={pending:'Em análise',approved:'Selecionado',rejected:'Não selecionado',completed:'Concluída'};
  box.innerHTML=rows.map(a=>{
    const skillHtml=skills(a.competencies).map(x=>`<span class="skill-chip">${esc(x)}</span>`).join('');
    const approved=a.status==='approved';
    const active=a.status==='approved';
    return `<article class="admin-application application-mural">
      <div class="student-summary"><div class="chat-avatar">${esc((a.nome||'E').charAt(0).toUpperCase())}</div><div><strong>${esc(a.nome||'Estudante')}</strong><small>${esc(a.turma||'Turma não informada')} · ${esc(a.email||'')}</small><small>Atividade: ${esc(a.titulo||'Oportunidade')}</small></div></div>
      <div class="candidate-profile-preview"><div><h4>Sobre o estudante</h4><p>${esc(a.bio||'O estudante ainda não adicionou uma descrição sobre si.')}</p></div><div><h4>Competências</h4><div class="skills-wrap">${skillHtml||'<span class="muted">Nenhuma competência cadastrada.</span>'}</div></div></div>
      <div class="candidate-actions"><span class="status-pill ${esc(a.status||'pending')}">${labels[a.status]||'Em análise'}</span>${a.resume_path?`<span class="resume-attached">${esc(a.resume_filename||'Currículo anexado')}</span><button class="secondary-btn resume-student" data-path="${esc(a.resume_path)}">Ver currículo</button>`:'<span class="muted">Sem currículo anexado</span>'}<button class="secondary-btn chat-student" data-id="${esc(a.student_id)}">Conversar</button>${approved?`<button class="complete-btn" data-id="${esc(a.id)}">✓ Finalizar trabalho e emitir certificado</button>`:''}<button class="approve-btn" data-id="${esc(a.id)}" ${approved||a.status==='completed'?'disabled':''}>✓ ${approved?'Selecionado':'Selecionar'}</button><button class="reject-btn" data-id="${esc(a.id)}" ${a.status==='rejected'||a.status==='completed'?'disabled':''}>✕ ${a.status==='rejected'?'Não selecionado':'Recusar'}</button></div>
    </article>`;
  }).join('');
  box.querySelectorAll('.approve-btn').forEach(b=>b.addEventListener('click',()=>changeApplicationStatus(b.dataset.id,'approved')));box.querySelectorAll('.complete-btn').forEach(b=>b.addEventListener('click',()=>changeApplicationStatus(b.dataset.id,'completed')));
  box.querySelectorAll('.reject-btn').forEach(b=>b.addEventListener('click',()=>changeApplicationStatus(b.dataset.id,'rejected')));
  box.querySelectorAll('.resume-student').forEach(b=>b.addEventListener('click',()=>openStudentResume(b.dataset.path)));
  box.querySelectorAll('.chat-student').forEach(b=>b.addEventListener('click',()=>openApplicantChat(b.dataset.id)));
}
async function changeApplicationStatus(id,status){
  const label=status==='approved'?'selecionar':status==='completed'?'emitir o certificado':'recusar';
  if(!confirm(`Confirmar que deseja ${label} esta candidatura?`))return;
  let data,error;
  if(status==='completed'){
    const result=await supabaseClient.rpc('eduwork_complete_application_v2',{p_application_id:id});
    data=result.data; error=result.error;
  }else{
    const result=await supabaseClient.rpc('set_application_status_v43',{p_application_id:id,p_status:status});
    data=result.data; error=result.error;
  }
  if(error){console.error('Atualização candidatura:',error);showToast(error.message||'Não foi possível atualizar a candidatura.','error');return;}
  if(data?.success===false){showToast(data.message||'Não foi possível atualizar.','error');return;}
  showToast(status==='completed'?'Certificado emitido com sucesso.':(data?.message||'Candidatura atualizada.'));if(status==='completed'){window.dispatchEvent(new CustomEvent('eduwork:activity-completed'));}
  await Promise.all([loadApplications(),loadStats(),loadOpportunities(),loadStudents()]);
}

function openApplicantChat(id){if(!id)return;const target=`coordenador-mensagens.html?student=${encodeURIComponent(id)}`;window.location.assign(target);}

async function openStudentResume(path){const {data,error}=await supabaseClient.storage.from('curriculos').createSignedUrl(path,1800);if(error){alert('Não foi possível abrir o currículo. Verifique as permissões do armazenamento.');return;}window.open(data.signedUrl,'_blank');}

async function loadStudents(){
  if(!$('studentList'))return;
  const {data:all,error}=await supabaseClient.from('profiles').select('id,nome,email,turma,resume_path,resume_filename,role').order('nome');
  if(error||!all){$('studentList').innerHTML='<div class="chat-empty">Não foi possível carregar os estudantes.</div>';return;}
  const students=all.filter(s=>String(s.role||'').trim().toLowerCase()==='student');
  let {data:apps, error:appsError}=await supabaseClient.rpc('get_coordinator_applicants_v2');
  if(appsError){const direct=await supabaseClient.from('applications').select('student_id');apps=direct.data||[];}
  const applicantIds=new Set((apps||[]).map(x=>x.student_id));
  const {data:msgs}=await supabaseClient.from('messages').select('remetente_id,destinatario_id').or(`remetente_id.eq.${coordProfile.id},destinatario_id.eq.${coordProfile.id}`);
  (msgs||[]).forEach(m=>applicantIds.add(m.remetente_id===coordProfile.id?m.destinatario_id:m.remetente_id));
  if(selectedStudent)applicantIds.add(selectedStudent.id);
  const data=students.filter(s=>applicantIds.has(s.id));
  window.coordStudents=data;
  $('studentList').innerHTML=data.length?data.map(s=>`<div class="chat-contact-row"><button class="chat-contact ${selectedStudent?.id===s.id?'active':''}" data-id="${esc(s.id)}"><span class="chat-avatar">${esc((s.nome||'E').charAt(0).toUpperCase())}</span><span class="chat-contact-identity"><strong>${esc(s.nome||'Estudante')}</strong><small class="chat-role-label">Estudante</small>${s.turma?`<small class="chat-class-label">${esc(s.turma)}</small>`:''}</span></button>${s.resume_path?`<button class="text-btn view-student-resume" data-path="${esc(s.resume_path)}">Currículo</button>`:''}</div>`).join(''):'<div class="chat-empty">Os estudantes que se candidataram ou enviaram mensagem aparecerão aqui.</div>';
  $('studentList').querySelectorAll('.chat-contact').forEach(b=>b.addEventListener('click',()=>selectStudent(data.find(s=>String(s.id)===String(b.dataset.id)))));
  $('studentList').querySelectorAll('.view-student-resume').forEach(b=>b.addEventListener('click',()=>openStudentResume(b.dataset.path)));
}
async function selectStudent(s){if(!s)return;selectedStudent=s;$('chatHeader').innerHTML=`<span class="chat-avatar">${esc((s.nome||'E').charAt(0).toUpperCase())}</span><div class="chat-header-identity"><strong>${esc(s.nome||'Estudante')}</strong><small class="chat-role-label">Estudante</small>${s.turma?`<small class="chat-class-label">${esc(s.turma)}</small>`:''}</div>`;$('chatInput').disabled=false;$('chatForm').querySelector('button[type="submit"]').disabled=false;await loadChat();await subscribeChat();await loadStudents();}
function chatText(m){return m.apagada?'Mensagem apagada':(m.mensagem||'');}
function chatBubbleHTML(m){const mine=m.remetente_id===coordProfile.id,deleted=!!m.apagada;return `<div class="chat-bubble ${mine?'mine':'theirs'} ${deleted?'deleted':''}" data-message-id="${esc(m.id)}"><span>${esc(chatText(m))}${m.editado_em&&!deleted?' <em>(editada)</em>':''}</span><small>${new Date(m.criado_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'})}</small>${mine&&!deleted?`<div class="message-actions"><button type="button" class="msg-edit" data-id="${esc(m.id)}">Editar</button><button type="button" class="msg-delete" data-id="${esc(m.id)}">Excluir</button></div>`:''}</div>`;}
function renderChatRows(rows){const box=$('chatMessages');if(!rows.length){box.innerHTML='<div class="chat-empty">Nenhuma mensagem ainda.</div>';return;}box.innerHTML=rows.map(chatBubbleHTML).join('');bindMessageActions();box.scrollTop=box.scrollHeight;}
function appendChatMessage(m){const box=$('chatMessages');if(!box||!m?.id)return;if(box.querySelector(`[data-message-id="${CSS.escape(String(m.id))}"]`))return;box.querySelector('.chat-empty')?.remove();box.insertAdjacentHTML('beforeend',chatBubbleHTML(m));bindMessageActions();box.scrollTop=box.scrollHeight;}
function bindMessageActions(){$('chatMessages')?.querySelectorAll('.msg-edit').forEach(b=>b.onclick=()=>editMessage(b.dataset.id));$('chatMessages')?.querySelectorAll('.msg-delete').forEach(b=>b.onclick=()=>deleteMessage(b.dataset.id));}
async function loadChat(){if(!selectedStudent)return;const {data,error}=await supabaseClient.from('messages').select('id,remetente_id,destinatario_id,mensagem,criado_em,lida,editado_em,apagada').or(`and(remetente_id.eq.${coordProfile.id},destinatario_id.eq.${selectedStudent.id}),and(remetente_id.eq.${selectedStudent.id},destinatario_id.eq.${coordProfile.id})`).order('criado_em',{ascending:true});if(error){console.error('Chat:',error);return;}renderChatRows(data||[]);const unread=(data||[]).filter(m=>m.destinatario_id===coordProfile.id&&!m.lida&&!m.apagada).map(m=>m.id);if(unread.length)await supabaseClient.from('messages').update({lida:true}).in('id',unread).eq('destinatario_id',coordProfile.id);}
async function subscribeChat(){if(coordChatChannel)await supabaseClient.removeChannel(coordChatChannel);if(!selectedStudent)return;coordChatChannel=supabaseClient.channel(`coord-chat-${coordProfile.id}-${selectedStudent.id}`).on('postgres_changes',{event:'*',schema:'public',table:'messages'},payload=>{const m=payload.new||payload.old;if(!m)return;const same=(m.remetente_id===coordProfile.id&&m.destinatario_id===selectedStudent.id)||(m.remetente_id===selectedStudent.id&&m.destinatario_id===coordProfile.id);if(same)loadChat();}).subscribe();}
async function sendMessage(e){e.preventDefault();if(!selectedStudent)return;const input=$('chatInput'),button=$('chatForm').querySelector('button[type="submit"]'),text=input.value.trim();if(!text)return;input.disabled=true;button.disabled=true;let {data,error}=await supabaseClient.rpc('send_message_v40',{p_destinatario_id:selectedStudent.id,p_mensagem:text});if(error){const direct=await supabaseClient.from('messages').insert({remetente_id:coordProfile.id,destinatario_id:selectedStudent.id,mensagem:text}).select('id,remetente_id,destinatario_id,mensagem,criado_em,lida,editado_em,apagada').single();data=direct.data;error=direct.error;}input.disabled=false;button.disabled=false;if(error){alert(`Não foi possível enviar a mensagem.\n\n${error.message}`);return;}input.value='';await loadChat();}
async function editMessage(id){const el=document.querySelector(`[data-message-id="${CSS.escape(String(id))}"] span`);if(!el)return;const old=el.textContent.replace(/ \(editada\)$/,'');const next=prompt('Editar mensagem:',old);if(next===null)return;const text=next.trim();if(!text)return;const {data,error}=await supabaseClient.rpc('edit_message_v40',{p_message_id:id,p_mensagem:text});if(error){alert(`Não foi possível editar.\n\n${error.message}`);return;}if(data?.success===false){alert(data.message||'Não foi possível editar.');return;}await loadChat();}
async function deleteMessage(id){if(!confirm('Excluir esta mensagem?'))return;const {data,error}=await supabaseClient.rpc('delete_message_v40',{p_message_id:id});if(error){alert(`Não foi possível excluir.\n\n${error.message}`);return;}if(data?.success===false){alert(data.message||'Não foi possível excluir.');return;}await loadChat();}
async function deleteAllMessages(){if(!selectedStudent)return;if(!confirm('Apagar todas as mensagens desta conversa?'))return;const {data,error}=await supabaseClient.rpc('clear_chat_v40',{p_other_user_id:selectedStudent.id});if(error){alert(`Não foi possível apagar a conversa.\n\n${error.message}`);return;}if(data?.success===false){alert(data.message||'Não foi possível apagar a conversa.');return;}await loadChat();}


async function sendNotice(e){e.preventDefault();const title=$('noticeTitle').value.trim(),message=$('noticeMessage').value.trim(),status=$('noticeMessageStatus');status.textContent='Enviando...';const {data,error}=await supabaseClient.rpc('send_notice_v2',{p_titulo:title,p_mensagem:message});if(error){status.textContent=`Não foi possível enviar: ${error.message}`;return;}if(data?.success===false){status.textContent=data.message||'Não foi possível enviar o aviso.';return;}status.textContent=`Aviso enviado para ${data?.count||0} estudante(s)!`;e.target.reset();}

async function setupRealtime(){
  window.__coordPoll=setInterval(()=>{loadStudents();loadApplications();if(selectedStudent)loadChat();},6000);
  coordInboxChannel=supabaseClient.channel(`coord-inbox-${coordProfile.id}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`destinatario_id=eq.${coordProfile.id}`},()=>{loadStudents();loadApplications();}).subscribe();
  supabaseClient.channel(`coord-applications-${coordProfile.id}`).on('postgres_changes',{event:'*',schema:'public',table:'applications'},()=>{loadApplications();loadStudents();loadStats();}).subscribe();
}

function applyPageFocus(){
  const hash=String(location.hash||'').replace('#','').trim();
  const focus=hash||document.body.dataset.focus||'inicio';
  document.body.dataset.focus=focus;
  const map={inicio:['inicio'],criar:['criar'],candidaturas:['candidaturas'],avisos:['avisos'],oportunidades:['oportunidades'],mensagens:['mensagens']};
  const keep=new Set(map[focus]||['inicio']);
  document.querySelectorAll('main.dashboard > section').forEach(el=>{
    if(el.id && keep.has(el.id)) el.classList.remove('route-hidden');
    else if(el.id) el.classList.add('route-hidden');
  });
  document.querySelectorAll('.sidebar-nav a').forEach(a=>a.classList.toggle('active',a.dataset.route===focus));
  const target=document.getElementById(focus);
  if(target) setTimeout(()=>target.scrollIntoView({block:'start',behavior:'smooth'}),80);
}
window.addEventListener('hashchange',applyPageFocus);

async function openStudentFromUrl(){const id=new URLSearchParams(location.search).get('student');if(!id)return;for(let i=0;i<12;i++){const st=(window.coordStudents||[]).find(x=>String(x.id)===String(id));if(st){await selectStudent(st);return;}await new Promise(r=>setTimeout(r,150));}}

function setup(){
  document.querySelectorAll('.brand[href^="#"]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const t=document.querySelector(a.getAttribute('href'));if(t)t.scrollIntoView({block:'start',behavior:'smooth'});}));
  $('opportunityForm').addEventListener('submit',async e=>{e.preventDefault();const msg=$('oppMessage'),button=e.target.querySelector('[type=submit]');msg.textContent='Publicando...';button.disabled=true;const base={titulo:$('oppTitle').value.trim(),setor:$('oppArea').value.trim()||null,descricao:$('oppDescription').value.trim(),data:$('oppDate').value||null,vagas:Number($('oppSlots').value)||1,remuneracao:$('oppRemuneracao').value.trim()||null,criado_por:coordProfile.id};let result=await supabaseClient.from('opportunities').insert({...base,status:'open'});if(result.error){for(const table of ['opportunities','opportunies']){for(const status of ['open','aberta','aberto','published','publicada','publicado','active','ativo','ativa']){const r=await supabaseClient.from(table).insert({...base,status});if(!r.error){result=r;break;}result=r;}if(!result.error)break;}}if(result.error){msg.textContent=`Não foi possível publicar: ${result.error.message||'verifique o banco.'}`;button.disabled=false;return;}msg.textContent='Oportunidade publicada!';e.target.reset();await loadCoordinatorData();button.disabled=false;});
  $('noticeForm')?.addEventListener('submit',sendNotice);$('chatForm').addEventListener('submit',sendMessage);$('deleteAllMessages')?.addEventListener('click',deleteAllMessages);$('editOpportunityForm')?.addEventListener('submit',saveEditedOpportunity);$('closeOpportunityModal')?.addEventListener('click',()=>$('editOpportunityModal').classList.add('hidden'));$('editOpportunityModal')?.addEventListener('click',e=>{if(e.target===$('editOpportunityModal'))$('editOpportunityModal').classList.add('hidden');});setupRealtime();
}

function eduworkSmoothAnchors(){
  document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{const href=a.getAttribute('href');if(!href||href==='#')return;const t=document.querySelector(href);if(t){e.preventDefault();history.replaceState(null,'',href);t.scrollIntoView({behavior:'smooth',block:'start'});}}));
}
document.addEventListener('DOMContentLoaded',async()=>{coordProfile=await requireAuth('coordinator');if(!coordProfile)return;setup();eduworkSmoothAnchors();applyPageFocus();await loadCoordinatorData();await openStudentFromUrl();});
