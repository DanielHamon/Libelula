# Flujo de actividades para grados 4.º y 5.º

## Objetivo

Para cada libro sin actividades planeadas:

- Leer el PDF completo y basar las actividades en su contenido.
- Crear cuatro unidades por libro.
- Usar títulos con el formato exacto `[emoji] Seccion #`.
- Incluir en cada unidad título, subtítulo y texto descriptivo.
- Crear ocho actividades por unidad, para un total de 32 actividades por libro.
- Combinar mecánicas compatibles con la plataforma: comprensión, inferencias, secuencias, vocabulario, clasificación, escritura y reflexión.
- No crear aproximaciones cuando una mecánica no pueda reproducirse fielmente.

## Procedimiento con `iabooksAdminLocal`

1. Localizar el libro con `listar_libros` y obtener su estructura con `obtener_estructura_libro`.
2. Leer y analizar el PDF completo.
3. Preparar las cuatro unidades con `preparar_creacion_unidad`.
4. Confirmar cada preparación con `confirmar_cambio_admin` usando `operacion_esperada: crear_unidad`. Las unidades quedan pendientes de aprobación del superadmin.
5. Esperar a que el superadmin apruebe las unidades.
6. Volver a consultar la estructura y comprobar que las unidades estén ordenadas del 1 al 4.
7. Diseñar ocho actividades por unidad, usando únicamente tipos admitidos por `listar_tipos_actividad`.
8. Para cada actividad, ejecutar `preparar_creacion_actividad` y después `confirmar_cambio_admin` con `operacion_esperada: crear_actividad`.
9. Si una preparación falla por una mecánica no compatible, omitir esa actividad, documentar sección, posición, título y motivo, y continuar con las demás.
10. Verificar al final cantidad, orden, contenido e identificadores únicos mediante `obtener_estructura_libro`.

## Libros completados

- `cuando_emilio_llego`: 4 unidades, 32 actividades.
- `el_capitan_del_5`: 4 unidades, 32 actividades.
- `el_segundo_de_silencio`: 4 unidades, 32 actividades.
- `lo_que_lucia_no_podia_decir`: 4 unidades, 32 actividades.

## Nota de nombres

El PDF registrado en la base como `lo_que_lucia_no_podia_decir` se titula «Lo que Eliza no podía decir» y usa Eliza como protagonista. Las actividades se crearon usando Eliza para conservar la fidelidad al PDF.

## Verificación esperada

Cada libro debe terminar con cuatro unidades en orden 1–4, ocho actividades en orden 1–8 dentro de cada unidad, 32 actividades totales e identificadores únicos.
