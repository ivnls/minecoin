package app.minecoin;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Vibrator;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.Charset;

/**
 * O app é uma WebView sobre os arquivos de assets/ (HTML, CSS, JS e as texturas do Minecraft).
 * Esta Activity guarda os dados num arquivo privado, abre o seletor de arquivos para o backup e
 * repassa o botão Voltar para a interface.
 */
public class MainActivity extends Activity {

    private static final int REQ_EXPORT = 1;
    private static final int REQ_IMPORT = 2;
    private static final Charset UTF8 = Charset.forName("UTF-8");

    private WebView web;
    private String pendingExport;
    // aberto por um widget: a tela que ele pediu (o JavaScript busca com takeLaunchTarget ao iniciar)
    private volatile String launchTarget;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        launchTarget = getIntent().getStringExtra(Widgets.EXTRA_TARGET);
        setBarColor(Color.parseColor("#1b1b1b"));

        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#2b1f14"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        // a fonte é pixelada: qualquer ampliação de texto quebraria a grade de pixels
        s.setTextZoom(100);
        s.setAllowContentAccess(false);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            // a versão com WebResourceRequest (API 24+) chama esta por padrão
            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return openExternal(Uri.parse(url));
            }
        });
        web.addJavascriptInterface(new Bridge(), "MinecoinNative");
        setContentView(web);

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl("file:///android_asset/index.html");
        }
    }

    private boolean openExternal(Uri uri) {
        if ("file".equals(uri.getScheme())) return false;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            // nenhum navegador instalado
        }
        return true;
    }

    private void setBarColor(int color) {
        Window w = getWindow();
        w.setStatusBarColor(color);
        w.setNavigationBarColor(Color.BLACK);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String target = intent.getStringExtra(Widgets.EXTRA_TARGET);
        if (target != null && target.matches("[a-z]+")) {
            web.evaluateJavascript("window.Minecoin && Minecoin.open('" + target + "')", null);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.evaluateJavascript("window.Minecoin && Minecoin.flush()", null);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.Minecoin ? Minecoin.back() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if (!"true".equals(handled)) finish();
            }
        });
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.removeJavascriptInterface("MinecoinNative");
            web.destroy();
        }
        super.onDestroy();
    }

    // ---------- arquivo de dados ----------

    private File dataFile() {
        return new File(getFilesDir(), "minecoin.json");
    }

    private synchronized String readData() {
        File f = dataFile();
        if (!f.exists()) {
            File bak = new File(getFilesDir(), "minecoin.json.bak");
            if (!bak.exists()) return null;
            f = bak;
        }
        try (InputStream in = new FileInputStream(f)) {
            return readAll(in);
        } catch (Exception e) {
            return null;
        }
    }

    /** Grava num arquivo temporário e troca de nome, mantendo a versão anterior como .bak. */
    private synchronized void writeData(String json) {
        File f = dataFile();
        if (json == null || json.isEmpty()) {
            f.delete();
            new File(getFilesDir(), "minecoin.json.bak").delete();
            return;
        }
        File tmp = new File(getFilesDir(), "minecoin.json.tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(json.getBytes(UTF8));
            out.getFD().sync();
        } catch (Exception e) {
            return;
        }
        File bak = new File(getFilesDir(), "minecoin.json.bak");
        if (f.exists()) {
            bak.delete();
            f.renameTo(bak);
        }
        tmp.renameTo(f);
    }

    private static String readAll(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] b = new byte[16384];
        int n;
        while ((n = in.read(b)) > 0) buf.write(b, 0, n);
        return new String(buf.toByteArray(), UTF8);
    }

    // ---------- backup ----------

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        Uri uri = data != null ? data.getData() : null;
        if (requestCode == REQ_EXPORT) {
            boolean ok = false;
            if (resultCode == RESULT_OK && uri != null && pendingExport != null) {
                try (OutputStream out = getContentResolver().openOutputStream(uri, "wt")) {
                    out.write(pendingExport.getBytes(UTF8));
                    ok = true;
                } catch (Exception e) {
                    ok = false;
                }
            }
            pendingExport = null;
            if (resultCode == RESULT_OK) web.evaluateJavascript("Minecoin.onExported(" + ok + ")", null);
        } else if (requestCode == REQ_IMPORT && resultCode == RESULT_OK && uri != null) {
            try (InputStream in = getContentResolver().openInputStream(uri)) {
                String text = readAll(in);
                web.evaluateJavascript("Minecoin.onImport(" + JSONObject.quote(text) + ")", null);
            } catch (Exception e) {
                Toast.makeText(this, "Não foi possível ler o arquivo", Toast.LENGTH_SHORT).show();
            }
        }
    }

    /** Métodos chamados pelo JavaScript como MinecoinNative.xxx(). */
    private class Bridge {
        @JavascriptInterface
        public String load() {
            return readData();
        }

        /** Resumo para os widgets da tela inicial: guarda e redesenha todos. */
        @JavascriptInterface
        public void updateWidgets(String json) {
            Widgets.save(MainActivity.this, json);
            Widgets.updateAll(MainActivity.this);
        }

        @JavascriptInterface
        public String takeLaunchTarget() {
            String t = launchTarget;
            launchTarget = null;
            return t;
        }

        @JavascriptInterface
        public void save(String json) {
            writeData(json);
        }

        @JavascriptInterface
        public void exportBackup(final String json, final String name) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    pendingExport = json;
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("application/json");
                    i.putExtra(Intent.EXTRA_TITLE, name);
                    try {
                        startActivityForResult(i, REQ_EXPORT);
                    } catch (ActivityNotFoundException e) {
                        shareBackup(json, name);
                    }
                }
            });
        }

        @JavascriptInterface
        public void importBackup() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("*/*");
                    i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain", "application/octet-stream"});
                    try {
                        startActivityForResult(i, REQ_IMPORT);
                    } catch (ActivityNotFoundException e) {
                        Toast.makeText(MainActivity.this, "Nenhum seletor de arquivos", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public void vibrate(int ms) {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) v.vibrate(Math.max(5, Math.min(ms, 200)));
        }

        @JavascriptInterface
        public void setBarColor(final String color) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        MainActivity.this.setBarColor(Color.parseColor(color));
                    } catch (IllegalArgumentException ignored) {
                        // cor inválida: mantém a atual
                    }
                }
            });
        }

        @JavascriptInterface
        public String version() {
            try {
                PackageInfo p = getPackageManager().getPackageInfo(getPackageName(), 0);
                return p.versionName;
            } catch (Exception e) {
                return "";
            }
        }
    }

    // sem seletor de documentos (aparelhos raros): compartilha o backup como texto
    private void shareBackup(String json, String name) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("application/json");
        send.putExtra(Intent.EXTRA_SUBJECT, name);
        send.putExtra(Intent.EXTRA_TEXT, json);
        startActivity(Intent.createChooser(send, name));
    }
}
