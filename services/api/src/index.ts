import { loadRootEnv } from './env/loadEnv.js';
import { buildApp } from './buildApp.js';

loadRootEnv();

const server = await buildApp();

const port = Number(process.env.PORT ?? 8080);
await server.listen({ port, host: '0.0.0.0' });
