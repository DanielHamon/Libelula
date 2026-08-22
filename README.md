# React + Vite

## Reporte de texto de los PDF

El extractor administrativo analiza cada página, limpia texto básico, detecta
páginas vacías o con imágenes sin texto extraíble y genera reportes JSON, CSV y
Markdown en `.reports/pdf-pages/`.

PDF local:

```bash
npm run report:pdf -- --file /ruta/al/libro.pdf --book-id id_del_libro --include-text
```

Un libro almacenado en el bucket privado de Supabase:

```bash
npm run report:pdf -- --book-id id_del_libro --include-text
```

Todo el catálogo:

```bash
npm run report:pdf -- --all --include-text
```

Los dos últimos comandos requieren `VITE_SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY` en `.env.local`. Esta clave es exclusivamente para
el script local: nunca debe usar el prefijo `VITE_`, subirse al repositorio ni
emplearse en el frontend.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
