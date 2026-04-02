declare module 'pdf-parse' {
  export interface PDFInfo {
    Title?: string;
    [k: string]: any;
  }
  export interface PDFResult {
    text: string;
    info?: PDFInfo;
    metadata?: any;
    version?: string;
  }
  export default function pdf(data: Buffer | Uint8Array | ArrayBuffer, options?: any): Promise<PDFResult>;
}
