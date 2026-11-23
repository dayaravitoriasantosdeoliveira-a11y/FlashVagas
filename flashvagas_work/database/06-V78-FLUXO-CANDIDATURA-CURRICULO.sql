-- EDUWORK V78: corrige o status inicial que causava applications_status_check_v43.
-- Também salva uma fotografia dos dados profissionais do estudante no momento da candidatura.
-- Execute uma vez no SQL Editor do Supabase, no projeto conectado ao EduWork.

alter table public.applications
  add column if not exists curriculum_snapshot jsonb;

-- A aplicação usa estes três estados. A conclusão é registrada em concluido_em,
-- sem depender de um quarto estado que possa conflitar com a constraint antiga.
alter table public.applications drop constraint if exists applications_status_check_v43;

update public.applications
   set status = 'pending'
 where status is null
    or status::text not in ('pending','approved','rejected');

alter table public.applications alter column status set default 'pending';
alter table public.applications
  add constraint applications_status_check_v43
  check (status::text in ('pending','approved','rejected'));

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

  if not exists (select 1 from public.opportunities o where o.id=p_opportunity_id) then
    return jsonb_build_object('success',false,'message','Esta oportunidade não existe mais.');
  end if;

  select a.id, a.status::text into v_application_id, v_status
  from public.applications a
  where a.student_id=v_user and a.opportunity_id=p_opportunity_id
  limit 1;

  if v_application_id is not null then
    return jsonb_build_object('success',true,'already_applied',true,
      'application_id',v_application_id,'status',v_status,
      'message','Você já enviou uma candidatura para esta oportunidade.');
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
  return jsonb_build_object('success',true,'already_applied',true,'application_id',v_application_id,
    'message','Você já enviou uma candidatura para esta oportunidade.');
when others then
  return jsonb_build_object('success',false,'message',sqlerrm);
end;
$$;

revoke all on function public.submit_application_v4(uuid) from public;
grant execute on function public.submit_application_v4(uuid) to authenticated;

select 'EDUWORK_V78_CANDIDATURAS_OK' as resultado;
