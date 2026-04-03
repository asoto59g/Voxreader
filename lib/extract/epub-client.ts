import JSZip from 'jszip';

export async function extractFromEpubClient(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  // Encontrar el archivo contenedor para localizar el OPF
  const containerXml = await zip.file("META-INF/container.xml")?.async("string");
  if (!containerXml) throw new Error("Archivo EPUB inválido (falta container.xml)");
  
  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXml, "text/xml");
  const opfPath = containerDoc.querySelector("rootfile")?.getAttribute("full-path");
  if (!opfPath) throw new Error("No se pudo encontrar el archivo OPF en el EPUB");
  
  const opfXml = await zip.file(opfPath)?.async("string");
  if (!opfXml) throw new Error("No se pudo leer el archivo OPF");
  
  const opfDoc = parser.parseFromString(opfXml, "text/xml");
  const title = opfDoc.querySelector("title")?.textContent || file.name;
  
  // Encontrar todos los items de tipo documento en el manifest
  const manifestItems: Record<string, string> = {};
  opfDoc.querySelectorAll("manifest > item").forEach(item => {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    const mediaType = item.getAttribute("media-type");
    if (id && href && (mediaType?.includes("xhtml") || mediaType?.includes("html") || mediaType?.includes("xml"))) {
      manifestItems[id] = href;
    }
  });

  // Seguir el orden del spine para extraer el texto
  let fullText = "";
  const spineItems = opfDoc.querySelectorAll("spine > itemref");
  
  // Obtener el directorio base del OPF para resolver rutas relativas del manifest
  const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : "";

  for (const itemref of Array.from(spineItems)) {
    const idref = itemref.getAttribute("idref");
    if (idref && manifestItems[idref]) {
      const href = manifestItems[idref];
      const fullHref = opfDir + href;
      const content = await zip.file(fullHref)?.async("string");
      if (content) {
        const doc = parser.parseFromString(content, "text/html");
        // Eliminar scripts y estilos antes de extraer texto
        doc.querySelectorAll("script, style").forEach(el => el.remove());
        fullText += (doc.body.textContent || "") + "\n";
      }
    }
  }

  const text = fullText.replace(/[\r\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return { title, text };
}
