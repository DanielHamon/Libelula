# Evidencia — AUD-008

**Hallazgo:** URL firmada de PDF con vigencia de 1 hora, redistribuible
**Severidad:** Media · CVSS 3.1: 5.3 (`AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N`)
**Commit:** `070ac28`

---

## Comandos de reproducción

```bash
git checkout 070ac28
grep -rn "createSignedUrl" src/
```

## Salida registrada

```
src/services/libros.service.js:32:  .from('libros').createSignedUrl(libro.pdf_url, 3600)
src/services/libros.service.js:72:  .from('libros').createSignedUrl(portadaPath, 3600)
src/components/StoragePicker.jsx:31: .from('libros').createSignedUrl(f.path, 300)
```

---

## Análisis

El control de acceso se aplica al **generar** la URL: `get_libro_completo`
verifica licencia o rol antes de firmar. Una vez emitida, la URL firmada es un
**portador válido durante 3 600 segundos con independencia de quién la posea**.
La comprobación de licencia no se repite al usarla.

### Contraste interno de criterio

| Ubicación | Contenido | Vigencia |
|---|---|---|
| `libros.service.js:32` | PDF de libro licenciado | **3 600 s** |
| `libros.service.js:72` | Portada de libro | **3 600 s** |
| `StoragePicker.jsx:31` | Vista previa administrativa | **300 s** |

El criterio más estricto (300 s) se aplicó al contenido menos sensible. El
material licenciado —el activo comercial a proteger— recibe la ventana más
amplia.

---

## Escenario

1. Estudiante con licencia legítima abre un libro.
2. Copia la URL firmada desde las herramientas de desarrollo del navegador.
3. La publica en un canal de mensajería.
4. Cualquier receptor descarga el PDF sin autenticación durante la hora
   siguiente. No se verifica licencia.

---

## Por qué es Media y no Alta

- Requiere un usuario legítimo como punto de partida (`PR:L`).
- La ventana es acotada.
- El contenido no es un dato personal; el impacto es comercial (erosión del
  licenciamiento por escuela), no de privacidad.

Ningún esquema de URL firmada resiste a un usuario autorizado decidido a
redistribuir. El objetivo realista es **acotar la ventana y detectar el abuso**,
no eliminarlo.

---

## Remediación verificable

1. Reducir la vigencia del PDF a 300 s, renovando desde el cliente mientras el
   lector permanezca abierto.
2. Registrar emisiones (usuario, libro, marca temporal) para detección de
   anomalías.
3. Limitar la tasa de emisión por usuario.
4. Marca de agua por usuario en el PDF, si la protección es prioritaria (costo de
   procesamiento; única medida disuasoria real ante redistribución).

```bash
# Verificación tras la corrección:
grep -n "createSignedUrl" src/services/libros.service.js
# Confirmar 300 en lugar de 3600.
```
