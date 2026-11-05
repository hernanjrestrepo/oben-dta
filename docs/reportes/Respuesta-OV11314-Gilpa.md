**Asunto:** RE: PI 11496 OBEN CO GILPA — kilos de la referencia ET-0012RT0770S0760 (OV 11314 / FV 12220)

Alejandra, Jorge, José, buenas tardes.

Revisamos el caso con la evidencia del envío. Esto es lo que encontramos:

**1. Qué enviamos.** El 30-oct a las 9:50 a. m. Oben Xmart envió la Lista de Empaque de la OV 11314 (correo "Lista de Empaque — Orden 11314", seis archivos). En la Lista Unificada, la referencia ET-0012RT0770S0760 sumaba **2.020,96 kg**, con dos estibas:
- 26A29C0102369153: 851,60 kg netos.
- 26A29C3201369197: **1.169,36 kg netos**, con peso bruto de 952,00 kg.

**2. De dónde salió el dato.** Oben Xmart no calcula esos pesos: los copia tal cual de la consulta `spEmpaqueUnificada_Paradixe` de Oben. La estiba 26A29C3201369197 llegó con un neto (1.169,36 kg) mayor que su bruto (952,00 kg), algo imposible, y el mismo valor aparece en la Lista Especial. Hoy esa misma consulta devuelve 883,60 kg netos para esa estiba: la referencia suma 1.735,20 kg y el total de la OV 15.951,22 kg, y no los 16.236,98 kg que mostraba el archivo del 30-oct. La diferencia es de 285,76 kg, y 851,60 + 1.169,36 = 2.020,96 es exactamente la cifra de la línea 7 de la factura FV 12220 (emitida el 30-oct a las 2:25 p. m., con cantidad 2.020,96 kg).

**3. Lo que no hicimos bien.** Nuestro sistema no detectó que el neto superara al bruto y dejó pasar el dato sin avisar. Lo vamos a corregir: si un peso neto es mayor que su bruto, o el total no cuadra, la lista no saldrá sin una advertencia visible para Programación. También vamos a guardar una copia de cada archivo que enviamos y de la respuesta de Oben, para poder comparar cuando haya una diferencia.

**4. Lo que necesitamos de ustedes.**
- Confirmar cuánto pesó realmente la estiba 26A29C3201369197 (la consulta hoy dice 883,60 kg; Alejandra indica un cierre de 1.720,20 kg para la referencia, lo que daría 868,60 kg para esa estiba; hay 15 kg de diferencia por aclarar).
- Verificar en OBEN MAS desde qué dato se tomó la cantidad de la FV 12220 y emitir la nota crédito por la diferencia de la línea 7. Gilpa recibió 851,60 y 883,60 kg y reclamó la diferencia en la factura.
- Que Planeación revise por qué esa estiba salió con un neto de 1.169,36 kg el 30-oct y por qué cambió después.

Gracias,
Hernán
