# Evidencia — AUD-005

**Hallazgo:** Ausencia total de división de código: paquete único de 1,38 MB
**Severidad:** Alta
**Commit:** `070ac28`

---

## Comandos de reproducción

```bash
git checkout 070ac28
npm ci
npx vite build
```

## Salida registrada de la compilación

```
vite v8.1.5 building client environment for production...
✓ 146 modules transformed.
dist/index.html                              0.60 kB │ gzip:   0.38 kB
dist/assets/pdf.worker.min-qwK7q_zL.mjs  1 046.21 kB
dist/assets/index-B0Ui3h9i.css              26.03 kB │ gzip:   6.04 kB
dist/assets/index-CVk49nnR.js            1 378.45 kB │ gzip: 361.95 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
```

**La propia herramienta de compilación emite la advertencia.**

---

## Verificación de la ausencia de división

```bash
# Búsqueda de carga diferida en todo el árbol
grep -rn "React.lazy\|lazy(\|Suspense" src/
# Salida: (ninguna coincidencia)

# Imports estáticos en el punto de entrada de rutas
grep -c "^import" src/App.jsx
# Salida: 26

# Estrategia de fragmentación en la configuración
cat vite.config.js
```
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],   // sin build.rollupOptions.output.manualChunks
})
```

---

## Contenido descargado innecesariamente en el login

```bash
find src/pages/admin -type f | xargs wc -l | tail -1
```

Las 9 vistas del panel administrativo, más los dos componentes de mayor tamaño
(`AdminLibroDetalle.jsx` con 2 675 líneas y `ActivityCard.jsx` con 3 814), se
incluyen en el paquete inicial que descarga todo usuario, incluido un estudiante
que solo va a leer un libro.

---

## Proyección de tiempo de descarga inicial

Paquete inicial: 362 KB (JS comprimido) + 6 KB (CSS comprimido) ≈ 368 KB.

| Conexión | Tiempo estimado |
|---|---|
| Fibra (50 Mbps) | < 1 s |
| 4G típico (5 Mbps) | ≈ 3,5 s |
| 3G (1,5 Mbps) | ≈ 12 s |
| 3G lento (400 kbps) | ≈ 45 s |

Al tiempo de transferencia se añade el de análisis y ejecución de JavaScript, que
en dispositivos de gama baja puede igualarlo o superarlo. El contexto escolar del
producto hace probable el uso de redes limitadas y dispositivos modestos.

---

## Verificación de la remediación

```bash
# Tras aplicar división por rutas + carga diferida del worker de PDF:
npx vite build
# Confirmar: el chunk inicial (index-*.js) queda muy por debajo de los
# 1 378 kB actuales, y aparecen chunks separados por ruta administrativa.
```
