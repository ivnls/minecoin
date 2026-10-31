package app.minecoin;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** Base dos quatro widgets: redesenha quando o Android pede ou quando o tamanho muda. */
abstract class WidgetProvider extends AppWidgetProvider {

    abstract int kind();

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) Widgets.update(c, m, id, kind());
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle options) {
        Widgets.update(c, m, id, kind());
    }
}
