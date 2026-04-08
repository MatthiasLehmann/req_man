import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [tailwind()],
  site: 'https://MatthiasLehmann.gitlab.io',
  base: '/req_man',
});
