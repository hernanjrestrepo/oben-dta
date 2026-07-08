import { BadRequestException } from '@nestjs/common';

/**
 * Extrae texto plano de un documento según su tipo.
 * TXT/MD son nativos. PDF/DOCX/XLSX usan librerías cargadas de forma perezosa,
 * de modo que la ausencia de una librería no rompe el resto del pipeline.
 */
export async function extractText(
  fileType: string,
  raw: Buffer | string,
): Promise<string> {
  const type = fileType.toLowerCase().replace(/^\./, '');
  const buf = typeof raw === 'string' ? Buffer.from(raw, 'utf-8') : raw;

  switch (type) {
    case 'txt':
    case 'md':
    case 'markdown':
    case 'text':
      return buf.toString('utf-8');

    case 'pdf': {
      const pdfParse = await loadOptional('pdf-parse', 'PDF');
      const data = await pdfParse(buf);
      return data.text;
    }

    case 'docx': {
      const mammoth = await loadOptional('mammoth', 'DOCX');
      const result = await mammoth.extractRawText({ buffer: buf });
      return result.value;
    }

    case 'xlsx':
    case 'xls': {
      const XLSX = await loadOptional('xlsx', 'XLSX');
      const wb = XLSX.read(buf, { type: 'buffer' });
      const parts: string[] = [];
      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        parts.push(`# Hoja: ${sheetName}\n` + XLSX.utils.sheet_to_csv(sheet));
      }
      return parts.join('\n\n');
    }

    default:
      throw new BadRequestException(
        `Tipo de documento no soportado: ${fileType}. Soportados: PDF, DOCX, XLSX, TXT, MD.`,
      );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadOptional(moduleName: string, label: string): Promise<any> {
  try {
    // Carga perezosa: solo se requiere si se ingesta ese formato.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(moduleName);
    return mod.default ?? mod;
  } catch {
    throw new BadRequestException(
      `Soporte de ${label} no instalado en el servidor (falta la librería ${moduleName}).`,
    );
  }
}
