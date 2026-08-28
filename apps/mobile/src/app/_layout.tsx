import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useTheme } from "@/lib/theme/use-theme";

export default function RootLayout() {
  const theme = useTheme();

  return (
    <>
      <StatusBar style={theme.scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.card },
          headerTintColor: theme.colors.foreground,
          headerTitleStyle: { fontWeight: "600" },
          // A sombra padrao do cabecalho vira um degrade cinza sobre o fundo
          // escuro; a separacao aqui vem da propria cor do painel.
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        {/* Login e timeline trazem o proprio cabecalho, como no web. */}
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="[userId]/index" options={{ headerShown: false }} />
        <Stack.Screen name="event/[eventId]" options={{ title: "Evento" }} />
        <Stack.Screen
          name="new-event"
          options={{ title: "Novo evento", presentation: "modal" }}
        />
      </Stack>
    </>
  );
}
