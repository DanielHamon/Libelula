# Evidencia — AUD-009

**Hallazgo:** Tres vulnerabilidades altas en dependencias de construcción
**Severidad:** Media (CVSS individual hasta 7.5)
**Commit:** `070ac28`

---

## Comandos de reproducción

```bash
git checkout 070ac28
npm ci
npm audit
```

## Salida registrada

```
brace-expansion  <1.1.18
Severity: high
brace-expansion: DoS via unbounded intermediate arrays — GHSA-rgw5-rvv9-x895
CVSS 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H)

js-yaml  4.0.0 - 4.3.1
Severity: high
JS-YAML: Quadratic CPU consumption in !!omap resolution — GHSA-5p4m-2wfm-xmqj
js-yaml: maxTotalMergeKeys does not limit CPU — GHSA-2883-xcg3-v3hh

nanoid  <3.3.18
Severity: high
nanoid: custom generators can loop indefinitely when size is zero — GHSA-2v37-7h3g-55p8

@humanfs/node  <0.16.8
Severity: moderate
humanfs: Recursive copy follows symlinked files — GHSA-p498-v437-472g

4 vulnerabilities (1 moderate, 3 high)
fix available via `npm audit fix`
```

---

## Análisis

| Paquete | Severidad | Naturaleza | En el paquete de producción |
|---|---|---|---|
| `brace-expansion` | Alta | DoS | No (transitiva de ESLint/glob) |
| `js-yaml` | Alta | DoS por CPU | No (transitiva de herramientas) |
| `nanoid` | Alta | Bucle infinito | No (transitiva) |
| `@humanfs/node` | Moderada | Recorrido de rutas | No (transitiva de ESLint) |

Las cuatro son **dependencias transitivas de la cadena de construcción**
(ESLint, Vite y sus herramientas), no del código que se ejecuta en el navegador.
Ninguna llega al paquete de producción.

---

## Por qué es Media pese al CVSS 7.5

El vector de ataque exige control sobre las entradas del proceso de
construcción, lo que implica acceso previo al repositorio o a la canalización de
integración. No es explotable por un atacante externo contra el sistema en
ejecución.

No se descarta por ello: es riesgo de cadena de suministro y la corrección tiene
costo casi nulo.

---

## Remediación verificable

```bash
npm audit fix
npm audit          # confirmar 0 vulnerabilidades
npx vite build     # confirmar que la compilación sigue siendo correcta
```

Automatización recomendada:
```bash
# En la canalización de integración continua:
npm audit --audit-level=high   # falla el build ante vulnerabilidades altas
```

---

## Atención particular: `pdfjs-dist`

No presenta avisos en esta revisión, pero es la **única dependencia de
producción que procesa contenido no confiable** (los PDF subidos) y acumula
antecedentes históricos de vulnerabilidades de ejecución de código. Debe
vigilarse con prioridad en el seguimiento continuo de dependencias.

```bash
grep pdfjs-dist package.json
# "pdfjs-dist": "^5.4.296"
```
