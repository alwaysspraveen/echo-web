package com.praveen.echomusic.tv;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.AssetManager;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/** Runs the Echo server (Node.js for Mobile) once per app process, on its own thread. */
final class NodeRunner {
    static final int PORT = 47610;
    private static boolean started;

    static { System.loadLibrary("native-lib"); System.loadLibrary("node"); }

    private static native int startNode(String[] args);

    static synchronized void start(Context ctx) {
        if (started) return;
        started = true;
        new Thread(() -> {
            try {
                File root = new File(ctx.getFilesDir(), "echo");
                copyAssetsIfNew(ctx, root);
                String script = new File(root, "nodejs-project/main.mjs").getAbsolutePath();
                String web = new File(root, "web").getAbsolutePath();
                startNode(new String[] { "node", script, web, String.valueOf(PORT), java.util.TimeZone.getDefault().getID() });
            } catch (Exception e) {
                Log.e("EchoNode", "Node failed", e);
            }
        }, "echo-node").start();
    }

    /** Copies the bundled server and web app out of the APK after each install/update. */
    private static void copyAssetsIfNew(Context ctx, File root) throws Exception {
        SharedPreferences prefs = ctx.getSharedPreferences("echo", Context.MODE_PRIVATE);
        long stamp = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).lastUpdateTime;
        if (prefs.getLong("assetsStamp", 0) == stamp && new File(root, "nodejs-project/main.mjs").exists()) return;
        deleteRecursive(root);
        AssetManager am = ctx.getAssets();
        copyDir(am, "nodejs-project", new File(root, "nodejs-project"));
        copyDir(am, "web", new File(root, "web"));
        prefs.edit().putLong("assetsStamp", stamp).apply();
    }

    private static void copyDir(AssetManager am, String path, File dest) throws IOException {
        String[] list = am.list(path);
        if (list == null || list.length == 0) {
            dest.getParentFile().mkdirs();
            try (InputStream in = am.open(path); OutputStream out = new FileOutputStream(dest)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            return;
        }
        dest.mkdirs();
        for (String name : list) copyDir(am, path + "/" + name, new File(dest, name));
    }

    private static void deleteRecursive(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteRecursive(k);
        f.delete();
    }
}
