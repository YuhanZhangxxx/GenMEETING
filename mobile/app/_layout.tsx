import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "@/store/auth";
import { EventsProvider } from "@/store/events";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;
    const inLoginScreen = segments[0] === "login";
    if (!user && !inLoginScreen) {
      router.replace("/login");
    } else if (user && inLoginScreen) {
      router.replace("/(tabs)");
    }
  }, [user, isLoading, segments]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <EventsProvider>
        <AuthGate>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="login" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="event/[id]"
              options={{
                headerShown: true,
                title: "Event Details",
                headerBackTitle: "Back",
                headerStyle: { backgroundColor: "#FFFFFF" },
                headerTintColor: "#2563EB",
                headerTitleStyle: { color: "#0F172A", fontWeight: "700" },
                presentation: "card",
              }}
            />
          </Stack>
        </AuthGate>
      </EventsProvider>
    </AuthProvider>
  );
}
