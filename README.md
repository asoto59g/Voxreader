<img width="1162" height="420" alt="image" src="https://github.com/user-attachments/assets/80d1698d-1d02-45c6-81c1-6c6660ed7563" />


# Voxreader PWA - Text-to-Audio companion

Voxreader es una aplicación web progresiva (PWA) diseñada para convertir documentos y artículos web en audio de alta calidad, permitiéndote "leer" mientras realizas otras tareas. Está optimizada para dispositivos móviles, garantizando que el audio no se detenga incluso cuando la pantalla está apagada.

Ejecutar app en siguiente link:  https://voxreader.vercel.app/

## 🚀 Características Principales

- **Multi-formato**: Extrae texto de archivos **PDF**, **EPUB** y **páginas web** (URLs).
- **Lectura Sincronizada**: Resaltado de texto estilo karaoke que avanza junto con la voz.
- **Soporte de Archivos Grandes**: Capacidad para procesar PDFs y EPUBs de gran tamaño (100MB+) gracias a la extracción local en el navegador.
- **Auto-Scroll**: El visor de texto se desplaza automáticamente para mantener la oración activa siempre a la vista.
- **Navegación Interactiva**: Salta a cualquier párrafo simplemente tocándolo en el visor.
- **Controles de Audio Profesionales**: Botones de Anterior, Siguiente, Reiniciar y Pausar, totalmente integrados con el panel de control de tu celular (MediaSession API).
- **Persistencia de Sesión**: Recuerda automáticamente el último documento cargado, la posición exacta de lectura y tus ajustes de voz.
- **Screen Wake Lock**: Evita que la pantalla se apague mientras estás siguiendo la lectura visualmente.
- **Hardened Background Audio**: Técnicas avanzadas para evitar que Android detenga la lectura al bloquear el teléfono.
- **Voces Premium**: Soporte para voces de alta calidad (incluyendo voces naturales de Microsoft si se usa el navegador Edge).

## 📋 Requisitos para Ejecución Correcta

### 🌐 Navegador Recomendado
- **Android**: Google Chrome (indispensable para la mejor experiencia de PWA y persistencia de audio).
- **iOS**: Safari (soporta PWA y TTS básico).
- **Escritorio**: Chrome o Edge para soporte completo de Wake Lock y controles multimedia.

### 🎙️ Cómo obtener las mejores voces en Android
Si quieres tener las voces de **Microsoft** (como en PC) o voces más naturales:
1. **Usar Microsoft Edge**: Si instalas y usas Voxreader desde el navegador **Edge para Android**, tendrás acceso a todas las voces "Online" de Microsoft que suenan mucho más humanas.
2. **Mejorar Google TTS**:
   - Ve a **Ajustes** de tu celular.
   - Busca **"Salida de texto a voz"**.
   - En **Motor preferido**, asegúrate de que esté seleccionado "Servicios de voz de Google".
   - Pulsa el icono de engranaje ⚙️ > **Instalar datos de voz**.
   - Descarga los paquetes de "Español" (existen versiones recomendadas de 15MB-50MB que suenan mucho mejor).

### 🛠️ Configuración de Desarrollo
Si deseas ejecutar el proyecto localmente:

1. **Instalar dependencias**:
   ```bash
   npm install pdfjs-dist jszip
   npm install
   ```
2. **Ejecutar servidor de desarrollo**:
   ```bash
   npm run dev
   ```
3. **Producción**:
   ```bash
   npm run build
   npm start
   ```

## 🛠️ Tecnologías Utilizadas

- **Framework**: [Next.js](https://nextjs.org/) (React)
- **Audio/Voz**: Web Speech API (SpeechSynthesis)
- **Persistencia**: LocalStorage API
- **Control**: Media Session API (Integración con controles externos)
- **Pantalla**: Screen Wake Lock API
- **Estilos**: CSS nativo con diseño premium y animaciones.

---
Desarrollado con ❤️ por Antigravity para Voxreader.
