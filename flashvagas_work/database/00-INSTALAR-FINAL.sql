-- EDUWORK — CERTIFICADO SIMPLES E IDÊNTICO EM TODAS AS INSTALAÇÕES
-- Não cria policies duplicadas, não altera constraints de status e não usa a tabela certificates antiga.
-- A conclusão fica registrada diretamente na candidatura por meio de concluido_em.

alter table public.applications
  add column if not exists concluido_em timestamptz;

create or replace function public.eduwork_complete_application_v2(p_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_student uuid;
  v_opp uuid;
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

  select a.student_id, a.opportunity_id, coalesce(o.titulo,'Atividade voluntária')
    into v_student, v_opp, v_title
  from public.applications a
  left join public.opportunities o on o.id=a.opportunity_id
  where a.id=p_application_id;

  if v_student is null or v_opp is null then
    return jsonb_build_object('success',false,'message','Candidatura não encontrada.');
  end if;

  update public.applications
     set concluido_em = coalesce(concluido_em, now())
   where id=p_application_id;

  begin
    insert into public.notifications(user_id,titulo,mensagem,lida)
    values(
      v_student,
      'Atividade concluída',
      'A coordenação confirmou a conclusão de "'||v_title||'". Seu certificado já está disponível.',
      false
    );
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

create or replace function public.eduwork_get_my_completions_v2()
returns table(
  application_id uuid,
  opportunity_id uuid,
  title text,
  issued_at timestamptz,
  code text
)
language sql
security definer
set search_path=public
as $$
  select
    a.id,
    a.opportunity_id,
    coalesce(o.titulo,'Atividade voluntária'),
    a.concluido_em,
    'EW-'||upper(substr(md5(a.id::text||':'||a.student_id::text),1,10))
  from public.applications a
  left join public.opportunities o on o.id=a.opportunity_id
  where a.student_id=auth.uid()
    and a.concluido_em is not null
  order by a.concluido_em desc;
$$;

create or replace function public.eduwork_get_completed_application_ids_v2()
returns table(application_id uuid)
language sql
security definer
set search_path=public
as $$
  select a.id
  from public.applications a
  join public.opportunities o on o.id=a.opportunity_id
  where o.criado_por=auth.uid()
    and a.concluido_em is not null;
$$;

revoke all on function public.eduwork_complete_application_v2(uuid) from public;
revoke all on function public.eduwork_get_my_completions_v2() from public;
revoke all on function public.eduwork_get_completed_application_ids_v2() from public;

grant execute on function public.eduwork_complete_application_v2(uuid) to authenticated;
grant execute on function public.eduwork_get_my_completions_v2() to authenticated;
grant execute on function public.eduwork_get_completed_application_ids_v2() to authenticated;

select 'EDUWORK_CERTIFICADO_SIMPLES_OK' as resultado;
