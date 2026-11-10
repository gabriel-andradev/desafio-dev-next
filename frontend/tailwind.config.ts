import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#06264E',
          dark: '#041A36',
          gold: '#D4AD50',
          goldLight: '#E5C678',
        },
      },
    },
  },
  plugins: [],
};

export default config;

