-- EDUWORK V83 — fluxo de candidaturas, recusa, nova tentativa e certificado
-- Execute UMA VEZ no Supabase > SQL Editor do projeto usado pelo FlashVagas.
-- Mantém os estados compatíveis com a constraint: pending / approved / rejected.
-- A conclusão é registrada em applications.concluido_em (certificado emitido automaticamente).

-- Garante que a coluna usada pelo fluxo de certificados exista mesmo em instalações antigas.
alter table public.applications
  add column if not exists concluido_em timestamptz;

create or replace function public.set_application_status_v43(
  p_application_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(trim(coalesce(p_status,'')));
  v_student uuid;
  v_opportunity uuid;
  v_title text;
begin
  if auth.uid() is null then
    return jsonb_build_object('success',false,'message','Sessão expirada. Entre novamente.');
  end if;

  if v_status not in ('approved','rejected') then
    return jsonb_build_object('success',false,'message','Ação inválida para esta candidatura.');
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(trim(p.role::text)) in ('coordinator','coordenador')
  ) then
    return jsonb_build_object('success',false,'message','Somente a coordenação pode alterar candidaturas.');
  end if;

  select a.student_id, a.opportunity_id, coalesce(o.titulo,'Atividade voluntária')
    into v_student, v_opportunity, v_title
  from public.applications a
  join public.opportunities o on o.id = a.opportunity_id
  where a.id = p_application_id
    and o.criado_por = auth.uid()
    and a.concluido_em is null
  for update of a;

  if v_student is null then
    return jsonb_build_object('success',false,'message','Candidatura não encontrada, já concluída ou não pertence à sua coordenação.');
  end if;

  update public.applications
     set status = v_status
   where id = p_application_id
     and (status::text = 'pending' or (v_status = 'approved' and status::text = 'approved'));

  if not found then
    return jsonb_build_object('success',false,'message','Esta candidatura não está mais aguardando análise.');
  end if;

  begin
    insert into public.notifications(user_id,titulo,mensagem,lida)
    values(
      v_student,
      case when v_status = 'approved' then 'Candidatura selecionada' else 'Candidatura não selecionada' end,
      case when v_status = 'approved'
        then 'Você foi selecionado(a) para a atividade "'||v_title||'". A coordenação informará os próximos passos.'
        else 'Sua candidatura para "'||v_title||'" não foi selecionada. Você pode se candidatar novamente enquanto a oportunidade estiver aberta.'
      end,
      false
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'success',true,
    'application_id',p_application_id,
    'status',v_status,
    'message',case when v_status='approved' then 'Estudante selecionado.' else 'Candidatura recusada.' end
  );
exception when others then
  return jsonb_build_object('success',false,'message',sqlerrm);
end;
$$;

create or replace function public.submit_application_v4(p_opportunity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_application_id uuid;
  v_profile jsonb;
  v_status text;
  v_opp_status text;
begin
  if v_user is null then
    return jsonb_build_object('success',false,'message','Sua sessão expirou. Entre novamente.');
  end if;

  select to_jsonb(p) into v_profile
  from public.profiles p
  where p.id = v_user
    and lower(trim(p.role::text)) in ('student','aluno');

  if v_profile is null then
    return jsonb_build_object('success',false,'message','Entre com uma conta de estudante para se candidatar.');
  end if;

  select lower(trim(coalesce(o.status::text,'open')))
    into v_opp_status
  from public.opportunities o
  where o.id = p_opportunity_id
    and lower(trim(coalesce(o.status::text,'open'))) not in ('deleted','removed','archived','cancelled','canceled','closed','fechada','fechado','completed','concluida','concluída');

  if v_opp_status is null then
    return jsonb_build_object('success',false,'message','Esta oportunidade não existe mais ou não está recebendo candidaturas.');
  end if;

  select a.id, a.status::text into v_application_id, v_status
  from public.applications a
  where a.student_id = v_user and a.opportunity_id = p_opportunity_id
  limit 1
  for update;

  if v_application_id is not null and v_status <> 'rejected' then
    return jsonb_build_object('success',true,'already_applied',true,
      'application_id',v_application_id,'status',v_status,
      'message','Você já enviou uma candidatura para esta oportunidade.');
  end if;

  if v_application_id is not null and v_status = 'rejected' then
    update public.applications
       set status = 'pending',
           concluido_em = null,
           curriculum_snapshot = jsonb_build_object(
             'nome',v_profile->>'nome',
             'email',v_profile->>'email',
             'turma',v_profile->>'turma',
             'matricula',v_profile->>'matricula',
             'bio',v_profile->>'bio',
             'competencies',v_profile->'competencies',
             'curriculo_objetivo',v_profile->>'curriculo_objetivo',
             'experiencias',v_profile->>'experiencias',
             'cursos',v_profile->>'cursos',
             'projetos',v_profile->>'projetos',
             'informacoes_adicionais',v_profile->>'informacoes_adicionais',
             'resume_filename',v_profile->>'resume_filename',
             'capturado_em',now()
           )
     where id = v_application_id;

    return jsonb_build_object('success',true,'already_applied',false,
      'application_id',v_application_id,'status','pending',
      'message','Nova candidatura enviada com sucesso.');
  end if;

  insert into public.applications(student_id,opportunity_id,status,curriculum_snapshot)
  values(v_user,p_opportunity_id,'pending',jsonb_build_object(
    'nome',v_profile->>'nome',
    'email',v_profile->>'email',
    'turma',v_profile->>'turma',
    'matricula',v_profile->>'matricula',
    'bio',v_profile->>'bio',
    'competencies',v_profile->'competencies',
    'curriculo_objetivo',v_profile->>'curriculo_objetivo',
    'experiencias',v_profile->>'experiencias',
    'cursos',v_profile->>'cursos',
    'projetos',v_profile->>'projetos',
    'informacoes_adicionais',v_profile->>'informacoes_adicionais',
    'resume_filename',v_profile->>'resume_filename',
    'capturado_em',now()
  ))
  returning id into v_application_id;

  return jsonb_build_object('success',true,'already_applied',false,
    'application_id',v_application_id,'status','pending',
    'message','Candidatura enviada com seu perfil profissional.');
exception when unique_violation then
  select a.id into v_application_id from public.applications a
  where a.student_id=v_user and a.opportunity_id=p_opportunity_id limit 1;
  return jsonb_build_object('success',true,'already_applied',true,
    'application_id',v_application_id,'message','Você já enviou uma candidatura para esta oportunidade.');
when others then
  return jsonb_build_object('success',false,'message',sqlerrm);
end;
$$;

-- A função de conclusão já grava concluido_em e disponibiliza o certificado.
-- Reforça a verificação para impedir concluir atividades de outra coordenação.
create or replace function public.eduwork_complete_application_v2(p_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_student uuid;
  v_title text;
begin
  if auth.uid() is null then
    return jsonb_build_object('success',false,'message','Sessão expirada. Entre novamente.');
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(trim(p.role::text)) in ('coordinator','coordenador')
  ) then
    return jsonb_build_object('success',false,'message','A conta atual não é de coordenação.');
  end if;

  select a.student_id, coalesce(o.titulo,'Atividade voluntária')
    into v_student, v_title
  from public.applications a
  join public.opportunities o on o.id=a.opportunity_id
  where a.id=p_application_id
    and o.criado_por=auth.uid()
    and a.status::text='approved'
  for update of a;

  if v_student is null then
    return jsonb_build_object('success',false,'message','Somente uma candidatura selecionada desta coordenação pode ser concluída.');
  end if;

  update public.applications
     set concluido_em=coalesce(concluido_em,now())
   where id=p_application_id;

  begin
    insert into public.notifications(user_id,titulo,mensagem,lida)
    values(v_student,'Atividade concluída',
      'A coordenação confirmou a conclusão de "'||v_title||'". Seu certificado já está disponível.',false);
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'success',true,
    'application_id',p_application_id,
    'code','EW-'||upper(substr(md5(p_application_id::text||':'||v_student::text),1,10)),
    'message','Atividade concluída e certificado disponível.'
  );
exception when others then
  return jsonb_build_object('success',false,'message',sqlerrm);
end;
$$;

revoke all on function public.set_application_status_v43(uuid,text) from public;
revoke all on function public.submit_application_v4(uuid) from public;
revoke all on function public.eduwork_complete_application_v2(uuid) from public;
grant execute on function public.set_application_status_v43(uuid,text) to authenticated;
grant execute on function public.submit_application_v4(uuid) to authenticated;
grant execute on function public.eduwork_complete_application_v2(uuid) to authenticated;

select 'EDUWORK_V83_FLUXO_CANDIDATURAS_OK' as resultado;
