declare module 'epub' {
  export default class EPub {
    constructor(path: string, imagewebroot?: string, chapterwebroot?: string);
    metadata?: any;
    flow?: { id: string }[];
    parse(): void;
    on(event: 'end', cb: () => void): void;
    on(event: 'error', cb: (err: any) => void): void;
    on(event: string, cb: (...args: any[]) => void): void;
    getChapter(id: string, cb: (err: any, text: string) => void): void;
  }
}
