import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.adez.smm',
  appName: 'ADEZ SMM',
  webDir: 'public',
  server: {
    url: 'https://arnoldadezsmm.vercel.app',
    androidScheme: 'https',
    cleartext: false,
  },
};

export default config;
