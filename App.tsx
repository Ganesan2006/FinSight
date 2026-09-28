// ============================================================
// FINANCE COPILOT — Personal Finance Manager (Expo SDK 51)
// Liquid Glass UI · Supabase Auth + Postgres + RLS
// 5 tabs: Spend · Due · Invest · Goal · Bill  (+ Quick Add FAB)
// Full supporting screen set per tab + system screens.
// ============================================================
import React, { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StatusBar, Text, TextInput, View } from "react-native";
import { Modal } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeftRight, Bell, ChevronLeft, CircleHelp, CreditCard, FileText, HandCoins,
  Plus, Search, Settings, Sparkles, Tags, Target, TrendingUp, Wallet, X,
} from "lucide-react-native";
import { Ctx } from "./src/components/glass/primitives";
import { makeGlassStyles, themes } from "./src/theme/glass";
import { formatCurrency } from "./src/lib/format";
import { useAppEngine, Engine } from "./src/lib/engine";
import { AuthScreens } from "./src/screens/AuthScreens";
import { AccountsScreen, AddTransactionScreen, CategoriesScreen, SpendTab, TransactionDetailScreen, TransactionsScreen } from "./src/screens/spend/SpendScreens";
import { DueDetailScreen, DueTab, AddDueScreen } from "./src/screens/due/DueScreens";
import { AddInvestmentScreen, InvestTab, InvestmentDetailScreen, PortfolioBreakdownScreen } from "./src/screens/invest/InvestScreens";
import { AddGoalScreen, GoalConflictScreen, GoalDetailScreen, GoalPriorityScreen, GoalScenarioScreen, GoalTab } from "./src/screens/goal/GoalScreens";
import { AddBillScreen, BillDetailScreen, BillTab } from "./src/screens/bill/BillScreens";
import { BudgetsScreen, DataScreen, HelpScreen, NotificationsScreen, ReportsScreen, SearchScreen, SettingsScreen } from "./src/screens/system/SystemScreens";

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
  { title: "Add transaction", desc: "Expense, income or transfer", icon: Plus, tab: "Spend" },
  { title: "Categories", desc: "Where your spending goes", icon: Tags, tab: "Spend" },
  { title: "Budgets", desc: "Monthly limits and progress", icon: FileText, tab: "Spend" },
  { title: "Reports", desc: "Income and spending insights", icon: TrendingUp, tab: "Spend" },
  { title: "Add due", desc: "Money owed between people", icon: HandCoins, tab: "Due" },
  { title: "Add investment", desc: "Stocks, MF, gold, FD", icon: TrendingUp, tab: "Invest" },
  { title: "Portfolio breakdown", desc: "Allocation by asset class", icon: Search, tab: "Invest" },
  { title: "Add goal", desc: "A target with a deadline", icon: Target, tab: "Goal" },
  { title: "Goal conflict analysis", desc: "⭐ Shortfall & prioritization", icon: Sparkles, tab: "Goal" },
  { title: "Goal scenario", desc: "What-if simulator", icon: TrendingUp, tab: "Goal" },
  { title: "Add bill", desc: "Recurring scheduled payment", icon: CreditCard, tab: "Bill" },
  { title: "Notifications", desc: "Alerts and reminders", icon: Bell, tab: "" },
  { title: "Search", desc: "Find anything across tabs", icon: Search, tab: "" },
  { title: "Export / import data", desc: "JSON backup and restore", icon: FileText, tab: "" },
  { title: "Settings", desc: "Profile, theme, currency", icon: Settings, tab: "" },
  { title: "Help & support", desc: "How the app thinks", icon: CircleHelp, tab: "" },
];

export default function App() {
  const E = useAppEngine();

  const ctx: Ctx = useMemo(() => {
    const T = themes[E.themeName];
    return { s: makeGlassStyles(T), T, money: (n: number) => formatCurrency(n, E.currency), iso, fmtDate };
  }, [E.themeName, E.currency]);

  if (!E.profileLoaded) {
    return (
      <SafeAreaProvider><SafeAreaView style={ctx.s.safe} edges={["top", "left", "right"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Sparkles size={26} color={ctx.T.mint} /><Text style={[ctx.s.sub, { marginTop: 12 }]}>Loading your workspace…</Text>
        </View>
      </SafeAreaView></SafeAreaProvider>
    );
  }

  const onAuthFlow = !E.profile || ["welcome", "login", "signup", "reset"].includes(E.authMode);
  if (onAuthFlow) {
    return (
      <SafeAreaProvider><SafeAreaView style={ctx.s.safe} edges={["top", "left", "right", "bottom"]}>
        <StatusBar barStyle={ctx.T.name === "dark" ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />
        <View style={ctx.s.bg}>
          <LinearGradient colors={ctx.T.orbA as any} style={ctx.s.orbA} />
          <LinearGradient colors={ctx.T.orbB as any} style={ctx.s.orbB} />
          <LinearGradient colors={ctx.T.orbC as any} style={ctx.s.orbC} />
          <AuthScreens E={E} ctx={ctx} />
        </View>
      </SafeAreaView></SafeAreaProvider>
    );
  }

  const props = { E, ctx };
  const sub = E.subpage;
  const unread = E.notifications.filter((n) => !n.read).length;

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
      case "Export / import data": return <DataScreen {...props} />;
      case "Reports": return <ReportsScreen {...props} />;
      case "Budgets": return <BudgetsScreen {...props} />;
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
              <Bell size={19} color={unread ? ctx.T.mint : ctx.T.muted} />
              {unread > 0 && <View style={{ position: "absolute", top: 6, right: 6, width: 7, height: 7, borderRadius: 4, backgroundColor: ctx.T.coral }} />}
            </Pressable>
            <Pressable style={ctx.s.avatar} onPress={() => E.setMoreOpen(true)}>
              <Text style={{ color: ctx.T.mint, fontWeight: "700", fontSize: 12 }}>{(E.profile?.fullName || "F").slice(0, 1).toUpperCase()}</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={ctx.s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {sub ? (
              <>
                <Pressable style={ctx.s.backButton} onPress={() => E.setSubpage("")}>
                  <ChevronLeft size={16} color={ctx.T.mint} />
                  <Text style={ctx.s.link}>Back to {E.tab}</Text>
                </Pressable>
                {renderSub()}
              </>
            ) : (
              renderTab()
            )}
            <View style={{ height: 130 }} />
          </ScrollView>

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
                  <View style={ctx.s.profileAvatar}><Text style={{ color: ctx.T.mint, fontWeight: "700" }}>{(E.profile?.fullName || "F").slice(0, 1).toUpperCase()}</Text></View>
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
  const [extra, setExtra] = useState("");
  const [priority, setPriority] = useState("Important");
  const KINDS = ["Expense", "Income", "Transfer", "Due", "Bill", "Goal", "Investment"];
  const CATS = ["Food & Dining", "Transport", "Shopping", "Bills", "Health", "Entertainment"];
  const close = () => { E.setQuickOpen(false); setName(""); setAmount(""); setExtra(""); };
  const save = () => {
    E.quickAdd({ kind: kind as any, name, amount: Number(amount) || 0, extra, priority: priority as any });
    close();
  };
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
            <Pressable key={k} onPress={() => { setKind(k); setExtra(""); }} style={[ctx.s.kindTile, kind === k && ctx.s.kindActive]}>
              <Text style={{ color: kind === k ? ctx.T.mint : ctx.T.muted, fontSize: 9, fontWeight: "600" }}>{k}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput value={name} onChangeText={setName}
          placeholder={kind === "Due" ? "Person or loan name" : kind === "Bill" ? "Bill name (e.g. Rent)" : kind === "Goal" ? "Goal name" : kind === "Investment" ? "Asset name" : "What was it for?"}
          placeholderTextColor={ctx.T.faint} style={ctx.s.input} />
        <View style={ctx.s.amountBox}>
          <Text style={{ color: ctx.T.muted, fontSize: 19 }}>₹</Text>
          <TextInput value={amount} onChangeText={setAmount} placeholder="0" keyboardType="decimal-pad" placeholderTextColor={ctx.T.faint} style={ctx.s.amountInput} />
        </View>
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
        {kind === "Transfer" && <TextInput value={extra} onChangeText={setExtra} placeholder="From → to account (optional)" placeholderTextColor={ctx.T.faint} style={ctx.s.input} />}
        <Pressable style={ctx.s.save} onPress={save}>
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
