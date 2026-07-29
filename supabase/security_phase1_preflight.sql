-- Solo lectura. Ejecutar ANTES de security_phase1.sql.
-- Revisa que los roles privilegiados existentes sean legítimos.

SELECT
  p.id,
  p.nombre,
  p.email,
  p.rol,
  p.escuela_id,
  p.fecha_registro
FROM public.profiles p
WHERE p.rol IN ('admin', 'docente')
ORDER BY p.rol, p.fecha_registro;

-- El bucket de libros debe ser privado.
SELECT id, name, public
FROM storage.buckets
WHERE id = 'libros';

-- Inventario de políticas actuales del bucket. No cambia nada.
SELECT
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
ORDER BY policyname;
