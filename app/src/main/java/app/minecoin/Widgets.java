package app.minecoin;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffColorFilter;
import android.graphics.Rect;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.os.Bundle;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.Charset;
import java.util.Calendar;
import java.util.HashMap;
import java.util.Map;

/**
 * Os quatro widgets da tela inicial. O app (JavaScript) manda um resumo já formatado sempre que os dados mudam
 * (MinecoinNative.updateWidgets); aqui cada widget é desenhado como uma imagem pixelada, com a fonte e as texturas
 * do Minecraft e o fundo do tema escolhido no app.
 */
final class Widgets {

    static final int NET_WORTH = 0;
    static final int GOAL = 1;
    static final int MONTH = 2;
    static final int ACHIEVEMENTS = 3;

    /** O que abrir no app ao tocar em cada widget (lido pelo JavaScript em Minecoin.open). */
    static final String[] TARGETS = {"home", "home", "summary", "achievements"};
    static final String EXTRA_TARGET = "app.minecoin.TARGET";

    private static final Class<?>[] PROVIDERS = {
            NetWorthWidget.class, GoalWidget.class, MonthWidget.class, AchievementsWidget.class};
    // tamanho padrão (dp) quando o launcher ainda não informou o tamanho real
    private static final int[][] DEFAULT_DP = {{180, 60}, {250, 60}, {250, 60}, {250, 120}};

    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final String[] MONTHS = {"Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho",
            "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"};

    private static final int WHITE = 0xffffffff;
    private static final int GRAY = 0xffaaaaaa;
    private static final int GOLD = 0xffffaa00;
    private static final int GREEN = 0xff55ff55;
    private static final int RED = 0xffff5555;
    private static final int YELLOW = 0xffffff55;
    private static final int XP = 0xff80ff20;

    private Widgets() {
    }

    // ---------- resumo vindo do app ----------

    private static File file(Context c) {
        return new File(c.getFilesDir(), "widgets.json");
    }

    static synchronized void save(Context c, String json) {
        File tmp = new File(c.getFilesDir(), "widgets.json.tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(json.getBytes(UTF8));
        } catch (Exception e) {
            return;
        }
        tmp.renameTo(file(c));
    }

    static synchronized JSONObject load(Context c) {
        try (InputStream in = new FileInputStream(file(c))) {
            byte[] b = new byte[(int) file(c).length()];
            int n = 0;
            while (n < b.length) {
                int r = in.read(b, n, b.length - n);
                if (r < 0) break;
                n += r;
            }
            return new JSONObject(new String(b, 0, n, UTF8));
        } catch (Exception e) {
            return null;
        }
    }

    // ---------- atualização ----------

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (int kind = 0; kind < PROVIDERS.length; kind++) {
            for (int id : m.getAppWidgetIds(new ComponentName(c, PROVIDERS[kind]))) update(c, m, id, kind);
        }
    }

    static void update(Context c, AppWidgetManager m, int id, int kind) {
        float density = c.getResources().getDisplayMetrics().density;
        Bundle o = m.getAppWidgetOptions(id);
        int wDp = o != null ? o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH) : 0;
        int hDp = o != null ? o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT) : 0;
        if (wDp <= 0 || hDp <= 0) {
            wDp = DEFAULT_DP[kind][0];
            hDp = DEFAULT_DP[kind][1];
        }
        int w = Math.round(wDp * density);
        int h = Math.round(hDp * density);
        // limite de memória das imagens em widgets: reduz telas muito grandes
        float cap = (float) Math.sqrt(1200000f / (w * (float) h));
        if (cap < 1) {
            w = (int) (w * cap);
            h = (int) (h * cap);
            density *= cap;
        }

        Bitmap bmp = Bitmap.createBitmap(Math.max(w, 1), Math.max(h, 1), Bitmap.Config.ARGB_8888);
        new Painter(c, bmp, density).draw(kind, load(c));

        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget);
        rv.setImageViewBitmap(R.id.widget_image, bmp);
        Intent open = new Intent(c, MainActivity.class)
                .putExtra(EXTRA_TARGET, TARGETS[kind])
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        rv.setOnClickPendingIntent(R.id.widget_image, PendingIntent.getActivity(c, kind, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        m.updateAppWidget(id, rv);
    }

    // ---------- desenho ----------

    /** Desenha um widget. Uma unidade "u" é um pixel do jogo (cerca de 2dp, reduzida quando falta espaço). */
    private static final class Painter {
        private static Typeface font;
        private static final Map<String, Bitmap> cache = new HashMap<>();

        private final AssetManager assets;
        private final Canvas canvas;
        private final int w;
        private final int h;
        private final float density;
        private final Paint text = new Paint();
        private final Paint pix = new Paint();
        private int u;

        Painter(Context c, Bitmap bmp, float density) {
            assets = c.getAssets();
            canvas = new Canvas(bmp);
            w = bmp.getWidth();
            h = bmp.getHeight();
            this.density = density;
            if (font == null) font = Typeface.createFromAsset(assets, "fonts/minecraft.ttf");
            text.setTypeface(font);
            text.setAntiAlias(false);
            pix.setFilterBitmap(false);
            pix.setAntiAlias(false);
        }

        /** Escolhe u para que caibam {@code units} pixels do jogo na altura (e {@code unitsW} na largura). */
        private void fit(int units, int unitsW) {
            u = Math.max(1, Math.round(2 * density));
            while (u > 1 && (units * u > h || unitsW * u > w)) u--;
        }

        void draw(int kind, JSONObject s) {
            String theme = s != null ? s.optString("theme", "overworld") : "overworld";
            fit(1, 1);
            background(theme);
            if (s == null || s.optBoolean("empty")) {
                fit(30, 60);
                centered(new String[]{"Abra o Minecoin", "para começar"}, new int[]{WHITE, GRAY});
                return;
            }
            switch (kind) {
                case NET_WORTH: netWorth(s); break;
                case GOAL: goal(s); break;
                case MONTH: month(s); break;
                default: achievements(s); break;
            }
        }

        // fundo: textura do bloco do tema, ampliada sem suavização, escurecida como no app, e moldura
        private void background(String theme) {
            String block;
            int shade;
            if ("nether".equals(theme)) {
                block = "netherrack";
                shade = Color.argb(168, 20, 0, 0);
            } else if ("end".equals(theme)) {
                block = "end_stone";
                shade = Color.argb(204, 16, 4, 30);
            } else if ("deep".equals(theme)) {
                block = "deepslate";
                shade = Color.argb(140, 0, 0, 0);
            } else {
                block = "dirt";
                shade = Color.argb(158, 0, 0, 0);
            }
            Bitmap tex = bitmap("mc/block/" + block + ".png");
            if (tex != null) {
                BitmapShader sh = new BitmapShader(tex, Shader.TileMode.REPEAT, Shader.TileMode.REPEAT);
                Matrix mx = new Matrix();
                float texel = 2 * u;
                mx.setScale(texel, texel);
                sh.setLocalMatrix(mx);
                Paint p = new Paint();
                p.setShader(sh);
                p.setFilterBitmap(false);
                canvas.drawRect(0, 0, w, h, p);
            } else {
                canvas.drawColor(0xff2b1f14);
            }
            canvas.drawColor(shade);
            Paint frame = new Paint();
            frame.setColor(0xff000000);
            int b = u;
            canvas.drawRect(0, 0, w, b, frame);
            canvas.drawRect(0, h - b, w, h, frame);
            canvas.drawRect(0, 0, b, h, frame);
            canvas.drawRect(w - b, 0, w, h, frame);
            frame.setColor(0x20ffffff);
            canvas.drawRect(b, b, w - b, 2 * b, frame);
            canvas.drawRect(b, 2 * b, 2 * b, h - b, frame);
        }

        // ---------- 1. patrimônio líquido ----------

        private void netWorth(JSONObject s) {
            String value = s.optString("net");
            int color = s.optBoolean("netNegative") ? RED : GOLD;
            fit(8 + 3 + 8 + 10, 40);
            int pad = 4 * u;
            int icon = Math.min(h - 2 * pad, 16 * 2 * u);
            int x = pad;
            if (w > h * 2 && icon >= 16) {
                icon = icon / 16 * 16;
                drawItem("chest", x, (h - icon) / 2, icon, false);
                x += icon + 3 * u;
            }
            int avail = w - x - pad;
            int scale = scaleFor(value, avail, Math.max(1, (h - 2 * pad - 11 * u) / (8 * u)), 4);
            int blockH = 8 * u + 3 * u + 8 * u * scale;
            int top = (h - blockH) / 2;
            drawText("Patrimônio líquido", x, top, GRAY, 1, avail);
            drawText(value, x, top + 11 * u, color, scale, avail);
        }

        // ---------- 2. barra de XP da meta ----------

        private void goal(JSONObject s) {
            if (s.optLong("goal") <= 0) {
                fit(30, 60);
                centered(new String[]{"Sem meta definida", "Defina em Ajustes"}, new int[]{WHITE, GRAY});
                return;
            }
            fit(8 + 2 + 5 + 3 + 8 + 6, 60);
            double pct = s.optDouble("pct", 0);
            String level = (int) Math.floor(pct * 100) + "%";
            String meta = "Meta: " + s.optString("goalText");
            int pad = 4 * u;
            int barW = w - 2 * pad;
            int blockH = 8 * u + 2 * u + 5 * u + 3 * u + 8 * u;
            int top = (h - blockH) / 2;

            // número do nível: verde com contorno preto, como no jogo
            int lw = width(level, 1);
            int lx = (w - lw) / 2;
            for (int[] d : new int[][]{{-1, 0}, {1, 0}, {0, -1}, {0, 1}}) {
                rawText(level, lx + d[0] * u, top + d[1] * u, 0xff000000, 1);
            }
            rawText(level, lx, top, XP, 1);

            int by = top + 10 * u;
            Bitmap bg = bitmap("mc/gui/xp_bg.png");
            Bitmap fg = bitmap("mc/gui/xp_fg.png");
            if (bg != null) canvas.drawBitmap(bg, null, new Rect(pad, by, pad + barW, by + 5 * u), pix);
            if (fg != null && pct > 0) {
                int srcW = Math.max(1, (int) Math.round(fg.getWidth() * pct));
                canvas.drawBitmap(fg, new Rect(0, 0, srcW, fg.getHeight()),
                        new Rect(pad, by, pad + (int) Math.round(barW * pct), by + 5 * u), pix);
            }
            int mw = Math.min(width(meta, 1), barW);
            drawText(meta, (w - mw) / 2, by + 8 * u, GRAY, 1, barW);
        }

        // ---------- 3. entrou e saiu no mês ----------

        private void month(JSONObject s) {
            Calendar now = Calendar.getInstance();
            String current = String.format(java.util.Locale.US, "%04d-%02d",
                    now.get(Calendar.YEAR), now.get(Calendar.MONTH) + 1);
            // virou o mês sem abrir o app: o mês novo ainda não tem registros
            boolean stale = !current.equals(s.optString("month"));
            String in = stale ? s.optString("zero") : s.optString("income");
            String out = stale ? s.optString("zero") : s.optString("expense");
            String name = MONTHS[now.get(Calendar.MONTH)];

            fit(8 + 3 + 8 + 3 + 8 + 6, 60);
            int pad = 4 * u;
            boolean header = h >= (8 + 3 + 8 + 3 + 8 + 8) * u;
            int colW = (w - 2 * pad - 4 * u) / 2;
            int scale = Math.min(scaleFor(in, colW, 3, 2), scaleFor(out, colW, 3, 2));
            int blockH = (header ? 11 * u : 0) + 8 * u + 3 * u + 8 * u * scale;
            int top = (h - blockH) / 2;
            if (header) {
                drawText(name, pad, top, YELLOW, 1, w - 2 * pad);
                top += 11 * u;
            }
            int x2 = pad + colW + 4 * u;
            drawText("Entrou", pad, top, GRAY, 1, colW);
            drawText("Saiu", x2, top, GRAY, 1, colW);
            drawText(in, pad, top + 11 * u, GREEN, scale, colW);
            drawText(out, x2, top + 11 * u, RED, scale, colW);
        }

        // ---------- 4. conquistas ----------

        private void achievements(JSONObject s) {
            JSONArray adv = s.optJSONArray("adv");
            int n = adv != null ? adv.length() : 0;
            fit(8 + 4 + 18 + 8, 18 * 4);
            int pad = 4 * u;
            String title = "Conquistas";
            String count = s.optInt("advCount") + "/" + s.optInt("advTotal");
            drawText(title, pad, pad, WHITE, 1, w - 2 * pad);
            int cw = width(count, 1);
            drawText(count, w - pad - cw, pad, GRAY, 1, cw);
            if (n == 0) return;

            // a grade com espaços maiores que ainda cabe (espaços com tamanho inteiro de pixels do jogo)
            int areaW = w - 2 * pad;
            int areaH = h - 2 * pad - 12 * u;
            int bestT = 0;
            int bestCols = n;
            for (int cols = n; cols >= 1; cols--) {
                int rows = (n + cols - 1) / cols;
                int t = Math.min(areaW / (18 * cols), areaH / (18 * rows));
                if (t > bestT) {
                    bestT = t;
                    bestCols = cols;
                }
            }
            int t = Math.max(1, bestT);
            int slot = 18 * t;
            int cols = bestCols;
            int rows = (n + cols - 1) / cols;
            int gx = (w - cols * slot) / 2;
            int gy = pad + 12 * u + Math.max(0, (areaH - rows * slot) / 2);
            Bitmap slotBmp = bitmap("mc/gui/slot.png");
            for (int i = 0; i < n; i++) {
                JSONObject a = adv.optJSONObject(i);
                int x = gx + (i % cols) * slot;
                int y = gy + (i / cols) * slot;
                if (slotBmp != null) canvas.drawBitmap(slotBmp, null, new Rect(x, y, x + slot, y + slot), pix);
                if (a != null) drawItem(a.optString("icon"), x + t, y + t, 16 * t, a.optString("got").isEmpty());
            }
        }

        // ---------- texto ----------

        private void centered(String[] lines, int[] colors) {
            int lineH = 11 * u;
            int top = (h - (lines.length * lineH - 3 * u)) / 2;
            for (int i = 0; i < lines.length; i++) {
                int lw = Math.min(width(lines[i], 1), w - 4 * u);
                drawText(lines[i], (w - lw) / 2, top + i * lineH, colors[i], 1, w - 4 * u);
            }
        }

        /** Maior escala (até max) em que o texto cabe na largura e na altura (em linhas de 8u). */
        private int scaleFor(String s, int maxW, int maxByHeight, int max) {
            int scale = Math.max(1, Math.min(max, maxByHeight));
            while (scale > 1 && width(s, scale) > maxW) scale--;
            return scale;
        }

        private int width(String s, int scale) {
            text.setTextSize(8 * u * scale);
            return (int) Math.ceil(text.measureText(s));
        }

        /** Texto com sombra; {@code top} é o alto da linha. Corta com reticências se passar de maxW. */
        private void drawText(String s, int x, int top, int color, int scale, int maxW) {
            if (width(s, scale) > maxW) {
                while (s.length() > 1 && width(s + "…", scale) > maxW) s = s.substring(0, s.length() - 1);
                s = s + "…";
            }
            int shadow = (color & 0xff000000) | ((color & 0xfcfcfc) >> 2);
            rawText(s, x + u * scale, top + u * scale, shadow, scale);
            rawText(s, x, top, color, scale);
        }

        private void rawText(String s, int x, int top, int color, int scale) {
            text.setTextSize(8 * u * scale);
            text.setColor(color);
            // a fonte tem 7 pixels acima da linha de base
            canvas.drawText(s, x, top + 7 * u * scale, text);
        }

        // ---------- imagens ----------

        private void drawItem(String name, int x, int y, int size, boolean locked) {
            Bitmap b = bitmap("mc/item/" + name + ".png");
            if (b == null) b = bitmap("mc/item/barrier.png");
            if (b == null) return;
            Paint p = pix;
            if (locked) {
                p = new Paint(pix);
                p.setColorFilter(new PorterDuffColorFilter(0x99000000, PorterDuff.Mode.SRC_IN));
            }
            canvas.drawBitmap(b, null, new Rect(x, y, x + size, y + size), p);
        }

        private Bitmap bitmap(String path) {
            synchronized (cache) {
                if (cache.containsKey(path)) return cache.get(path);
                Bitmap b = null;
                try (InputStream in = assets.open(path)) {
                    BitmapFactory.Options o = new BitmapFactory.Options();
                    o.inScaled = false;
                    b = BitmapFactory.decodeStream(in, null, o);
                } catch (Exception ignored) {
                    // asset ausente: quem chamou desenha sem a imagem
                }
                cache.put(path, b);
                return b;
            }
        }
    }
}
