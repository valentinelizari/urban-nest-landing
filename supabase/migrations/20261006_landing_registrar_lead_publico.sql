-- Aplicada en el proyecto "Urban Nest" (ezocccljyweieyafndhb) el 2026-10-06.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.landing_lead_log (
  id bigint generated always as identity primary key,
  contacto text not null,
  creado timestamptz not null default now()
);
create index if not exists landing_lead_log_creado_idx on private.landing_lead_log (creado);
create index if not exists landing_lead_log_contacto_idx on private.landing_lead_log (contacto, creado);
revoke all on private.landing_lead_log from public, anon, authenticated;

create or replace function public.registrar_lead_publico(
  p_nombre text,
  p_contacto text,
  p_barrio text default null,
  p_tipo text default null,
  p_ambientes text default null,
  p_mensaje text default null,
  p_origen text default null,
  p_trampa text default null
) returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text := left(btrim(coalesce(p_nombre, '')), 120);
  v_contacto text := left(btrim(coalesce(p_contacto, '')), 160);
  v_barrio text := nullif(left(btrim(coalesce(p_barrio, '')), 80), '');
  v_tipo text := nullif(left(btrim(coalesce(p_tipo, '')), 60), '');
  v_amb text := nullif(left(btrim(coalesce(p_ambientes, '')), 20), '');
  v_msj text := nullif(left(btrim(coalesce(p_mensaje, '')), 1500), '');
  v_origen text := nullif(left(btrim(coalesce(p_origen, '')), 60), '');
  v_clave text;
  v_id text := gen_random_uuid()::text;
begin
  -- Honeypot: los bots completan el campo oculto. Respondemos ok sin guardar.
  if coalesce(btrim(p_trampa), '') <> '' then
    return json_build_object('ok', true);
  end if;

  if char_length(v_nombre) < 2 then
    raise exception 'Ingresá tu nombre.' using errcode = '22023';
  end if;
  if v_contacto !~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'
     and char_length(regexp_replace(v_contacto, '\D', '', 'g')) not between 8 and 15 then
    raise exception 'Ingresá un WhatsApp o email válido.' using errcode = '22023';
  end if;

  v_clave := lower(case when v_contacto like '%@%' then v_contacto
                        else regexp_replace(v_contacto, '\D', '', 'g') end);

  -- Límites anti-abuso: 3 por contacto cada 24 h y 40 en total por hora.
  if (select count(*) from private.landing_lead_log
      where contacto = v_clave and creado > now() - interval '24 hours') >= 3
     or (select count(*) from private.landing_lead_log
         where creado > now() - interval '1 hour') >= 40 then
    raise exception 'Ya recibimos tu consulta. Te contactamos a la brevedad.' using errcode = 'P0001';
  end if;

  insert into private.landing_lead_log (contacto) values (v_clave);

  insert into public.leads (id, "propertyName", neighborhood, "ownerName", contact,
                            "propertyType", bedrooms, status, notes)
  values (
    v_id,
    concat_ws(' · ', coalesce(v_tipo, 'Departamento'), coalesce(v_barrio, 'Sin barrio')),
    v_barrio, v_nombre, v_contacto, v_tipo, v_amb, 'Nuevo',
    concat_ws(E'\n',
      'Lead desde la landing (' || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') || ')',
      case when v_origen is not null then 'Origen: ' || v_origen end,
      v_msj)
  );

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.registrar_lead_publico(text, text, text, text, text, text, text, text) from public;
grant execute on function public.registrar_lead_publico(text, text, text, text, text, text, text, text) to anon, authenticated;
