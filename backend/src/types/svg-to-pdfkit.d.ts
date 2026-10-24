declare module 'svg-to-pdfkit' {
  /** Dibuja un SVG en un documento PDFKit como vector. */
  function SVGtoPDF(doc: PDFKit.PDFDocument, svg: string, x: number, y: number, options?: { width?: number; height?: number; preserveAspectRatio?: string; assumePt?: boolean }): void;
  export = SVGtoPDF;
}
