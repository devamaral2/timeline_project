package app.braid.mobile.ui.chat

import androidx.compose.ui.geometry.Rect
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** As regras do voo do botão do Hermes, as do `mobile-navigation.tsx` do web: quando voa, para onde e quando não. */
class HermesFlightTest {
    private var clock = 10_000L
    private val flight = HermesFlight(now = { clock })
    private val button = Rect(883f, 2164f, 1020f, 2301f)
    private val chatMark = Rect(58f, 1856f, 132f, 1930f)
    private val dockMark = Rect(58f, 1900f, 132f, 1974f)

    private fun barShown() {
        flight.barChanged(true)
        flight.buttonMoved(button)
    }

    @Test
    fun `opening the chat flies out and closing it flies back from the icon`() {
        barShown()
        flight.chatOpened()
        assertEquals(FlightKind.Out, flight.current?.kind)
        assertTrue(flight.hidesMark(MarkRole.Chat))
        flight.markMoved(MarkRole.Chat, chatMark)
        flight.land(flight.current!!.serial)
        assertFalse(flight.hidesMark(MarkRole.Chat))

        flight.chatClosed()

        assertEquals(FlightKind.Back, flight.current?.kind)
        assertEquals(chatMark, flight.current?.mark)
    }

    @Test
    fun `closing a chat whose icon was never shown does not fly`() {
        barShown()

        flight.chatClosed()

        assertNull(flight.current)
    }

    @Test
    fun `a reopened chat flies to where its icon was, before the panel is measured`() {
        barShown()
        flight.markMoved(MarkRole.Chat, chatMark)
        flight.markLeft(MarkRole.Chat)

        flight.chatOpened()

        assertEquals(chatMark, flight.mark(MarkRole.Chat))
    }

    @Test
    fun `a detail field that arrives while the bar is up calls the button`() {
        barShown()

        flight.markArrived(MarkRole.Dock)

        assertEquals(FlightKind.Dock, flight.current?.kind)
        assertTrue(flight.hidesMark(MarkRole.Dock))
    }

    @Test
    fun `a detail that loads soon after the bar left still calls the button, a late one does not`() {
        barShown()
        flight.barChanged(false)
        clock += 500
        flight.markArrived(MarkRole.Dock)
        assertEquals(FlightKind.Dock, flight.current?.kind)
        flight.land(flight.current!!.serial)
        flight.markLeft(MarkRole.Dock)

        barShown()
        flight.barChanged(false)
        clock += 700
        flight.markArrived(MarkRole.Dock)

        assertNull(flight.current)
    }

    @Test
    fun `going from one detail to another does not fly`() {
        barShown()
        flight.markArrived(MarkRole.Dock)
        flight.land(flight.current!!.serial)
        flight.barChanged(false)
        flight.markLeft(MarkRole.Dock)

        clock += 100
        flight.markArrived(MarkRole.Dock)

        assertNull(flight.current)
    }

    @Test
    fun `leaving a detail flies the icon back when the bar returns soon after`() {
        barShown()
        flight.markArrived(MarkRole.Dock)
        flight.markMoved(MarkRole.Dock, dockMark)
        flight.land(flight.current!!.serial)
        flight.barChanged(false)

        flight.markLeft(MarkRole.Dock)
        clock += 300
        flight.barChanged(true)

        assertEquals(FlightKind.Undock, flight.current?.kind)
        assertEquals(dockMark, flight.current?.mark)
    }

    @Test
    fun `the bar returning while the detail is still leaving the screen flies the icon back`() {
        barShown()
        flight.markArrived(MarkRole.Dock)
        flight.markMoved(MarkRole.Dock, dockMark)
        flight.land(flight.current!!.serial)
        flight.barChanged(false)

        flight.barChanged(true)
        flight.markLeft(MarkRole.Dock)

        assertEquals(FlightKind.Undock, flight.current?.kind)
        assertEquals(dockMark, flight.current?.mark)
    }

    @Test
    fun `the bar returning long after the detail left does not fly`() {
        barShown()
        flight.markArrived(MarkRole.Dock)
        flight.markMoved(MarkRole.Dock, dockMark)
        flight.land(flight.current!!.serial)
        flight.barChanged(false)

        flight.markLeft(MarkRole.Dock)
        clock += 1_500
        flight.barChanged(true)

        assertNull(flight.current)
    }

    @Test
    fun `a detail opened from the chat ends the flight back and calls the button`() {
        barShown()
        flight.markMoved(MarkRole.Chat, chatMark)
        flight.chatClosed()
        assertEquals(FlightKind.Back, flight.current?.kind)

        flight.markArrived(MarkRole.Dock)

        assertEquals(FlightKind.Dock, flight.current?.kind)
    }

    @Test
    fun `with animations off nothing flies`() {
        flight.reduced = true
        barShown()

        flight.chatOpened()
        flight.markArrived(MarkRole.Dock)

        assertNull(flight.current)
    }

    @Test
    fun `the path runs sideways first and only then climbs, shrinking on the way`() {
        val start = flightSample(0f)
        val half = flightSample(0.5f)
        val end = flightSample(1f)

        assertEquals(listOf(0f, 0f, 0f), start.toList())
        assertEquals(listOf(1f, 1f, 1f), end.toList())
        assertEquals(0.93f, half[0], 0.0001f)
        assertEquals(0.338f, half[1], 0.0001f)
        assertEquals(0.5f, half[2], 0.0001f)
    }
}
