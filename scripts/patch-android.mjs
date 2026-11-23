#!/usr/bin/env node
/**
 * Ajusta o projeto Android depois do "npx cap add android":
 *  - permissões (notificação, localização e serviço em primeiro plano do GPS do entregador)
 *  - serviço do GPS em segundo plano (só no app Entregador)
 *  - som "pedido" (pedido novo / corrida) em res/raw
 *  - assinatura pelo keystore do Codemagic (CM_KEYSTORE_*) e número da versão (BUILD_NUMBER)
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';

const app = JSON.parse(readFileSync('app.config.json', 'utf8'));
const manifestPath = 'android/app/src/main/AndroidManifest.xml';
const gradlePath = 'android/app/build.gradle';
const stringsPath = 'android/app/src/main/res/values/strings.xml';

if (!existsSync(manifestPath)) {
  console.error('Rode "npx cap add android" antes.');
  process.exit(1);
}

// ---------- AndroidManifest ----------
let manifest = readFileSync(manifestPath, 'utf8');
const permissions = ['android.permission.INTERNET', 'android.permission.POST_NOTIFICATIONS', 'android.permission.VIBRATE'];
if (app.driverGps) {
  permissions.push(
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_LOCATION'
  );
}
for (const p of permissions) {
  if (!manifest.includes(`"${p}"`)) {
    manifest = manifest.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
  }
}
if (app.driverGps && !manifest.includes('BackgroundGeolocationService')) {
  manifest = manifest.replace(
    '</application>',
    `        <service
            android:name="com.equimaps.capacitor_background_geolocation.BackgroundGeolocationService"
            android:enabled="true"
            android:exported="true"
            android:foregroundServiceType="location" />
    </application>`
  );
}
writeFileSync(manifestPath, manifest);

// ---------- textos do aviso fixo do GPS ----------
if (app.driverGps && existsSync(stringsPath)) {
  let strings = readFileSync(stringsPath, 'utf8');
  if (!strings.includes('capacitor_background_geolocation_notification_channel_name')) {
    strings = strings.replace(
      '</resources>',
      `    <string name="capacitor_background_geolocation_notification_channel_name">Localização da corrida</string>
</resources>`
    );
    writeFileSync(stringsPath, strings);
  }
}

// ---------- som ----------
mkdirSync('android/app/src/main/res/raw', { recursive: true });
copyFileSync('resources/sounds/pedido.wav', 'android/app/src/main/res/raw/pedido.wav');

// ---------- versão e assinatura ----------
let gradle = readFileSync(gradlePath, 'utf8');
const build = parseInt(process.env.BUILD_NUMBER || process.env.PROJECT_BUILD_NUMBER || '1', 10) || 1;
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${build}`);
gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${app.version}"`);

if (!gradle.includes('signingConfigs')) {
  gradle = gradle.replace(
    /buildTypes\s*\{/,
    `signingConfigs {
        release {
            if (System.getenv("CM_KEYSTORE_PATH")) {
                storeFile file(System.getenv("CM_KEYSTORE_PATH"))
                storePassword System.getenv("CM_KEYSTORE_PASSWORD")
                keyAlias System.getenv("CM_KEY_ALIAS")
                keyPassword System.getenv("CM_KEY_PASSWORD")
            }
        }
    }
    buildTypes {`
  );
  gradle = gradle.replace(/release\s*\{\s*minifyEnabled/, 'release {\n            signingConfig signingConfigs.release\n            minifyEnabled');
}
writeFileSync(gradlePath, gradle);

console.log(`✓ Android ajustado (${app.appId}) · versão ${app.version} (${build})${app.driverGps ? ' · GPS em segundo plano' : ''}`);
