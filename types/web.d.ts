declare module 'jsdom' {
  export class JSDOM {
    constructor(html: string, options?: any)
    window: Window & typeof globalThis
  }
}

declare module '@mozilla/readability' {
  export class Readability {
    constructor(doc: Document)
    parse(): { title?: string; content?: string; textContent?: string } | null
  }
}
