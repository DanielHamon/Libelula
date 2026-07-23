-- Permite actividades para ordenar palabras y construir una oración.
ALTER TABLE public.actividades
  DROP CONSTRAINT IF EXISTS actividades_tipo_check;

ALTER TABLE public.actividades
  ADD CONSTRAINT actividades_tipo_check CHECK (tipo IN (
    'sopaLetras','seleccionMultiple','identificar','reflexionPersonal',
    'termometroEmocional','clasificacionCategorias','separarSilabas','acrostico',
    'crucigrama','respiracionGuiada','miniJuegoConteo','exploracionInteractiva',
    'selectorEmocionColor','mezclaPinturaGuiada','tarjetasVolteables',
    'verdaderoFalso','completarPalabras','ordenarEventos','ordenarPalabras',
    'emparejar','completarMapa','escribirCarta','dibujoLibre',
    'video','audio','imagen','colorear'
  ));
