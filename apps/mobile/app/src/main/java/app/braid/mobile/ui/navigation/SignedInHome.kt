package app.braid.mobile.ui.navigation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.braid.mobile.core.designsystem.BraidWordmark
import app.braid.mobile.data.session.SessionUser

@Composable
@Suppress("ktlint:standard:function-naming")
fun SignedInHome(
    user: SessionUser,
    onSignOut: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        BraidWordmark(style = MaterialTheme.typography.displaySmall, logoSize = 48.dp)
        Text(text = "Olá, ${user.name}", style = MaterialTheme.typography.titleLarge)
        Text(text = user.email, style = MaterialTheme.typography.bodyMedium)
        Button(onClick = onSignOut, modifier = Modifier.padding(top = 24.dp)) {
            Text("Sair")
        }
    }
}
