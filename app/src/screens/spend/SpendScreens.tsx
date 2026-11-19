// ============================================================
// SPEND TAB — Dashboard + support screens:
// All Transactions (search/filter) · Transaction Detail ·
// Edit Transaction · Add Transaction · Accounts · Categories
// ============================================================
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Pressable, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AlertTriangle, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronRight, CreditCard, Landmark, Pencil, Plus, Search, ShieldCheck, Tags, Trash2, Wallet } from "lucide-react-native";
import { ScreenProps } from "../types";
import { AmountField, Badge, Bar, Chips, EmptyState, Field, Glass, Header, PrimaryButton, Row, Section } from "../../components/glass/primitives";
import { Tx } from "../../lib/engine";
import * as rest from "../../lib/restClient";

const CATS = ["Food & Dining", "Transport", "Shopping", "Bills", "Health", "Entertainment", "Education", "Travel", "Salary", "Side income", "Transfer", "Other"];

const PROVIDER_LOGOS: Record<string, any> = {
  groww: require("../../../assets/groww.jpeg"),
  kite: require("../../../assets/kite.png"),
  angelone: require("../../../assets/angelone.png"),
  amex: require("../../../assets/american-express.png"),
  visa: require("../../../assets/visa.png"),
  mastercard: require("../../../assets/mastercard.png"),
};

const CONNECTION_OPTIONS = {
  brokers: [
    { provider: "kite", label: "Kite (Zerodha)", desc: "Investment broker" },
    { provider: "groww", label: "Groww", desc: "Investment broker" },
    { provider: "angelone", label: "Angel One", desc: "Investment broker" },
  ],
  cards: [
    { provider: "amex", label: "American Express", desc: "Card provider" },
    { provider: "mastercard", label: "Mastercard", desc: "Card network" },
    { provider: "visa", label: "Visa", desc: "Card network" },
  ],
};

export function SpendTab({ E, ctx }: ScreenProps) {
  const [accountBreakdownOpen, setAccountBreakdownOpen] = useState(false);
  const [expandedCurrency, setExpandedCurrency] = useState<string | null>(null);
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);
  const first = E.profile?.fullName.trim().split(/\s+/)[0];
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthName = now.toLocaleDateString("en-IN", { month: "long" });
  const spendCurrencies = [...new Set([
    ...E.monthCurrencyTotals.map((item) => item.currency),
    ...E.accounts.map((account) => account.currency),
  ])].sort((a, b) => a.localeCompare(b));
  const toggleAccountBreakdown = () => {
    const open = !accountBreakdownOpen;
    setAccountBreakdownOpen(open);
    setExpandedCurrency(open ? E.currency : null);
    setExpandedAccountId(null);
  };
  return (
    <>
      <Header ctx={ctx} title={first ? `Good morning, ${first}` : "Your finances"} sub={`Your money at a glance · ${monthName}`} />
      <LinearGradient colors={ctx.T.heroGrad} style={ctx.s.hero}>
        <View style={ctx.s.herotop}>
        <Text style={ctx.s.meta}>Available balance by currency</Text>
          <View style={ctx.s.secure}><ShieldCheck size={13} color={ctx.T.mint} /><Text style={ctx.s.secureText}>PRIVATE</Text></View>
        </View>
        {Object.entries(E.balanceByCurrency).length ? Object.entries(E.balanceByCurrency).map(([code, value]: [string, number]) => <Text key={code} style={ctx.s.big}>{ctx.money(value, code)}</Text>) : <Text style={ctx.s.big}>{ctx.money(0, E.currency)}</Text>}
        <Text style={ctx.s.meta}>● Across {E.accounts.length} account{E.accounts.length === 1 ? "" : "s"} · updated today</Text>
        {E.convertedBalanceTotal !== null
          ? <Text style={[ctx.s.meta, { marginTop: 4 }]}>Combined estimate: {ctx.money(E.convertedBalanceTotal, E.currency)} using saved rates</Text>
          : !!E.missingBalanceCurrencies.length && <Text style={[ctx.s.meta, { marginTop: 4 }]}>Add rates for {E.missingBalanceCurrencies.join(", ")} to see one converted total</Text>}
      </LinearGradient>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Monthly spending total ${ctx.money(E.spent, E.currency)}. Tap to view currencies and accounts.`}
        onPress={toggleAccountBreakdown}
      >
        <Glass ctx={ctx} style={{ ...ctx.s.card, padding: 17, marginBottom: 10 }}>
          <View style={[ctx.s.herotop, { alignItems: "center" }]}>
            <Text style={[ctx.s.meta, { fontSize: 11 }]}>{`TOTAL SPENT · ${monthName.toUpperCase()} · ${E.currency}`}</Text>
            <ArrowUpRight size={18} color={ctx.T.coral} />
          </View>
          <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: ctx.T.text, fontSize: 32, fontWeight: "800", marginTop: 7 }}>
            {ctx.money(E.spent, E.currency)}
          </Text>
          <Text style={[ctx.s.meta, { marginTop: 5 }]}>{accountBreakdownOpen ? "Tap to close account breakdown" : "Tap to view spending by currency and account"}</Text>
          {E.convertedMonthSummary
            ? <Text style={[ctx.s.meta, { marginTop: 4 }]}>Includes all recorded currencies converted with saved effective rates</Text>
            : E.monthCurrencyTotals.length > 1 && <Text style={[ctx.s.meta, { marginTop: 4 }]}>Amounts in other currencies stay separate until rates are saved</Text>}
        </Glass>
      </Pressable>

      <View style={ctx.s.stats}>
        <Glass ctx={ctx} style={ctx.s.stat}>
          <View style={[ctx.s.statIcon, { backgroundColor: ctx.T.mint + "20" }]}><ArrowDownLeft size={15} color={ctx.T.mint} /></View>
          <Text style={ctx.s.meta}>{`Monthly Income · ${E.currency}`}</Text>
          <Text style={ctx.s.statValue}>{ctx.money(E.income, E.currency)}</Text>
        </Glass>
        <Glass ctx={ctx} style={ctx.s.stat}>
          <View style={[ctx.s.statIcon, { backgroundColor: ctx.T.violet + "20" }]}><Wallet size={15} color={ctx.T.violet} /></View>
          <Text style={ctx.s.meta}>{`Net · ${E.currency}`}</Text>
          <Text style={ctx.s.statValue}>{ctx.money(E.income - E.spent, E.currency)}</Text>
        </Glass>
      </View>

      {accountBreakdownOpen && <>
        <Section ctx={ctx} title="Spending tree" right="Close" onPress={toggleAccountBreakdown} />
        <Glass ctx={ctx} style={ctx.s.card}>
          {spendCurrencies.map((code) => {
            const currencyTotal = E.monthCurrencyTotals.find((item) => item.currency === code)?.spent || 0;
            const currencyAccounts = E.spendByAccount.filter((account) => account.currency === code).sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name));
            const currencyOpen = expandedCurrency === code;
            return <View key={code} style={{ borderBottomWidth: 1, borderBottomColor: ctx.T.divider, paddingVertical: 5 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${code} monthly spending total ${ctx.money(currencyTotal, code)}`}
                onPress={() => { setExpandedCurrency((current) => current === code ? null : code); setExpandedAccountId(null); }}
                style={[ctx.s.row, { paddingHorizontal: 2 }]}
              >
                <ChevronRight size={16} color={ctx.T.mint} style={{ transform: [{ rotate: currencyOpen ? "90deg" : "0deg" }] }} />
                <View style={{ flex: 1 }}>
                  <Text style={ctx.s.title}>{`${code} total`}</Text>
                  <Text style={ctx.s.meta}>{`${currencyAccounts.length} account${currencyAccounts.length === 1 ? "" : "s"}`}</Text>
                </View>
                <Text style={ctx.s.value}>{ctx.money(currencyTotal, code)}</Text>
              </Pressable>
              {currencyOpen && <View style={{ marginLeft: 11, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: ctx.T.edge }}>
                {currencyAccounts.map((account) => {
                  const accountTx = E.tx.filter((item) => item.kind === "expense" && item.accountId === account.accountId && item.currency === account.currency && String(item.date).slice(0, 7) === currentMonthKey).sort((a, b) => b.date.localeCompare(a.date));
                  const accountOpen = expandedAccountId === account.accountId;
                  return <View key={account.accountId}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${account.name}, ${ctx.money(account.spent, account.currency)} spent`}
                      onPress={() => setExpandedAccountId((id) => id === account.accountId ? null : account.accountId)}
                      style={[ctx.s.row, { paddingHorizontal: 2 }]}
                    >
                      <ChevronRight size={14} color={ctx.T.blue} style={{ transform: [{ rotate: accountOpen ? "90deg" : "0deg" }] }} />
                      <View style={{ flex: 1 }}>
                        <Text style={ctx.s.title}>{account.name}</Text>
                        <Text style={ctx.s.meta}>{`${cap(account.type)}${account.accountMask ? ` · ••${account.accountMask}` : ""} · ${account.count} transaction${account.count === 1 ? "" : "s"}`}</Text>
                      </View>
                      <Text style={ctx.s.value}>{ctx.money(account.spent, account.currency)}</Text>
                    </Pressable>
                    {accountOpen && <View style={{ marginLeft: 10, paddingLeft: 9, borderLeftWidth: 1, borderLeftColor: ctx.T.divider }}>
                      {accountTx.length ? accountTx.map((item) => <TxRow key={item.id} ctx={ctx} E={E} t={item} />) : <Text style={[ctx.s.meta, { paddingVertical: 8 }]}>No expense transactions this month.</Text>}
                    </View>}
                  </View>;
                })}
                {!currencyAccounts.length && <Text style={[ctx.s.meta, { paddingVertical: 8 }]}>No accounts in {code}.</Text>}
              </View>}
            </View>;
          })}
          {!spendCurrencies.length && <EmptyState ctx={ctx} text="Add an account to see spending here." />}
        </Glass>
      </>}

      <Section ctx={ctx} title="Spending breakdown" right="This month" onPress={() => E.setSubpage("Reports")} />
      <Glass ctx={ctx} style={ctx.s.card}>
        {E.catTotals.length ? E.catTotals.slice(0, 5).map(([n, v], i) => (
          <View key={n} style={ctx.s.cat}>
            <View style={ctx.s.herotop}><Text style={ctx.s.title}>{n}</Text><Text style={ctx.s.value}>{ctx.money(v)}</Text></View>
            <Bar ctx={ctx} value={E.categoryCurrencySpent ? (v / E.categoryCurrencySpent) * 100 : 0} color={[ctx.T.violet, ctx.T.mint, ctx.T.gold, ctx.T.blue, ctx.T.pink][i]} />
            <Text style={ctx.s.meta}>{Math.round(E.categoryCurrencySpent ? (v / E.categoryCurrencySpent) * 100 : 0)}% of {E.currency} spending</Text>
          </View>
        )) : <EmptyState ctx={ctx} text="No spending recorded this month yet." />}
      </Glass>

      <Section ctx={ctx} title="Recent transactions" right="See all" onPress={() => E.setSubpage("Transactions")} />
      <Glass ctx={ctx} style={ctx.s.card}>
        {E.tx.slice(0, 5).map((t) => <TxRow key={t.id} ctx={ctx} E={E} t={t} />)}
        {!E.tx.length && <EmptyState ctx={ctx} text="Use Quick Add to record your first transaction." />}
      </Glass>

      <Section ctx={ctx} title="Accounts" right="Manage" onPress={() => E.setSubpage("Accounts")} />
      <Glass ctx={ctx} style={ctx.s.card}>
        {E.accounts.map((a) => <Row key={a.id} ctx={ctx} title={a.name} sub={`${cap(a.type)} account · ${a.currency}${a.accountMask ? ` · ••${a.accountMask}` : ""}`} amount={ctx.money(a.balance, a.currency)} color={a.balance < 0 ? ctx.T.coral : ctx.T.text} icon={Landmark} onPress={() => E.setSubpage("Accounts")} />)}
      </Glass>
      <Text style={ctx.s.help}>When you record a bill payment, choose whether to add it to spending and budgets as an expense.</Text>
    </>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function TxRow({ ctx, E, t }: { ctx: ScreenProps["ctx"]; E: ScreenProps["E"]; t: Tx }) {
  const account = E.accounts.find((item) => item.id === t.accountId);
  const accountLabel = account ? `${account.name}${account.accountMask ? ` · ••${account.accountMask}` : ""}` : t.accountName || "Account unknown";
  const sourceLabel = t.source === "sms" ? "SMS import" : t.source === "csv" ? "CSV import" : t.source === "bill_payment" ? "Bill payment" : "Manual";
  return (
    <Row
      ctx={ctx}
      title={t.title}
      sub={`${t.category} · ${accountLabel} · ${sourceLabel} · ${ctx.fmtDate(t.date)}`}
      amount={(t.kind === "income" ? "+" : t.kind === "transfer" ? "↔ " : "−") + ctx.money(t.amount, t.currency)}
      color={t.kind === "income" ? ctx.T.mint : t.kind === "transfer" ? ctx.T.blue : ctx.T.text}
      icon={t.kind === "income" ? ArrowDownLeft : t.kind === "transfer" ? ArrowLeftRight : ArrowUpRight}
      onPress={() => { E.setSelected(t); E.setSubpage("Transaction detail"); }}
    />
  );
}

// ---------------- All Transactions (grouped, search + filters) ----------------
export function TransactionsScreen({ E, ctx }: ScreenProps) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [accountFilter, setAccountFilter] = useState("All");
  const [datePreset, setDatePreset] = useState("All time");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [serverRows, setServerRows] = useState<Tx[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const requestVersion = useRef(0);
  const now = new Date();
  const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStart = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}-01`;
  const lastMonthEnd = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, "0")}-${String(new Date(now.getFullYear(), now.getMonth(), 0).getDate()).padStart(2, "0")}`;
  const startDate = datePreset === "This month" ? thisMonthStart : datePreset === "Last month" ? lastMonthStart : datePreset === "Custom" ? customStart : "";
  const endDate = datePreset === "Last month" ? lastMonthEnd : datePreset === "Custom" ? customEnd : "";
  const sourceValue: Record<string, string> = { Manual: "manual", CSV: "csv", "Reviewed SMS": "sms", "Bill payment": "bill_payment" };
  const categoryOptions = [...new Set(E.tx.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const filters = { search: q.trim(), type: filter === "All" ? "" : filter.toLowerCase(), category: categoryFilter === "All" ? "" : categoryFilter, source: sourceFilter === "All" ? "" : sourceValue[sourceFilter] || "", accountId: accountFilter === "All" ? "" : accountFilter, startDate, endDate };
  const filterKey = JSON.stringify(filters);
  const fromRow = (raw: any): Tx => {
    const account = E.accounts.find((item) => item.id === raw.account_id);
    return {
      id: raw.id, title: raw.description || raw.category || "Transaction", category: raw.category || "Other",
      amount: Number(raw.amount), currency: raw.currency || account?.currency || E.currency,
      toAmount: raw.to_amount == null ? undefined : Number(raw.to_amount), toCurrency: raw.to_currency,
      exchangeRate: raw.exchange_rate == null ? undefined : Number(raw.exchange_rate), kind: raw.type,
      date: String(raw.date || "").slice(0, 10), note: raw.note || "", accountId: raw.account_id,
      accountName: account?.name, accountMask: account?.accountMask || null,
      toAccountId: raw.to_account_id, toAccountName: E.accounts.find((item) => item.id === raw.to_account_id)?.name,
      source: raw.source || "manual",
    };
  };
  const loadPage = async (nextPage: number) => {
    if (!E.cloud || E.offline) return;
    const version = requestVersion.current;
    setLoading(true); setServerError("");
    try {
      const result = await rest.apiTransactionPage({ ...filters, page: nextPage, limit: 40 });
      if (version !== requestVersion.current) return;
      const mapped = result.data.map(fromRow);
      setServerRows((previous) => nextPage === 1 ? mapped : [...previous, ...mapped]);
      setTotal(result.total); setPage(nextPage); setHasMore(result.hasMore);
    } catch (error: any) {
      if (version === requestVersion.current) setServerError(error?.message || "Could not load transaction history.");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  };
  useEffect(() => {
    requestVersion.current += 1;
    const version = requestVersion.current;
    if (!E.cloud || E.offline) {
      const local = E.tx.filter((item) => (!filters.type || item.kind === filters.type)
        && (!filters.category || item.category === filters.category)
        && (!filters.source || item.source === filters.source)
        && (!filters.accountId || item.accountId === filters.accountId)
        && (!filters.startDate || item.date >= filters.startDate)
        && (!filters.endDate || item.date <= filters.endDate)
        && (item.title + " " + item.category).toLowerCase().includes(filters.search.toLowerCase()))
        .sort((a, b) => b.date.localeCompare(a.date));
      setServerRows(local.slice(0, 40)); setTotal(local.length); setHasMore(false); setLoading(false); setServerError("");
      return;
    }
    setServerRows([]); setTotal(0); setHasMore(false); setPage(1);
    const timer = setTimeout(() => { if (requestVersion.current === version) void loadPage(1); }, 280);
    return () => clearTimeout(timer);
  }, [filterKey, E.cloud, E.offline, E.tx]);
  const list = serverRows;
  const groups = useMemo(() => {
    const m: Record<string, Tx[]> = {};
    list.forEach((t) => { const k = ctx.fmtDate(t.date); (m[k] = m[k] || []).push(t); });
    return Object.entries(m);
  }, [list, ctx]);
  const accountLabel = (id: string) => {
    const account = E.accounts.find((item) => item.id === id);
    return account ? `${account.name} · ${account.currency} · ${account.id.slice(0, 6)}` : "All accounts";
  };
  return (
    <>
      <Header ctx={ctx} title="All transactions" sub={`${total} records · search and filter`} />
      <View style={[ctx.s.amountBox, { height: 46 }]}>
        <Search size={15} color={ctx.T.muted} />
        <TextInput accessibilityLabel="Search transactions" value={q} onChangeText={setQ} placeholder="Search by name or category" placeholderTextColor={ctx.T.faint} style={{ flex: 1, color: ctx.T.text, fontSize: 11 }} />
      </View>
      <Chips ctx={ctx} options={["All", "Income", "Expense", "Transfer"]} value={filter} onChange={setFilter} />
      <Text style={[ctx.s.meta, { marginTop: 8, marginBottom: 5 }]}>Category</Text>
      <Chips ctx={ctx} options={["All categories", ...categoryOptions]} value={categoryFilter === "All" ? "All categories" : categoryFilter} onChange={(value) => setCategoryFilter(value === "All categories" ? "All" : value)} />
      <Text style={[ctx.s.meta, { marginTop: 8, marginBottom: 5 }]}>Account</Text>
      <Chips ctx={ctx} options={["All accounts", ...E.accounts.map((account) => accountLabel(account.id))]} value={accountFilter === "All" ? "All accounts" : accountLabel(accountFilter)} onChange={(value) => setAccountFilter(value === "All accounts" ? "All" : E.accounts.find((account) => accountLabel(account.id) === value)?.id || "All")} />
      <Text style={[ctx.s.meta, { marginTop: 8, marginBottom: 5 }]}>Date range</Text>
      <Chips ctx={ctx} options={["All time", "This month", "Last month", "Custom"]} value={datePreset} onChange={setDatePreset} />
      {datePreset === "Custom" && <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}><Field ctx={ctx} label="From (YYYY-MM-DD)" value={customStart} onChangeText={setCustomStart} /></View>
        <View style={{ flex: 1 }}><Field ctx={ctx} label="To (YYYY-MM-DD)" value={customEnd} onChangeText={setCustomEnd} /></View>
      </View>}
      <Text style={[ctx.s.meta, { marginTop: 8, marginBottom: 5 }]}>Recorded via</Text>
      <Chips ctx={ctx} options={["All", "Manual", "CSV", "Reviewed SMS", "Bill payment"]} value={sourceFilter} onChange={setSourceFilter} />
      {E.offline && <Text style={ctx.s.help}>Showing locally cached history. Reconnect to load older filtered pages.</Text>}
      {!!serverError && <Text accessibilityRole="alert" style={ctx.s.help}>{serverError}</Text>}
      {groups.map(([day, items]) => (
        <View key={day}>
          <Text style={[ctx.s.eyebrow, { marginTop: 12 }]}>{day.toUpperCase()}</Text>
          <Glass ctx={ctx} style={ctx.s.card}>
            {items.map((t) => <TxRow key={t.id} ctx={ctx} E={E} t={t} />)}
          </Glass>
        </View>
      ))}
      {hasMore && <Pressable accessibilityRole="button" style={[ctx.s.ghostBtn, { alignSelf: "center", marginTop: 10 }]} disabled={loading} onPress={() => { void loadPage(page + 1); }}><Text style={{ color: ctx.T.mint, fontSize: 11, fontWeight: "700" }}>{loading ? "Loading…" : `Load more · ${Math.max(0, total - list.length)} remaining`}</Text></Pressable>}
      {loading && !list.length && <Text style={ctx.s.help}>Loading transactions…</Text>}
      {!groups.length && <EmptyState ctx={ctx} text="Nothing matches your search." />}
    </>
  );
}

// ---------------- Transaction Detail + Edit + Delete ----------------
export function TransactionDetailScreen({ E, ctx }: ScreenProps) {
  const t: Tx = E.selected;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(t?.title || "");
  const [amount, setAmount] = useState(String(t?.amount || ""));
  const [receivedAmount, setReceivedAmount] = useState(String(t?.toAmount || t?.amount || ""));
  const [category, setCategory] = useState(t?.category || "Other");
  const [date, setDate] = useState(t?.date || ctx.iso());
  const [note, setNote] = useState(t?.note || "");
  if (!t) return null;
  const acc = E.accounts.find((a) => a.id === t.accountId);
  const destination = E.accounts.find((a) => a.id === t.toAccountId);
  if (editing) {
    return (
      <>
        <Header ctx={ctx} title="Edit transaction" sub="Update the details and save." />
        <Glass ctx={ctx}>
          <Field ctx={ctx} label="Title" value={title} onChangeText={setTitle} />
        <AmountField ctx={ctx} symbol={E.accounts.find((a) => a.id === (E.selected?.accountId || E.accounts[0]?.id))?.currency || E.currency} value={amount} onChangeText={setAmount} />
          {t.kind === "transfer" && t.toCurrency !== t.currency && <>
            <AmountField ctx={ctx} symbol={t.toCurrency || E.accounts.find((a) => a.id === t.toAccountId)?.currency || E.currency} value={receivedAmount} onChangeText={setReceivedAmount} />
            {!!Number(amount) && !!Number(receivedAmount) && <Text style={ctx.s.meta}>Rate: 1 {t.currency} = {(Number(receivedAmount) / Number(amount)).toFixed(6)} {t.toCurrency}</Text>}
          </>}
          <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Category</Text>
          <Chips ctx={ctx} options={CATS.slice(0, 8)} value={category} onChange={setCategory} />
        <Field ctx={ctx} label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
          <Field ctx={ctx} label="Note" value={note} onChangeText={setNote} multiline placeholder="Optional note" />
          <PrimaryButton ctx={ctx} label="Save changes" onPress={() => E.editTx(t.id, { title: title.trim() || t.title, amount: Number(amount) || t.amount, category, date, note, toAmount: t.kind === "transfer" ? Number(receivedAmount) || t.toAmount || t.amount : undefined, exchangeRate: t.kind === "transfer" && t.toCurrency !== t.currency ? (Number(receivedAmount) || t.toAmount || t.amount) / (Number(amount) || t.amount) : undefined })} />
          <Pressable onPress={() => setEditing(false)}><Text style={ctx.s.authLink}>Cancel</Text></Pressable>
        </Glass>
      </>
    );
  }
  return (
    <>
      <Header ctx={ctx} title="Transaction detail" sub={t.kind === "expense" ? "Money going out" : t.kind === "income" ? "Money coming in" : "Moving between accounts"} />
      <Glass ctx={ctx}>
        <Text style={ctx.s.statBig}>{(t.kind === "income" ? "+" : t.kind === "transfer" ? "↔ " : "−") + ctx.money(t.amount, t.currency)}</Text>
        <Text style={[ctx.s.title, { marginTop: 2 }]}>{t.title}</Text>
        <Row ctx={ctx} title="Type" sub="Record kind" amount={cap(t.kind)} />
        <Row ctx={ctx} title="Category" sub="Spending bucket" amount={t.category} />
        <Row ctx={ctx} title="Date" sub="When it happened" amount={ctx.fmtDate(t.date)} />
        <Row ctx={ctx} title="Account" sub={`${acc?.institutionName || cap(acc?.type || "account")}${acc?.accountMask ? ` · ••${acc.accountMask}` : ""}`} amount={acc ? acc.name : t.accountName || "Account unknown"} icon={CreditCard} />
        {t.kind === "transfer" && <>
          <Row ctx={ctx} title="To account" sub="Transfer destination" amount={destination?.name || t.toAccountName || "Account unknown"} icon={CreditCard} />
          <Row ctx={ctx} title="Amount received" sub={t.exchangeRate ? `Exchange rate 1 ${t.currency} = ${t.exchangeRate.toFixed(6)} ${t.toCurrency || destination?.currency || ""}` : "Same currency transfer"} amount={ctx.money(t.toAmount ?? t.amount, t.toCurrency || destination?.currency || t.currency)} />
        </>}
        <Row ctx={ctx} title="Recorded via" sub="Transaction source" amount={t.source === "sms" ? "Reviewed SMS" : t.source === "csv" ? "CSV import" : t.source === "bill_payment" ? "Bill payment" : "Manual entry"} />
        {!!t.note && <Row ctx={ctx} title="Note" sub={t.note} amount="" />}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
          <Pressable style={[ctx.s.save, { flex: 1, justifyContent: "center", gap: 5, flexDirection: "row", marginTop: 0 }]} onPress={() => setEditing(true)}>
            <Pencil size={14} color={ctx.T.primaryBtnText} /><Text style={ctx.s.saveText}>Edit</Text>
          </Pressable>
          <Pressable style={[ctx.s.deleteButton, { flex: 1, marginTop: 0, flexDirection: "row", justifyContent: "center", gap: 5, alignItems: "center" }]} onPress={() => E.deleteTx(t.id)}>
            <Trash2 size={14} color={ctx.T.coral} /><Text style={{ color: ctx.T.coral, fontSize: 11, fontWeight: "700" }}>Delete</Text>
          </Pressable>
        </View>
      </Glass>
    </>
  );
}

// ---------------- Add Transaction ----------------
export function AddTransactionScreen({ E, ctx }: ScreenProps) {
  const [kind, setKind] = useState("Expense");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food & Dining");
  const [accountId, setAccountId] = useState(E.accounts[0]?.id || "");
  const [toAccountId, setToAccountId] = useState(E.accounts[1]?.id || "");
  const [toAmount, setToAmount] = useState("");
  const [date, setDate] = useState(ctx.iso());
  const [note, setNote] = useState("");
  const sourceAccount = E.accounts.find((a) => a.id === accountId);
  const targetAccount = E.accounts.find((a) => a.id === toAccountId);
  useEffect(() => {
    if (!E.accounts.some((account) => account.id === accountId)) setAccountId(E.accounts[0]?.id || "");
    if (toAccountId === accountId || !E.accounts.some((account) => account.id === toAccountId)) setToAccountId(E.accounts.find((account) => account.id !== accountId)?.id || "");
  }, [E.accounts, accountId, toAccountId]);
  const accountLabel = (account: (typeof E.accounts)[number]) => `${account.name} · ${account.currency} · ${account.id.slice(0, 6)}`;
  const submit = () => E.quickAdd({ kind: kind as any, name, amount: Number(amount) || 0, extra: kind === "Transfer" ? "Transfer" : category, date, accountId, toAccountId, toAmount: Number(toAmount) || undefined, exchangeRate: targetAccount && sourceAccount && targetAccount.currency !== sourceAccount.currency ? Number(toAmount) / Number(amount) : undefined, note });
  return (
    <>
      <Header ctx={ctx} title="Add transaction" sub="Record an expense, income or transfer." />
      <Glass ctx={ctx}>
        <Chips ctx={ctx} options={["Expense", "Income", "Transfer"]} value={kind} onChange={setKind} />
        <Field ctx={ctx} value={name} onChangeText={setName} placeholder={kind === "Income" ? "e.g. Freelance payment" : "e.g. Groceries"} />
        <AmountField ctx={ctx} symbol={sourceAccount?.currency || E.currency} value={amount} onChangeText={setAmount} />
        {kind !== "Transfer" && (
          <>
            <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Category</Text>
            <Chips ctx={ctx} options={CATS.slice(0, 8)} value={category} onChange={setCategory} />
          </>
        )}
        <Text style={[ctx.s.meta, { marginBottom: 5 }]}>From account</Text>
        {E.accounts.length ? <Chips ctx={ctx} options={E.accounts.map(accountLabel)} value={sourceAccount ? accountLabel(sourceAccount) : ""} onChange={(label) => setAccountId(E.accounts.find((account) => accountLabel(account) === label)?.id || "")} /> : <View style={{ marginBottom: 12 }}>
          <Text style={ctx.s.meta}>No accounts yet. Add a bank, card, or cash account before recording a transaction.</Text>
          <Pressable accessibilityRole="button" onPress={() => E.setSubpage("Accounts")} style={{ paddingVertical: 10 }}><Text style={ctx.s.link}>Create an account</Text></Pressable>
        </View>}
        {kind === "Transfer" && <>
          <Text style={[ctx.s.meta, { marginBottom: 5 }]}>To account</Text>
          <Chips ctx={ctx} options={E.accounts.filter((a) => a.id !== accountId).map(accountLabel)} value={targetAccount ? accountLabel(targetAccount) : ""} onChange={(label) => setToAccountId(E.accounts.find((account) => account.id !== accountId && accountLabel(account) === label)?.id || "")} />
          {!!targetAccount && !!sourceAccount && targetAccount.currency !== sourceAccount.currency && <>
            <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Amount received ({targetAccount.currency})</Text>
            <AmountField ctx={ctx} symbol={targetAccount.currency} value={toAmount} onChangeText={setToAmount} />
            {!!Number(amount) && !!Number(toAmount) && <Text style={ctx.s.meta}>Exchange rate: 1 {sourceAccount.currency} = {(Number(toAmount) / Number(amount)).toFixed(6)} {targetAccount.currency}</Text>}
          </>}
        </>}
        <Field ctx={ctx} label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
        <Field ctx={ctx} label="Note" value={note} onChangeText={setNote} multiline placeholder="Optional" />
        <PrimaryButton ctx={ctx} label="Save transaction" onPress={submit} disabled={!name.trim() || !Number(amount) || !E.accounts.length || (kind === "Transfer" && E.accounts.length < 2)} />
      </Glass>
    </>
  );
}

// ---------------- Accounts ----------------
export function AccountsScreen({ E, ctx }: ScreenProps) {
  const [sourceKind, setSourceKind] = useState("brokers");
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [reconcilingAccountId, setReconcilingAccountId] = useState<string | null>(null);
  const [actualBalance, setActualBalance] = useState("");
  const [reconciliationNote, setReconciliationNote] = useState("");
  const [accountName, setAccountName] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [accountMask, setAccountMask] = useState("");
  const [accountType, setAccountType] = useState("cash");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [accountCurrency, setAccountCurrency] = useState(E.currency || "INR");
  const selectedCategory = sourceKind as keyof typeof CONNECTION_OPTIONS;
  const clearAccountForm = () => {
    setEditingAccountId(null); setAccountName(""); setInstitutionName(""); setAccountMask("");
    setAccountType("cash"); setOpeningBalance("0"); setAccountCurrency(E.currency || "INR");
  };
  const startEditingAccount = (account: (typeof E.accounts)[number]) => {
    setEditingAccountId(account.id); setAccountName(account.name); setInstitutionName(account.institutionName || "");
    setAccountMask(account.accountMask || ""); setAccountType(account.type); setOpeningBalance(String(account.balance)); setAccountCurrency(account.currency);
  };
  const saveAccount = async () => {
    const balance = Number(openingBalance);
    if (!accountName.trim() || !Number.isFinite(balance) || !/^[A-Z]{3}$/.test(accountCurrency) || (accountMask && accountMask.length !== 4)) return;
    setAccountBusy(true);
    try {
      const values = { name: accountName.trim(), type: accountType, balance, currency: accountCurrency, institution_name: institutionName.trim(), account_mask: accountMask || null };
      const saved = editingAccountId ? await E.updateAccount(editingAccountId, values) : await E.addAccount(values);
      if (saved) clearAccountForm();
    } finally { setAccountBusy(false); }
  };
  const confirmDeleteAccount = (account: (typeof E.accounts)[number]) => {
    const linkedTransactions = E.tx.filter((transaction) => transaction.accountId === account.id).length;
    const linkedBills = E.bills.filter((bill) => bill.accountId === account.id).length;
    const linkedReconciliations = E.reconciliations.filter((item) => item.account_id === account.id).length;
    Alert.alert(
      `Delete ${account.name}?`,
      `This permanently deletes ${linkedTransactions} transaction${linkedTransactions === 1 ? "" : "s"} recorded from this account and ${linkedReconciliations} balance reconciliation record${linkedReconciliations === 1 ? "" : "s"}. ${linkedBills} bill${linkedBills === 1 ? "" : "s"} will remain but lose their account link. Transfers from other accounts will remain without this destination.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete account", style: "destructive", onPress: () => { void (async () => {
          setAccountBusy(true);
          try {
            const deleted = await E.removeAccount(account.id);
            if (deleted && editingAccountId === account.id) clearAccountForm();
          } finally { setAccountBusy(false); }
        })(); } },
      ],
    );
  };
  return (
    <>
      <Header ctx={ctx} title="Accounts" sub="Manage balances and record transactions manually." />
      <Glass ctx={ctx} style={ctx.s.card}>
        <Text style={ctx.s.title}>Manual accounts</Text>
        <Text style={[ctx.s.meta, { marginTop: 4, marginBottom: 12 }]}>Create, view, edit, and delete your bank, card, and cash accounts here. Account data is entered manually; it is not connected or synced automatically.</Text>
        {E.accounts.map((account) => <Row
          key={account.id} ctx={ctx} title={account.name}
          sub={`${cap(account.type)} · ${account.institutionName || "manual account"} · ${account.currency}${account.accountMask ? ` · ••${account.accountMask}` : ""}`}
          amount={ctx.money(account.balance, account.currency)} icon={Wallet}
          right={<View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Reconcile ${account.name} balance`} style={[ctx.s.pay, { paddingHorizontal: 8 }]} disabled={accountBusy} onPress={() => { setReconcilingAccountId((id) => id === account.id ? null : account.id); setActualBalance(String(account.balance)); setReconciliationNote(""); }}><Text style={{ color: ctx.T.blue, fontSize: 9, fontWeight: "700" }}>Reconcile</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${account.name}`} style={ctx.s.pay} disabled={accountBusy} onPress={() => startEditingAccount(account)}><Pencil size={14} color={ctx.T.mint} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${account.name}`} style={ctx.s.pay} disabled={accountBusy} onPress={() => confirmDeleteAccount(account)}><Trash2 size={14} color={ctx.T.coral} /></Pressable>
          </View>}
        />)}
        {!!reconcilingAccountId && (() => {
          const account = E.accounts.find((item) => item.id === reconcilingAccountId);
          if (!account) return null;
          const history = E.reconciliations.filter((item) => item.account_id === account.id).slice(0, 3);
          return <View style={[ctx.s.cat, { borderTopWidth: 1, borderTopColor: ctx.T.edge, marginTop: 8, paddingTop: 12 }]}>
            <Text style={ctx.s.title}>Reconcile {account.name}</Text>
            <Text style={[ctx.s.meta, { marginTop: 3, marginBottom: 8 }]}>Enter the balance shown by your bank/card statement. The app records the difference in a separate audit history and does not create a spending transaction.</Text>
            <AmountField ctx={ctx} symbol={account.currency} value={actualBalance} onChangeText={setActualBalance} />
            <Field ctx={ctx} label="Note (optional)" value={reconciliationNote} onChangeText={setReconciliationNote} placeholder="Statement date or reason" />
            <PrimaryButton ctx={ctx} label="Save reconciliation" onPress={() => { void (async () => {
              setAccountBusy(true);
              try { if (await E.reconcileAccount(account.id, Number(actualBalance), reconciliationNote)) setReconcilingAccountId(null); }
              finally { setAccountBusy(false); }
            })(); }} disabled={accountBusy || actualBalance.trim() === "" || !Number.isFinite(Number(actualBalance))} />
            {!!history.length && <>
              <Text style={[ctx.s.meta, { marginTop: 10 }]}>Recent reconciliation history</Text>
              {history.map((item) => <Text key={item.id} style={[ctx.s.meta, { marginTop: 4 }]}>{item.reconciled_at.slice(0, 10)} · {ctx.money(item.system_balance, account.currency)} → {ctx.money(item.actual_balance, account.currency)} · adjustment {ctx.money(item.adjustment, account.currency)}{item.note ? ` · ${item.note}` : ""}</Text>)}
            </>}
          </View>;
        })()}
        {!E.accounts.length && <EmptyState ctx={ctx} text="No accounts yet. Add one to record transactions and organize spending." />}
        <Field ctx={ctx} label="Account name" value={accountName} onChangeText={setAccountName} placeholder="e.g. Salary account" />
        <Field ctx={ctx} label="Bank / card issuer (optional)" value={institutionName} onChangeText={setInstitutionName} placeholder="e.g. HDFC Bank" />
        <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Type</Text>
        <Chips ctx={ctx} options={["cash", "bank", "credit"]} value={accountType} onChange={setAccountType} />
        <Field ctx={ctx} label="Last four digits only (optional)" value={accountMask} onChangeText={(value) => setAccountMask(value.replace(/\D/g, "").slice(-4))} keyboardType="number-pad" placeholder="5352" />
        <Field ctx={ctx} label={editingAccountId ? "Current balance" : "Opening balance"} value={openingBalance} onChangeText={setOpeningBalance} keyboardType="decimal-pad" />
        {!!editingAccountId && <Text style={[ctx.s.meta, { marginTop: -3, marginBottom: 8 }]}>Use Reconcile to set the statement balance and keep an audit record. Editing this field directly changes only the account total.</Text>}
        <Field ctx={ctx} label="Currency (3-letter ISO code)" value={accountCurrency} onChangeText={(value) => setAccountCurrency(value.toUpperCase().slice(0, 3))} placeholder="USD" />
        <PrimaryButton ctx={ctx} label={accountBusy ? "Saving…" : editingAccountId ? "Save account changes" : "Add manual account"} onPress={() => { void saveAccount(); }} disabled={accountBusy || !accountName.trim() || !Number.isFinite(Number(openingBalance)) || !/^[A-Z]{3}$/.test(accountCurrency) || (!!accountMask && accountMask.length !== 4)} />
        {!!editingAccountId && <Pressable accessibilityRole="button" onPress={clearAccountForm} style={{ alignSelf: "center", paddingVertical: 10 }}><Text style={ctx.s.link}>Cancel editing</Text></Pressable>}
      </Glass>
      <Glass ctx={ctx} style={ctx.s.card}>
        <Text style={ctx.s.title}>Other connections</Text>
        <Text style={[ctx.s.meta, { marginTop: 4, marginBottom: 10 }]}>Optional investment broker and card connections are separate from bank accounts.</Text>
        <Chips ctx={ctx} options={["Brokers", "Cards"]} value={sourceKind === "brokers" ? "Brokers" : "Cards"} onChange={(label) => setSourceKind(label === "Brokers" ? "brokers" : "cards")} />
        {CONNECTION_OPTIONS[selectedCategory].map((item) => <ProviderOption key={item.provider} ctx={ctx} item={item} onPress={() => { E.setSelected(item); E.setSubpage("Provider setup"); }} />)}
      </Glass>
    </>
  );
}

function ProviderOption({ ctx, item, onPress }: { ctx: ScreenProps["ctx"]; item: any; onPress: () => void }) {
  const logo = PROVIDER_LOGOS[item.provider];
  return (
    <Pressable onPress={onPress} style={ctx.s.row}>
      <View style={{ width: 48, height: 42, borderRadius: 9, overflow: "hidden", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}>
        {logo ? <Image source={logo} resizeMode="contain" style={{ width: 46, height: 40 }} /> : <Landmark size={18} color={ctx.T.blue} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={ctx.s.title}>{item.label}</Text>
        <Text style={[ctx.s.meta, { marginTop: 2 }]} numberOfLines={1}>{item.desc}</Text>
      </View>
      <ChevronRight size={17} color={ctx.T.faint} />
    </Pressable>
  );
}

export function ProviderSetupScreen({ E, ctx }: ScreenProps) {
  const provider = E.selected as { provider: string; label: string; desc: string } | null;
  const logo = provider ? PROVIDER_LOGOS[provider.provider] : null;
  return (
    <>
      <Header ctx={ctx} title={provider?.label || "Provider connection"} sub={provider?.desc || "Account connection setup"} />
      <Glass ctx={ctx} style={{ ...ctx.s.card, alignItems: "center", paddingVertical: 28 }}>
        {logo && <View style={{ width: 58, height: 48, borderRadius: 10, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: 18 }}><Image source={logo} resizeMode="contain" style={{ width: 54, height: 44 }} /></View>}
        <AlertTriangle size={38} color={ctx.T.gold} />
        <Text style={[ctx.s.title, { fontSize: 16, marginTop: 14 }]}>Under construction</Text>
        <Text style={[ctx.s.meta, { textAlign: "center", marginTop: 8, lineHeight: 17 }]}>
          {provider?.label || "This provider"} account connection is being prepared. You can return to the provider list and choose another option.
        </Text>
      </Glass>
    </>
  );
}

// ---------------- Categories ----------------
export function CategoriesScreen({ E, ctx }: ScreenProps) {
  return (
    <>
      <Header ctx={ctx} title="Categories" sub="Where your spending goes this month." />
      <Glass ctx={ctx} style={ctx.s.card}>
        {(E.catTotals.length ? E.catTotals : ([["No spending yet", 0]] as [string, number][])).map(([n, v]) => (
          <View key={n} style={ctx.s.cat}>
            <Row ctx={ctx} title={n} sub="Expense category" amount={ctx.money(v)} icon={Tags} />
            <Bar ctx={ctx} value={E.spent ? (v / E.spent) * 100 : 0} color={ctx.T.violet} />
          </View>
        ))}
      </Glass>
      <Text style={ctx.s.help}>Categories come from your transactions. Set monthly limits in Settings → Budgets.</Text>
    </>
  );
}
