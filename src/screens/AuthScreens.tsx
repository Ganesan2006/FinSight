// ============================================================
// AUTH & ONBOARDING — Welcome · Login · Register · Forgot password
// Complete profile · Initial financial setup (currency, first
// account, monthly income)
// ============================================================
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ShieldCheck, Sparkles, Wallet } from "lucide-react-native";
import { ScreenProps } from "../screens/types";
import { AmountField, Bar, Chips, Field, Glass, PrimaryButton } from "../components/glass/primitives";

export function AuthScreens({ E, ctx }: ScreenProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(E.authEmail);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const mode = E.authMode;

  const valid = email.includes("@") && password.length >= 6;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={ctx.s.safe}>
      <ScrollView contentContainerStyle={ctx.s.auth} keyboardShouldPersistTaps="handled">
        <View style={ctx.s.mark}><Sparkles color={ctx.T.mint} size={17} /></View>

        {mode === "welcome" && (
          <>
            <Text style={[ctx.s.h1, { marginTop: 20, textAlign: "center" }]}>Your money,{"\n"}seen through glass.</Text>
            <Text style={[ctx.s.sub, { textAlign: "center", marginBottom: 24, lineHeight: 18 }]}>
              Track spending, dues, investments, goals and bills in one calm, private place.
            </Text>
            <Glass ctx={ctx} style={{ padding: 18, width: "100%", gap: 10 }}>
              {[["Spend", "Every rupee, every account"], ["Due", "Money owed both ways"], ["Invest", "Portfolio at a glance"], ["Goal", "Conflict-aware savings plan"], ["Bill", "Never miss a payment"]].map(([t, d]) => (
                <View key={t} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={ctx.s.rowIcon}><Text style={{ color: ctx.T.mint, fontWeight: "800", fontSize: 10 }}>{t.slice(0, 1)}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={ctx.s.title}>{t}</Text>
                    <Text style={ctx.s.meta}>{d}</Text>
                  </View>
                </View>
              ))}
            </Glass>
            <PrimaryButton ctx={ctx} label="Get started" onPress={() => E.setAuthMode("signup")} />
            <Pressable onPress={() => E.setAuthMode("login")}>
              <Text style={ctx.s.authLink}>I already have an account</Text>
            </Pressable>
          </>
        )}

        {(mode === "login" || mode === "signup" || mode === "reset" || mode === "complete") && (
          <>
            <Text style={[ctx.s.h1, { marginTop: 20 }]}>{mode === "signup" ? "Create your account." : mode === "complete" ? "Finish your profile." : mode === "reset" ? "Reset your password." : "Welcome back."}</Text>
            <Text style={[ctx.s.sub, { lineHeight: 18, marginBottom: 20 }]}>
              {mode === "signup" ? "Set up your secure finance space." : mode === "complete" ? "Add the details missing from your saved account." : mode === "reset" ? "We'll email you a secure reset link." : "Sign in to view your finances securely."}
            </Text>
            <Glass ctx={ctx} style={{ padding: 17 }}>
              <Text style={ctx.s.title}>{mode === "signup" ? "Your details" : mode === "complete" ? "Profile details" : mode === "reset" ? "Your email" : "Sign in"}</Text>
              {(mode === "signup" || mode === "complete") && (
                <>
                  <Field ctx={ctx} value={name} onChangeText={setName} placeholder="Full name" />
                  <Field ctx={ctx} value={phone} onChangeText={setPhone} placeholder="Phone number" keyboardType="phone-pad" />
                </>
              )}
              <Field ctx={ctx} value={email} onChangeText={setEmail} placeholder="Email address" keyboardType="email-address" />
              {(mode === "login" || mode === "signup") && <Field ctx={ctx} value={password} onChangeText={setPassword} placeholder="Password" secure />}
              {mode === "signup" && <Field ctx={ctx} value={confirm} onChangeText={setConfirm} placeholder="Confirm password" secure />}
              {mode === "reset" ? (
                <PrimaryButton ctx={ctx} loading={E.authBusy} label="Send reset link" onPress={() => E.resetPassword(email)} />
              ) : (
                <PrimaryButton
                  ctx={ctx}
                  loading={E.authBusy}
                  label={mode === "signup" ? "Create account" : mode === "complete" ? "Save profile" : "Sign in"}
                  onPress={() => {
                    if (mode === "signup") {
                      if (!valid || password !== confirm) return;
                      E.signUp({ fullName: name.trim(), email: email.trim(), phone: phone.trim() }, password);
                    } else if (mode === "complete") {
                      E.completeProfile({ fullName: name.trim(), email: email.trim(), phone: phone.trim() });
                    } else E.signIn(email.trim(), password);
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
              {mode === "complete" ? "These details are saved to the profile row for your signed-in Supabase account." : E.cloud ? "Your password is handled by Supabase Authentication and is never stored in the app database." : "This build runs offline with local sample data. Add Supabase keys to .env.local for secure cloud accounts."}
            </Text>
          </>
        )}

        {mode === "onboarding" && <Onboarding E={E} ctx={ctx} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------- Initial setup / onboarding wizard ----------------
function Onboarding({ E, ctx }: ScreenProps) {
  const [step, setStep] = useState(0);
  const [currency, setCurrency] = useState("INR");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState("Bank");
  const [balance, setBalance] = useState("");
  const [income, setIncome] = useState("");

  const steps = ["Personal profile", "Choose currency", "Add first account", "Monthly income"];
  const symbol = { INR: "₹", USD: "$", EUR: "€", GBP: "£", AED: "د.إ" }[currency] || "₹";

  const finish = () => {
    E.finishOnboarding({
      currency,
      accountName: accountName.trim() || "Main account",
      accountType: accountType.toLowerCase(),
      openingBalance: Number(balance) || 0,
      monthlyIncome: Number(income) || 0,
    });
    E.setTab("Spend");
  };

  return (
    <View style={{ width: "100%" }}>
      <Text style={ctx.s.eyebrow}>INITIAL SETUP · STEP {step + 1} OF 4</Text>
      <Text style={[ctx.s.h1, { marginBottom: 6 }]}>{steps[step]}</Text>
      <Bar value={(step + 1) / 4 * 100} ctx={ctx} color={ctx.T.violet} />
      <Glass ctx={ctx} style={{ marginVertical: 16 }}>
        {step === 0 && (
          <>
            <View style={ctx.s.profileCard}>
              <View style={ctx.s.profileAvatar}><Wallet size={19} color={ctx.T.mint} /></View>
              <View style={{ flex: 1 }}>
                <Text style={ctx.s.title}>{E.profile?.fullName || "Welcome!"}</Text>
                <Text style={ctx.s.meta}>Let's tailor Finance Copilot to you.</Text>
              </View>
            </View>
            <Text style={ctx.s.help}>We use your name for greetings and your email only for account recovery.</Text>
          </>
        )}
        {step === 1 && (
          <>
            <Chips ctx={ctx} options={["INR", "USD", "EUR", "GBP", "AED"]} value={currency} onChange={setCurrency} />
            <Text style={ctx.s.help}>You can change this later in Settings → Currency.</Text>
          </>
        )}
        {step === 2 && (
          <>
            <Field ctx={ctx} value={accountName} onChangeText={setAccountName} placeholder="e.g. HDFC Bank" />
            <Chips ctx={ctx} options={["Bank", "Cash", "Credit"]} value={accountType} onChange={setAccountType} />
            <AmountField ctx={ctx} symbol={symbol} value={balance} onChangeText={setBalance} />
            <Text style={ctx.s.help}>Enter your current available balance so totals start accurate.</Text>
          </>
        )}
        {step === 3 && (
          <>
            <AmountField ctx={ctx} symbol={symbol} value={income} onChangeText={setIncome} />
            <Text style={ctx.s.help}>Used to compute Budget Remaining and Goal Conflict Analysis.</Text>
          </>
        )}
      </Glass>
      <PrimaryButton ctx={ctx} label={step === 3 ? "Finish setup" : "Continue"} onPress={() => (step === 3 ? finish() : setStep(step + 1))} />
      {step > 0 && (
        <Pressable onPress={() => setStep(step - 1)}>
          <Text style={ctx.s.authLink}>Back</Text>
        </Pressable>
      )}
      <LinearGradient colors={["transparent", ctx.T.orbB[0]] as any} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={{ height: 2, borderRadius: 2, marginTop: 18 }} />
      <View style={ctx.s.securityNote}>
        <ShieldCheck size={15} color={ctx.T.mint} />
        <Text style={ctx.s.meta}>Everything stays between you and your own database.</Text>
      </View>
    </View>
  );
}
