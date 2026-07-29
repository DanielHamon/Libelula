-- Solo lectura. Debe devolver cero filas antes de aplicar security_phase2.sql.

-- Respuestas cuya actividad no pertenece a la unidad declarada.
SELECT r.id, r.usuario_id, r.actividad_id, r.unidad_id, r.libro_id
FROM public.respuestas r
LEFT JOIN public.actividades a
  ON a.id = r.actividad_id AND a.unidad_id = r.unidad_id
LEFT JOIN public.unidades u
  ON u.id = r.unidad_id AND u.libro_id = r.libro_id
WHERE a.id IS NULL OR u.id IS NULL;

-- Progreso principal sin activación/licencia individual.
SELECT p.usuario_id, p.libro_id
FROM public.progreso p
LEFT JOIN public.libro_activaciones la
  ON la.usuario_id = p.usuario_id AND la.libro_id = p.libro_id
WHERE la.usuario_id IS NULL;

-- Actividades completadas para libros sin activación/licencia individual.
SELECT ap.usuario_id, ap.actividad_id, u.libro_id
FROM public.actividad_progreso ap
JOIN public.actividades a ON a.id = ap.actividad_id
JOIN public.unidades u ON u.id = a.unidad_id
LEFT JOIN public.libro_activaciones la
  ON la.usuario_id = ap.usuario_id AND la.libro_id = u.libro_id
WHERE la.usuario_id IS NULL;
