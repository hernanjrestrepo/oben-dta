import { ValidationPipe } from '@nestjs/common';
import { TabularImportDto } from './tabular-import';
import { ConfigDto, EditarCasoDto, OcManualDto, RespuestaManualDto } from '../../modules/comercial/comercial-casos.controller';

/**
 * Los DTO pasan por el MISMO ValidationPipe global de main.ts
 * (whitelist + transform + conversión implícita). Encontrado en la prueba
 * HTTP del 2026-09-27: con la conversión implícita, un arreglo de objetos sin
 * @Type(() => Object) llegaba como [[]] y la carga masiva respondía 400 — las
 * pruebas unitarias del servicio no pasaban por el pipe.
 */
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true, transformOptions: { enableImplicitConversion: true } });
const run = <T>(metatype: new () => T, body: unknown) => pipe.transform(body, { type: 'body', metatype }) as Promise<T>;

describe('DTOs a través del ValidationPipe global', () => {
  it('carga masiva: las filas llegan como objetos, con sus columnas intactas', async () => {
    const dto = await run(TabularImportDto, { dryRun: true, rows: [{ Cliente: 'X', 'Código Oben': 'Y', Kilos: 5 }] });
    expect(dto.rows).toEqual([{ Cliente: 'X', 'Código Oben': 'Y', Kilos: 5 }]);
    expect(dto.dryRun).toBe(true);
  });

  it('configuración Comercial: ejemplos de OC y seguimientos llegan como objetos', async () => {
    const dto = await run(ConfigDto, {
      modo: 'supervisado',
      seguimientoFirma: { intervalosHoras: [24, 48], luegoCadaHoras: 168 },
      ejemplosOc: [{ entrada: 'OC texto', salida: { lineas: [] } }],
    });
    expect(dto.ejemplosOc).toEqual([{ entrada: 'OC texto', salida: { lineas: [] } }]);
    expect(dto.seguimientoFirma).toEqual({ intervalosHoras: [24, 48], luegoCadaHoras: 168 });
    await expect(run(ConfigDto, { modo: 'turbo' })).rejects.toBeDefined();
  });

  it('corrección de un caso: líneas anidadas validadas; un valor negativo se rechaza', async () => {
    const dto = await run(EditarCasoDto, { lineas: [{ n: 1, codigoOben: 'SC15TN', kilos: 100, guardarEquivalencia: true }], direccionId: 'D1' });
    expect(dto.lineas?.[0]).toMatchObject({ n: 1, codigoOben: 'SC15TN', kilos: 100, guardarEquivalencia: true });
    await expect(run(EditarCasoDto, { lineas: [{ n: 1, kilos: -5 }] })).rejects.toBeDefined();
  });

  it('OC manual con adjuntos y respuesta manual con líneas', async () => {
    const oc = await run(OcManualDto, { from: 'a@b.co', subject: 'OC', body: 'x', attachments: [{ filename: 'oc.pdf', contentBase64: 'JVBERg==' }] });
    expect(oc.attachments?.[0]).toMatchObject({ filename: 'oc.pdf', contentBase64: 'JVBERg==' });
    const r = await run(RespuestaManualDto, { tipo: 'modifica', nota: 'por teléfono', lineas: [{ codigoCliente: 'BOPP 15', kilos: 2000, anchoMm: 425 }] });
    expect(r.lineas?.[0]).toMatchObject({ codigoCliente: 'BOPP 15', kilos: 2000 });
    await expect(run(RespuestaManualDto, { tipo: 'quizas', nota: 'x' })).rejects.toBeDefined();
  });
});
