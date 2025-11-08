import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default {
  server: {
    proxy: {
      '/ai': 'http://localhost:8787'
    }
  }
};
