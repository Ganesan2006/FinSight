// ============================================================
// SYSTEM SCREENS — Notifications · Global Search · Profile/
// Settings · Export & Import data · Reports · Budgets · Help
// ============================================================
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Platform, Pressable, Text, TextInput, View } from "react-native";
import * as Crypto from "expo-crypto";
import { BarChart3, Bell, Check, ChevronRight, CreditCard, Download, FileText, Globe, Moon, Search, Settings, Share2, ShieldCheck, Sparkles, Sun, Tags, Trash2, Upload } from "lucide-react-native";
import { ScreenProps } from "../types";
import { AmountField, Badge, Bar, Chips, EmptyState, Field, Glass, Header, PrimaryButton, Row, Section } from "../../components/glass/primitives";
import { billStatus } from "../bill/BillScreens";
import * as rest from "../../lib/restClient";
import type { SubscriptionPlan, SubscriptionRecord } from "../../lib/restClient";
import { previewRecentSms } from "../../lib/smsImport";
import type { SmsCandidate } from "../../lib/restClient";

const SMS_CREATE_ACCOUNT = "__create_sms_account__";
const lastFour = (value?: string | null) => (value || "").replace(/\D/g, "").slice(-4);
const sameInstitution = (a?: string | null, b?: string | null) => {
  if (!a || !b) return true;
  const left = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  const right = b.toLowerCase().replace(/[^a-z0-9]/g, "");
  return left.includes(right) || right.includes(left);
};
const smsAccountLabel = (account: { id: string; name: string; currency: string; accountMask?: string | null }) =>
  `${account.name} · ${account.currency}${account.accountMask ? ` · ••${account.accountMask}` : ""} · ${account.id.slice(0, 6)}`;
const smsAccountMatches = (candidate: SmsCandidate, accounts: Array<{ id: string; type: string; currency: string; accountMask?: string | null; institutionName?: string | null }>) => {
  const suffix = lastFour(candidate.account_mask);
  const expectedType = candidate.instrument_type || "bank";
  return accounts.filter((account) => {
    const typeMatches = expectedType === "credit" ? account.type === "credit" : expectedType === "cash" ? account.type === "cash" : account.type === "bank";
    return !!suffix && account.accountMask === suffix && account.currency === candidate.currency && typeMatches && sameInstitution(account.institutionName, candidate.institution_name);
  });
};
const suggestedSmsAccountId = (candidate: SmsCandidate, accounts: Array<{ id: string; type: string; currency: string; accountMask?: string | null; institutionName?: string | null }>) => {
  const suffix = lastFour(candidate.account_mask);
  const matches = smsAccountMatches(candidate, accounts);
  if (matches.length === 1) return matches[0].id;
  if (!suffix || matches.length > 1) return "";
  const expectedType = candidate.instrument_type || "bank";
  const unmaskedPossibilities = accounts.some((account) => {
    const typeMatches = expectedType === "credit" ? account.type === "credit" : expectedType === "cash" ? account.type === "cash" : account.type === "bank";
    return typeMatches && account.currency === candidate.currency && !account.accountMask && sameInstitution(account.institutionName, candidate.institution_name);
  });
  return unmaskedPossibilities ? "" : SMS_CREATE_ACCOUNT;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell); cell = "";
      if (row.some((part) => part.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); if (row.some((part) => part.trim())) rows.push(row); }
  if (quoted) throw new Error("CSV has an unclosed quoted field.");
  return rows;
}

function parseTransactionCsv(text: string) {
  const data = parseCsv(text);
  if (data.length < 2) throw new Error("Paste a header row and at least one transaction row.");
  const headers = data[0].map((value) => value.trim().toLowerCase());
  const at = (row: string[], key: string) => row[headers.indexOf(key)]?.trim() || "";
  const mapped = data.slice(1).map((row, index) => ({
    row: index + 2, date: at(row, "date"), type: at(row, "type").toLowerCase(), amount: Number(at(row, "amount")),
    currency: at(row, "currency").toUpperCase(), category: at(row, "category") || "Other",
    description: at(row, "description") || at(row, "title") || "CSV transaction", note: at(row, "note"),
    account_id: at(row, "account_id"), to_account_id: at(row, "to_account_id"),
    to_amount: Number(at(row, "to_amount")) || undefined, to_currency: at(row, "to_currency").toUpperCase(),
    exchange_rate: Number(at(row, "exchange_rate")) || undefined,
  }));
  const accepted = mapped.filter((item) => isValidIsoDate(item.date)
    && ["income", "expense", "transfer"].includes(item.type) && Number.isFinite(item.amount) && item.amount > 0 && /^[A-Z]{3}$/.test(item.currency)) as Array<(typeof mapped)[number] & { type: "income" | "expense" | "transfer" }>;
  const ignored = mapped.length - accepted.length;
  return { accepted, ignored, total: mapped.length };
}

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD"];
const isValidIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

// ---------------- Notifications center ----------------
export function NotificationsScreen({ E, ctx }: ScreenProps) {
  // auto-generated alerts: overdue bills, dues due soon, goal conflicts
  const alerts = useMemo(() => {
    const list: { id: string; title: string; body: string; tone: "coral" | "gold" | "violet" | "mint" }[] = [];
    E.overdueBills.forEach((b) => list.push({ id: "ob" + b.id, title: `Overdue bill: ${b.name}`, body: `${ctx.money(b.amount)} was due on ${ctx.fmtDate(b.date)}. Mark it paid to clear this alert.`, tone: "coral" }));
    E.bills.filter((b) => b.status.toLowerCase() !== "paid" && billStatus(b, ctx.iso()).label === "Due soon").forEach((b) => list.push({ id: "ds" + b.id, title: `${b.name} due soon`, body: `${ctx.money(b.amount)} scheduled for ${ctx.fmtDate(b.date)}.`, tone: "gold" }));
    E.budgetAlerts.forEach((budget) => list.push({
      id: budget.id,
      title: budget.over ? `${budget.category} budget exceeded` : `${budget.category} budget nearly used`,
      body: budget.over
        ? `${ctx.money(Math.abs(budget.amount), budget.currency)} over the recorded limit (${Math.round(budget.percent)}% used).`
        : `${Math.round(budget.percent)}% used · ${ctx.money(budget.amount, budget.currency)} remains this month.`,
      tone: budget.over ? "coral" : "gold",
    }));
    E.dues.filter((d) => d.direction === "owed_to_me" && new Date(d.date) < new Date(ctx.iso()) && d.amount - d.paid > 0).forEach((d) => list.push({ id: "od" + d.id, title: `Collect from ${d.person}`, body: `${ctx.money(d.amount - d.paid)} is past its due date.`, tone: "violet" }));
    if (E.goals.length) {
      const need = E.goals.reduce((n, g) => { const m = Math.max(1, Math.ceil((new Date(g.date).getTime() - Date.now()) / (30 * 86400000))); return n + Math.max(0, g.target - g.saved) / m; }, 0);
      if (need > E.availableSavings) list.push({ id: "gc", title: "Goal conflict detected", body: `Your goals need ${ctx.money(Math.round(need))}/mo but only ${ctx.money(Math.round(E.availableSavings))} is available. Open Goal planning.`, tone: "coral" });
    }
    return list;
  }, [E.bills, E.dues, E.goals, E.availableSavings, E.budgetAlerts]);
  return (
    <>
      <Header ctx={ctx} title="Notifications" sub="Alerts from your recorded bills, dues and goals." />
      <Section ctx={ctx} title="Smart alerts" right={`${alerts.length}`} />
      <Glass ctx={ctx} style={ctx.s.card}>
        {alerts.length ? alerts.map((a) => (
          <View key={a.id} style={ctx.s.cat}>
            <View style={ctx.s.herotop}><Text style={ctx.s.title}>{a.title}</Text><Badge ctx={ctx} label={a.tone === "coral" ? "Urgent" : a.tone === "gold" ? "Soon" : "Info"} color={ctx.T[a.tone]} /></View>
            <Text style={[ctx.s.meta, { marginTop: 5, lineHeight: 15 }]}>{a.body}</Text>
          </View>
        )) : <EmptyState ctx={ctx} text="All clear — nothing needs your attention." />}
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
          {[["Accounts", "Bank, cash & credit"], ["Transactions", "Full history"], ["Goal conflict analysis", "The planner"], ["Portfolio breakdown", "Allocation view"], ["Export data", "Backup"]].map(([t, d]) => (
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
  const [editingProfile, setEditingProfile] = useState(false);
  const [fullName, setFullName] = useState(E.profile?.fullName || "");
  const [monthlyIncomeValue, setMonthlyIncomeValue] = useState(String(E.monthlyIncome || ""));
  const [incomeCurrency, setIncomeCurrency] = useState(E.monthlyIncomeCurrency || E.currency);
  const incomeCurrencyOptions = [...new Set([...CURRENCIES, E.currency, ...E.accounts.map((account) => account.currency)])];
  const [smsBusy, setSmsBusy] = useState(false);
  const [smsMessage, setSmsMessage] = useState("");
  const [smsCandidates, setSmsCandidates] = useState<Array<SmsCandidate & { selected: boolean; account_id: string; commit_error?: string }>>([]);
  const [smsScanSummary, setSmsScanSummary] = useState("");
  const syncSms = async () => {
    setSmsBusy(true);
    setSmsMessage("");
    try {
      const result = await previewRecentSms();
      setSmsCandidates(result.candidates.map((candidate) => {
        const suffix = lastFour(candidate.account_mask);
        const normalized = { ...candidate, account_mask: suffix || undefined };
        return { ...normalized, selected: true, account_id: suggestedSmsAccountId(normalized, E.accounts), commit_error: undefined };
      }));
      setSmsScanSummary(`${result.scanned} scanned · ${result.duplicates} already imported · ${result.ignored} ignored`);
      setSmsMessage(result.candidates.length ? "Review each account match. A unique last-four match is selected automatically. If no account matches and a suffix is available, a masked account is created on import; without a suffix, choose an existing account." : "No new transaction candidates were found.");
    } catch (error: any) {
      setSmsMessage(error?.message || "Could not import SMS messages.");
    } finally {
      setSmsBusy(false);
    }
  };
  const commitSms = async (accountCreationApproved = false) => {
    const selected = smsCandidates.filter((candidate) => candidate.selected);
    if (!selected.length) { setSmsMessage("Select at least one transaction to import."); return; }
    const valid = selected.every((candidate) => {
      if (!Number.isFinite(candidate.amount) || candidate.amount <= 0 || !/^[A-Z]{3}$/.test(candidate.currency) || !/^\d{4}-\d{2}-\d{2}$/.test(candidate.date) || !candidate.description.trim()) return false;
      if (candidate.account_id === SMS_CREATE_ACCOUNT) return lastFour(candidate.account_mask).length === 4 && candidate.amount > 0 && !!candidate.description.trim();
      const account = E.accounts.find((item) => item.id === candidate.account_id);
      return account && account.currency === candidate.currency && account.type === (candidate.instrument_type || "bank") && (!candidate.account_mask || !account.accountMask || account.accountMask === lastFour(candidate.account_mask));
    });
    if (!valid) { setSmsMessage("Correct each amount, currency, date, and account selection before importing."); return; }
    const accountsToCreate = [...new Set(selected.filter((candidate) => candidate.account_id === SMS_CREATE_ACCOUNT).map((candidate) => {
      const type = candidate.instrument_type === "credit" ? "Credit card" : candidate.instrument_type === "cash" ? "Cash account" : "Bank account";
      return `${type} · ${candidate.institution_name || "account"} · ••${lastFour(candidate.account_mask)} · ${candidate.currency}`;
    }))];
    if (accountsToCreate.length && !accountCreationApproved) {
      Alert.alert(
        accountsToCreate.length === 1 ? "Create this account?" : "Create these accounts?",
        `If no matching account exists at save time, FinSight will create:\n${accountsToCreate.join("\n")}\n\nThen it will import the selected transactions. Only last-four digits are stored.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Create & import", onPress: () => { void commitSms(true); } },
        ],
      );
      return;
    }
    setSmsBusy(true);
    try {
      const result = await rest.apiCommitSms(selected.map(({ selected: _selected, commit_error: _commitError, ...candidate }) => ({ ...candidate, account_id: candidate.account_id === SMS_CREATE_ACCOUNT ? null : candidate.account_id || null })));
      await E.refreshCloud();
      const failed = new Map((result.errors || []).map((item) => [item.fingerprint, item.error]));
      setSmsCandidates((items) => items.filter((item) => !item.selected || failed.has(item.fingerprint)).map((item) => ({ ...item, commit_error: failed.get(item.fingerprint) })));
      const created = result.created_accounts?.length ? ` · created ${result.created_accounts.map((account) => account.name).join(", ")}` : "";
      const pendingCount = smsCandidates.filter((item) => !item.selected || failed.has(item.fingerprint)).length;
      setSmsMessage(`${result.imported} imported · ${result.duplicates} already imported${created}.${failed.size ? ` ${failed.size} need account/detail review.` : ""}${pendingCount > failed.size ? ` ${pendingCount - failed.size} left unselected.` : ""}${result.historyWarning ? ` ${result.historyWarning}` : ""}`);
    } catch (error: any) {
      setSmsMessage(error?.message || "Could not save the selected transactions.");
    } finally {
      setSmsBusy(false);
    }
  };
  const confirmSmsImport = () => {
    Alert.alert(
      "Import payment SMS?",
      "Finance Copilot will scan up to 100 recent SMS messages. Regex filters likely transaction alerts before parsing; you review any candidates before saving.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Continue", onPress: () => { void syncSms(); } },
      ],
    );
  };
  return (
    <>
      <Header ctx={ctx} title="Profile & settings" sub="Your account, preferences and privacy." />
      <Glass ctx={ctx} style={ctx.s.profileCard}>
        <View style={ctx.s.profileAvatar}><Text style={{ color: ctx.T.mint, fontWeight: "700", fontSize: 15 }}>{E.profile?.fullName.slice(0, 1).toUpperCase()}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={[ctx.s.title, { fontSize: 13 }]}>{E.profile?.fullName}</Text>
          <Text style={ctx.s.meta}>{E.profile?.email} · {E.profile?.phone}</Text>
        </View>
        <Badge ctx={ctx} label={E.cloud ? "SERVER" : "API OFF"} color={E.cloud ? ctx.T.mint : ctx.T.gold} />
        <Pressable style={ctx.s.pay} onPress={() => setEditingProfile((v) => !v)}><Text style={{ color: ctx.T.mint, fontSize: 9, fontWeight: "700" }}>{editingProfile ? "Close" : "Edit"}</Text></Pressable>
      </Glass>
      {editingProfile && <Glass ctx={ctx} style={ctx.s.card}>
        <Field ctx={ctx} label="Full name" value={fullName} onChangeText={setFullName} />
        <PrimaryButton ctx={ctx} label="Save profile" onPress={() => { E.updateProfile({ fullName }); setEditingProfile(false); }} disabled={!fullName.trim()} />
      </Glass>}

      <Section ctx={ctx} title="Preferences" />
      <Glass ctx={ctx} style={ctx.s.card}>
        <View style={ctx.s.row}>
          <View style={ctx.s.rowIcon}>{darkMode ? <Moon size={15} color={ctx.T.violet} /> : <Sun size={15} color={ctx.T.gold} />}</View>
          <View style={{ flex: 1 }}><Text style={ctx.s.title}>Appearance</Text><Text style={ctx.s.meta}>Liquid Glass {E.themeName} mode</Text></View>
          <Pressable style={ctx.s.pay} onPress={E.toggleTheme}><Text style={{ color: ctx.T.mint, fontSize: 9, fontWeight: "700" }}>{darkMode ? "Switch to light" : "Switch to dark"}</Text></Pressable>
        </View>
        <View style={ctx.s.cat}>
          <Text style={[ctx.s.meta, { marginBottom: 6 }]}>Currency</Text>
          <Chips ctx={ctx} options={[...new Set([...CURRENCIES, E.currency, ...E.accounts.map((account) => account.currency)])]} value={E.currency} onChange={E.changeCurrency} />
        </View>
        <Row ctx={ctx} title="Exchange rates" sub={`Convert recorded currencies to ${E.currency} using your own rates`} amount="" icon={Globe} onPress={() => E.setSubpage("Exchange rates")} />
      </Glass>

      <Section ctx={ctx} title="Income reference" />
      <Glass ctx={ctx} style={ctx.s.card}>
        <Text style={[ctx.s.meta, { marginBottom: 8, lineHeight: 16 }]}>Optional monthly take-home income. FinSight converts it to your reporting currency only when you add a matching exchange rate.</Text>
        <AmountField ctx={ctx} symbol={incomeCurrency} value={monthlyIncomeValue} onChangeText={setMonthlyIncomeValue} />
        <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Income currency</Text>
        <Chips ctx={ctx} options={[...incomeCurrencyOptions, "Other"]} value={incomeCurrencyOptions.includes(incomeCurrency) ? incomeCurrency : "Other"} onChange={(value) => setIncomeCurrency(value === "Other" ? "XXX" : value)} />
        {!incomeCurrencyOptions.includes(incomeCurrency) && <Field ctx={ctx} label="Other currency (ISO code)" value={incomeCurrency} onChangeText={(value) => setIncomeCurrency(value.toUpperCase().slice(0, 3))} />}
        <PrimaryButton ctx={ctx} label="Save income reference" onPress={() => E.updateMonthlyIncome(Number(monthlyIncomeValue || 0), incomeCurrency)} disabled={!/^[A-Z]{3}$/.test(incomeCurrency) || !Number.isFinite(Number(monthlyIncomeValue || 0)) || Number(monthlyIncomeValue || 0) < 0} />
      </Glass>

      <Section ctx={ctx} title="Subscription" right="Explore plans" onPress={() => E.setSubpage("Subscription")} />
      <Glass ctx={ctx} style={ctx.s.card}>
        <Row ctx={ctx} title="Plans & billing" sub="Compare Free, Plus and Pro for your individual workspace." amount="" icon={CreditCard} onPress={() => E.setSubpage("Subscription")} />
      </Glass>

      <Section ctx={ctx} title="Data & privacy" />
      <Glass ctx={ctx} style={ctx.s.card}>
        <View style={ctx.s.cat}>
          <Text style={ctx.s.title}>Import payment SMS</Text>
          <Text style={[ctx.s.meta, { marginTop: 4, lineHeight: 15 }]}>Nothing is read or parsed automatically. On Android, tap Review recent SMS and confirm. You can correct candidates and choose an account before saving; iOS uses manual entry and CSV import/export.</Text>
          <View style={{ marginTop: 12 }}><PrimaryButton ctx={ctx} label={smsBusy ? "Reading messages…" : "Review recent SMS"} onPress={confirmSmsImport} disabled={smsBusy || !E.cloud || Platform.OS !== "android"} /></View>
          {!!smsScanSummary && <Text style={[ctx.s.meta, { marginTop: 10 }]}>{smsScanSummary}</Text>}
          {smsCandidates.map((candidate, index) => <View key={candidate.fingerprint} style={[ctx.s.cat, { borderTopWidth: 1, borderTopColor: ctx.T.edge, marginTop: 8, paddingTop: 10 }]}>
            <Pressable onPress={() => setSmsCandidates((items) => items.map((item, i) => i === index ? { ...item, selected: !item.selected } : item))}>
              <Text style={ctx.s.title}>{candidate.selected ? "☑" : "□"} {candidate.type.toUpperCase()} · {candidate.currency} {candidate.amount}</Text>
            </Pressable>
            <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Transaction type</Text>
            <Chips ctx={ctx} options={["expense", "income"]} value={candidate.type} onChange={(value) => setSmsCandidates((items) => items.map((item, i) => i === index ? { ...item, type: value as SmsCandidate["type"] } : item))} />
            <Field ctx={ctx} label="Description" value={candidate.description} onChangeText={(value) => setSmsCandidates((items) => items.map((item, i) => i === index ? { ...item, description: value } : item))} />
            <Field ctx={ctx} label="Amount" value={String(candidate.amount)} keyboardType="decimal-pad" onChangeText={(value) => setSmsCandidates((items) => items.map((item, i) => i === index ? { ...item, amount: Number(value) } : item))} />
            <Field ctx={ctx} label="Category" value={candidate.category} onChangeText={(value) => setSmsCandidates((items) => items.map((item, i) => i === index ? { ...item, category: value } : item))} />
            <Field ctx={ctx} label="Currency" value={candidate.currency} onChangeText={(value) => setSmsCandidates((items) => items.map((item, i) => {
              if (i !== index) return item;
              const updated = { ...item, currency: value.toUpperCase().slice(0, 3) };
              return { ...updated, account_id: suggestedSmsAccountId(updated, E.accounts) };
            }))} />
            <Field ctx={ctx} label="Bank / card issuer" value={candidate.institution_name || ""} onChangeText={(value) => setSmsCandidates((items) => items.map((item, i) => {
              if (i !== index) return item;
              const updated = { ...item, institution_name: value.slice(0, 100) };
              return { ...updated, account_id: suggestedSmsAccountId(updated, E.accounts) };
            }))} />
            <Field ctx={ctx} label="Account last four digits" value={candidate.account_mask || ""} onChangeText={(value) => setSmsCandidates((items) => items.map((item, i) => {
              if (i !== index) return item;
              const updated = { ...item, account_mask: value.replace(/\D/g, "").slice(-4) || undefined };
              return { ...updated, account_id: suggestedSmsAccountId(updated, E.accounts) };
            }))} keyboardType="number-pad" placeholder="5352" />
            <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Detected account type</Text>
            <Chips ctx={ctx} options={["bank", "credit", "cash"]} value={candidate.instrument_type || "bank"} onChange={(value) => setSmsCandidates((items) => items.map((item, i) => {
              if (i !== index) return item;
              const updated = { ...item, instrument_type: value as SmsCandidate["instrument_type"] };
              return { ...updated, account_id: suggestedSmsAccountId(updated, E.accounts) };
            }))} />
            <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Save to account</Text>
            {(() => {
              const suffix = lastFour(candidate.account_mask);
              const expectedType = candidate.instrument_type || "bank";
              const choices = E.accounts.filter((account) => {
                const typeMatches = expectedType === "credit" ? account.type === "credit" : expectedType === "cash" ? account.type === "cash" : account.type === "bank";
                return typeMatches && account.currency === candidate.currency && (!suffix || !account.accountMask || account.accountMask === suffix);
              });
              const hasMatchingAccount = smsAccountMatches(candidate, E.accounts).length > 0;
              const createLabel = suffix && !hasMatchingAccount ? `Create ${candidate.instrument_type === "credit" ? "credit card" : candidate.instrument_type === "cash" ? "cash account" : "bank account"} · ${candidate.institution_name || "account"} · ••${suffix} · ${candidate.currency}` : null;
              const options = [...choices.map(smsAccountLabel), ...(createLabel ? [createLabel] : [])];
              const selectedAccount = E.accounts.find((account) => account.id === candidate.account_id);
              const selectedLabel = candidate.account_id === SMS_CREATE_ACCOUNT ? createLabel || "" : selectedAccount ? smsAccountLabel(selectedAccount) : "";
              return <>
                <Chips ctx={ctx} options={options} value={selectedLabel} onChange={(label) => {
                  const account = choices.find((item) => smsAccountLabel(item) === label);
                  setSmsCandidates((items) => items.map((item, i) => i === index ? { ...item, account_id: account?.id || (label === createLabel ? SMS_CREATE_ACCOUNT : "") } : item));
                }} />
                {candidate.account_id === SMS_CREATE_ACCOUNT && <Text style={[ctx.s.meta, { marginTop: 2 }]}>This account will be created when you import the selected transaction.</Text>}
                {!suffix && !options.length && <Text style={ctx.s.meta}>No last-four code was detected. Select an existing account with the same currency.</Text>}
              </>;
            })()}
            <Text style={ctx.s.meta}>Transaction date · {candidate.date}</Text>
            {!!candidate.commit_error && <Text accessibilityRole="alert" style={ctx.s.help}>{candidate.commit_error}</Text>}
          </View>)}
          {!!smsCandidates.length && <View style={{ marginTop: 10 }}><PrimaryButton ctx={ctx} label={smsBusy ? "Saving…" : `Import selected (${smsCandidates.filter((item) => item.selected).length})`} onPress={() => { void commitSms(); }} disabled={smsBusy || !E.cloud} /></View>}
          {!!smsMessage && <Text accessibilityRole="alert" style={[ctx.s.help, { marginTop: 8 }]}>{smsMessage}</Text>}
        </View>
        <Row ctx={ctx} title="Export data" sub="JSON backup of your workspace" amount="" icon={Share2} onPress={() => E.setSubpage("Export data")} />
        <Row ctx={ctx} title="Smart alerts" sub="Bills, dues and goal warnings" amount="" icon={Bell} onPress={() => E.setSubpage("Notifications")} />
        <Row ctx={ctx} title="Manage accounts" sub="Balances and connection options" amount="" icon={Settings} onPress={() => { E.setTab("Spend"); E.setSubpage("Accounts"); }} />
        <View style={ctx.s.securityNote}>
          <ShieldCheck size={16} color={ctx.T.mint} />
          <Text style={[ctx.s.meta, { flex: 1, lineHeight: 15 }]}>
            {E.cloud ? "Your requests use a signed-in account. The backend scopes database queries to your user ID; keep API and Supabase service keys on the server." : "Connect to the Supabase backed API to use and save your financial workspace."}
          </Text>
        </View>
      </Glass>

      <PrimaryButton ctx={ctx} label="Sign out" onPress={E.logout} danger />
      <Pressable style={ctx.s.deleteButton} onPress={() => Alert.alert(
        "Delete account?",
        "Your account will be locked immediately. Sign in within 7 days to cancel; after that, account data is permanently deleted.",
        [{ text: "Cancel", style: "cancel" }, { text: "Schedule deletion", style: "destructive", onPress: () => { void E.deleteAccount(); } }],
      )}>
        <Text style={{ color: ctx.T.coral, fontSize: 11, fontWeight: "700" }}>Delete account · 7-day recovery</Text>
      </Pressable>
    </>
  );
}

// ---------------- Subscription purchase ----------------
export function SubscriptionScreen({ E, ctx }: ScreenProps) {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionRecord>({ plan: "free", status: "active", billing_cycle: "monthly", current_period_end: null });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!E.cloud) return;
    let active = true;
    setLoading(true);
    Promise.all([rest.apiSubscriptionPlans(), rest.apiGetSubscription()]).then(([catalogue, current]) => {
      if (!active) return;
      setPlans(catalogue);
      setSubscription(current);
    }).catch((error: any) => {
      if (active) setMessage(error.message || "Couldn't load subscription details.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [E.cloud]);

  const choosePlan = async (plan: SubscriptionPlan) => {
    if (plan.id !== "free") {
      setMessage("Paid checkout is coming soon. You will not be charged and your current plan will not change.");
      return;
    }
    if (busy || subscription.plan === plan.id || !E.cloud) return;
    setBusy(true);
    setMessage("");
    try {
      const current = await rest.apiSetSubscription(plan.id);
      setSubscription(current);
      setMessage("Free plan is active for your account.");
    } catch (error: any) {
      setMessage(error.message || "Couldn't update your plan.");
    } finally { setBusy(false); }
  };

  return (
    <>
      <Header ctx={ctx} title="Plans for your money" sub="Individual plans that grow with your finance workspace." />
      <Glass ctx={ctx} style={ctx.s.card}>
        <View style={ctx.s.herotop}>
          <View style={ctx.s.rowIcon}><CreditCard size={17} color={ctx.T.mint} /></View>
          <View style={{ flex: 1 }}>
            <Text style={ctx.s.title}>Your current plan</Text>
            <Text style={ctx.s.meta}>{subscription.plan.toUpperCase()} · {subscription.status || "active"}{subscription.current_period_end ? ` · renews ${ctx.fmtDate(String(subscription.current_period_end).slice(0, 10))}` : ""}</Text>
          </View>
          <Badge ctx={ctx} label={E.cloud ? "ACTIVE" : "API OFF"} color={E.cloud ? ctx.T.mint : ctx.T.gold} />
        </View>
        {loading && <Text style={ctx.s.help}>Loading your plans…</Text>}
        {!E.cloud && <Text style={ctx.s.help}>Connect to the Supabase backed API to load or change your plan.</Text>}
      </Glass>

      <Section ctx={ctx} title="Choose a plan" />
      {plans.map((plan) => {
        const current = subscription.plan === plan.id;
        return (
          <Glass key={plan.id} ctx={ctx} style={ctx.s.card}>
            <View style={ctx.s.herotop}>
              <View style={{ flex: 1 }}>
                <Text style={[ctx.s.title, { fontSize: 16 }]}>{plan.name}</Text>
                <Text style={[ctx.s.meta, { marginTop: 3 }]}>{plan.description}</Text>
              </View>
              {current && <Badge ctx={ctx} label="CURRENT" />}
            </View>
            <Text style={[ctx.s.statBig, { marginTop: 14 }]}>{plan.price === 0 ? "Free" : `₹${plan.price}`}<Text style={ctx.s.meta}>{plan.price === 0 ? " forever" : ` / ${plan.interval || "month"}`}</Text></Text>
            {!!plan.limits && <Text style={[ctx.s.meta, { marginTop: 8 }]}>{plan.limits.accounts == null ? "Unlimited" : plan.limits.accounts} accounts · {plan.limits.goals == null ? "Unlimited" : plan.limits.goals} goals</Text>}
            <View style={{ marginTop: 12, gap: 8 }}>
              {plan.features.map((feature) => <View key={feature} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                <Check size={14} color={ctx.T.mint} style={{ marginTop: 1 }} />
                <Text style={[ctx.s.meta, { flex: 1, lineHeight: 17 }]}>{feature}</Text>
              </View>)}
            </View>
            <View style={{ marginTop: 16 }}>
              {plan.id === "free" ? (
                <PrimaryButton ctx={ctx} label={current ? "Current plan" : busy ? "Updating…" : "Choose Free"} onPress={() => choosePlan(plan)} disabled={current || busy || !E.cloud} />
              ) : (
                <Pressable style={[ctx.s.save, { opacity: 0.88 }]} onPress={() => choosePlan(plan)}>
                  <Text style={ctx.s.saveText}>Purchase {plan.name} · checkout coming soon</Text>
                </Pressable>
              )}
            </View>
          </Glass>
        );
      })}
      {!!message && <Text style={ctx.s.help}>{message}</Text>}

      <Section ctx={ctx} title="Planned for the future" right="ROADMAP" />
      <Glass ctx={ctx} style={ctx.s.card}>
        {[
          [BarChart3, "Broker portfolio sync", "Groww, Kite and Angel One holdings"],
          [CreditCard, "Card statement connections", "Visa, Mastercard and American Express"],
          [Sparkles, "Paid billing tools", "Secure checkout, renewals, receipts and plan management"],
        ].map(([Icon, title, description]: any[]) => (
          <View key={title} style={ctx.s.row}>
            <View style={ctx.s.rowIcon}><Icon size={16} color={ctx.T.violet} /></View>
            <View style={{ flex: 1 }}><Text style={ctx.s.title}>{title}</Text><Text style={[ctx.s.meta, { marginTop: 2 }]}>{description}</Text></View>
            <Badge ctx={ctx} label="PLANNED" color={ctx.T.gold} />
          </View>
        ))}
      </Glass>
      <Text style={[ctx.s.help, { marginBottom: 12 }]}>Planned items are not available or included in paid plans yet. Current plan limits are applied by your account in the backend.</Text>
    </>
  );
}

// ---------------- Export / Import ----------------
export function DataScreen({ E, ctx }: ScreenProps) {
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState<ReturnType<typeof parseTransactionCsv> | null>(null);
  const [csvAccountId, setCsvAccountId] = useState(E.accounts[0]?.id || "");
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvStatus, setCsvStatus] = useState("");
  const [csvVisibleCount, setCsvVisibleCount] = useState(20);
  const accountLabel = (account: (typeof E.accounts)[number]) => `${account.name} · ${account.currency} · ${account.id.slice(0, 6)}`;
  const updateCsvRow = (index: number, patch: Partial<ReturnType<typeof parseTransactionCsv>["accepted"][number]>) => {
    setCsvPreview((current) => current ? { ...current, accepted: current.accepted.map((row, i) => i === index ? { ...row, ...patch } : row) } : current);
  };
  const previewCsv = () => {
    try {
      setCsvPreview(parseTransactionCsv(csvText));
      setCsvVisibleCount(20);
      setCsvStatus("");
    } catch (error: any) {
      setCsvPreview(null);
      setCsvStatus(error?.message || "Could not read this CSV.");
    }
  };
  const importCsv = async () => {
    if (!csvPreview || !E.accounts.length) { setCsvStatus("Add an account and preview the CSV first."); return; }
    setCsvBusy(true);
    try {
      const transactions = await Promise.all(csvPreview.accepted.map(async (row) => {
        const account = E.accounts.find((item) => item.id === row.account_id) || E.accounts.find((item) => item.id === csvAccountId);
        if (!account) throw new Error(`CSV row ${row.row}: choose a source account.`);
        if (account.currency !== row.currency) throw new Error(`CSV row ${row.row}: ${row.currency} does not match ${account.name} (${account.currency}).`);
        const destination = row.type === "transfer" ? E.accounts.find((item) => item.id === row.to_account_id) : undefined;
        if (row.type === "transfer" && !destination) throw new Error(`CSV row ${row.row}: choose a destination account for this transfer.`);
        const toAmount = destination ? (row.to_amount || (destination.currency === account.currency ? row.amount : 0)) : undefined;
        const exchangeRate = destination && destination.currency !== account.currency ? (row.exchange_rate || (toAmount ? toAmount / row.amount : 0)) : undefined;
        if (destination && destination.currency !== account.currency && !(toAmount && exchangeRate)) throw new Error(`CSV row ${row.row}: enter the received amount for this cross-currency transfer.`);
        const prepared = {
          ...row, row_number: row.row, account_id: account.id, to_account_id: destination?.id,
          to_amount: toAmount, to_currency: destination?.currency, exchange_rate: exchangeRate,
        };
        const identity = JSON.stringify([prepared.account_id, prepared.to_account_id, prepared.date, prepared.type, prepared.amount, prepared.currency, prepared.to_amount, prepared.to_currency, prepared.exchange_rate, prepared.category, prepared.description, prepared.note]);
        const fingerprint = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, identity);
        return { ...prepared, fingerprint };
      }));
      const result = await rest.apiImportTransactions(transactions);
      await E.refreshCloud();
      setCsvStatus(`${result.imported} imported · ${result.duplicates} duplicate${result.duplicates === 1 ? "" : "s"} · ${csvPreview.ignored} invalid rows skipped · ${result.errors.length} failed`);
      if (result.errors.length) setCsvStatus((message) => `${message}. First issue: row ${result.errors[0].row}, ${result.errors[0].error}`);
      if (result.historyWarning) setCsvStatus((message) => `${message}. ${result.historyWarning}`);
    } catch (error: any) {
      setCsvStatus(error?.message || "CSV import failed.");
    } finally { setCsvBusy(false); }
  };
  return (
    <>
      <Header ctx={ctx} title="Export data" sub="Download a copy of your Finance Copilot workspace." />
      <Glass ctx={ctx} style={ctx.s.note}>
        <Text style={ctx.s.title}>Export</Text>
        <Text style={[ctx.s.meta, { marginTop: 5, lineHeight: 15 }]}>Share a JSON workspace backup or export transactions as CSV. Transaction amounts keep their original currencies.</Text>
        <View style={{ marginTop: 12 }}><PrimaryButton ctx={ctx} label="Download backup (JSON)" onPress={E.exportData} /></View>
        <View style={{ marginTop: 12 }}><PrimaryButton ctx={ctx} label="Export transactions (CSV)" onPress={E.exportTransactionsCsv} /></View>
      </Glass>
      <Section ctx={ctx} title="Import transactions (CSV)" />
      <Glass ctx={ctx}>
        <Text style={[ctx.s.meta, { marginBottom: 8, lineHeight: 16 }]}>Paste a FinSight CSV, review and correct each row, map it to your accounts, then import income, expenses and transfers. Re-imported rows are deduplicated.</Text>
        <Field ctx={ctx} label="Paste CSV" value={csvText} onChangeText={(value) => { setCsvText(value); setCsvPreview(null); }} multiline placeholder={'date,type,amount,currency,category,description,note\n2026-11-01,expense,12.50,USD,Food,Coffee,'} />
        <PrimaryButton ctx={ctx} label="Preview CSV" onPress={previewCsv} disabled={!csvText.trim()} />
        {!!csvPreview && <>
          <Text style={[ctx.s.meta, { marginTop: 10 }]}>{csvPreview.accepted.length} valid rows · {csvPreview.ignored} rows need CSV correction</Text>
          <Text style={[ctx.s.meta, { marginTop: 8 }]}>Default source account for rows without an account ID</Text>
          <Chips ctx={ctx} options={E.accounts.map(accountLabel)} value={E.accounts.find((item) => item.id === csvAccountId) ? accountLabel(E.accounts.find((item) => item.id === csvAccountId)!) : ""} onChange={(label) => setCsvAccountId(E.accounts.find((item) => accountLabel(item) === label)?.id || "")} />
          {csvPreview.accepted.slice(0, csvVisibleCount).map((row, index) => {
            const source = E.accounts.find((item) => item.id === row.account_id) || E.accounts.find((item) => item.id === csvAccountId);
            const target = E.accounts.find((item) => item.id === row.to_account_id);
            return <View key={`${row.row}-${index}`} style={[ctx.s.cat, { borderTopWidth: 1, borderTopColor: ctx.T.edge, marginTop: 8, paddingTop: 10 }]}>
              <Text style={ctx.s.title}>CSV row {row.row}</Text>
              <Text style={[ctx.s.meta, { marginTop: 6, marginBottom: 5 }]}>Type</Text>
              <Chips ctx={ctx} options={["expense", "income", "transfer"]} value={row.type} onChange={(value) => updateCsvRow(index, { type: value as typeof row.type })} />
              <Field ctx={ctx} label="Date (YYYY-MM-DD)" value={row.date} onChangeText={(value) => updateCsvRow(index, { date: value })} />
              <Field ctx={ctx} label="Amount" value={String(row.amount)} keyboardType="decimal-pad" onChangeText={(value) => updateCsvRow(index, { amount: Number(value) })} />
              <Field ctx={ctx} label="Currency" value={row.currency} onChangeText={(value) => updateCsvRow(index, { currency: value.toUpperCase().slice(0, 3) })} />
              <Field ctx={ctx} label="Category" value={row.category} onChangeText={(value) => updateCsvRow(index, { category: value })} />
              <Field ctx={ctx} label="Description" value={row.description} onChangeText={(value) => updateCsvRow(index, { description: value })} />
              <Text style={[ctx.s.meta, { marginTop: 3, marginBottom: 5 }]}>From account</Text>
              <Chips ctx={ctx} options={E.accounts.map(accountLabel)} value={source ? accountLabel(source) : ""} onChange={(label) => updateCsvRow(index, { account_id: E.accounts.find((item) => accountLabel(item) === label)?.id || "" })} />
              {row.type === "transfer" && <>
                <Text style={[ctx.s.meta, { marginTop: 5, marginBottom: 5 }]}>To account</Text>
                <Chips ctx={ctx} options={E.accounts.filter((account) => account.id !== source?.id).map(accountLabel)} value={target ? accountLabel(target) : ""} onChange={(label) => {
                  const selected = E.accounts.find((item) => accountLabel(item) === label && item.id !== source?.id);
                  updateCsvRow(index, { to_account_id: selected?.id || "", to_currency: selected?.currency || "", to_amount: selected?.currency === source?.currency ? row.amount : row.to_amount, exchange_rate: selected?.currency === source?.currency ? 1 : row.exchange_rate });
                }} />
                {!!target && target.currency !== source?.currency && <>
                  <Field ctx={ctx} label={`Received amount (${target.currency})`} value={String(row.to_amount || "")} keyboardType="decimal-pad" onChangeText={(value) => updateCsvRow(index, { to_amount: Number(value) })} />
                  {!!row.to_amount && <Text style={ctx.s.meta}>Rate: 1 {row.currency} = {(row.to_amount / row.amount).toFixed(6)} {target.currency}</Text>}
                </>}
              </>}
            </View>;
          })}
          {csvPreview.accepted.length > csvVisibleCount && <Pressable accessibilityRole="button" style={[ctx.s.ghostBtn, { alignSelf: "center", marginTop: 8 }]} onPress={() => setCsvVisibleCount((count) => count + 20)}><Text style={{ color: ctx.T.mint, fontSize: 11, fontWeight: "700" }}>Review 20 more rows</Text></Pressable>}
          <View style={{ marginTop: 10 }}><PrimaryButton ctx={ctx} label={csvBusy ? "Importing…" : `Import ${csvPreview.accepted.length} valid rows`} onPress={() => { void importCsv(); }} disabled={csvBusy || !E.cloud || !E.accounts.length || !csvPreview.accepted.length} /></View>
        </>}
        {!!csvStatus && <Text accessibilityRole="alert" style={[ctx.s.help, { marginTop: 8 }]}>{csvStatus}</Text>}
      </Glass>
      <Section ctx={ctx} title="Recent import history" right={`${E.importBatches.length}`} />
      <Glass ctx={ctx} style={ctx.s.card}>
        {E.importBatches.slice(0, 10).map((batch) => <View key={batch.id}>
          <Row ctx={ctx} title={`${batch.source.toUpperCase()} import`} sub={`${ctx.fmtDate(batch.created_at.slice(0, 10))} · ${batch.rows_total} rows · ${batch.duplicate_count} duplicates · ${batch.failed_count} failed`} amount={`${batch.imported_count} added`} />
          {!!batch.errors?.length && <Text style={[ctx.s.help, { marginTop: -3, marginBottom: 8 }]}>First issue: {batch.errors[0]?.error || "Review failed rows and re-import."}</Text>}
        </View>)}
        {!E.importBatches.length && <EmptyState ctx={ctx} text="Reviewed CSV and SMS imports will appear here." />}
      </Glass>
      {!E.cloud && <Text style={ctx.s.help}>Connect to the Supabase backed API before exporting financial data.</Text>}
    </>
  );
}

// ---------------- Manual exchange rates ----------------
export function ExchangeRatesScreen({ E, ctx }: ScreenProps) {
  const currencies = [...new Set([
    ...CURRENCIES,
    ...E.accounts.map((account) => account.currency),
    ...E.tx.map((transaction) => transaction.currency),
    E.currency,
  ])].sort();
  const [fromCurrency, setFromCurrency] = useState(currencies.find((code) => code !== E.currency) || "USD");
  const [rate, setRate] = useState("");
  const [effectiveOn, setEffectiveOn] = useState(ctx.iso());
  return <>
    <Header ctx={ctx} title="Exchange rates" sub={`Convert different currencies to your reporting currency (${E.currency}).`} />
    <Glass ctx={ctx} style={ctx.s.note}>
      <Text style={ctx.s.title}>Add a rate you trust</Text>
      <Text style={[ctx.s.meta, { marginTop: 5, lineHeight: 16 }]}>Rates are entered by you and applied from their effective date. FinSight does not fetch live rates. For each currency, enter how much 1 unit is worth in {E.currency}.</Text>
      <View style={{ marginTop: 12 }}>
        <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Currency to convert</Text>
        <Chips ctx={ctx} options={[...currencies.filter((code) => code !== E.currency), "Other"]} value={currencies.includes(fromCurrency) ? fromCurrency : "Other"} onChange={(value) => setFromCurrency(value === "Other" ? "XXX" : value)} />
        {!currencies.includes(fromCurrency) && <Field ctx={ctx} label="Other currency (ISO code)" value={fromCurrency} onChangeText={(value) => setFromCurrency(value.toUpperCase().slice(0, 3))} />}
        <Text style={[ctx.s.meta, { marginTop: 8, marginBottom: 5 }]}>1 {fromCurrency} equals {E.currency}</Text>
        <AmountField ctx={ctx} symbol={E.currency} value={rate} onChangeText={setRate} />
        <Field ctx={ctx} label="Effective from (YYYY-MM-DD)" value={effectiveOn} onChangeText={setEffectiveOn} />
        <PrimaryButton ctx={ctx} label="Save exchange rate" onPress={() => E.saveExchangeRate({ from_currency: fromCurrency, to_currency: E.currency, rate: Number(rate), effective_on: effectiveOn })} disabled={!/^[A-Z]{3}$/.test(fromCurrency) || fromCurrency === E.currency || !(Number(rate) > 0) || !isValidIsoDate(effectiveOn)} />
      </View>
    </Glass>
    <Section ctx={ctx} title="Saved rates" right={`${E.exchangeRates.length}`} />
    <Glass ctx={ctx} style={ctx.s.card}>
      {[...E.exchangeRates].sort((a, b) => b.effective_on.localeCompare(a.effective_on)).map((item) => <Row key={item.id} ctx={ctx} title={`1 ${item.from_currency} = ${item.rate} ${item.to_currency}`} sub={`Effective ${ctx.fmtDate(item.effective_on)}`} amount="" />)}
      {!E.exchangeRates.length && <EmptyState ctx={ctx} text="No rates saved. Different currency amounts remain separate until you add a conversion rate." />}
    </Glass>
    {E.convertedBalanceTotal !== null && <Text style={ctx.s.help}>All current account balances convert to {ctx.money(E.convertedBalanceTotal, E.currency)} using the latest rates effective today.</Text>}
  </>;
}

// ---------------- Reports ----------------
export function ReportsScreen({ E, ctx }: ScreenProps) {
  const net = E.income - E.spent;
  const rate = E.income ? Math.round((net / E.income) * 100) : 0;
  const currentDate = new Date();
  const previousDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  const previousMonthKey = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, "0")}`;
  const previousSpendByCurrency = E.tx.filter((item) => item.kind === "expense" && item.date.slice(0, 7) === previousMonthKey)
    .reduce((totals: Record<string, number>, item) => { totals[item.currency] = (totals[item.currency] || 0) + item.amount; return totals; }, {});
  const previousSpendRates = Object.entries(previousSpendByCurrency).map(([code, amount]) => ({ amount, rate: E.rateFor(code) }));
  const previousSpend = previousSpendRates.length && previousSpendRates.every((item) => item.rate !== null)
    ? previousSpendRates.reduce((sum, item) => sum + item.amount * (item.rate || 0), 0)
    : previousSpendByCurrency[E.currency] || 0;
  const spendingChange = previousSpend > 0 ? Math.round(((E.spent - previousSpend) / previousSpend) * 100) : null;
  const topCategory = E.catTotals[0];
  const guidance = E.income <= 0
    ? `Add income records in ${E.currency} to compare monthly spending with income. This view uses only transactions you recorded.`
    : net < 0
      ? `Recorded spending is ${ctx.money(Math.abs(net), E.currency)} above recorded income. ${topCategory ? `${topCategory[0]} is the largest category at ${ctx.money(topCategory[1], E.currency)}.` : "Review your categories and transactions for this month."}`
      : E.budgetAlerts.some((item) => item.over && item.currency === E.currency)
        ? `At least one ${E.currency} category budget is over its limit. Review the budget amounts before adding discretionary spending.`
        : topCategory
          ? `${topCategory[0]} is your largest recorded category at ${ctx.money(topCategory[1], E.currency)}. Your current net cash flow is ${ctx.money(net, E.currency)}.`
          : `Your recorded income exceeds spending by ${ctx.money(net, E.currency)}. Add budgets to make a more specific plan.`;
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
        {spendingChange !== null && <Text style={[ctx.s.help, { marginTop: 7 }]}>Spending is {Math.abs(spendingChange)}% {spendingChange > 0 ? "higher" : spendingChange < 0 ? "lower" : "unchanged"} than last month ({ctx.money(previousSpend, E.currency)}). {previousSpendRates.length && previousSpendRates.every((item) => item.rate !== null) ? "Both periods use saved rates." : "This comparison includes only reporting-currency transactions because a rate is missing."}</Text>}
        {!!E.convertedMonthSummary && <Text style={[ctx.s.help, { marginTop: 7 }]}>Across currencies, recorded expenses total {ctx.money(E.convertedMonthSummary.spent, E.currency)} and recorded income totals {ctx.money(E.convertedMonthSummary.income, E.currency)} using saved rates.</Text>}
      </Glass>
      <Section ctx={ctx} title="Guidance from your records" />
      <Glass ctx={ctx} style={ctx.s.note}>
        <Text style={[ctx.s.meta, { lineHeight: 17 }]}>{guidance}</Text>
        <Text style={[ctx.s.help, { marginTop: 7 }]}>This is a summary of the transactions, bills and budgets you entered. It does not include unrecorded accounts or future income.</Text>
      </Glass>
      <Section ctx={ctx} title="Spending by category" />
      <Glass ctx={ctx} style={ctx.s.card}>
        {E.catTotals.length ? E.catTotals.map(([c, v], i) => (
          <View key={c} style={ctx.s.cat}>
            <View style={ctx.s.herotop}><Text style={ctx.s.title}>{c}</Text><Text style={ctx.s.value}>{ctx.money(v)}</Text></View>
            <Bar ctx={ctx} value={E.categoryCurrencySpent ? (v / E.categoryCurrencySpent) * 100 : 0} color={[ctx.T.violet, ctx.T.mint, ctx.T.gold, ctx.T.blue, ctx.T.pink][i % 5]} />
          </View>
        )) : <EmptyState ctx={ctx} text="No expenses recorded this month." />}
      </Glass>
    </>
  );
}

// ---------------- Budgets ----------------
export function BudgetsScreen({ E, ctx }: ScreenProps) {
  const [category, setCategory] = useState("Food & Dining");
  const [amount, setAmount] = useState("");
  const [budgetCurrency, setBudgetCurrency] = useState(E.currency);
  const [period, setPeriod] = useState(`${new Date().toISOString().slice(0, 7)}-01`);
  const [rollover, setRollover] = useState("No rollover");
  const start = new Date(`${period}T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  const categories = [...new Set([...E.tx.map((t) => t.category), "Food & Dining", "Transport", "Bills", "Other"])];
  const rows = E.budgets.filter((b) => b.period_start === period).map((budget) => {
    const transactionSpend = E.tx.filter((t) => t.kind === "expense" && t.category === budget.category && t.currency === budget.currency && t.date >= period && t.date < end).reduce((sum, t) => sum + t.amount, 0);
    const unpaidExpenseSpend = E.billPayments ? Object.entries(E.billPayments).reduce((sum, [billId, payments]) => {
      const bill = E.bills.find((item) => item.id === billId);
      if (!bill || bill.category !== budget.category || bill.currency !== budget.currency) return sum;
      return sum + payments.filter((payment) => !payment.transactionId && payment.date >= period && payment.date < end).reduce((subtotal, payment) => subtotal + payment.amount, 0);
    }, 0) : 0;
    return { ...budget, spent: transactionSpend + unpaidExpenseSpend };
  });
  const currencyTotals = E.monthCurrencyTotals || [];
  const spentPct = E.income ? (E.spent / E.income) * 100 : 0;
  const net = E.income - E.spent;
  return (
    <>
      <Header ctx={ctx} title="Budgets & spending" sub="Set monthly limits per category and currency." />
      <Glass ctx={ctx} style={ctx.s.note}>
        <View style={ctx.s.herotop}>
          <Text style={ctx.s.meta}>Spending vs income</Text>
          {E.income > 0 && <Badge ctx={ctx} label={`${Math.round(spentPct)}% of income`} color={net >= 0 ? ctx.T.mint : ctx.T.coral} />}
        </View>
        <Text style={ctx.s.statBig}>{ctx.money(E.spent, E.currency)} <Text style={ctx.s.meta}>spent in {E.currency}</Text></Text>
        <Bar ctx={ctx} value={spentPct} color={net >= 0 ? ctx.T.mint : ctx.T.coral} />
        <Text style={[ctx.s.help, { marginTop: 8 }]}>{E.income > 0 ? `${ctx.money(net, E.currency)} net cash flow from ${ctx.money(E.income, E.currency)} income.` : "Record income to compare spending against it."}</Text>
        {currencyTotals.filter((x) => x.currency !== E.currency).map((x) => <Text key={x.currency} style={[ctx.s.meta, { marginTop: 5 }]}>{x.currency}: {ctx.money(x.spent, x.currency)} spent · {ctx.money(x.income, x.currency)} income</Text>)}
      </Glass>
      <Section ctx={ctx} title="Monthly category budgets" />
      <Glass ctx={ctx} style={ctx.s.card}>
        <Field ctx={ctx} label="Month (first day, YYYY-MM-01)" value={period} onChangeText={setPeriod} placeholder="2026-11-01" />
        <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Category</Text>
        <Chips ctx={ctx} options={categories.slice(0, 12)} value={category} onChange={setCategory} />
        <AmountField ctx={ctx} symbol={budgetCurrency} value={amount} onChangeText={setAmount} />
        <Field ctx={ctx} label="Budget currency (ISO code)" value={budgetCurrency} onChangeText={(value) => setBudgetCurrency(value.toUpperCase().slice(0, 3))} />
        <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Unused / overspent amount</Text>
        <Chips ctx={ctx} options={["No rollover", "Rollover"]} value={rollover} onChange={setRollover} />
        <PrimaryButton ctx={ctx} label="Save monthly budget" onPress={() => E.saveBudget({ category, period_start: period, amount: Number(amount), currency: budgetCurrency, rollover_enabled: rollover === "Rollover" })} disabled={!category || !/^\d{4}-\d{2}-01$/.test(period) || !(Number(amount) > 0) || !/^[A-Z]{3}$/.test(budgetCurrency)} />
      </Glass>
      <Section ctx={ctx} title={`Budgets for ${period.slice(0, 7)}`} />
      <Glass ctx={ctx} style={ctx.s.card}>
        {rows.map((budget) => {
          const available = budget.amount + budget.carry_in;
          const remaining = available - budget.spent;
          const percent = available > 0 ? budget.spent / available * 100 : 0;
          return <View key={budget.id} style={ctx.s.cat}>
            <View style={ctx.s.herotop}><Text style={ctx.s.title}>{budget.category}</Text><Text style={ctx.s.value}>{ctx.money(remaining, budget.currency)} left</Text></View>
            <Text style={ctx.s.meta}>{ctx.money(budget.spent, budget.currency)} spent of {ctx.money(available, budget.currency)} · {budget.rollover_enabled ? "rollover on" : "no rollover"}</Text>
            <Bar ctx={ctx} value={available > 0 ? (budget.spent / available) * 100 : 0} color={remaining >= 0 ? ctx.T.mint : ctx.T.coral} />
            {percent >= 80 && <Text style={[ctx.s.meta, { marginTop: 5, color: remaining < 0 ? ctx.T.coral : ctx.T.gold }]}>{remaining < 0 ? `Over by ${ctx.money(Math.abs(remaining), budget.currency)} · ${Math.round(percent)}% used` : `${Math.round(percent)}% used · ${ctx.money(remaining, budget.currency)} remains`}</Text>}
          </View>;
        })}
        {!rows.length && <EmptyState ctx={ctx} text="No budgets for this month yet. Add one above." />}
      </Glass>
      <Section ctx={ctx} title="Recorded expenses by category" />
      <Glass ctx={ctx} style={ctx.s.card}>
        {E.catTotals.map(([category, amount]) => <Row key={category} ctx={ctx} title={category} sub="This month" amount={ctx.money(amount)} />)}
        {!E.catTotals.length && <EmptyState ctx={ctx} text="No expenses recorded this month." />}
      </Glass>
      <Text style={ctx.s.help}>Budgets only compare records in the same currency. Transactions in other currencies are listed separately until an exchange rate is recorded.</Text>
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
          ["Due vs Bill", "Due = one-off money between people (both directions, partial payments). Bill = scheduled recurring obligation with payment history."],
          ["Quick Add", "The floating button on every tab captures Expense, Income, Transfer, Due, Bill, Goal or Investment in seconds."],
          ["Goal conflict detector", "Open Goal → Analyze. The waterfall funds Essential → Important → Flexible and shows the monthly shortfall plus which goals collide."],
          ["What-if scenarios", "Simulate extra income, spending cuts or longer deadlines without touching real data."],
          ["Privacy", "The mobile app talks to the REST backend. The backend verifies your signed session and scopes queries by your user ID; server secrets stay off the device."],
        ].map(([t, d]) => (
          <View key={t} style={ctx.s.cat}><Text style={ctx.s.title}>{t}</Text><Text style={[ctx.s.meta, { marginTop: 5, lineHeight: 15 }]}>{d}</Text></View>
        ))}
      </Glass>
      <Glass ctx={ctx} style={ctx.s.note}>
        <Text style={ctx.s.meta}>Finance Copilot · Expo SDK 51</Text>
        <Text style={[ctx.s.meta, { marginTop: 4 }]}>Version 1.0.0 · {Platform.OS}</Text>
      </Glass>
    </>
  );
}
