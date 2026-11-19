// ============================================================
// FINANCE COPILOT — Personal Finance Manager (Expo SDK 51)
// Liquid Glass UI · custom SQL authentication + Supabase Postgres
// 5 tabs: Spend · Due · Invest · Goal · Bill  (+ Quick Add FAB)
// Full supporting screen set per tab + system screens.
// ============================================================
import React, { useEffect, useMemo, useState } from "react";
import { BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, Text, TextInput, View } from "react-native";
import { Modal } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeftRight, Bell, ChevronLeft, CircleHelp, CreditCard, FileText, HandCoins,
  Plus, Search, Settings, Sparkles, Tags, Target, TrendingUp, Wallet, X,
} from "lucide-react-native";
import { Chips, Ctx } from "./src/components/glass/primitives";
import { makeGlassStyles, themes } from "./src/theme/glass";
import { formatCurrency } from "./src/lib/format";
import { useAppEngine, Engine } from "./src/lib/engine";
import { AccountsScreen, AddTransactionScreen, CategoriesScreen, ProviderSetupScreen, SpendTab, TransactionDetailScreen, TransactionsScreen } from "./src/screens/spend/SpendScreens";
import { DueDetailScreen, DueTab, AddDueScreen } from "./src/screens/due/DueScreens";
import { AddInvestmentScreen, InvestTab, InvestmentDetailScreen, PortfolioBreakdownScreen } from "./src/screens/invest/InvestScreens";
import { AddGoalScreen, GoalConflictScreen, GoalDetailScreen, GoalPriorityScreen, GoalScenarioScreen, GoalTab } from "./src/screens/goal/GoalScreens";
import { AddBillScreen, BillDetailScreen, BillTab } from "./src/screens/bill/BillScreens";
import { BudgetsScreen, DataScreen, ExchangeRatesScreen, HelpScreen, NotificationsScreen, ReportsScreen, SearchScreen, SettingsScreen, SubscriptionScreen } from "./src/screens/system/SystemScreens";

const iso = (offsetDays = 0) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return d.toISOString().slice(0, 10); };
const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const TABS = [
  { name: "Spend", icon: Wallet },
  { name: "Due", icon: HandCoins },
  { name: "Invest", icon: TrendingUp },
  { name: "Goal", icon: Target },
  { name: "Bill", icon: CreditCard },
] as const;

const MORE_ITEMS = [
  { title: "Accounts", desc: "Balances and payment sources", icon: Wallet, tab: "Spend" },
  { title: "Transactions", desc: "Search and review activity", icon: ArrowLeftRight, tab: "Spend" },
  { title: "Categories", desc: "Where your spending goes", icon: Tags, tab: "Spend" },
  { title: "Spending pace", desc: "Income and spending this month", icon: FileText, tab: "Spend" },
  { title: "Reports", desc: "Income and spending insights", icon: TrendingUp, tab: "Spend" },
  { title: "Portfolio breakdown", desc: "Allocation by asset class", icon: Search, tab: "Invest" },
  { title: "Goal conflict analysis", desc: "⭐ Shortfall & prioritization", icon: Sparkles, tab: "Goal" },
  { title: "Goal scenario", desc: "What-if simulator", icon: TrendingUp, tab: "Goal" },
  { title: "Notifications", desc: "Alerts and reminders", icon: Bell, tab: "" },
  { title: "Search", desc: "Find anything across tabs", icon: Search, tab: "" },
  { title: "Export data", desc: "Download a JSON backup", icon: FileText, tab: "" },
  { title: "Subscription", desc: "Plans, purchase and billing", icon: CreditCard, tab: "" },
  { title: "Settings", desc: "Profile, theme, currency", icon: Settings, tab: "" },
  { title: "Help & support", desc: "How the app thinks", icon: CircleHelp, tab: "" },
];

export default function App() {
  const E = useAppEngine();

  const ctx: Ctx = useMemo(() => {
    const T = themes[E.themeName];
    return { s: makeGlassStyles(T), T, money: (n: number, currency?: string) => formatCurrency(n, currency || E.currency), iso, fmtDate };
  }, [E.themeName, E.currency]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (E.moreOpen) { E.setMoreOpen(false); return true; }
      if (E.quickOpen) { E.setQuickOpen(false); return true; }
      if (E.subpage) { E.goBack(); return true; }
      if (E.tab !== "Spend") { E.setTab("Spend"); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [E.moreOpen, E.quickOpen, E.subpage, E.tab, E.goBack, E.setTab, E.setMoreOpen, E.setQuickOpen]);

  if (!E.profileLoaded) {
    return (
      <SafeAreaProvider><SafeAreaView style={ctx.s.safe} edges={["top", "left", "right"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Sparkles size={26} color={ctx.T.mint} /><Text style={[ctx.s.sub, { marginTop: 12 }]}>Loading your workspace…</Text>
        </View>
      </SafeAreaView></SafeAreaProvider>
    );
  }

  if (!E.profile?.fullName) return <AuthGate E={E} ctx={ctx} />;

  const props = { E, ctx };
  const sub = E.subpage;

  const renderTab = () => {
    switch (E.tab) {
      case "Spend": return <SpendTab {...props} />;
      case "Due": return <DueTab {...props} />;
      case "Invest": return <InvestTab {...props} />;
      case "Goal": return <GoalTab {...props} />;
      case "Bill": return <BillTab {...props} />;
    }
  };

  const renderSub = () => {
    switch (sub) {
      // ---- Spend support ----
      case "Transactions": return <TransactionsScreen {...props} />;
      case "Transaction detail": return <TransactionDetailScreen {...props} />;
      case "Add transaction": return <AddTransactionScreen {...props} />;
      case "Accounts": return <AccountsScreen {...props} />;
      case "Provider setup": return <ProviderSetupScreen {...props} />;
      case "Categories": return <CategoriesScreen {...props} />;
      // ---- Due support ----
      case "Add due": return <AddDueScreen {...props} />;
      case "Due detail": return <DueDetailScreen {...props} />;
      // ---- Invest support ----
      case "Add investment": return <AddInvestmentScreen {...props} />;
      case "Investment detail": return <InvestmentDetailScreen {...props} />;
      case "Portfolio breakdown": return <PortfolioBreakdownScreen {...props} />;
      // ---- Goal support ----
      case "Add goal": return <AddGoalScreen {...props} />;
      case "Goal detail": return <GoalDetailScreen {...props} />;
      case "Goal conflict analysis": return <GoalConflictScreen {...props} />;
      case "Goal priority": return <GoalPriorityScreen {...props} />;
      case "Goal scenario": return <GoalScenarioScreen {...props} />;
      // ---- Bill support ----
      case "Add bill": return <AddBillScreen {...props} />;
      case "Edit bill": return <AddBillScreen {...props} />;
      case "Bill detail": return <BillDetailScreen {...props} />;
      // ---- System ----
      case "Notifications": return <NotificationsScreen {...props} />;
      case "Search": return <SearchScreen {...props} />;
      case "Settings": return <SettingsScreen {...props} />;
      case "Subscription": return <SubscriptionScreen {...props} />;
      case "Export data": return <DataScreen {...props} />;
      case "Exchange rates": return <ExchangeRatesScreen {...props} />;
      case "Reports": return <ReportsScreen {...props} />;
      case "Spending pace": return <BudgetsScreen {...props} />;
      case "Help & support": return <HelpScreen {...props} />;
      default: return null;
    }
  };

  const openMoreItem = (item: (typeof MORE_ITEMS)[number]) => {
    if (item.tab) E.setTab(item.tab as any);
    E.setSelected(null);
    E.setSubpage(item.title);
    E.setMoreOpen(false);
  };

  const navItems = TABS.map((t) => {
    const active = E.tab === t.name && !sub;
    return (
      <Pressable key={t.name} style={ctx.s.navItem} onPress={() => { E.setTab(t.name as any); E.setSubpage(""); }}>
        <View style={[ctx.s.navIcon, active && ctx.s.activeIcon]}><t.icon size={18} color={active ? ctx.T.mint : ctx.T.faint} /></View>
        <Text style={[ctx.s.navLabel, active && { color: ctx.T.mint }]}>{t.name}</Text>
      </Pressable>
    );
  });

  return (
    <SafeAreaProvider>
      <SafeAreaView style={ctx.s.safe} edges={["top", "left", "right"]}>
        <StatusBar barStyle={ctx.T.name === "dark" ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />
        <View style={ctx.s.bg}>
          {/* vibrant gradient orbs showing through the glass panels */}
          <LinearGradient colors={ctx.T.orbA as any} style={ctx.s.orbA} pointerEvents="none" />
          <LinearGradient colors={ctx.T.orbB as any} style={ctx.s.orbB} pointerEvents="none" />
          <LinearGradient colors={ctx.T.orbC as any} style={ctx.s.orbC} pointerEvents="none" />

          {/* top bar */}
          <View style={ctx.s.top}>
            <View style={ctx.s.mark}><Sparkles size={16} color={ctx.T.mint} /></View>
            <Text style={ctx.s.brand}>Finance <Text style={{ color: ctx.T.muted, fontWeight: "400" }}>Copilot</Text></Text>
            <View style={{ flex: 1 }} />
            <Pressable style={ctx.s.topButton} onPress={() => { E.setTab("Spend"); E.setSubpage("Search"); }}>
              <Search size={19} color={ctx.T.muted} />
            </Pressable>
            <Pressable style={ctx.s.topButton} onPress={() => E.setSubpage("Notifications")}>
              <Bell size={19} color={ctx.T.muted} />
            </Pressable>
            <Pressable style={ctx.s.avatar} onPress={() => E.setMoreOpen(true)}>
              <Text style={{ color: ctx.T.mint, fontWeight: "700", fontSize: 12 }}>{E.profile?.fullName.slice(0, 1).toUpperCase()}</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={ctx.s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {E.offline && <Pressable accessibilityRole="button" accessibilityLabel="Retry finance workspace sync" onPress={() => { void E.refreshCloud(); }} style={[ctx.s.note, { marginBottom: 12, borderColor: ctx.T.gold + "66" }]}>
              <Text style={[ctx.s.title, { color: ctx.T.gold }]}>Offline snapshot · read only</Text>
              <Text style={[ctx.s.meta, { marginTop: 3 }]}>Showing saved data from this device. Reconnect and tap here to sync before editing.</Text>
            </Pressable>}
            {sub ? (
              <>
                <Pressable style={ctx.s.backButton} onPress={E.goBack}>
                  <ChevronLeft size={16} color={ctx.T.mint} />
                  <Text style={ctx.s.link}>Back to {E.backLabel}</Text>
                </Pressable>
                {renderSub()}
              </>
            ) : (
              renderTab()
            )}
            <View style={{ height: 130 }} />
          </ScrollView>

          {!!E.toast && <View pointerEvents="none" style={{ position: "absolute", bottom: 92, left: 20, right: 20, backgroundColor: ctx.T.glassSolid, borderColor: ctx.T.edge, borderWidth: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16 }}>
            <Text style={{ color: ctx.T.text, fontSize: 11, textAlign: "center" }}>{E.toast}</Text>
          </View>}

          {/* Quick Add FAB — accessible from all tabs */}
          <Pressable style={ctx.s.fab} onPress={() => E.setQuickOpen(true)}>
            <LinearGradient colors={ctx.T.fabGrad as any} style={ctx.s.fabGrad}>
              <Plus size={20} color={ctx.T.fabText} />
              <Text style={ctx.s.fabText}>Quick Add</Text>
            </LinearGradient>
          </Pressable>

          {/* bottom navigation — exactly 5 tabs */}
          <View style={ctx.s.navWrap}>
            {Platform.OS === "android" ? (
              <View style={ctx.s.nav}>{navItems}</View>
            ) : (
              <BlurView intensity={60} tint={ctx.T.name as any} style={ctx.s.nav}>{navItems}</BlurView>
            )}
          </View>

          {/* More menu sheet */}
          <Modal visible={E.moreOpen} transparent animationType="fade" onRequestClose={() => E.setMoreOpen(false)}>
            <View style={ctx.s.moreModalRoot}>
              <Pressable style={ctx.s.scrim} onPress={() => E.setMoreOpen(false)} />
              <View style={ctx.s.morePanel}>
                <View style={ctx.s.herotop}>
                  <Text style={ctx.s.modalTitle}>Menu</Text>
                  <Pressable onPress={() => E.setMoreOpen(false)} hitSlop={10}><X size={18} color={ctx.T.muted} /></Pressable>
                </View>
                <Pressable onPress={() => { E.setMoreOpen(false); E.setSubpage("Settings"); }} style={ctx.s.profileCard}>
                  <View style={ctx.s.profileAvatar}><Text style={{ color: ctx.T.mint, fontWeight: "700" }}>{E.profile?.fullName.slice(0, 1).toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={ctx.s.title}>{E.profile?.fullName}</Text>
                    <Text style={ctx.s.meta}>{E.profile?.email}</Text>
                  </View>
                  <Text style={ctx.s.link}>Edit</Text>
                </Pressable>
                <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
                  {MORE_ITEMS.map((item) => (
                    <Pressable key={item.title} style={ctx.s.moreRow} onPress={() => openMoreItem(item)}>
                      <View style={ctx.s.moreIcon}><item.icon size={16} color={ctx.T.blue} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={ctx.s.title}>{item.title}</Text>
                        <Text style={ctx.s.meta}>{item.desc}</Text>
                      </View>
                      <ChevronLeft size={15} color={ctx.T.faint} style={{ transform: [{ rotate: "180deg" }] }} />
                    </Pressable>
                  ))}
                  <Pressable style={ctx.s.moreRow} onPress={() => { E.setMoreOpen(false); E.logout(); }}>
                    <View style={ctx.s.moreIcon}><X size={16} color={ctx.T.coral} /></View>
                    <Text style={{ ...ctx.s.title, color: ctx.T.coral, flex: 1 }}>Sign out</Text>
                  </Pressable>
                </ScrollView>
              </View>
            </View>
          </Modal>

          {/* Quick Add modal */}
          <QuickAddSheet E={E} ctx={ctx} />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ---------------- Quick Add bottom sheet ----------------
function QuickAddSheet({ E, ctx }: { E: Engine; ctx: Ctx }) {
  const [kind, setKind] = useState<string>("Expense");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [extra, setExtra] = useState("");
  const [priority, setPriority] = useState("Important");
  const [sourceId, setSourceId] = useState(E.accounts[0]?.id || "");
  const [destinationId, setDestinationId] = useState(E.accounts.find((a) => a.id !== sourceId)?.id || "");
  const [currency, setCurrency] = useState(E.currency);
  const [receivedAmount, setReceivedAmount] = useState("");
  const sourceAccount = E.accounts.find((account) => account.id === sourceId);
  const destinationAccount = E.accounts.find((account) => account.id === destinationId);
  const accountBasedKind = ["Expense", "Income", "Bill"].includes(kind);
  const amountCurrency = ["Expense", "Income", "Transfer", "Bill"].includes(kind) ? sourceAccount?.currency || E.currency : currency;
  const accountLabel = (account: (typeof E.accounts)[number]) => `${account.name} · ${account.currency} · ${account.id.slice(0, 6)}`;
  const KINDS = ["Expense", "Income", "Transfer", "Due", "Bill", "Goal", "Investment"];
  const CATS = ["Food & Dining", "Transport", "Shopping", "Bills", "Health", "Entertainment"];
  const close = () => { E.setQuickOpen(false); setName(""); setAmount(""); setCurrentValue(""); setExtra(""); };
  const save = () => {
    E.quickAdd({ kind: kind as any, name, amount: Number(amount) || 0, currentValue: Number(currentValue) || undefined, extra, priority: priority as any, accountId: sourceId, toAccountId: destinationId, toAmount: Number(receivedAmount) || undefined, exchangeRate: sourceAccount && destinationAccount && destinationAccount.currency !== sourceAccount.currency && Number(receivedAmount) > 0 ? Number(receivedAmount) / Number(amount) : undefined, currency: amountCurrency });
    close();
  };
  const validAmount = Number.isFinite(Number(amount)) && Number(amount) > 0;
  const transferNeedsReceivedAmount = sourceAccount && destinationAccount && sourceAccount.currency !== destinationAccount.currency;
  const canSave = Boolean(name.trim()) && validAmount
    && !(accountBasedKind && !sourceAccount)
    && (kind !== "Transfer" || Boolean(sourceAccount && destinationAccount && sourceAccount.id !== destinationAccount.id
      && (!transferNeedsReceivedAmount || (Number.isFinite(Number(receivedAmount)) && Number(receivedAmount) > 0))));
  const body = (
    <>
      <View style={ctx.s.modalHandle} />
      <View style={ctx.s.herotop}>
        <View>
          <Text style={ctx.s.modalTitle}>Quick add</Text>
          <Text style={ctx.s.meta}>Capture it while it's on your mind</Text>
        </View>
        <Pressable onPress={close} hitSlop={10}><X color={ctx.T.muted} size={18} /></Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={ctx.s.kindGrid}>
          {KINDS.map((k) => (
          <Pressable key={k} onPress={() => { setKind(k); setExtra(""); setCurrency(E.currency); setReceivedAmount(""); }} style={[ctx.s.kindTile, kind === k && ctx.s.kindActive]}>
              <Text style={{ color: kind === k ? ctx.T.mint : ctx.T.muted, fontSize: 9, fontWeight: "600" }}>{k}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput value={name} onChangeText={setName}
          placeholder={kind === "Due" ? "Person or loan name" : kind === "Bill" ? "Bill name (e.g. Rent)" : kind === "Goal" ? "Goal name" : kind === "Investment" ? "Asset name" : "What was it for?"}
          placeholderTextColor={ctx.T.faint} style={ctx.s.input} />
        <View style={ctx.s.amountBox}>
          <Text style={{ color: ctx.T.muted, fontSize: 13, fontWeight: "700" }}>{amountCurrency}</Text>
          <TextInput value={amount} onChangeText={setAmount} placeholder="0" keyboardType="decimal-pad" placeholderTextColor={ctx.T.faint} style={ctx.s.amountInput} />
        </View>
        {accountBasedKind && <>
          <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Account</Text>
          {!!E.accounts.length
            ? <Chips ctx={ctx} options={E.accounts.map(accountLabel)} value={sourceAccount ? accountLabel(sourceAccount) : ""} onChange={(label) => { const account = E.accounts.find((item) => accountLabel(item) === label); setSourceId(account?.id || ""); if (account?.id === destinationId) setDestinationId(E.accounts.find((item) => item.id !== account.id)?.id || ""); }} />
            : <Text style={ctx.s.meta}>Add an account before saving this item.</Text>}
        </>}
        {!accountBasedKind && <TextInput accessibilityLabel="Currency code" value={currency} onChangeText={(value) => setCurrency(value.toUpperCase().slice(0, 3))} autoCapitalize="characters" maxLength={3} placeholder="Currency code, e.g. USD" placeholderTextColor={ctx.T.faint} style={ctx.s.input} />}
        {kind === "Investment" && <TextInput value={currentValue} onChangeText={setCurrentValue} placeholder="Current value (optional)" keyboardType="decimal-pad" placeholderTextColor={ctx.T.faint} style={ctx.s.input} />}
        {kind === "Due" && (
          <View style={ctx.s.kindGrid}>
            {["I owe", "Owed to me"].map((x) => (
              <Pressable key={x} onPress={() => setExtra(x)} style={[ctx.s.kindTile, extra === x && ctx.s.kindActive]}><Text style={ctx.s.meta}>{x}</Text></Pressable>
            ))}
          </View>
        )}
        {(kind === "Expense" || kind === "Income") && (
          <View style={ctx.s.kindGrid}>
            {CATS.map((c) => (
              <Pressable key={c} onPress={() => setExtra(c)} style={[ctx.s.kindTile, extra === c && ctx.s.kindActive]}><Text style={ctx.s.meta}>{c}</Text></Pressable>
            ))}
          </View>
        )}
        {kind === "Bill" && (
          <View style={ctx.s.kindGrid}>
            {["Weekly", "Monthly", "Quarterly", "Yearly"].map((f) => (
              <Pressable key={f} onPress={() => setExtra(f)} style={[ctx.s.kindTile, extra === f && ctx.s.kindActive]}><Text style={ctx.s.meta}>{f}</Text></Pressable>
            ))}
          </View>
        )}
        {kind === "Investment" && (
          <View style={ctx.s.kindGrid}>
            {["Mutual fund", "Stocks", "Gold", "FD"].map((a) => (
              <Pressable key={a} onPress={() => setExtra(a)} style={[ctx.s.kindTile, extra === a && ctx.s.kindActive]}><Text style={ctx.s.meta}>{a}</Text></Pressable>
            ))}
          </View>
        )}
        {kind === "Goal" && (
          <View style={ctx.s.kindGrid}>
            {["Essential", "Important", "Flexible"].map((p) => (
              <Pressable key={p} onPress={() => setPriority(p)} style={[ctx.s.kindTile, priority === p && ctx.s.kindActive]}><Text style={ctx.s.meta}>{p}</Text></Pressable>
            ))}
          </View>
        )}
        {kind === "Transfer" && <>
          <Text style={ctx.s.meta}>From account</Text>
          <Chips ctx={ctx} options={E.accounts.map(accountLabel)} value={sourceAccount ? accountLabel(sourceAccount) : ""} onChange={(label) => { const id = E.accounts.find((a) => accountLabel(a) === label)?.id || ""; setSourceId(id); if (destinationId === id) setDestinationId(E.accounts.find((a) => a.id !== id)?.id || ""); }} />
          <Text style={ctx.s.meta}>To account</Text>
          <Chips ctx={ctx} options={E.accounts.filter((a) => a.id !== sourceId).map(accountLabel)} value={destinationAccount ? accountLabel(destinationAccount) : ""} onChange={(label) => setDestinationId(E.accounts.find((a) => a.id !== sourceId && accountLabel(a) === label)?.id || "")} />
          {sourceAccount && destinationAccount && sourceAccount.currency !== destinationAccount.currency && <>
            <View style={ctx.s.amountBox}><Text style={{ color: ctx.T.muted, fontSize: 13, fontWeight: "700" }}>{destinationAccount.currency}</Text><TextInput value={receivedAmount} onChangeText={setReceivedAmount} placeholder="Amount received" keyboardType="decimal-pad" placeholderTextColor={ctx.T.faint} style={ctx.s.amountInput} /></View>
            {!!Number(receivedAmount) && !!Number(amount) && <Text style={ctx.s.meta}>Rate: 1 {sourceAccount.currency} = {(Number(receivedAmount) / Number(amount)).toFixed(6)} {destinationAccount.currency}</Text>}
          </>}
        </>}
        {(kind === "Expense" || kind === "Income" || kind === "Transfer") && <Pressable onPress={() => { E.setQuickOpen(false); E.setSubpage("Add transaction"); }} style={{ paddingVertical: 10 }}><Text style={ctx.s.link}>Add date, note, and other details</Text></Pressable>}
        <Pressable accessibilityRole="button" style={[ctx.s.save, !canSave ? { opacity: 0.55 } : null]} disabled={!canSave} onPress={save}>
          <Text style={ctx.s.saveText}>Save {kind.toLowerCase()}</Text>
          <Plus size={16} color={ctx.T.primaryBtnText} />
        </Pressable>
        <View style={{ height: 16 }} />
      </ScrollView>
    </>
  );
  return (
    <Modal visible={E.quickOpen} transparent animationType="slide" onRequestClose={close}>
      <View style={ctx.s.modalRoot}>
        <Pressable style={ctx.s.scrim} onPress={close} />
        {Platform.OS === "android"
          ? <View style={ctx.s.modal}>{body}</View>
          : <BlurView intensity={ctx.T.sheetBlurIntensity} tint={ctx.T.name as any} style={ctx.s.modal}>{body}</BlurView>}
      </View>
    </Modal>
  );
}

function AuthGate({ E, ctx }: { E: Engine; ctx: Ctx }) {
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState(E.authEmail || ""); const [password, setPassword] = useState(""); const [currency, setCurrency] = useState("INR");
  const signup = E.authMode === "signup";
  const resetting = E.authMode === "reset";
  const submit = () => {
    E.setAuthError("");
    E.setAuthInfo("");
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) { E.setAuthError("Enter a valid email address."); return; }
    if (resetting) { void E.resetPassword(normalizedEmail); return; }
    if (signup) {
      const normalizedPhone = phone.trim().replace(/[\s().-]/g, "");
      if (!name.trim()) { E.setAuthError("Enter your name."); return; }
      if (!/^\+?[1-9]\d{6,14}$/.test(normalizedPhone)) { E.setAuthError("Enter a valid phone number."); return; }
      if (password.length < 8) { E.setAuthError("Use a password with at least 8 characters."); return; }
      void E.signUp({ fullName: name.trim(), email: normalizedEmail, phone: phone.trim(), currency }, password);
      return;
    }
    if (!password) { E.setAuthError("Enter your password."); return; }
    void E.signIn(normalizedEmail, password);
  };
  return <SafeAreaProvider><SafeAreaView style={ctx.s.safe}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={[ctx.s.bg, { flexGrow: 1, justifyContent: "center", padding: 24 }]} keyboardShouldPersistTaps="handled">
      <Text style={ctx.s.brand}>Finance Copilot</Text>
      <Text style={[ctx.s.meta, { marginTop: 10, marginBottom: 18 }]}>{signup ? "Create your secure account" : resetting ? "Get a secure password reset link" : "Sign in to your account"}</Text>
      {!E.cloud && <Text style={[ctx.s.help, { marginBottom: 12 }]}>Authentication is unavailable until EXPO_PUBLIC_API_URL is configured for the Supabase backed API.</Text>}
      {signup && <>
        <TextInput value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" returnKeyType="next" placeholder="Full name" placeholderTextColor={ctx.T.faint} style={ctx.s.input} />
        <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" returnKeyType="next" placeholder="Phone number" placeholderTextColor={ctx.T.faint} style={ctx.s.input} />
        <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Preferred currency</Text>
        <Chips ctx={ctx} options={["INR", "USD", "EUR", "GBP", "AED", "SGD", "Other"]} value={["INR", "USD", "EUR", "GBP", "AED", "SGD"].includes(currency) ? currency : "Other"} onChange={(value) => setCurrency(value === "Other" ? "XXX" : value)} />
        {!(["INR", "USD", "EUR", "GBP", "AED", "SGD"].includes(currency)) && <TextInput accessibilityLabel="Other preferred currency code" value={currency} onChangeText={(value) => setCurrency(value.toUpperCase().slice(0, 3))} autoCapitalize="characters" maxLength={3} placeholder="Other currency ISO code" placeholderTextColor={ctx.T.faint} style={ctx.s.input} />}
      </>}
      <TextInput accessibilityLabel="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" placeholder="Email" placeholderTextColor={ctx.T.faint} style={ctx.s.input} />
      {!resetting && <TextInput accessibilityLabel="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={signup ? "new-password" : "current-password"} textContentType={signup ? "newPassword" : "password"} returnKeyType="done" onSubmitEditing={submit} placeholder={signup ? "Password (8 characters minimum)" : "Password"} placeholderTextColor={ctx.T.faint} style={ctx.s.input} />}
      {!!E.authError && <Text accessibilityRole="alert" style={{ color: ctx.T.coral, fontSize: 12, marginTop: 4 }}>{E.authError}</Text>}
      {!!E.authInfo && <Text accessibilityRole="text" style={{ color: ctx.T.mint, fontSize: 12, marginTop: 4 }}>{E.authInfo}</Text>}
      {E.authError.toLowerCase().includes("verify your email") && <Pressable accessibilityRole="button" onPress={() => { void E.resendVerification(email); }} style={{ paddingVertical: 8 }}><Text style={[ctx.s.link, { textAlign: "center" }]}>Send another verification link</Text></Pressable>}
      <Pressable style={[ctx.s.save, { marginTop: 12, opacity: E.authBusy || !E.cloud ? 0.6 : 1 }]} disabled={E.authBusy || !E.cloud} onPress={submit}>
        <Text style={ctx.s.saveText}>{E.authBusy ? "Please wait…" : signup ? "Create account" : resetting ? "Send reset link" : "Sign in"}</Text>
      </Pressable>
      {resetting
        ? <Pressable disabled={E.authBusy} onPress={() => { E.setAuthError(""); E.setAuthInfo(""); E.setAuthMode("login"); }} style={{ paddingVertical: 18 }}><Text style={[ctx.s.link, { textAlign: "center" }]}>Back to sign in</Text></Pressable>
        : <>
          {!signup && <Pressable disabled={E.authBusy} onPress={() => { E.setAuthError(""); E.setAuthInfo(""); E.setAuthMode("reset"); }} style={{ paddingVertical: 8 }}><Text style={[ctx.s.link, { textAlign: "center" }]}>Forgot password?</Text></Pressable>}
          <Pressable disabled={E.authBusy} onPress={() => { E.setAuthError(""); E.setAuthInfo(""); setPassword(""); E.setAuthMode(signup ? "login" : "signup"); }} style={{ paddingVertical: 12 }}>
            <Text style={[ctx.s.link, { textAlign: "center" }]}>{signup ? "Already have an account? Sign in" : "New here? Create an account"}</Text>
          </Pressable>
        </>}
      </ScrollView>
  </KeyboardAvoidingView></SafeAreaView></SafeAreaProvider>;
}
