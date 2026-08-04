package com.freekitlab.automail;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "AutoMail";
    private static final String BASE_URL = "https://automail-a.vercel.app";
    private static final String APP_PARAM = "?app=android";

    private static final String CHROME_UA =
            "Mozilla/5.0 (Linux; Android 16; SM-S928N) "
                    + "AppleWebKit/537.36 (KHTML, like Gecko) "
                    + "Chrome/131.0.6778.200 Mobile Safari/537.36";

    private WebView webView;
    private ProgressBar progressBar;
    private ValueCallback<Uri[]> fileCallback;

    private final ActivityResultLauncher<Intent> filePicker =
            registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
                if (fileCallback == null) return;
                Uri[] uris = null;
                if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
                    if (result.getData().getClipData() != null) {
                        int count = result.getData().getClipData().getItemCount();
                        uris = new Uri[count];
                        for (int i = 0; i < count; i++) {
                            uris[i] = result.getData().getClipData().getItemAt(i).getUri();
                        }
                    } else if (result.getData().getData() != null) {
                        uris = new Uri[]{result.getData().getData()};
                    }
                }
                fileCallback.onReceiveValue(uris);
                fileCallback = null;
            });

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(0xFF0a0a0a);
        window.setNavigationBarColor(0xFF0a0a0a);

        setContentView(R.layout.activity_main);

        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main_container), (v, windowInsets) -> {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(insets.left, insets.top, insets.right, insets.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        progressBar = findViewById(R.id.progress_bar);
        webView = findViewById(R.id.webview);

        setupWebView();
        webView.loadUrl(BASE_URL + APP_PARAM);

        getOnBackPressedDispatcher().addCallback(this, new androidx.activity.OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    moveTaskToBack(true);
                }
            }
        });
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setTextZoom(100);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(false);

        settings.setUserAgentString(CHROME_UA);

        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                Log.d(TAG, "Loading: " + url);

                if (url.startsWith(BASE_URL) ||
                        url.contains("accounts.google.com") ||
                        url.contains("googleapis.com") ||
                        url.contains("google.com/o/oauth2") ||
                        url.contains("vercel.app") ||
                        url.contains("/api/auth")) {
                    return false;
                }

                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) {}
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectAppStyles();
                Log.d(TAG, "Page finished: " + url);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    Log.e(TAG, "Error: " + error.getDescription());
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    progressBar.setVisibility(View.VISIBLE);
                    progressBar.setProgress(newProgress);
                } else {
                    progressBar.setVisibility(View.GONE);
                }
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = callback;

                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                filePicker.launch(Intent.createChooser(intent, "첨부파일 선택"));
                return true;
            }
        });
    }

    private void injectAppStyles() {
        String css = "body{-webkit-tap-highlight-color:transparent;overscroll-behavior:none;}"
                + "*{-webkit-user-select:auto!important;}"
                + "::-webkit-scrollbar{width:3px;}"
                + "::-webkit-scrollbar-thumb{background:#333;border-radius:3px;}";

        String js = "(function(){"
                + "var s=document.createElement('style');"
                + "s.textContent='" + css + "';"
                + "document.head.appendChild(s);"
                + "var m=document.querySelector('meta[name=viewport]');"
                + "if(!m){m=document.createElement('meta');m.name='viewport';document.head.appendChild(m);}"
                + "m.content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no';"
                + "window.__AUTOMAIL_APP='android';"
                + "if(!window.__AUTOMAIL_ANDROID_TOUCH_PATCH){"
                + "window.__AUTOMAIL_ANDROID_TOUCH_PATCH=true;"
                + "function sidebar(){return Array.prototype.find.call(document.querySelectorAll('div'),function(el){var c=el.className||'';return typeof c==='string'&&c.indexOf('w-80')>-1&&c.indexOf('flex-col')>-1&&c.indexOf('border-r')>-1;});}"
                + "function openSidebar(){var el=sidebar();if(!el)return false;el.classList.remove('-translate-x-full');el.classList.add('translate-x-0');el.style.transform='translateX(0)';el.style.visibility='visible';el.style.pointerEvents='auto';var t=document.querySelector('button.fixed.top-3.left-3 span');if(t)t.textContent='\\u2715';return true;}"
                + "function isMenuButton(el){var b=el&&el.closest&&el.closest('button');if(!b)return false;var text=(b.textContent||'').trim();var r=b.getBoundingClientRect();return text==='\\u2630'||text==='\\u2715'||(r.left<80&&r.top<90&&r.width<80&&r.height<80);}"
                + "['touchstart','pointerdown','click'].forEach(function(type){document.addEventListener(type,function(e){var p=e.touches&&e.touches[0]?e.touches[0]:e;if(isMenuButton(e.target)||(p&&p.clientX<90&&p.clientY<100)){if(openSidebar()){e.preventDefault();e.stopImmediatePropagation();}}},true);});"
                + "}"
                + "})()";
        webView.evaluateJavascript(js, null);
    }

}
