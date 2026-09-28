# Revisión del candidato de fase 6

Candidato local sobre `623804cfe5def764a883371bfc294ccc295116e1`, recuperado en `/tmp/iabooks-fase6-retoma28`. No publicado. La fase sigue abierta hasta completar las comprobaciones pendientes y la publicación autorizada.

## Cambios incluidos

- AUD-005: carga diferida de páginas con Suspense y recuperación de errores de descarga. Se conservan las rutas y guardas de main, incluidas las páginas admin individuales; no se incorpora AdminWorkspace del árbol de trabajo.
- AUD-011: controlador de inactividad con plazo absoluto, sincronización de actividad cada 15 segundos y reloj de aviso cada segundo. Un solo temporizador; refresh de Auth no reinicia el plazo.
- AUD-012: el aviso de inactividad posee su propio estado en InactivityNotice. Medición local de seis segundos: Libro pasa de seis renders adicionales a cero mientras el contador sigue avanzando. No se presenta como medición de CPU ni de finalización de actividades.
- AUD-008: firmas de PDF solicitadas por 300 segundos, nueva comprobación RPC antes de renovar, recuperación de errores y conservación de página. Portadas mantienen el comportamiento y fallback de main. El PDF no utiliza fallback público: catálogo cloud consultado solo por recuentos confirma 40 rutas Storage, cero rutas públicas/absolutas entre 42 libros. No se incorporan eliminaciones de archivos públicos del árbol local ni se promete impedir acceso a copias ya descargadas o públicas.
- AUD-010: extracción gradual de TarjetasVolteables, SeleccionMultiple y helpers. Las 60 declaraciones originales del candidato conservan sus AST salvo llamadas diagnósticas; ActivityCard pasa de 3815 a 3503 líneas. Los cuatro archivos extraídos coinciden con los verificados en el árbol local.
- AUD-014: 44 llamadas de aplicación usan etiquetas estáticas y un logger que admite únicamente códigos permitidos y status HTTP. No vuelca Error, mensajes remotos, rutas ni respuestas. No modifica diagnósticos internos de React/PDF.js.

## Verificación del candidato

Build aprobado: principal 448.80 kB; Libro 452.10 kB. Mismas dependencias instaladas compartidas; no instalación limpia. ESLint mantiene deuda previa: base 35 errores/24 avisos, candidato 34/23, cero nuevos. Scripts 25/26/29/30/31: 13+5+10+6+4 pruebas aprobadas. Script32: 60 declaraciones equivalentes. Los 34 archivos de código y pruebas se recuperaron idénticos al respaldo aprobado del 27 de septiembre; posteriormente solo se retiraron líneas vacías finales de ActivityCard y se repitió su comparación contractual; hashes en resultados/fase6/retoma-28/candidato-hashes.json.

Navegador del candidato con Auth/Storage locales: PDF de 16.6 MB y 32 páginas cargado en ruta protegida de alumno; ocho casos de las mecánicas extraídas aprobados. Panel docente y detalle de clase cargan mediante rutas diferidas. Se usa exclusivamente información ficticia. No acredita navegación admin con MFA real ni producción.

El primer fallo del worker PDF en el worktree se debía a la lista fs.allow del servidor de prueba y las dependencias compartidas. Se corrigió solo la configuración temporal; el PDF carga después de reiniciar. Un aviso heredado de React por expandir key en props de ActivityContent permanece fuera de esta extracción contractual.

## Límites y pendientes

- Range tardío aprobado: tras 327.244 s, cuatro GET del PDF caducado devuelven 400; una firma nueva permite volver a recibir206 y mostrar páginas 31–32. Cero alertas finales/errores JS. El harness fuerza descargas parciales con disableAutoFetch/disableStream y proxy local: Storage no expone Accept-Ranges a JavaScript por CORS. Estas opciones y proxy no se publican en el producto.
- No se acredita suspensión real del sistema operativo ni un límite máximo de TTL impuesto por servidor. El SDK de aplicación solicita 300 s; usuarios autorizados pueden guardar bytes ya obtenidos.
- Limpieza acotada completada: PDF/bucket/token/activación y política/índice temporales retirados. Se conservan 30 usuarios/perfiles y 1500 respuestas.
- Publicación pendiente de autorización; el manifiesto identifica los archivos revisados. No copiar todo src ni otros cambios del árbol de auditoria-saz. Sin SQL ni Edge de producción.

## Reproducir comparación contractual

El script32 requiere el ActivityCard anterior en el directorio ignorado de evidencia. Para verificar este candidato, extraer únicamente `src/components/ActivityCard.jsx` de la base 623804c en `auditoria/pruebas/resultados/fase6/cierre-local/src-antes/components/ActivityCard.jsx`, crear `resultados/fase6/retoma-27` y ejecutar `node auditoria/pruebas/scripts/32_extraccion_fase6.mjs` desde el candidato. No usar el respaldo de 62 declaraciones del árbol sucio para comparar el candidato de main. Los scripts 25/26/29/30/31 no requieren la base local en funcionamiento.

Prueba parcial detallada y captura: resultados/fase6/retoma-28/range-tardio.json y range-renovado-31.png (ignorados). La instalación directa usa descarga completa en el entorno local por las cabeceras CORS observadas; no se afirma que su tráfico normal sea Range.

Supabase local detenido con `backup: true`; navegadores y servidores 5181/5182 cerrados. Sin commit, PR ni despliegue.
