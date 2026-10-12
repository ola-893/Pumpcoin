import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import { registrationPlugin } from '../agent-registration/vite.js';
import { localInferencePlugin } from '../local-inference/vite.js';
import { marketDataPlugin } from '../market-data/vite.js';
export default defineConfig(({ mode }) => {
  // Private server configuration: never pass this key to define, VITE_ variables or client props.
  const root = loadEnv(mode, fileURLToPath(new URL('..', import.meta.url)), 'PUMPCOIN_');
  const app = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'PUMPCOIN_');
  for (const name of ['PUMPCOIN_SIGNER_PASSWORD_FILE','PUMPCOIN_SIGNER_DIRECTORY','PUMPCOIN_AUTONOMY_CONFIG'] as const) { const value = app[name] || root[name]; if (value) process.env[name] = value; }
  return { plugins: [react(), tailwindcss(), localInferencePlugin(), registrationPlugin(undefined, app.PUMPCOIN_PYTH_API_KEY || root.PUMPCOIN_PYTH_API_KEY), marketDataPlugin()] };
});
