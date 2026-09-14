# Evidencia — AUD-010

**Hallazgo:** Componente monolítico de 3 814 líneas con 28 ramas de tipo
**Severidad:** Media
**Commit:** `070ac28`

---

## Comandos de reproducción

```bash
git checkout 070ac28

# Distribución de tamaño
find src -type f \( -name '*.jsx' -o -name '*.js' \) | xargs wc -l | sort -rn | head -6

# Complejidad de ActivityCard
grep -c "^function \|^const [A-Z]" src/components/ActivityCard.jsx   # 54
grep -c "case '" src/components/ActivityCard.jsx                      # 28
```

## Salida registrada

```
3814 src/components/ActivityCard.jsx
2675 src/pages/admin/AdminLibroDetalle.jsx
1283 src/pages/DocenteRespuestaEstudiante.jsx
 911 src/pages/ClaseDetalle.jsx
 720 src/components/LectorLibro.jsx
```

---

## Concentración de código

| Archivo | Líneas | % de 17 450 LOC |
|---|---|---|
| `ActivityCard.jsx` | 3 814 | 21,9 % |
| `AdminLibroDetalle.jsx` | 2 675 | 15,3 % |
| `DocenteRespuestaEstudiante.jsx` | 1 283 | 7,4 % |
| `ClaseDetalle.jsx` | 911 | 5,2 % |
| **4 de 54 archivos** | **8 683** | **49,8 %** |

`ActivityCard.jsx`: 54 definiciones internas de componente/función y 28 ramas de
tipo de actividad en un solo módulo.

---

## Impacto

1. **Bloquea la división de código (AUD-005)**: los 28 tipos entran en el paquete
   inicial aunque una unidad use solo 2 o 3.
2. **Riesgo de regresión**: modificar un tipo obliga a tocar el archivo del que
   dependen los 28.
3. **Fricción de revisión**: diferencias difíciles de revisar.
4. **Obstáculo a las pruebas**: no hay infraestructura de pruebas en el proyecto;
   un módulo así de grande encarece introducirlas.

Es deuda técnica, no un defecto: el código es funcional. Su relevancia principal
es que condiciona la corrección de AUD-005.

---

## Remediación: registro con carga diferida

```
src/components/actividades/
├── index.js          // registro de importaciones dinámicas
├── Crucigrama.jsx
├── SopaDeLetras.jsx
└── … (28 módulos)
```

```js
const REGISTRO = {
  crucigrama:  () => import('./Crucigrama'),
  sopa_letras: () => import('./SopaDeLetras'),
  // …
}
export function cargarActividad(tipo) {
  const cargador = REGISTRO[tipo]
  if (!cargador) throw new Error(`Tipo desconocido: ${tipo}`)
  return lazy(cargador)
}
```

**Ejecución recomendada: incremental.** Extraer primero los tipos de mayor
tamaño, manteniendo el componente actual como capa de compatibilidad. Una
reescritura íntegra de 3 814 líneas sin pruebas automatizadas es una operación de
riesgo elevado.
