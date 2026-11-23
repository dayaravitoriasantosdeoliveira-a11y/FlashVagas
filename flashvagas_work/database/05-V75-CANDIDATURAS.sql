-- EduWork V75 — envio seguro de candidaturas
-- Execute no SQL Editor do Supabase usando o projeto correto.
-- Usa as colunas student_id e opportunity_id já utilizadas pelo EduWork.

create or replace function public.submit_application_v3(p_opportunity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_application_id uuid;
begin
  if v_user is null then
    return jsonb_build_object('success', false, 'message', 'Sua sessão expirou. Entre novamente.');
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_user
      and lower(trim(p.role::text)) in ('student', 'aluno')
  ) then
    return jsonb_build_object('success', false, 'message', 'Entre com uma conta de estudante para se candidatar.');
  end if;

  if not exists (
    select 1 from public.opportunities o
    where o.id = p_opportunity_id
  ) then
    return jsonb_build_object('success', false, 'message', 'Esta oportunidade não existe mais.');
  end if;

  select a.id into v_application_id
  from public.applications a
  where a.student_id = v_user and a.opportunity_id = p_opportunity_id
  limit 1;

  if v_application_id is not null then
    return jsonb_build_object('success', true, 'already_applied', true, 'application_id', v_application_id,
      'message', 'Você já enviou uma candidatura para esta oportunidade.');
  end if;

  insert into public.applications (student_id, opportunity_id)
  values (v_user, p_opportunity_id)
  returning id into v_application_id;

  return jsonb_build_object('success', true, 'already_applied', false,
    'application_id', v_application_id, 'message', 'Candidatura enviada com sucesso.');
exception when others then
  return jsonb_build_object('success', false, 'message', sqlerrm);
end;
$$;

revoke all on function public.submit_application_v3(uuid) from public;
grant execute on function public.submit_application_v3(uuid) to authenticated;

select 'EDUWORK_V75_CANDIDATURAS_OK' as resultado;
