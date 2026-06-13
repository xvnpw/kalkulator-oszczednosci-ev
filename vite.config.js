import { defineConfig } from 'vite';

export default defineConfig({
  base: '/kalkulator-oszczednosci-ev/',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html'
      }
    }
  },
  test: {
    include: ['tests/**/*.test.js'],
    exclude: ['.claude/**']
  }
});
