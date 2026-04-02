# Voxreader PWA - Text-to-Audio companion

Voxreader es una aplicación web progresiva (PWA) diseñada para convertir documentos y artículos web en audio de alta calidad, permitiéndote "leer" mientras realizas otras tareas. Está optimizada para dispositivos móviles, garantizando que el audio no se detenga incluso cuando la pantalla está apagada.

Ejecutar app en siguiente link:  https://voxreader.vercel.app/

## 🚀 Características Principales

- **Multi-formato**: Extrae texto de archivos **PDF**, **EPUB** y **páginas web** (URLs).
- **Lectura Sincronizada**: Resaltado de texto estilo karaoke que avanza junto con la voz.
- **Auto-Scroll**: El visor de texto se desplaza automáticamente para mantener la oración activa siempre a la vista.
- **Navegación Interactiva**: Salta a cualquier párrafo simplemente tocándolo en el visor.
- **Controles de Audio Profesionales**: Botones de Anterior, Siguiente, Reiniciar y Pausar, totalmente integrados con el panel de control de tu celular (MediaSession API).
- **Persistencia de Sesión**: Recuerda automáticamente el último documento cargado, la posición exacta de lectura y tus ajustes de voz.
- **Screen Wake Lock**: Evita que la pantalla se apague mientras estás siguiendo la lectura visualmente.
- **Hardened Background Audio**: Técnicas avanzadas para evitar que Android detenga la lectura al bloquear el teléfono.

## 📋 Requisitos para Ejecución Correcta

### 🌐 Navegador Recomendado
- **Android**: Google Chrome (indispensable para la mejor experiencia de PWA y persistencia de audio).
- **iOS**: Safari (soporta PWA y TTS básico).
- **Escritorio**: Chrome o Edge para soporte completo de Wake Lock y controles multimedia.

### 🔋 Configuración para Android (Lectura en segundo plano)
Para evitar que el sistema operativo detenga el audio después de unos minutos de bloqueo, se recomienda:
1. Ir a **Ajustes** > **Aplicaciones** > **Voxreader** (o Chrome si no la has instalado como App).
2. Seleccionar **Batería** o **Ahorro de batería**.
3. Elegir la opción **"Sin restricciones"** o **"No optimizar"**.

### 🛠️ Configuración de Desarrollo
Si deseas ejecutar el proyecto localmente:

1. **Instalar dependencias**:
   ```bash
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
