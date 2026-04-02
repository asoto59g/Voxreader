# Text2Audio PWA — Vercel TS Fix
- Import dinámico para 'pdf-parse' y 'epub' (evita error de tipos en Vercel).
- global.d.ts con declare module 'pdf-parse' y 'epub'.
- Alias @ y demás fixes listos.

Desarrollo:
npm install
npm run dev

Producción:
npm run build
npm start
