// ============================================================
// AUTH — Welcome · Login · Sign Up · Forgot password (minimal flow)
// Sign up → straight to the dashboard. No onboarding wizard.
// ============================================================
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { ShieldCheck } from "lucide-react-native";
import { ScreenProps } from "../screens/types";
import { Field, Glass, PrimaryButton } from "../components/glass/primitives";

export function AuthScreens({ E, ctx }: ScreenProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState(E.authEmail);
  const [password, setPassword] = useState("");
  const mode = E.authMode;

  const valid = email.includes("@") && password.length >= 6;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={ctx.s.safe}>
      <ScrollView contentContainerStyle={ctx.s.auth} keyboardShouldPersistTaps="handled">
        <View style={ctx.s.mark}><ShieldCheck color={ctx.T.mint} size={17} /></View>

        {mode === "welcome" && (
          <>
            <Text style={[ctx.s.h1, { marginTop: 20, textAlign: "center" }]}>Your money,{"\n"}seen through glass.</Text>
            <Text style={[ctx.s.sub, { textAlign: "center", marginBottom: 24, lineHeight: 18 }]}>
              Track spending, dues, investments, goals and bills in one calm, private place.
            </Text>
            <PrimaryButton ctx={ctx} label="Create account" onPress={() => E.setAuthMode("signup")} />
            <Pressable onPress={() => E.setAuthMode("login")}>
              <Text style={ctx.s.authLink}>I already have an account · Sign in</Text>
            </Pressable>
          </>
        )}

        {(mode === "login" || mode === "signup" || mode === "reset") && (
          <>
            <Text style={[ctx.s.h1, { marginTop: 20 }]}>
              {mode === "signup" ? "Create your account." : mode === "reset" ? "Reset your password." : "Welcome back."}
            </Text>
            <Text style={[ctx.s.sub, { lineHeight: 18, marginBottom: 20 }]}>
              {mode === "signup" ? "Three fields, then you're in — no setup steps." : mode === "reset" ? "We'll email you a secure reset link." : "Sign in to view your finances securely."}
            </Text>
            <Glass ctx={ctx} style={{ padding: 17 }}>
              {mode === "signup" && (
                <Field ctx={ctx} value={name} onChangeText={setName} placeholder="Name" />
              )}
              <Field ctx={ctx} value={email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" />
              {mode !== "reset" && <Field ctx={ctx} value={password} onChangeText={setPassword} placeholder="Password" secure />}
              {mode === "reset" ? (
                <PrimaryButton ctx={ctx} loading={E.authBusy} label="Send reset link" onPress={() => E.resetPassword(email)} />
              ) : (
                <PrimaryButton
                  ctx={ctx}
                  loading={E.authBusy}
                  disabled={mode === "signup" ? !(valid && name.trim()) : !valid}
                  label={mode === "signup" ? "Create Account" : "Sign in"}
                  onPress={() => {
                    if (!valid) return;
                    if (mode === "signup") E.signUp({ fullName: name.trim(), email: email.trim(), phone: "" }, password);
                    else E.signIn(email.trim(), password);
                  }}
                />
              )}
              {mode === "login" && (
                <>
                  <Pressable onPress={() => E.setAuthMode("reset")}><Text style={[ctx.s.authLink, { marginTop: 12 }]}>Forgot password?</Text></Pressable>
                  <Pressable onPress={() => E.setAuthMode("signup")}><Text style={ctx.s.authLink}>New here? Create an account</Text></Pressable>
                </>
              )}
              {mode === "signup" && <Pressable onPress={() => E.setAuthMode("login")}><Text style={ctx.s.authLink}>Already have an account? Sign in</Text></Pressable>}
              {mode === "reset" && <Pressable onPress={() => E.setAuthMode("login")}><Text style={ctx.s.authLink}>Back to sign in</Text></Pressable>}
            </Glass>
            <Text style={ctx.s.help}>
              {E.cloud
                ? "Passwords are handled by Supabase Authentication — never stored in the app database. Your data is protected by Row Level Security."
                : "This build runs offline with local sample data. Add Supabase keys to .env.local for real cloud accounts."}
            </Text>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
