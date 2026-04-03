export async function extractFromPdfClient(file: File) {
  // Import dinámico de pdfjs con worker
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = (content.items as any[]).map(item => item.str);
    fullText += strings.join(' ') + '\n';
  }

  const text = fullText.replace(/[\r\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const title = file.name || 'Documento PDF';
  return { title, text };
}
