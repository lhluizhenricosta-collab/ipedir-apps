/// <reference types="@capacitor-firebase/messaging" />
import type { CapacitorConfig } from '@capacitor/cli';
import { readFileSync } from 'node:fs';

/**
 * A configuração de cada app vem de app.config.json, gerado por:
 *   node scripts/prepare.mjs --app ipedir-delivery --platform android
 * (o Codemagic roda isso sozinho; o arquivo de cada app fica em apps/<nome>.json)
 */
const app = JSON.parse(readFileSync(new URL('./app.config.json', import.meta.url), 'utf8'));

const config: CapacitorConfig = {
  appId: app.appId,
  appName: app.name,
  webDir: 'www',

  // O site identifica o app por aqui (resources/js/app-bridge.js no Laravel)
  appendUserAgent: `iPedirApp/${app.appKey}`,

  server: {
    url: app.url,              // o app abre o site do iPedir / da agência / da loja
    allowNavigation: app.hosts, // fora destes endereços abre no navegador do celular
    errorPath: 'offline.html', // sem internet: tela "Sem conexão"
    androidScheme: 'https',
    cleartext: false,
  },

  android: {
    backgroundColor: app.background,
    // Mantém o GPS do entregador funcionando depois de 5 min em segundo plano
    useLegacyBridge: true,
  },

  ios: {
    backgroundColor: app.background,
    contentInset: 'automatic',
  },

  plugins: {
    FirebaseMessaging: {
      presentationOptions: ['alert', 'badge', 'sound'],
    },
    SplashScreen: {
      launchShowDuration: 900,
      backgroundColor: app.background,
      showSpinner: false,
    },
    CapacitorHttp: {
      enabled: false, // não troca o fetch do site; o GPS usa o HTTP nativo direto
    },
  },
};

export default config;
