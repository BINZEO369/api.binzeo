begin;

-- Direct PostgREST writes are not an application boundary. All mutations must
-- pass through the Central API/Admin API, which uses service_role after its
-- own authentication, authorization, validation, and audit checks.
do $$
declare
  v_table record;
  v_sequence record;
begin
  for v_table in
    select table_schema, table_name
      from information_schema.tables
     where table_schema = 'public'
       and table_type = 'BASE TABLE'
  loop
    execute format('alter table %I.%I enable row level security', v_table.table_schema, v_table.table_name);
    execute format('revoke insert, update, delete, truncate, references, trigger on table %I.%I from public, anon, authenticated', v_table.table_schema, v_table.table_name);
  end loop;

  for v_sequence in
    select sequence_schema, sequence_name
      from information_schema.sequences
     where sequence_schema = 'public'
  loop
    execute format('revoke all on sequence %I.%I from public, anon, authenticated', v_sequence.sequence_schema, v_sequence.sequence_name);
  end loop;
end;
$$;

-- Do not expose public RPC functions as an alternate write path. The API uses
-- service_role, which retains execute access through the grants below.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

-- Keep future objects locked down by default as well.
alter default privileges in schema public
  revoke insert, update, delete, truncate, references, trigger on tables from public, anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

commit;
