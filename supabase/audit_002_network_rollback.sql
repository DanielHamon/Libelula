-- Revertir primero Edge Function con copia previa; luego esta función SQL.
-- Mantiene ACL endurecidos y no toca AUD-016/AUD-003.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.prevalidar_token_anonimo(p_token text, p_red_hash text, p_dispositivo_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_token TEXT := upper(trim(p_token));
  v_intentos_red INTEGER;
  v_intentos_dispositivo INTEGER;
BEGIN
  IF p_red_hash IS NULL
     OR p_dispositivo_hash IS NULL
     OR p_red_hash !~ '^[0-9a-f]{64}$'
     OR p_dispositivo_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'clave_limite_invalida' USING ERRCODE = '22023';
  END IF;

  -- Serializa intentos del mismo origen para impedir carreras sobre el límite.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_red_hash, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_dispositivo_hash, 1));

  SELECT count(*) INTO v_intentos_red
  FROM public.intentos_token_anonimos
  WHERE red_hash = p_red_hash
    AND intentado_en > now() - interval '1 hour';

  SELECT count(*) INTO v_intentos_dispositivo
  FROM public.intentos_token_anonimos
  WHERE dispositivo_hash = p_dispositivo_hash
    AND intentado_en > now() - interval '1 hour';

  IF v_intentos_red >= 100 OR v_intentos_dispositivo >= 10 THEN
    RETURN jsonb_build_object('valido', false, 'motivo', 'demasiados_intentos');
  END IF;

  INSERT INTO public.intentos_token_anonimos(red_hash, dispositivo_hash)
  VALUES (p_red_hash, p_dispositivo_hash);

  DELETE FROM public.intentos_token_anonimos
  WHERE intentado_en <= now() - interval '24 hours';

  IF v_token IS NULL OR char_length(v_token) NOT BETWEEN 6 AND 128 THEN
    RETURN jsonb_build_object('valido', false, 'motivo', 'token_invalido');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tokens
    WHERE id = v_token
      AND estado = 'valido'
      AND (expira_en IS NULL OR expira_en >= now())
  ) THEN
    RETURN jsonb_build_object('valido', true);
  END IF;

  RETURN jsonb_build_object('valido', false, 'motivo', 'token_invalido');
END;
$function$
;
COMMIT;
