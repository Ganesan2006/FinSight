// ============================================================
// SPEND TAB — Dashboard + support screens:
// All Transactions (search/filter) · Transaction Detail ·
// Edit Transaction · Add Transaction · Accounts · Categories
// ============================================================
import React, { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CreditCard, Landmark, Pencil, Plus, Search, ShieldCheck, Tags, Trash2, Wallet } from "lucide-react-native";
import { ScreenProps } from "../types";
import { AmountField, Badge, Bar, Chips, EmptyState, Field, Glass, Header, PrimaryButton, Row, Section } from "../../components/glass/primitives";
import { Tx } from "../../lib/engine";

const CATS = ["Food & Dining", "Transport", "Shopping", "Bills", "Health", "Entertainment", "Education", "Travel", "Salary", "Side income", "Transfer", "Other"];

export function SpendTab({ E, ctx }: ScreenProps) {
  const first = (E.profile?.fullName || "friend").trim().split(/\s+/)[0];
  const monthName = new Date().toLocaleDateString("en-IN", { month: "long" });
  return (
    <>
      <Header ctx={ctx} title={`Good morning, ${first}`} sub={`Your money at a glance · ${monthName}`} />
      <LinearGradient colors={ctx.T.heroGrad} style={ctx.s.hero}>
        <View style={ctx.s.herotop}>
          <Text style={ctx.s.meta}>Total available balance</Text>
          <View style={ctx.s.secure}><ShieldCheck size={13} color={ctx.T.mint} /><Text style={ctx.s.secureText}>PRIVATE</Text></View>
        </View>
        <Text style={ctx.s.big}>{ctx.money(E.balance)}</Text>
        <Text style={ctx.s.meta}>● Across {E.accounts.length} account{E.accounts.length === 1 ? "" : "s"} · updated today</Text>
      </LinearGradient>

      <View style={ctx.s.stats}>
        {([[ArrowDownLeft, "Monthly Income", ctx.money(E.income), ctx.T.mint], [ArrowUpRight, "Monthly Spent", ctx.money(E.spent), ctx.T.coral], [Wallet, "Budget Remaining", ctx.money(Math.max(0, E.income - E.spent)), ctx.T.violet]] as any[]).map(([I, l, v, c]) => (
          <Glass key={l} ctx={ctx} style={ctx.s.stat}>
            <View style={[ctx.s.statIcon, { backgroundColor: c + "20" }]}><I size={15} color={c} /></View>
            <Text style={ctx.s.meta}>{l}</Text>
            <Text style={ctx.s.statValue}>{v}</Text>
          </Glass>
        ))}
      </View>

      <Section ctx={ctx} title="Spending breakdown" right="This month" onPress={() => E.setSubpage("Reports")} />
      <Glass ctx={ctx} style={ctx.s.card}>
        {E.catTotals.length ? E.catTotals.slice(0, 5).map(([n, v], i) => (
          <View key={n} style={ctx.s.cat}>
            <View style={ctx.s.herotop}><Text style={ctx.s.title}>{n}</Text><Text style={ctx.s.value}>{ctx.money(v)}</Text></View>
            <Bar ctx={ctx} value={E.spent ? (v / E.spent) * 100 : 0} color={[ctx.T.violet, ctx.T.mint, ctx.T.gold, ctx.T.blue, ctx.T.pink][i]} />
            <Text style={ctx.s.meta}>{Math.round(E.spent ? (v / E.spent) * 100 : 0)}% of spending</Text>
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
        {E.accounts.map((a) => <Row key={a.id} ctx={ctx} title={a.name} sub={cap(a.type) + " account"} amount={ctx.money(a.balance)} color={a.balance < 0 ? ctx.T.coral : ctx.T.text} icon={Landmark} onPress={() => E.setSubpage("Accounts")} />)}
      </Glass>
      <Text style={ctx.s.help}>Tip: bills you mark as paid automatically appear here as expenses.</Text>
    </>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function TxRow({ ctx, E, t }: { ctx: ScreenProps["ctx"]; E: ScreenProps["E"]; t: Tx }) {
  return (
    <Row
      ctx={ctx}
      title={t.title}
      sub={t.category + " · " + ctx.fmtDate(t.date)}
      amount={(t.kind === "income" ? "+" : t.kind === "transfer" ? "↔ " : "−") + ctx.money(t.amount)}
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
  const list = useMemo(() => {
    return E.tx.filter((t) => (filter === "All" || t.kind === filter.toLowerCase()) && (t.title + " " + t.category).toLowerCase().includes(q.toLowerCase()));
  }, [E.tx, q, filter]);
  const groups = useMemo(() => {
    const m: Record<string, Tx[]> = {};
    list.forEach((t) => { const k = ctx.fmtDate(t.date); (m[k] = m[k] || []).push(t); });
    return Object.entries(m);
  }, [list, ctx]);
  return (
    <>
      <Header ctx={ctx} title="All transactions" sub={`${list.length} records · search and filter`} />
      <View style={[ctx.s.amountBox, { height: 46 }]}>
        <Search size={15} color={ctx.T.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search by name or category" placeholderTextColor={ctx.T.faint} style={{ flex: 1, color: ctx.T.text, fontSize: 11 }} />
      </View>
      <Chips ctx={ctx} options={["All", "Income", "Expense", "Transfer"]} value={filter} onChange={setFilter} />
      {groups.map(([day, items]) => (
        <View key={day}>
          <Text style={[ctx.s.eyebrow, { marginTop: 12 }]}>{day.toUpperCase()}</Text>
          <Glass ctx={ctx} style={ctx.s.card}>
            {items.map((t) => <TxRow key={t.id} ctx={ctx} E={E} t={t} />)}
          </Glass>
        </View>
      ))}
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
  const [category, setCategory] = useState(t?.category || "Other");
  const [date, setDate] = useState(t?.date || ctx.iso());
  const [note, setNote] = useState(t?.note || "");
  if (!t) return null;
  const acc = E.accounts.find((a) => a.id === t.accountId);
  if (editing) {
    return (
      <>
        <Header ctx={ctx} title="Edit transaction" sub="Update the details and save." />
        <Glass ctx={ctx}>
          <Field ctx={ctx} label="Title" value={title} onChangeText={setTitle} />
          <AmountField ctx={ctx} symbol="₹" value={amount} onChangeText={setAmount} />
          <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Category</Text>
          <Chips ctx={ctx} options={CATS.slice(0, 8)} value={category} onChange={setCategory} />
          <Field ctx={ctx} label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
          <Field ctx={ctx} label="Note" value={note} onChangeText={setNote} multiline placeholder="Optional note" />
          <PrimaryButton ctx={ctx} label="Save changes" onPress={() => E.editTx(t.id, { title: title.trim() || t.title, amount: Number(amount) || t.amount, category, date, note })} />
          <Pressable onPress={() => setEditing(false)}><Text style={ctx.s.authLink}>Cancel</Text></Pressable>
        </Glass>
      </>
    );
  }
  return (
    <>
      <Header ctx={ctx} title="Transaction detail" sub={t.kind === "expense" ? "Money going out" : t.kind === "income" ? "Money coming in" : "Moving between accounts"} />
      <Glass ctx={ctx}>
        <Text style={ctx.s.statBig}>{(t.kind === "income" ? "+" : t.kind === "transfer" ? "↔ " : "−") + ctx.money(t.amount)}</Text>
        <Text style={[ctx.s.title, { marginTop: 2 }]}>{t.title}</Text>
        <Row ctx={ctx} title="Type" sub="Record kind" amount={cap(t.kind)} />
        <Row ctx={ctx} title="Category" sub="Spending bucket" amount={t.category} />
        <Row ctx={ctx} title="Date" sub="When it happened" amount={ctx.fmtDate(t.date)} />
        <Row ctx={ctx} title="Account" sub="Payment method" amount={acc ? acc.name : "Main account"} icon={CreditCard} />
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
  const [date, setDate] = useState(ctx.iso());
  const [note, setNote] = useState("");
  const submit = () => E.quickAdd({ kind: kind as any, name, amount: Number(amount) || 0, extra: kind === "Transfer" ? "Transfer" : category, date, accountId });
  return (
    <>
      <Header ctx={ctx} title="Add transaction" sub="Record an expense, income or transfer." />
      <Glass ctx={ctx}>
        <Chips ctx={ctx} options={["Expense", "Income", "Transfer"]} value={kind} onChange={setKind} />
        <Field ctx={ctx} value={name} onChangeText={setName} placeholder={kind === "Income" ? "e.g. Freelance payment" : "e.g. Groceries"} />
        <AmountField ctx={ctx} symbol="₹" value={amount} onChangeText={setAmount} />
        {kind !== "Transfer" && (
          <>
            <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Category</Text>
            <Chips ctx={ctx} options={CATS.slice(0, 8)} value={category} onChange={setCategory} />
          </>
        )}
        <Text style={[ctx.s.meta, { marginBottom: 5 }]}>From account</Text>
        <Chips ctx={ctx} options={E.accounts.map((a) => a.name)} value={E.accounts.find((a) => a.id === accountId)?.name || ""} onChange={(n) => setAccountId(E.accounts.find((a) => a.name === n)?.id || "")} />
        <Field ctx={ctx} label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
        <Field ctx={ctx} label="Note" value={note} onChangeText={setNote} multiline placeholder="Optional" />
        <PrimaryButton ctx={ctx} label="Save transaction" onPress={submit} disabled={!name.trim() || !Number(amount)} />
      </Glass>
    </>
  );
}

// ---------------- Accounts ----------------
export function AccountsScreen({ E, ctx }: ScreenProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("Bank");
  const [balance, setBalance] = useState("");
  return (
    <>
      <Header ctx={ctx} title="Accounts" sub="Bank, cash and credit balances." />
      <Pressable style={[ctx.s.save, { marginBottom: 12 }]} onPress={() => setAdding((a) => !a)}>
        <Text style={ctx.s.saveText}>{adding ? "Close form" : "Add account"}</Text><Plus size={16} color={ctx.T.primaryBtnText} />
      </Pressable>
      {adding && (
        <Glass ctx={ctx} style={{ marginBottom: 12 }}>
          <Field ctx={ctx} value={name} onChangeText={setName} placeholder="Account name" />
          <Chips ctx={ctx} options={["Bank", "Cash", "Credit"]} value={type} onChange={setType} />
          <AmountField ctx={ctx} symbol="₹" value={balance} onChangeText={setBalance} />
          <PrimaryButton ctx={ctx} label="Create account" onPress={() => { if (name.trim()) { E.addAccount({ name: name.trim(), type: type.toLowerCase(), balance: Number(balance) || 0 }); setAdding(false); setName(""); setBalance(""); } }} />
        </Glass>
      )}
      <Glass ctx={ctx} style={ctx.s.card}>
        {E.accounts.map((a) => <Row key={a.id} ctx={ctx} title={a.name} sub={cap(a.type) + " · payment source"} amount={ctx.money(a.balance)} color={a.balance < 0 ? ctx.T.coral : ctx.T.text} icon={Landmark} />)}
      </Glass>
      <Glass ctx={ctx} style={ctx.s.note}>
        <Text style={ctx.s.meta}>Total across accounts</Text>
        <Text style={ctx.s.statBig}>{ctx.money(E.balance)}</Text>
        <View style={{ marginTop: 10 }}>
          <Badge ctx={ctx} label={"Net worth (liquid + investments): " + ctx.money(E.balance + E.portfolioValue)} color={ctx.T.violet} />
        </View>
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
