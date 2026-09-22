-- Solo local: datos ficticios y transacción descartable.
BEGIN;
DO $$
DECLARE book text := 'fase5-' || gen_random_uuid()::text; unit text; actual integer; uid uuid := gen_random_uuid(); result jsonb;
BEGIN
  INSERT INTO public.libros(id,titulo) VALUES (book,'Prueba fase 5');
  INSERT INTO public.unidades(id,libro_id,titulo,orden) VALUES (book||'-1',book,'📘 Sección 1',1);
  unit:=book||'-2';
  INSERT INTO public.unidades(id,libro_id,titulo,orden) VALUES (unit,book,'📘 Sección 2',1) RETURNING orden INTO actual;
  IF actual<>2 THEN RAISE EXCEPTION 'Orden duplicado no normalizado'; END IF;
  INSERT INTO public.unidades(id,libro_id,titulo,orden) VALUES (book||'-3',book,'📘 Sección 3',NULL) RETURNING orden INTO actual;
  IF actual<>3 THEN RAISE EXCEPTION 'Orden nulo no normalizado'; END IF;
  -- Preparación privilegiada de un administrador ficticio, exclusivamente local.
  INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(uid,uid::text||'@auditoria.local','{}');
  DELETE FROM public.profiles WHERE id=uid;
  INSERT INTO public.profiles(id,nombre,email,rol) VALUES(uid,'Admin ficticio',uid::text||'@auditoria.local','admin');
  PERFORM set_config('request.jwt.claim.sub',uid::text,true);
  result:=public.admin_solicitar_accion_sensible_v2('crear_unidad',jsonb_build_object('libro_id',book,'titulo','📘 Sección 4','orden',1));
  SELECT (payload->>'orden')::integer INTO actual FROM public.acciones_admin_pendientes WHERE id=(result->>'id')::uuid;
  IF actual<>4 THEN RAISE EXCEPTION 'Primera reserva incorrecta: %',actual; END IF;
  result:=public.admin_solicitar_accion_sensible_v2('crear_unidad',jsonb_build_object('libro_id',book,'titulo','📘 Sección 5','orden',1));
  SELECT (payload->>'orden')::integer INTO actual FROM public.acciones_admin_pendientes WHERE id=(result->>'id')::uuid;
  IF actual<>5 THEN RAISE EXCEPTION 'Reserva pendiente ignorada: %',actual; END IF;
END $$;
SELECT 'OK: colisión y orden nulo normalizados; reservas pendientes consecutivas' AS resultado;
ROLLBACK;
