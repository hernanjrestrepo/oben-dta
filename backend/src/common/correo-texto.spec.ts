import { cuerpoLegible, esReenvio, htmlATexto, pareceHtml, remitenteReenviado } from './correo-texto';

// El HTML real que llegó el 3-nov (reenvío de Outlook de Alejandra): firma digital con imagen en base64 y estilos.
const HTML_OUTLOOK = `<html><head><meta http-equiv="Content-Type" content="text/html; charset=Windows-1252"><style type="text/css" style="display:none;"> P {margin-top:0;margin-bottom:0;} </style></head>
<body dir="ltr"><div style="font-family: Aptos, Calibri; font-size: 12pt;"><br></div><div id="appendonsend"></div>
<div><b>De:</b> Victor Casta&ntilde;eda &lt;victor@cliente-brasil.com.br&gt;<br><b>Enviado:</b> lunes<br><b>Asunto:</b> Orden de compra P01856</div>
<p style="margin: 0.1pt; font-family: Arial; font-size: 10pt;"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAACE8AAAWKCAIAAACMiE40AAAACXBIWXMAAC4jAAAuIwF4pT92AAAgAElEQVR4nOzdP3AbZ54"></p>
<table><tr><td>BOPP 20</td><td>1.000 kg</td></tr></table></body></html>`;

describe('lectura de correos (3-nov)', () => {
  it('el HTML se convierte a texto: sin estilos, sin imágenes base64 ni etiquetas, con saltos de línea y tildes', () => {
    const t = htmlATexto(HTML_OUTLOOK);
    expect(t).not.toMatch(/<\s*\/?(html|head|style|img|table|td|tr|p|div|br|span|b)|font-family|base64|iVBOR|margin-top/i);
    expect(t).toContain('De: Victor Castañeda <victor@cliente-brasil.com.br>');
    expect(t).toContain('Asunto: Orden de compra P01856');
    expect(t).toContain('BOPP 20 1.000 kg');
  });

  it('cuerpoLegible: usa el texto plano si lo hay; si "texto" es en realidad HTML o falta, convierte el HTML', () => {
    expect(cuerpoLegible('Hola, adjunto la orden.', '<p>otra cosa</p>')).toBe('Hola, adjunto la orden.');
    expect(cuerpoLegible(undefined, HTML_OUTLOOK)).not.toMatch(/<html|<table/i);
    expect(cuerpoLegible(HTML_OUTLOOK, false)).not.toMatch(/<html|<table/i);
    expect(cuerpoLegible('', false)).toBe('');
    expect(pareceHtml('Texto normal con 2 < 3')).toBe(false);
    expect(pareceHtml(HTML_OUTLOOK)).toBe(true);
  });

  it('remitente original de un reenvío: el primer "De:" externo; ignora los internos de Oben', () => {
    const cuerpo = htmlATexto(HTML_OUTLOOK);
    expect(remitenteReenviado(cuerpo, ['obengroup.com'])).toBe('victor@cliente-brasil.com.br');
    expect(remitenteReenviado('De: Alejandra <alejandramolinares@obengroup.com>\nPara: x', ['obengroup.com'])).toBeNull();
    expect(remitenteReenviado('Sin bloque reenviado, solo texto.', ['obengroup.com'])).toBeNull();
    expect(remitenteReenviado('From: Cliente <compras@acme.com>', ['obengroup.com'])).toBe('compras@acme.com');
  });

  it('reconoce los asuntos de reenvío', () => {
    for (const a of ['RV: Orden de compra P01856', 'FW: PEDIDO', 'Fwd: algo', 'RE: RV: pedido']) expect(esReenvio(a)).toBe(true);
    for (const a of ['Orden de compra P01856', 'Revisión de pedido', 'RE: pedido']) expect(esReenvio(a)).toBe(false);
  });
});
