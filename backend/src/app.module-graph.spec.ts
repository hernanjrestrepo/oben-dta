import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';

/**
 * Arranque completo de la aplicación sin base de datos (24-oct). El 24-oct un módulo nuevo (Traducción) usaba
 * JwtAuthGuard sin importar AuthModule: todas las pruebas unitarias pasaron, pero el backend de producción no
 * arrancaba ("Nest can't resolve dependencies of the JwtAuthGuard"). Este test compila el grafo REAL de módulos,
 * con la conexión a Postgres reemplazada por un DataSource falso, para que ese tipo de error falle antes de desplegar.
 * No inicia el servidor ni toca la red: solo verifica que toda dependencia de todo controlador y servicio se resuelva.
 */
describe('Grafo de módulos de la aplicación', () => {
  it('compila AppModule: toda dependencia de controladores y servicios se resuelve', async () => {
    // 'then' debe ser undefined: si no, Nest toma el repositorio por una promesa y espera para siempre.
    const repoFalso = new Proxy({}, { get: (_t, prop) => (prop === 'then' ? undefined : jest.fn()) });
    const dsFalso = {
      isInitialized: true,
      entityMetadatas: [],
      options: { type: 'postgres' },
      getRepository: () => repoFalso,
      getMetadata: () => ({}),
      query: jest.fn().mockResolvedValue([]),
      manager: { getRepository: () => repoFalso },
      initialize: jest.fn(),
      destroy: jest.fn(),
    };
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource)
      .useValue(dsFalso)
      .compile();
    expect(modulo).toBeDefined();
    await modulo.close();
  }, 60_000);
});
