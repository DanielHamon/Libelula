-- Paleta configurable del panel de actividades.
-- Las columnas son nullable para que los libros existentes conserven el aspecto
-- derivado de color_acento hasta que un administrador guarde una nueva paleta.
ALTER TABLE public.libros
  ADD COLUMN IF NOT EXISTS color_encabezado_inicio TEXT,
  ADD COLUMN IF NOT EXISTS color_encabezado_fin TEXT,
  ADD COLUMN IF NOT EXISTS color_fondo_actividades TEXT;

COMMENT ON COLUMN public.libros.color_acento IS 'Color de botones, pestañas y títulos del panel';
COMMENT ON COLUMN public.libros.color_encabezado_inicio IS 'Primer color del degradado del encabezado';
COMMENT ON COLUMN public.libros.color_encabezado_fin IS 'Segundo color del degradado del encabezado';
COMMENT ON COLUMN public.libros.color_fondo_actividades IS 'Color de fondo del panel de actividades';
