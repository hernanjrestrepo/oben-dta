import { generateKeyPairSync } from 'crypto';

/**
 * Genera el par de claves Ed25519 para firma de licencias. Ejecutar UNA vez
 * por instalación de Paradixe (el emisor) y pegar el resultado en el .env del
 * backend. La clave privada NUNCA debe salir del entorno del emisor.
 *
 * Uso: npm run license:generate-keys
 */
const { privateKey, publicKey } = generateKeyPairSync('ed25519');

const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

console.log(
  '# Agregar al .env del backend (NUNCA commitear la clave privada):',
);
console.log(
  `LICENSE_SIGNING_PRIVATE_KEY=${Buffer.from(privPem).toString('base64')}`,
);
console.log(
  `LICENSE_SIGNING_PUBLIC_KEY=${Buffer.from(pubPem).toString('base64')}`,
);
console.log(
  `LICENSE_SIGNING_KEY_ID=paradixe-${new Date().toISOString().slice(0, 10)}`,
);
