-- EDUWORK V81.3 — permite marcar oportunidades como removidas sem apagar candidaturas.
-- Execute este arquivo UMA VEZ no Supabase > SQL Editor.
-- Preserva todas as opções já aceitas pela constraint e acrescenta apenas 'deleted'.

do $$
declare
  v_constraint record;
  v_definition text;
  v_expression text;
begin
  select c.conrelid::regclass as table_name,
         c.conname,
         pg_get_constraintdef(c.oid) as definition
    into v_constraint
  from pg_constraint c
  join pg_namespace n on n.oid = c.connamespace
  where n.nspname = 'public'
    and c.conname = 'oportunidades_status_v44'
    and c.contype = 'c'
  limit 1;

  if not found then
    raise exception 'Não encontrei a constraint public.oportunidades_status_v44. Envie o resultado da consulta de diagnóstico antes de continuar.';
  end if;

  v_definition := v_constraint.definition;

  if position('deleted' in lower(v_definition)) = 0 then
    -- Remove somente o invólucro CHECK (...) para reaproveitar a regra atual.
    v_expression := substring(v_definition from 8 for char_length(v_definition) - 8);

    execute format('alter table %s drop constraint %I',
                   v_constraint.table_name, v_constraint.conname);

    execute format(
      'alter table %s add constraint %I check ((%s) or status::text = %L)',
      v_constraint.table_name, v_constraint.conname, v_expression, 'deleted'
    );
  end if;
end $$;

select 'EDUWORK_V81_3_CONSTRAINT_OK' as resultado;
