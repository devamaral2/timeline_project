package app.braid.mobile.ui.chat

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import app.braid.mobile.domain.request.ModelProvider

/*
 * As marcas dos provedores do modo modelo, numa cor só, para os quadrados da folha da escolha. Os desenhos são os do web
 * (`provider-marks.tsx`: Anthropic e OpenAI do SVG Logos, CC0; OpenRouter do Simple Icons, CC0), com o `d` e a caixa de
 * cada um copiados; as marcas são dos seus donos e aqui só nomeiam quem atende o pedido.
 */

private class MarkPath(
    val pathData: String,
    val evenOdd: Boolean = false,
)

/** [minX], [minY], [width] e [height] são o `viewBox`; [displayWidth] e [displayHeight], o tamanho do desenho no quadrado. */
private class Mark(
    val minX: Float,
    val minY: Float,
    val width: Float,
    val height: Float,
    val displayWidth: Dp,
    val displayHeight: Dp,
    val paths: List<MarkPath>,
)

private fun markOf(provider: ModelProvider): Mark =
    when (provider) {
        ModelProvider.Anthropic ->
            Mark(
                0f,
                0f,
                256f,
                176f,
                26.dp,
                18.dp,
                listOf(
                    MarkPath("M147.487 0l70.081 175.78H256L185.919 0z"),
                    MarkPath(
                        "M70.071 0L0 175.78h39.179l14.331-36.914h73.308l14.328 36.914h39.179L110.254 0zM66.183 106.221l23.979-61.774 23.98 61.774z",
                        evenOdd = true,
                    ),
                ),
            )
        ModelProvider.OpenAi ->
            Mark(
                0f,
                0f,
                256f,
                260f,
                24.dp,
                24.dp,
                listOf(
                    MarkPath(
                        "M239.183914,106.202783 C245.054304,88.5242096 243.02228,69.1733805 233.607599,53.0998864 C219.451678,28.4588021 190.999703,15.7836129 163.213007,21.739505 C147.554077,4.32145883 123.794909,-3.42398554 100.87901,1.41873898 C77.9631105,6.26146349 59.3690093,22.9572536 52.0959621,45.2214219 C33.8436494,48.9644867 18.0901721,60.392749 8.86672513,76.5818033 C-5.443491,101.182962 -2.19544431,132.215255 16.8986662,153.320094 C11.0060865,170.990656 13.0197283,190.343991 22.4238231,206.422991 C36.5975553,231.072344 65.0680342,243.746566 92.8695738,237.783372 C105.235639,251.708249 123.001113,259.630942 141.623968,259.52692 C170.105359,259.552169 195.337611,241.165718 204.037777,214.045661 C222.28734,210.296356 238.038489,198.869783 247.267014,182.68528 C261.404453,158.127515 258.142494,127.262775 239.183914,106.202783 L239.183914,106.202783 Z M141.623968,242.541207 C130.255682,242.559177 119.243876,238.574642 110.519381,231.286197 L112.054146,230.416496 L163.724595,200.590881 C166.340648,199.056444 167.954321,196.256818 167.970781,193.224005 L167.970781,120.373788 L189.815614,133.010026 C190.034132,133.121423 190.186235,133.330564 190.224885,133.572774 L190.224885,193.940229 C190.168603,220.758427 168.442166,242.484864 141.623968,242.541207 Z M37.1575749,197.93062 C31.456498,188.086359 29.4094818,176.546984 31.3766237,165.342426 L32.9113895,166.263285 L84.6329973,196.088901 C87.2389349,197.618207 90.4682717,197.618207 93.0742093,196.088901 L156.255402,159.663793 L156.255402,184.885111 C156.243557,185.149771 156.111725,185.394602 155.89729,185.550176 L103.561776,215.733903 C80.3054953,229.131632 50.5924954,221.165435 37.1575749,197.93062 Z M23.5493181,85.3811273 C29.2899861,75.4733097 38.3511911,67.9162648 49.1287482,64.0478825 L49.1287482,125.438515 C49.0891492,128.459425 50.6965386,131.262556 53.3237748,132.754232 L116.198014,169.025864 L94.3531808,181.662102 C94.1132325,181.789434 93.8257461,181.789434 93.5857979,181.662102 L41.3526015,151.529534 C18.1419426,138.076098 10.1817681,108.385562 23.5493181,85.125333 L23.5493181,85.3811273 Z M203.0146,127.075598 L139.935725,90.4458545 L161.7294,77.8607748 C161.969348,77.7334434 162.256834,77.7334434 162.496783,77.8607748 L214.729979,108.044502 C231.032329,117.451747 240.437294,135.426109 238.871504,154.182739 C237.305714,172.939368 225.050719,189.105572 207.414262,195.67963 L207.414262,134.288998 C207.322521,131.276867 205.650697,128.535853 203.0146,127.075598 Z M224.757116,94.3850867 L223.22235,93.4642272 L171.60306,63.3828173 C168.981293,61.8443751 165.732456,61.8443751 163.110689,63.3828173 L99.9806554,99.8079259 L99.9806554,74.5866077 C99.9533004,74.3254088 100.071095,74.0701869 100.287609,73.9215426 L152.520805,43.7889738 C168.863098,34.3743518 189.174256,35.2529043 204.642579,46.0434841 C220.110903,56.8340638 227.949269,75.5923959 224.757116,94.1804513 L224.757116,94.3850867 Z M88.0606409,139.097931 L66.2158076,126.512851 C65.9950399,126.379091 65.8450965,126.154176 65.8065367,125.898945 L65.8065367,65.684966 C65.8314495,46.8285367 76.7500605,29.6846032 93.8270852,21.6883055 C110.90411,13.6920079 131.063833,16.2835462 145.5632,28.338998 L144.028434,29.2086986 L92.3579852,59.0343142 C89.7419327,60.5687513 88.1282597,63.3683767 88.1117998,66.4011901 L88.0606409,139.097931 Z M99.9294965,113.5185 L128.06687,97.3011417 L156.255402,113.5185 L156.255402,145.953218 L128.169187,162.170577 L99.9806554,145.953218 L99.9294965,113.5185 Z",
                    ),
                ),
            )
        ModelProvider.OpenRouter ->
            Mark(
                -0.482f,
                1.364f,
                24.962f,
                21.272f,
                26.dp,
                22.dp,
                listOf(
                    MarkPath(
                        "M16.778 1.844v1.919q-.569-.026-1.138-.032-.708-.008-1.415.037c-1.93.126-4.023.728-6.149 2.237-2.911 2.066-2.731 1.95-4.14 2.75-.396.223-1.342.574-2.185.798-.841.225-1.753.333-1.751.333v4.229s.768.108 1.61.333c.842.224 1.789.575 2.185.799 1.41.798 1.228.683 4.14 2.75 2.126 1.509 4.22 2.11 6.148 2.236.88.058 1.716.041 2.555.005v1.918l7.222-4.168-7.222-4.17v2.176c-.86.038-1.611.065-2.278.021-1.364-.09-2.417-.357-3.979-1.465-2.244-1.593-2.866-2.027-3.68-2.508.889-.518 1.449-.906 3.822-2.59 1.56-1.109 2.614-1.377 3.978-1.466.667-.044 1.418-.017 2.278.02v2.176L24 6.014Z",
                    ),
                ),
            )
    }

/**
 * A marca de um provedor numa cor só. Quem a usa dá o nome acessível (o quadrado que a contém). Com [fitIn] a marca cabe
 * inteira nessa caixa, centrada, como o `svg` do web dentro da caixa que o CSS lhe dá; sem ele tem o tamanho do desenho.
 */
@Composable
internal fun ProviderMark(
    provider: ModelProvider,
    color: Color,
    modifier: Modifier = Modifier,
    fitIn: DpSize? = null,
) {
    val mark = remember(provider) { markOf(provider) }
    val paths =
        remember(mark) {
            mark.paths.map { part ->
                PathParser().parsePathString(part.pathData).toPath().also {
                    it.fillType = if (part.evenOdd) PathFillType.EvenOdd else PathFillType.NonZero
                }
            }
        }
    Canvas(modifier.size(fitIn ?: DpSize(mark.displayWidth, mark.displayHeight))) {
        val factor = if (fitIn == null) size.width / mark.width else minOf(size.width / mark.width, size.height / mark.height)
        val left = if (fitIn == null) 0f else (size.width - mark.width * factor) / 2f
        val top = if (fitIn == null) 0f else (size.height - mark.height * factor) / 2f
        translate(left, top) {
            scale(factor, factor, pivot = Offset.Zero) {
                translate(-mark.minX, -mark.minY) {
                    for (path in paths) drawPath(path, color)
                }
            }
        }
    }
}
