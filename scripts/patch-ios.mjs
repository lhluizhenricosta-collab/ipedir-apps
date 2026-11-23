#!/usr/bin/env node
/**
 * Ajusta o projeto iOS depois do "npx cap add ios":
 *  - Info.plist: textos de permissão (localização e notificação) e modos de segundo plano
 *  - AppDelegate.swift: liga o Firebase e repassa o token da Apple para o plugin de push
 *  - App.entitlements: push em produção
 * (Os arquivos GoogleService-Info.plist e pedido.wav entram no projeto pelo scripts/ios-add-files.rb)
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const app = JSON.parse(readFileSync('app.config.json', 'utf8'));
const dir = 'ios/App/App';
const plist = `${dir}/Info.plist`;

if (!existsSync(plist)) {
  console.error('Rode "npx cap add ios" antes.');
  process.exit(1);
}

// ---------- Info.plist (PlistBuddy, que vem no macOS) ----------
const pb = (cmd) => {
  try {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', cmd, plist], { stdio: 'pipe' });
  } catch (e) { /* chave já existe */ }
};
const setString = (key, value) => {
  pb(`Delete :${key}`);
  pb(`Add :${key} string ${value}`);
};

setString('CFBundleDisplayName', app.name);
pb('Delete :ITSAppUsesNonExemptEncryption');
pb('Add :ITSAppUsesNonExemptEncryption bool false');

pb('Delete :UIBackgroundModes');
pb('Add :UIBackgroundModes array');
pb('Add :UIBackgroundModes:0 string remote-notification');

if (app.driverGps) {
  setString('NSLocationWhenInUseUsageDescription', 'Usamos a sua localização para mostrar a corrida no mapa do cliente e da loja enquanto você está online.');
  setString('NSLocationAlwaysAndWhenInUseUsageDescription', 'Com você online, a localização continua sendo enviada com a tela apagada para o cliente acompanhar a entrega.');
  setString('NSLocationAlwaysUsageDescription', 'Com você online, a localização continua sendo enviada com a tela apagada para o cliente acompanhar a entrega.');
  pb('Add :UIBackgroundModes:1 string location');
} else {
  // O site pode pedir a localização do cliente para preencher o endereço
  setString('NSLocationWhenInUseUsageDescription', 'Usamos a sua localização só para preencher o endereço de entrega.');
}

// ---------- AppDelegate.swift ----------
const delegatePath = `${dir}/AppDelegate.swift`;
let delegate = readFileSync(delegatePath, 'utf8');
if (!delegate.includes('import FirebaseCore')) {
  delegate = delegate.replace('import Capacitor', 'import Capacitor\nimport FirebaseCore');
}
if (!delegate.includes('FirebaseApp.configure()')) {
  delegate = delegate.replace(
    /(didFinishLaunchingWithOptions[^{]*\{)/,
    `$1\n        if FirebaseApp.app() == nil { FirebaseApp.configure() }`
  );
}
if (!delegate.includes('capacitorDidRegisterForRemoteNotifications')) {
  const lastBrace = delegate.lastIndexOf('}');
  delegate = delegate.slice(0, lastBrace) + `
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
` + delegate.slice(lastBrace);
}
writeFileSync(delegatePath, delegate);

// ---------- entitlements ----------
writeFileSync(`${dir}/App.entitlements`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>aps-environment</key>
    <string>production</string>
</dict>
</plist>
`);

// ---------- som ----------
copyFileSync('resources/sounds/pedido.wav', `${dir}/pedido.wav`);

console.log(`✓ iOS ajustado (${app.appId})${app.driverGps ? ' · GPS em segundo plano' : ''}`);
