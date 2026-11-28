// GERADO por scripts/theme/generate-motion.ts — não edite; rode `pnpm generate:motion`.
// A fonte da verdade está em packages/theme/src/motion.ts.

package app.braid.mobile.core.designsystem

import kotlin.math.roundToInt

/**
 * Os tempos das animações de transição, os mesmos do web. [SCALE] multiplica todos: o que só existe no app escreve
 * o tempo de desenho e o passa por [ms]; uma mola passa a rigidez de desenho por [stiffness]. Laços e o movimento
 * reduzido ficam fora da escala.
 */
object Motion {
    /** O multiplicador único do tempo das transições: 1 é o tempo dos canvases. */
    const val SCALE = 0.25

    /** 150 ms no desenho. */
    const val DURATION_FAST_MS = 38

    /** 240 ms no desenho. */
    const val DURATION_SLOW_MS = 60

    /** 380 ms no desenho. */
    const val DURATION_SCREEN_MS = 95

    /** 280 ms no desenho. */
    const val DURATION_SCREEN_BACK_MS = 70

    /** 40 ms no desenho. */
    const val STAGGER_MS = 10

    /** 210 ms no desenho. */
    const val FLIGHT_OUT_MS = 53

    /** 360 ms no desenho. */
    const val FLIGHT_BACK_MS = 90

    /** 137 ms no desenho. */
    const val FLIGHT_LAND_MS = 34

    /** 73 ms no desenho. */
    const val FLIGHT_LAND_DELAY_MS = 18

    /** 126 ms no desenho. */
    const val BAR_AWAY_MS = 32

    /** 216 ms no desenho. */
    const val BAR_RETURN_MS = 54

    /** 144 ms no desenho. */
    const val BAR_RETURN_DELAY_MS = 36

    /** 234 ms no desenho. */
    const val PANEL_AWAY_MS = 59

    /** 200 ms no desenho. */
    const val CORE_AWAY_MS = 50

    /** 120 ms no desenho. */
    const val CLOSE_ENTER_MS = 30

    /** 70 ms no desenho. */
    const val CLOSE_ENTER_DELAY_MS = 18

    /** 480 ms no desenho. */
    const val SHEET_OPEN_MS = 120

    /** 300 ms no desenho. */
    const val SHEET_CLOSE_MS = 75

    /** 380 ms no desenho. */
    const val SCRIM_OPEN_MS = 95

    /** 220 ms no desenho. */
    const val SCRIM_CLOSE_MS = 55

    /** 380 ms no desenho. */
    const val SHEET_BLOCK_MS = 95

    /** 100 ms no desenho. */
    const val SHEET_BLOCK_DELAY_MS = 25

    /** 60 ms no desenho. */
    const val SHEET_BLOCK_STEP_MS = 15

    /** 200 ms no desenho. */
    const val SHEET_TOGGLE_MS = 50

    /** 420 ms no desenho. */
    const val DRAWER_GROW_MS = 105

    /** 300 ms no desenho. */
    const val DRAWER_SHRINK_MS = 75

    /** 200 ms no desenho. */
    const val DRAWER_ROW_IN_MS = 50

    /** 120 ms no desenho. */
    const val DRAWER_ROW_OUT_MS = 30

    /** 100 ms no desenho. */
    const val DRAWER_HEADER_DELAY_MS = 25

    /** 180 ms no desenho. */
    const val MENU_PICK_CLOSE_MS = 45

    /** 360 ms no desenho. */
    const val MENU_SETTLE_MS = 90

    /** 120 ms no desenho. */
    const val BOT_FADE_MS = 30

    /** 460 ms no desenho. */
    const val BOT_POP_MS = 115

    /** 170 ms no desenho. */
    const val BOT_POP_DELAY_MS = 43

    /** 380 ms no desenho. */
    const val BOT_SHAKE_MS = 95

    /** 80 ms no desenho. */
    const val BOT_SHAKE_DELAY_MS = 20

    /** 300 ms no desenho. */
    const val BOT_CHECK_DRAW_MS = 75

    /** 60 ms no desenho. */
    const val BOT_CHECK_FADE_MS = 15

    /** 110 ms no desenho. */
    const val BOT_CHECK_DELAY_MS = 28

    /** 60 ms no desenho. */
    const val BOT_EX_DELAY_MS = 15

    /** 380 ms no desenho. */
    const val BOT_POINT_MS = 95

    /** 150 ms no desenho. */
    const val BOT_POINT_DELAY_MS = 38

    /** 1600 ms no desenho. */
    const val CHANGE_FLASH_MS = 400

    /** Um tempo de desenho, em milissegundos, já na escala. */
    fun ms(designMs: Int): Int = (designMs * SCALE).roundToInt()

    /** O mesmo tempo como `Long`, para `delay`. */
    fun delayMs(designMs: Int): Long = ms(designMs).toLong()

    /**
     * A rigidez de uma mola na escala: o tempo de assentar cai com a raiz da rigidez, então metade do tempo pede o
     * quádruplo da rigidez.
     */
    fun stiffness(designStiffness: Float): Float = (designStiffness / (SCALE * SCALE)).toFloat()
}
