BEGIN;

ALTER TABLE public.actividades
  DROP CONSTRAINT IF EXISTS actividades_tipo_check;

ALTER TABLE public.actividades
  ADD CONSTRAINT actividades_tipo_check
  CHECK (tipo IN (
    'sopaLetras',
    'seleccionMultiple',
    'identificar',
    'termometroEmocional',
    'clasificacionCategorias',
    'separarSilabas',
    'acrostico',
    'crucigrama',
    'respiracionGuiada',
    'miniJuegoConteo',
    'exploracionInteractiva',
    'selectorEmocionColor',
    'mezclaPinturaGuiada',
    'tarjetasVolteables',
    'verdaderoFalso',
    'completarPalabras',
    'ordenarEventos',
    'emparejar',
    'completarMapa',
    'escribirCarta',
    'dibujoLibre',
    'video',
    'audio',
    'imagen',
    'colorear'
  ));

COMMIT;
