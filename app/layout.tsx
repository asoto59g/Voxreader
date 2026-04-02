import './globals.css'

export const metadata = {
  title: 'Text2Audio PWA',
  description: 'Convierte texto (PDF, web, libros) a audio',
  manifest: '/manifest.json',
  themeColor: '#2563eb'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}
        <script dangerouslySetInnerHTML={{__html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js').catch(console.error);
            });
          }
        `}} />
      </body>
    </html>
  )
}
