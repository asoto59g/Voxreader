# Text2Audio PWA (MVP)

Convierte texto a audio desde:
- PDF (adjunto)
- Páginas web (URL)
- Libros en EPUB (adjunto)

Incluye:
- PWA lista para instalar (manifest + service worker básico)
- Reproducción rápida en el navegador con Web Speech API
- Generación opcional de MP3 con OpenAI TTS (gpt-4o-mini-tts)
- Extracción robusta de páginas usando Readability
- Sanitización y límites de tamaño

## Requisitos

- Node.js 18+
- (Opcional) Variable de entorno OPENAI_API_KEY para generar MP3

## Inicio

```bash
npm install
npm run dev
```

Visitar http://localhost:3000

## Producción

```bash
npm run build
npm start
```

## Notas

- Para EPUB, en plataformas serverless se usa /tmp para el archivo temporal.
- Para textos largos > 4000 caracteres, implementá chunking y ZIP de audios (ver lib/extract/chunker.ts).
- Respetá robots.txt y Términos de Servicio al extraer contenido de sitios externos.
- El service worker implementa:
  - Cache-first para assets estáticos
  - Network-first para navegación con fallback offline
  - Stale-While-Revalidate para GET en /api/*
- Mejoras sugeridas: Workbox, Background Sync para colas TTS, IndexedDB para progreso de lectura.
