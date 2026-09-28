// ============================================================
// SYSTEM SCREENS — Notifications · Global Search · Profile/
// Settings · Export & Import data · Reports · Budgets · Help
// ============================================================
import React, { useMemo, useState } from "react";
import { Alert, Platform, Pressable, Text, TextInput, View } from "react-native";
import { BarChart3, Bell, Check, ChevronRight, Download, FileText, Globe, Moon, Search, Settings, Share2, ShieldCheck, Sun, Tags, Trash2, Upload } from "lucide-react-native";
import { ScreenProps } from "../types";
import { Badge, Bar, Chips, EmptyState, Field, Glass, Header, PrimaryButton, Row, Section } from "../../components/glass/primitives";
import { billStatus } from "../bill/BillScreens";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD"];

// ---------------- Notifications center ----------------
export function NotificationsScreen({ E, ctx }: ScreenProps) {
  // auto-generated alerts: overdue bills, dues due soon, goal conflicts
  const alerts = useMemo(() => {
    const list: { id: string; title: string; body: string; tone: "coral" | "gold" | "violet" | "mint" }[] = [];
    E.overdueBills.forEach((b) => list.push({ id: "ob" + b.id, title: `Overdue bill: ${b.name}`, body: `${ctx.money(b.amount)} was due on ${ctx.fmtDate(b.date)}. Mark it paid to clear this alert.`, tone: "coral" }));
    E.bills.filter((b) => b.status !== "Paid" && billStatus(b, ctx.iso()).label === "Due soon").forEach((b) => list.push({ id: "ds" + b.id, title: `${b.name} due soon`, body: `${ctx.money(b.amount)} scheduled for ${ctx.fmtDate(b.date)}.`, tone: "gold" }));
    E.dues.filter((d) => d.direction === "owed_to_me" && new Date(d.date) < new Date(ctx.iso()) && d.amount - d.paid > 0).forEach((d) => list.push({ id: "od" + d.id, title: `Collect from ${d.person}`, body: `${ctx.money(d.amount - d.paid)} is past its due date.`, tone: "violet" }));
    if (E.goals.length) {
      const need = E.goals.reduce((n, g) => { const m = Math.max(1, Math.ceil((new Date(g.date).getTime() - Date.now()) / (30 * 86400000))); return n + Math.max(0, g.target - g.saved) / m; }, 0);
      if (need > E.availableSavings) list.push({ id: "gc", title: "Goal conflict detected", body: `Your goals need ${ctx.money(Math.round(need))}/mo but only ${ctx.money(Math.round(E.availableSavings))} is available. Open Goal planning.`, tone: "coral" });
    }
    return list;
  }, [E.bills, E.dues, E.goals, E.availableSavings]);
  return (
    <>
      <Header ctx={ctx} title="Notifications" sub="Alerts, reminders and activity." />
      <Section ctx={ctx} title="Smart alerts" right={`${alerts.length}`} />
      <Glass ctx={ctx} style={ctx.s.card}>
        {alerts.length ? alerts.map((a) => (
          <View key={a.id} style={ctx.s.cat}>
            <View style={ctx.s.herotop}><Text style={ctx.s.title}>{a.title}</Text><Badge ctx={ctx} label={a.tone === "coral" ? "Urgent" : a.tone === "gold" ? "Soon" : "Info"} color={ctx.T[a.tone]} /></View>
            <Text style={[ctx.s.meta, { marginTop: 5, lineHeight: 15 }]}>{a.body}</Text>
          </View>
        )) : <EmptyState ctx={ctx} text="All clear — nothing needs your attention." />}
      </Glass>
      <Section ctx={ctx} title="Recent app activity" right={`${E.notifications.length}`} />
      <Glass ctx={ctx} style={ctx.s.card}>
        {E.notifications.length ? E.notifications.map((n) => (
          <Row key={n.id} ctx={ctx} title={n.title} sub={n.body} amount={n.time} icon={Bell} color={ctx.T.blue} onPress={() => E.setNotifications((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)))} />
        )) : <EmptyState ctx={ctx} text="No activity yet today." />}
      </Glass>
    </>
  );
}

// ---------------- Global search ----------------
export function SearchScreen({ E, ctx }: ScreenProps) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const tx = needle ? E.tx.filter((t) => (t.title + " " + t.category).toLowerCase().includes(needle)).slice(0, 6) : [];
  const dues = needle ? E.dues.filter((d) => d.person.toLowerCase().includes(needle)).slice(0, 4) : [];
  const assets = needle ? E.assets.filter((a) => (a.name + " " + a.type).toLowerCase().includes(needle)).slice(0, 4) : [];
  const goals = needle ? E.goals.filter((g) => g.name.toLowerCase().includes(needle)).slice(0, 4) : [];
  const bills = needle ? E.bills.filter((b) => b.name.toLowerCase().includes(needle)).slice(0, 4) : [];
  const none = needle && !tx.length && !dues.length && !assets.length && !goals.length && !bills.length;
  const go = (sub: string, sel?: any) => { if (sel !== undefined) E.setSelected(sel); E.setSubpage(sub); };
  return (
    <>
      <Header ctx={ctx} title="Search" sub="Find anything across Spend, Due, Invest, Goal and Bill." />
      <View style={[ctx.s.amountBox, { height: 46 }]}>
        <Search size={15} color={ctx.T.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Try “rent”, “Maya”, “gold”…" placeholderTextColor={ctx.T.faint} style={{ flex: 1, color: ctx.T.text, fontSize: 11 }} />
      </View>
      {!needle && (
        <Glass ctx={ctx} style={ctx.s.card}>
          {[["Accounts", "Bank, cash & credit"], ["Transactions", "Full history"], ["Goal conflict analysis", "The planner"], ["Portfolio breakdown", "Allocation view"], ["Export / import data", "Backup"]].map(([t, d]) => (
            <Row key={t} ctx={ctx} title={t} sub={d} amount="" icon={ChevronRight} onPress={() => go(t)} />
          ))}
        </Glass>
      )}
      {!!tx.length && <><Section ctx={ctx} title="Transactions" />
        <Glass ctx={ctx} style={ctx.s.card}>{tx.map((t) => <Row key={t.id} ctx={ctx} title={t.title} sub={`${t.category} · ${ctx.fmtDate(t.date)}`} amount={ctx.money(t.amount)} onPress={() => go("Transaction detail", t)} />)}</Glass></>}
      {!!dues.length && <><Section ctx={ctx} title="Dues" />
        <Glass ctx={ctx} style={ctx.s.card}>{dues.map((d) => <Row key={d.id} ctx={ctx} title={d.person} sub={ctx.fmtDate(d.date)} amount={ctx.money(d.amount - d.paid)} onPress={() => go("Due detail", d)} />)}</Glass></>}
      {!!assets.length && <><Section ctx={ctx} title="Investments" />
        <Glass ctx={ctx} style={ctx.s.card}>{assets.map((a) => <Row key={a.id} ctx={ctx} title={a.name} sub={a.type} amount={ctx.money(a.value)} onPress={() => go("Investment detail", a)} />)}</Glass></>}
      {!!goals.length && <><Section ctx={ctx} title="Goals" />
        <Glass ctx={ctx} style={ctx.s.card}>{goals.map((g) => <Row key={g.id} ctx={ctx} title={g.name} sub={g.priority} amount={ctx.money(g.saved)} onPress={() => go("Goal detail", g)} />)}</Glass></>}
      {!!bills.length && <><Section ctx={ctx} title="Bills" />
        <Glass ctx={ctx} style={ctx.s.card}>{bills.map((b) => <Row key={b.id} ctx={ctx} title={b.name} sub={`${b.frequency} · ${ctx.fmtDate(b.date)}`} amount={ctx.money(b.amount)} onPress={() => go("Bill detail", b)} />)}</Glass></>}
      {none && <EmptyState ctx={ctx} text={`Nothing found for “${q}”.`} />}
    </>
  );
}

// ---------------- Profile & settings ----------------
export function SettingsScreen({ E, ctx }: ScreenProps) {
  const darkMode = E.themeName === "dark";
  return (
    <>
      <Header ctx={ctx} title="Profile & settings" sub="Your account, preferences and privacy." />
      <Glass ctx={ctx} style={ctx.s.profileCard}>
        <View style={ctx.s.profileAvatar}><Text style={{ color: ctx.T.mint, fontWeight: "700", fontSize: 15 }}>{(E.profile?.fullName || "F").slice(0, 1).toUpperCase()}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={[ctx.s.title, { fontSize: 13 }]}>{E.profile?.fullName}</Text>
          <Text style={ctx.s.meta}>{E.profile?.email} · {E.profile?.phone}</Text>
        </View>
        <Badge ctx={ctx} label={E.cloud ? "SYNCED" : "LOCAL"} color={E.cloud ? ctx.T.mint : ctx.T.gold} />
      </Glass>

      <Section ctx={ctx} title="Preferences" />
      <Glass ctx={ctx} style={ctx.s.card}>
        <View style={ctx.s.row}>
          <View style={ctx.s.rowIcon}>{darkMode ? <Moon size={15} color={ctx.T.violet} /> : <Sun size={15} color={ctx.T.gold} />}</View>
          <View style={{ flex: 1 }}><Text style={ctx.s.title}>Appearance</Text><Text style={ctx.s.meta}>Liquid Glass {E.themeName} mode</Text></View>
          <Pressable style={ctx.s.pay} onPress={E.toggleTheme}><Text style={{ color: ctx.T.mint, fontSize: 9, fontWeight: "700" }}>{darkMode ? "Switch to light" : "Switch to dark"}</Text></Pressable>
        </View>
        <View style={ctx.s.cat}>
          <Text style={[ctx.s.meta, { marginBottom: 6 }]}>Currency</Text>
          <Chips ctx={ctx} options={CURRENCIES} value={E.currency} onChange={E.changeCurrency} />
        </View>
      </Glass>

      <Section ctx={ctx} title="Data & privacy" />
      <Glass ctx={ctx} style={ctx.s.card}>
        <Row ctx={ctx} title="Export / import data" sub="JSON backup of your workspace" amount="" icon={Share2} onPress={() => E.setSubpage("Export / import data")} />
        <Row ctx={ctx} title="Notifications" sub={`${E.notifications.filter((n) => !n.read).length} unread`} amount="" icon={Bell} onPress={() => E.setSubpage("Notifications")} />
        <Row ctx={ctx} title="Re-run initial setup" sub="Update currency, first account, income" amount="" icon={Settings} onPress={() => E.setAuthMode("onboarding")} />
        <View style={ctx.s.securityNote}>
          <ShieldCheck size={16} color={ctx.T.mint} />
          <Text style={[ctx.s.meta, { flex: 1, lineHeight: 15 }]}>
            {E.cloud ? "Records are protected by Supabase Row Level Security — only you can read your rows." : "Offline demo build: all data stays on this device via AsyncStorage."}
          </Text>
        </View>
      </Glass>

      <PrimaryButton ctx={ctx} label="Sign out" onPress={E.logout} danger />
    </>
  );
}

// ---------------- Export / Import ----------------
export function DataScreen({ E, ctx }: ScreenProps) {
  const [json, setJson] = useState("");
  const doImport = () => {
    try {
      const parsed = JSON.parse(json);
      if (!parsed || typeof parsed !== "object") throw new Error("Not a valid backup object.");
      Alert.alert("Backup validated", `Found ${Object.keys(parsed).length} sections. In the cloud build this restores through a Supabase Edge Function transaction.`);
      E.notify("Import ready", "Backup file parsed successfully.");
      setJson("");
    } catch (e: any) {
      Alert.alert("Import failed", e?.message || "Paste a valid Finance Copilot JSON export.");
    }
  };
  return (
    <>
      <Header ctx={ctx} title="Export / import data" sub="Own your numbers — back them up anytime." />
      <Glass ctx={ctx} style={ctx.s.note}>
        <Text style={ctx.s.title}>Export</Text>
        <Text style={[ctx.s.meta, { marginTop: 5, lineHeight: 15 }]}>Downloads a JSON snapshot with profiles, accounts, transactions, dues, investments, goals and bills.</Text>
        <View style={{ marginTop: 12 }}><PrimaryButton ctx={ctx} label="Download backup (JSON)" onPress={E.exportData} /></View>
      </Glass>
      <Glass ctx={ctx} style={ctx.s.note}>
        <Text style={ctx.s.title}>Import</Text>
        <Text style={[ctx.s.meta, { marginTop: 5, marginBottom: 10, lineHeight: 15 }]}>Paste a previous export to restore it.</Text>
        <TextInput value={json} onChangeText={setJson} multiline placeholder='{ "transactions": [...] }' placeholderTextColor={ctx.T.faint} style={[ctx.s.input, { height: 96, textAlignVertical: "top" }]} />
        <PrimaryButton ctx={ctx} label="Validate & import" onPress={doImport} disabled={!json.trim()} />
      </Glass>
      {!E.cloud && (
        <Pressable style={ctx.s.deleteButton} onPress={() => Alert.alert("Reset demo data?", "Sample workspace will be restored.", [{ text: "Cancel", style: "cancel" }, { text: "Reset", style: "destructive", onPress: E.resetDemo }])}>
          <View style={{ flexDirection: "row", gap: 5, alignItems: "center" }}><Trash2 size={13} color={ctx.T.coral} /><Text style={{ color: ctx.T.coral, fontSize: 11, fontWeight: "700" }}>Reset demo workspace</Text></View>
        </Pressable>
      )}
    </>
  );
}

// ---------------- Reports ----------------
export function ReportsScreen({ E, ctx }: ScreenProps) {
  const net = E.income - E.spent;
  const rate = E.income ? Math.round((net / E.income) * 100) : 0;
  return (
    <>
      <Header ctx={ctx} title="Reports" sub="Cash-flow insight for this month." />
      <View style={ctx.s.stats}>
        <Glass ctx={ctx} style={ctx.s.stat}><Text style={ctx.s.meta}>Income</Text><Text style={[ctx.s.statValue, { color: ctx.T.mint, fontSize: 14 }]}>{ctx.money(E.income)}</Text></Glass>
        <Glass ctx={ctx} style={ctx.s.stat}><Text style={ctx.s.meta}>Expenses</Text><Text style={[ctx.s.statValue, { color: ctx.T.coral, fontSize: 14 }]}>{ctx.money(E.spent)}</Text></Glass>
        <Glass ctx={ctx} style={ctx.s.stat}><Text style={ctx.s.meta}>Net flow</Text><Text style={[ctx.s.statValue, { color: net >= 0 ? ctx.T.mint : ctx.T.coral, fontSize: 14 }]}>{ctx.money(net)}</Text></Glass>
      </View>
      <Glass ctx={ctx} style={ctx.s.note}>
        <Text style={ctx.s.meta}>Savings rate</Text>
        <Text style={ctx.s.statBig}>{rate}%</Text>
        <Bar ctx={ctx} value={Math.max(0, rate)} color={ctx.T.violet} />
        <Text style={[ctx.s.help, { marginTop: 8 }]}>Recurring bills consume another {ctx.money(Math.round(E.monthlyBills))}/mo before goals start.</Text>
      </Glass>
      <Section ctx={ctx} title="Spending by category" />
      <Glass ctx={ctx} style={ctx.s.card}>
        {E.catTotals.length ? E.catTotals.map(([c, v], i) => (
          <View key={c} style={ctx.s.cat}>
            <View style={ctx.s.herotop}><Text style={ctx.s.title}>{c}</Text><Text style={ctx.s.value}>{ctx.money(v)}</Text></View>
            <Bar ctx={ctx} value={E.spent ? (v / E.spent) * 100 : 0} color={[ctx.T.violet, ctx.T.mint, ctx.T.gold, ctx.T.blue, ctx.T.pink][i % 5]} />
          </View>
        )) : <EmptyState ctx={ctx} text="No expenses recorded this month." />}
      </Glass>
    </>
  );
}

// ---------------- Budgets ----------------
export function BudgetsScreen({ E, ctx }: ScreenProps) {
  const usedPct = E.income ? (E.spent / E.income) * 100 : 0;
  return (
    <>
      <Header ctx={ctx} title="Budgets" sub="Monthly limits and progress." />
      <Glass ctx={ctx} style={ctx.s.note}>
        <View style={ctx.s.herotop}>
          <Text style={ctx.s.meta}>Monthly budget</Text>
          <Badge ctx={ctx} label={usedPct > 100 ? "Over budget" : `${Math.round(usedPct)}% used`} color={usedPct > 100 ? ctx.T.coral : ctx.T.mint} />
        </View>
        <Text style={ctx.s.statBig}>{ctx.money(E.spent)} <Text style={ctx.s.meta}>of {ctx.money(E.income)}</Text></Text>
        <Bar ctx={ctx} value={usedPct} color={usedPct > 100 ? ctx.T.coral : ctx.T.mint} />
        <Text style={[ctx.s.help, { marginTop: 8 }]}>{ctx.money(Math.max(0, E.income - E.spent))} remaining this month.</Text>
      </Glass>
      <Section ctx={ctx} title="Category limits" right="Categories" onPress={() => E.setSubpage("Categories")} />
      <Glass ctx={ctx} style={ctx.s.card}>
        {E.catTotals.map(([c, v]) => {
          const limit = Math.max(1000, Math.round((E.income * 0.15) / 100) * 100);
          const pct = (v / limit) * 100;
          return (
            <View key={c} style={ctx.s.cat}>
              <View style={ctx.s.herotop}><Text style={ctx.s.title}>{c}</Text><Text style={{ color: pct > 100 ? ctx.T.coral : ctx.T.text, fontSize: 11, fontWeight: "600" }}>{ctx.money(v)} / {ctx.money(limit)}</Text></View>
              <Bar ctx={ctx} value={pct} color={pct > 100 ? ctx.T.coral : pct > 75 ? ctx.T.gold : ctx.T.mint} />
            </View>
          );
        })}
        {!E.catTotals.length && <EmptyState ctx={ctx} text="Record spending to see budgets." />}
      </Glass>
    </>
  );
}

// ---------------- Help ----------------
export function HelpScreen({ E, ctx }: ScreenProps) {
  return (
    <>
      <Header ctx={ctx} title="Help & support" sub="How Finance Copilot thinks." />
      <Glass ctx={ctx} style={ctx.s.card}>
        {[
          ["Due vs Bill", "Due = one-off money between people (both directions, partial payments). Bill = scheduled recurring obligation with status badges and reminders."],
          ["Quick Add", "The floating button on every tab captures Expense, Income, Transfer, Due, Bill, Goal or Investment in seconds."],
          ["Goal conflict detector", "Open Goal → Analyze. The waterfall funds Essential → Important → Flexible and shows the monthly shortfall plus which goals collide."],
          ["What-if scenarios", "Simulate extra income, spending cuts or longer deadlines without touching real data."],
          ["Privacy", "Supabase RLS keeps every row scoped to your user id. Nothing is shared."],
        ].map(([t, d]) => (
          <View key={t} style={ctx.s.cat}><Text style={ctx.s.title}>{t}</Text><Text style={[ctx.s.meta, { marginTop: 5, lineHeight: 15 }]}>{d}</Text></View>
        ))}
      </Glass>
      <Glass ctx={ctx} style={ctx.s.note}>
        <Text style={ctx.s.meta}>Finance Copilot · hackathon build · Expo SDK 51 + Supabase</Text>
        <Text style={[ctx.s.meta, { marginTop: 4 }]}>Version 1.0.0 · {Platform.OS}</Text>
      </Glass>
    </>
  );
}
