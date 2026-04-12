import { config } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Load monorepo root `.env` when running from `services/api`. */
export function loadRootEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  // `src/env` -> monorepo root
  const rootEnv = join(here, '../../../../.env');
  config({ path: rootEnv });
}
