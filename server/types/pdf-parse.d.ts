declare module "pdf-parse" {
  export class PDFParse {
    constructor(opts: { data: Buffer });
    getText(): Promise<{ text: string }>;
    destroy(): Promise<void>;
  }
}
