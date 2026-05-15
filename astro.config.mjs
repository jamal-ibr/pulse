import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://jamalibrahim.com',
  output: 'static',
  trailingSlash: 'ignore',
  compressHTML: true,
  build: {
    inlineStylesheets: 'auto',
  },
});
