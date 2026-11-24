// =====================================================================
// VISUAL DO APP NO ANDROID (23/11) — roda no Codemagic depois do `npx cap sync android`
//
// 1. Site entre as barras do Android (Android 15+ desenha por baixo delas).
// 2. Barras "camaleão": o site manda a cor (meta theme-color) e o app pinta a barra de
//    cima (relógio) e a de baixo (botões), com ícones claros ou escuros conforme a cor.
//    Plugin nativo SystemBars, usado por resources/js/app-system-bars.js no Laravel.
// 3. Abertura mais profissional: fundo na cor do app (sem tela branca antes do site),
//    ícone do app no centro (Android 12+) e saída suave.
//
// Uso: node scripts/android-visual.mjs     (a cor vem de APP_BG, a mesma dos ícones)
// =====================================================================
import fs from 'node:fs';
import path from 'node:path';

const BG = /^#[0-9a-fA-F]{6}$/.test(process.env.APP_BG || '') ? process.env.APP_BG : '#FFFFFF';
const assets = 'android/app/src/main/assets/capacitor.config.json';
const log = (m) => console.log('[visual] ' + m);

// ---------- 1 e 3: configuração que o app lê ao abrir ----------
const cfg = JSON.parse(fs.readFileSync(assets, 'utf8'));
cfg.backgroundColor = BG; // fundo do site enquanto carrega (some a tela branca)
cfg.android = Object.assign({}, cfg.android, { adjustMarginsForEdgeToEdge: 'force' });
cfg.plugins = cfg.plugins || {};
cfg.plugins.SplashScreen = Object.assign({}, cfg.plugins.SplashScreen, {
    launchShowDuration: 2500,
    launchAutoHide: true,
    launchFadeOutDuration: 400,
    backgroundColor: BG,
    showSpinner: false,
    androidScaleType: 'CENTER_CROP',
    splashFullScreen: false,
    splashImmersive: false,
});
cfg.plugins.SystemBars = { color: BG };
fs.writeFileSync(assets, JSON.stringify(cfg, null, 2));
log('configuração: fundo ' + BG + ', margens nas barras, abertura de 2,5 s');

// ---------- 2: plugin nativo SystemBars ----------
const appId = cfg.appId;
if (!appId) throw new Error('appId não encontrado em ' + assets);
const javaDir = path.join('android/app/src/main/java', ...appId.split('.'));
fs.mkdirSync(javaDir, { recursive: true });

fs.writeFileSync(path.join(javaDir, 'SystemBarsPlugin.java'), `package ${appId};

import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Pinta as barras do Android com a cor que o site mandar (iPedir, 23/11). */
@CapacitorPlugin(name = "SystemBars")
public class SystemBarsPlugin extends Plugin {

    @Override
    public void load() {
        apply(getConfig().getString("color", "${BG}"), null);
    }

    @PluginMethod
    public void setColor(PluginCall call) {
        String color = call.getString("color");
        if (color == null || color.isEmpty()) {
            call.reject("Informe a cor");
            return;
        }
        apply(color, call.getBoolean("darkIcons"));
        call.resolve();
    }

    private void apply(String hex, Boolean darkIcons) {
        final int color;
        try {
            color = Color.parseColor(hex);
        } catch (Exception e) {
            return;
        }
        final boolean dark = darkIcons != null ? darkIcons : isLight(color);
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            View decor = window.getDecorView();
            decor.setBackgroundColor(color); // aparece nas margens de cima e de baixo
            if (Build.VERSION.SDK_INT < 35) {
                window.setStatusBarColor(color);
                window.setNavigationBarColor(color);
            }
            if (Build.VERSION.SDK_INT >= 29) {
                window.setNavigationBarContrastEnforced(false);
                window.setStatusBarContrastEnforced(false);
            }
            WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, decor);
            bars.setAppearanceLightStatusBars(dark);     // true = relógio e ícones escuros
            bars.setAppearanceLightNavigationBars(dark);
        });
    }

    private static boolean isLight(int c) {
        double l = (0.299 * Color.red(c) + 0.587 * Color.green(c) + 0.114 * Color.blue(c)) / 255.0;
        return l > 0.6;
    }
}
`);
log('plugin SystemBars criado em ' + javaDir);

// Registra o plugin na MainActivity (antes do super.onCreate, como o Capacitor pede)
const mainFile = ['MainActivity.java', 'MainActivity.kt']
    .map((f) => path.join(javaDir, f))
    .find((f) => fs.existsSync(f));
if (!mainFile) throw new Error('MainActivity não encontrada em ' + javaDir);
if (mainFile.endsWith('.kt')) throw new Error('MainActivity em Kotlin: registre SystemBarsPlugin à mão');

let main = fs.readFileSync(mainFile, 'utf8');
if (!main.includes('SystemBarsPlugin.class')) {
    const onCreate = /(void\s+onCreate\s*\(\s*(?:final\s+)?Bundle\s+\w+\s*\)\s*\{)/;
    if (onCreate.test(main)) {
        main = main.replace(onCreate, '$1\n        registerPlugin(SystemBarsPlugin.class);');
    } else {
        if (!/import\s+android\.os\.Bundle\s*;/.test(main)) {
            main = main.replace(/(package\s+[\w.]+\s*;)/, '$1\n\nimport android.os.Bundle;');
        }
        main = main.replace(/(extends\s+BridgeActivity\s*\{)/,
            '$1\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(SystemBarsPlugin.class);\n        super.onCreate(savedInstanceState);\n    }\n');
    }
    if (!main.includes('SystemBarsPlugin.class')) throw new Error('Não consegui registrar o SystemBars na MainActivity');
    fs.writeFileSync(mainFile, main);
}
log('SystemBars registrado na ' + path.basename(mainFile));

// ---------- 3: abertura do Android 12+ (fundo na cor do app e ícone no centro) ----------
const stylesFile = 'android/app/src/main/res/values/styles.xml';
if (fs.existsSync(stylesFile)) {
    let styles = fs.readFileSync(stylesFile, 'utf8');
    const launch = /(<style\s+name="AppTheme\.NoActionBarLaunch"[^>]*>)([\s\S]*?)(<\/style>)/;
    if (launch.test(styles) && !styles.includes('windowSplashScreenBackground')) {
        // 23/11 (noite): sem windowSplashScreenAnimatedIcon. O Android usa o ícone do app inteiro,
        // como na 1ª versão (o foreground sozinho ficava com zoom e cortado no círculo).
        const items = [
            `        <item name="windowSplashScreenBackground">${BG}</item>`,
            styles.includes('postSplashScreenTheme') ? '' : '        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>',
        ].filter(Boolean).join('\n');
        styles = styles.replace(launch, (all, open, body, close) => `${open}${body}${items}\n    ${close}`);
        fs.writeFileSync(stylesFile, styles);
        log('abertura do Android 12+ na cor ' + BG);
    }
}

log('pronto');
