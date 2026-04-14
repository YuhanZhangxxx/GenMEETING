import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  Platform,
} from "react-native";
import { useEffect, useState } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import {
  useAuthRequest,
  makeRedirectUri,
  ResponseType,
} from "expo-auth-session";
import { useAuth } from "@/store/auth";
import { api } from "@/lib/api";
import { Colors } from "@/constants/colors";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? "";
// Only use native client IDs if they're real values (not placeholders)
const GOOGLE_IOS_CLIENT_ID = (() => {
  const v = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  return v && !v.startsWith("your-") ? v : undefined;
})();
const GOOGLE_ANDROID_CLIENT_ID = (() => {
  const v = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  return v && !v.startsWith("your-") ? v : undefined;
})();
const MICROSOFT_CLIENT_ID = process.env.EXPO_PUBLIC_MICROSOFT_CLIENT_ID?.startsWith("your-")
  ? ""
  : (process.env.EXPO_PUBLIC_MICROSOFT_CLIENT_ID ?? "");

const MICROSOFT_DISCOVERY = {
  authorizationEndpoint:
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  tokenEndpoint:
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
};

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Google OAuth ────────────────────────────────────────────────────────
  // Derive the reversed-scheme redirect URI from the iOS client ID
  // e.g. "175775145034-xxx.apps.googleusercontent.com" →
  //      "com.googleusercontent.apps.175775145034-xxx:/oauthredirect"
  const googleIosRedirectUri = GOOGLE_IOS_CLIENT_ID
    ? `${GOOGLE_IOS_CLIENT_ID.split(".").reverse().join(".")}:/oauthredirect`
    : undefined;

  const [googleRequest, googleResponse, promptGoogle] = Google.useAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
    // Use Code+PKCE (default for installed apps) — auto-exchanges to accessToken
    scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/calendar"],
    // Force the correct iOS redirect URI so Google accepts it
    ...(Platform.OS === "ios" && googleIosRedirectUri
      ? { redirectUri: googleIosRedirectUri }
      : {}),
  });

  useEffect(() => {
    if (googleResponse?.type === "success") {
      const token = googleResponse.authentication?.accessToken;
      const refresh = googleResponse.authentication?.refreshToken ?? undefined;
      if (token) handleMobileSignIn("google", token, refresh);
    }
  }, [googleResponse]);

  // ── Microsoft OAuth ──────────────────────────────────────────────────────
  const redirectUri = makeRedirectUri({ scheme: "meetai" });
  const [msRequest, msResponse, promptMicrosoft] = useAuthRequest(
    {
      clientId: MICROSOFT_CLIENT_ID,
      scopes: [
        "openid",
        "profile",
        "email",
        "User.Read",
        "Calendars.ReadWrite",
        "offline_access",
      ],
      redirectUri,
      responseType: ResponseType.Token,
    },
    MICROSOFT_DISCOVERY
  );

  useEffect(() => {
    if (msResponse?.type === "success") {
      const token = msResponse.params?.access_token;
      if (token) handleMobileSignIn("microsoft", token);
    }
  }, [msResponse]);

  async function handleMobileSignIn(
    provider: "google" | "microsoft",
    accessToken: string,
    refreshToken?: string
  ) {
    setLoading(true);
    setError(null);
    try {
      const data = await api.mobileSignIn(provider, accessToken, refreshToken);
      if (!data.token) throw new Error("Authentication failed");
      await signIn(data.token, data.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoEmoji}>📅</Text>
          </View>
          <Text style={styles.appName}>MeetAI</Text>
          <Text style={styles.tagline}>AI-powered meeting scheduling</Text>
        </View>

        {/* Buttons */}
        <View style={styles.buttons}>
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Signing in…</Text>
            </View>
          ) : (
            <>
              {/* Google */}
              <TouchableOpacity
                style={styles.btn}
                onPress={() => {
                  console.log("[Google] redirect_uri:", googleRequest?.redirectUri);
                  promptGoogle();
                }}
                disabled={!GOOGLE_CLIENT_ID}
              >
                <View style={styles.btnInner}>
                  <View style={styles.providerIcon}>
                    <Text style={{ fontSize: 16 }}>G</Text>
                  </View>
                  <Text style={styles.btnText}>Continue with Google</Text>
                </View>
              </TouchableOpacity>

              {/* Microsoft */}
              <TouchableOpacity
                style={[styles.btn, styles.msBtn]}
                onPress={() => promptMicrosoft()}
                disabled={!MICROSOFT_CLIENT_ID || !msRequest}
              >
                <View style={styles.btnInner}>
                  <View style={[styles.providerIcon, styles.msIcon]}>
                    <Text style={{ fontSize: 12, color: "#fff" }}>MS</Text>
                  </View>
                  <Text style={[styles.btnText, styles.msBtnText]}>
                    Continue with Microsoft
                  </Text>
                </View>
              </TouchableOpacity>
            </>
          )}

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          Sign in with the same account you use for Google Calendar or Outlook.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  container: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: "space-between",
    paddingTop: 60,
    paddingBottom: 40,
  },
  hero: { alignItems: "center", gap: 12 },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  logoEmoji: { fontSize: 40 },
  appName: { fontSize: 36, fontWeight: "800", color: Colors.slate900 },
  tagline: { fontSize: 15, color: Colors.slate500, textAlign: "center" },

  buttons: { gap: 12 },
  btn: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.slate200,
    backgroundColor: "#fff",
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  btnInner: { flexDirection: "row", alignItems: "center", gap: 12 },
  providerIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: Colors.slate100,
    alignItems: "center",
    justifyContent: "center",
  },
  msIcon: { backgroundColor: Colors.microsoft },
  btnText: { fontSize: 15, fontWeight: "600", color: Colors.slate900 },
  msBtn: { borderColor: Colors.microsoft + "40" },
  msBtnText: { color: Colors.slate900 },

  loadingBox: { alignItems: "center", gap: 12, paddingVertical: 20 },
  loadingText: { color: Colors.slate500, fontSize: 14 },

  errorBox: {
    backgroundColor: Colors.redLight,
    borderRadius: 10,
    padding: 12,
  },
  errorText: { color: Colors.red, fontSize: 13, textAlign: "center" },

  footer: {
    fontSize: 12,
    color: Colors.slate400,
    textAlign: "center",
    lineHeight: 18,
  },
});
