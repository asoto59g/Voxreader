# Text2Audio PWA (MVP) — Fixes
Cambios incluidos:
- Alias @ configurado en tsconfig.json (baseUrl + paths).
- Bug corregido en app/page.tsx (setBusy(true)).
- Imports dinámicos en app/api/extract/route.ts para cargar extractores bajo demanda.
- package.json con engines Node >= 18.17.

Uso:
npm install
npm run dev

Producción:
npm run build
npm start
