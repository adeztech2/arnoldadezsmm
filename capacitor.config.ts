import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.adez.smm',
  appName: 'Adez SMM',
  webDir: 'dist/client',
  server: {
    androidScheme: 'https',
  },
};

export default config;
