package com.praveen.echomusic.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.net.HttpURLConnection;
import java.net.URL;

/** Echo Music for Android TV: the desktop app's UI in a full-screen WebView, served by the bundled server. */
public class MainActivity extends Activity {
    private static final String HOME = "http://127.0.0.1:" + NodeRunner.PORT + "/";
    private WebView web;
    private View splash;
    private View customView;
    private final Handler main = new Handler(Looper.getMainLooper());

    /** Exposed to the page as window.echoTv (its presence switches the app to TV mode). */
    public class Bridge {
        @JavascriptInterface public void exit() { main.post(MainActivity.this::finish); }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(0xFF140D0F);
        setContentView(frame);

        web = new WebView(this);
        web.setBackgroundColor(0xFF140D0F);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setUserAgentString(s.getUserAgentString() + " EchoMusicTV/" + BuildConfig.VERSION_NAME);
        web.addJavascriptInterface(new Bridge(), "echoTv");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return !r.getUrl().toString().startsWith(HOME); // stay inside the app
            }
            @Override public void onPageFinished(WebView v, String url) {
                splash.setVisibility(View.GONE);
                web.requestFocus();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            // Full-screen video.
            @Override public void onShowCustomView(View view, CustomViewCallback cb) {
                customView = view;
                frame.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            }
            @Override public void onHideCustomView() {
                if (customView != null) frame.removeView(customView);
                customView = null;
            }
        });
        frame.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        splash = getLayoutInflater().inflate(R.layout.splash, frame, false);
        frame.addView(splash);

        NodeRunner.start(getApplicationContext());
        waitForServer(0);
    }

    /** Loads the app once the bundled server answers (first launch unpacks it, which takes a moment). */
    private void waitForServer(int attempt) {
        new Thread(() -> {
            boolean up = false;
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(HOME + "api/health").openConnection();
                c.setConnectTimeout(800);
                c.setReadTimeout(800);
                up = c.getResponseCode() < 500;
                c.disconnect();
            } catch (Exception ignored) { }
            if (up) main.post(() -> { if (web.getUrl() == null) web.loadUrl(HOME); });
            else if (attempt < 300) main.postDelayed(() -> waitForServer(attempt + 1), 200);
        }).start();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (e.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (e.getAction() == KeyEvent.ACTION_UP) {
                if (customView != null) { web.getWebChromeClient().onHideCustomView(); return true; }
                web.evaluateJavascript("window.echoTvBack ? (echoTvBack(), 'ok') : 'none'", r -> { if (r == null || r.contains("none")) finish(); });
            }
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
