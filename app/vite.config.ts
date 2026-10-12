import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';
import { registrationPlugin } from '../agent-registration/vite.js';
import { localInferencePlugin } from '../local-inference/vite.js';
export default defineConfig(({ mode }) => { const env = loadEnv(mode, process.cwd(), 'PUMPCOIN_'); return { plugins: [react(), tailwindcss(), localInferencePlugin(), registrationPlugin(undefined, env.PUMPCOIN_PYTH_API_KEY)] }; });
