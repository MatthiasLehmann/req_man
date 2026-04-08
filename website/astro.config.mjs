import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [tailwind()],
  site: 'https://lehmann.gitlab.ils.uni-stuttgart.io',
  base: '/req_man',
});
