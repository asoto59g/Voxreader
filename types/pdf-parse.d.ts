declare module 'pdf-parse' {
  const pdfParse: (buffer: Buffer | Uint8Array) => Promise<{
    text?: string
    info?: { Title?: string }
    numpages?: number
  }>
  export default pdfParse
}
