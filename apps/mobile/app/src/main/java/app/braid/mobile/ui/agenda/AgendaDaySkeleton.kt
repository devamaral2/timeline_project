package app.braid.mobile.ui.agenda

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
@Suppress("ktlint:standard:function-naming")
fun AgendaDaySkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SkeletonBlock(modifier = Modifier.width(140.dp).height(18.dp))
        repeat(3) {
            Surface(
                modifier = Modifier.fillMaxWidth().height(128.dp),
                shape = RoundedCornerShape(16.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.62f),
            ) {
                Row(modifier = Modifier.padding(16.dp)) {
                    SkeletonBlock(modifier = Modifier.width(24.dp).height(24.dp))
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        SkeletonBlock(modifier = Modifier.width(72.dp).height(12.dp))
                        SkeletonBlock(modifier = Modifier.width(156.dp).height(18.dp))
                        SkeletonBlock(modifier = Modifier.width(224.dp).height(12.dp))
                    }
                }
            }
        }
    }
}

@Composable
@Suppress("ktlint:standard:function-naming")
private fun SkeletonBlock(modifier: Modifier) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(6.dp),
        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.09f),
    ) {}
}
