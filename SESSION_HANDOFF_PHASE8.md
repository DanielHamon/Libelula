# Continuidad — inicio de Fase 8

Fecha de cierre de Fase 7: 2026-07-29.

## Estado confirmado

La Fase 7 está finalizada. La migración, el hotfix, la verificación SQL, la
comprobación directa del Data API y las siete pruebas funcionales fueron
superadas.

## Controles cerrados

- Las RPC de tokens y clases no son ejecutables por `anon`.
- La validación y activación de tokens exige una sesión y tiene límite por
  usuario.
- La activación bloquea la fila del token antes de consumirla.
- El registro nuevo valida el código únicamente después de establecer sesión.
- La búsqueda y unión a clases tiene límite por usuario y errores genéricos.
- Las clases nuevas usan códigos de diez caracteres.
- Escuelas, grados y libros no son consultables anónimamente.
- El Data API devuelve HTTP 401 / PostgreSQL `42501` a las consultas anónimas
  verificadas.

## Pruebas funcionales superadas

1. Registro nuevo con token válido.
2. Registro nuevo con token inválido.
3. Activación de otro libro desde una cuenta existente.
4. Creación de una clase con código de diez caracteres.
5. Búsqueda y unión desde un estudiante compatible.
6. Respuesta genérica ante un código inexistente.
7. Acceso normal de usuarios autorizados a libros, escuela y grado.

## SQL aplicado

- `supabase/security_phase7.sql`
- `supabase/security_phase7_class_code_hotfix.sql`

La verificación se realizó con:

- `supabase/security_phase7_verify.sql`

## Deuda histórica preservada

El diagnóstico encontró tres clases antiguas sin ámbito completo y una clase
con docente incompatible. No se borraron ni reasignaron porque hace falta
conocer la escuela, el grado y el responsable correctos. Los flujos nuevos no
crean registros con estas inconsistencias.

## Próximo paso

Comenzar la Fase 8 con un preflight de solo lectura sobre auditoría,
dependencias, límites de payload, funciones privilegiadas heredadas y
configuración de despliegue. No repetir ni revertir las migraciones de fases
anteriores.
