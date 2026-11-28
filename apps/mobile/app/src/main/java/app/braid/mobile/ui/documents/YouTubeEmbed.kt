package app.braid.mobile.ui.documents

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import app.braid.mobile.domain.markdown.YouTubeVideo
import app.braid.mobile.domain.markdown.youtubeEmbedUrl

/**
 * O player oficial do YouTube (`youtube.com/embed`), o mesmo iframe do web, dentro de um `WebView`. A moldura nasce
 * de uma página com a origem do app: o YouTube recusa o player (erro 153) quando o pedido não diz de onde veio.
 * Tocar num link de dentro do player (o título, o logo) abre o YouTube fora do app, não navega a moldura.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
internal fun YouTubeEmbed(
    video: YouTubeVideo,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val html = remember(video) { embedPage(youtubeEmbedUrl(video)) }
    val view =
        remember {
            WebView(context).apply {
                layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.mediaPlaybackRequiresUserGesture = true
                setBackgroundColor(android.graphics.Color.BLACK)
                webViewClient =
                    object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(
                            view: WebView,
                            request: WebResourceRequest,
                        ): Boolean {
                            // Só a moldura do player navega dentro do WebView; o resto vai para o YouTube ou o navegador.
                            if (!request.isForMainFrame) return false
                            runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(request.url.toString()))) }
                            return true
                        }
                    }
            }
        }
    DisposableEffect(view) { onDispose { view.destroy() } }
    AndroidView(
        factory = { view },
        modifier = modifier,
        // Recompor não recarrega o player (o vídeo pararia): a página só muda quando o vídeo muda.
        update = {
            if (it.tag != html) {
                it.tag = html
                it.loadDataWithBaseURL(EMBED_ORIGIN, html, "text/html", "utf-8", null)
            }
        },
    )
}

/** A origem da página que segura o player: vai como `Referer` e `origin` ao YouTube. */
private const val EMBED_ORIGIN = "https://app.braid.mobile/"

private fun embedPage(src: String): String =
    """
    <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%}</style></head>
    <body><iframe src="$src" title="Vídeo do YouTube" referrerpolicy="strict-origin-when-cross-origin"
    allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"></iframe></body></html>
    """.trimIndent()
