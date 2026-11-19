// ============================================================
// DUE TAB — Money owed (strictly separate from recurring Bills)
// Support: Add Due · Due Detail · Record Payment · Due History
// ============================================================
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ArrowLeftRight, CalendarClock, CheckCircle2, HandCoins, Pencil, Trash2, Users } from "lucide-react-native";
import { ScreenProps } from "../types";
import { AmountField, Badge, Bar, Chips, EmptyState, Field, Glass, Header, PrimaryButton, Row, Section } from "../../components/glass/primitives";
import { Due } from "../../lib/engine";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD"];

export function DueTab({ E, ctx }: ScreenProps) {
  const youOwe = E.dues.filter((d) => d.direction === "i_owe" && d.amount > d.paid);
  const owedToYou = E.dues.filter((d) => d.direction === "owed_to_me" && d.amount > d.paid);
  const groupByCurrency = (items: Due[]) => Object.values(items.reduce((totals: Record<string, { currency: string; amount: number }>, due) => {
    const current = totals[due.currency] || (totals[due.currency] = { currency: due.currency, amount: 0 });
    current.amount += Math.max(0, due.amount - due.paid);
    return totals;
  }, {})).sort((a, b) => a.currency.localeCompare(b.currency));
  const oweByCurrency = groupByCurrency(youOwe);
  const owedByCurrency = groupByCurrency(owedToYou);
  return (
    <>
      <Header ctx={ctx} title="Money between us" sub="Personal promises — not to be confused with recurring bills." />
      <View style={ctx.s.stats}>
        <Glass ctx={ctx} style={ctx.s.dues}>
          <Text style={ctx.s.meta}>You owe</Text>
          <Text style={[ctx.s.statBig, { color: ctx.T.coral }]}>{ctx.money(E.owe, E.currency)}</Text>
          <Text style={[ctx.s.meta, { marginTop: 6 }]}>{youOwe.length} open records</Text>
          {oweByCurrency.filter((item) => item.currency !== E.currency).map((item) => <Text key={item.currency} style={[ctx.s.meta, { marginTop: 3 }]}>{item.currency}: {ctx.money(item.amount, item.currency)} owed</Text>)}
        </Glass>
        <Glass ctx={ctx} style={ctx.s.dues}>
          <Text style={ctx.s.meta}>Others owe you</Text>
          <Text style={[ctx.s.statBig, { color: ctx.T.mint }]}>{ctx.money(E.owed, E.currency)}</Text>
          <Text style={[ctx.s.meta, { marginTop: 6 }]}>{owedToYou.length} open records</Text>
          {owedByCurrency.filter((item) => item.currency !== E.currency).map((item) => <Text key={item.currency} style={[ctx.s.meta, { marginTop: 3 }]}>{item.currency}: {ctx.money(item.amount, item.currency)} to collect</Text>)}
        </Glass>
      </View>

      <Section ctx={ctx} title="You owe" right="Add due" onPress={() => E.setSubpage("Add due")} />
      <Glass ctx={ctx} style={ctx.s.card}>
        {youOwe.length ? youOwe.map((d) => <DueRow key={d.id} ctx={ctx} E={E} d={d} />) : <EmptyState ctx={ctx} text="No outstanding dues where you owe money." />}
      </Glass>

      <Section ctx={ctx} title="Owed to you" right="Add due" onPress={() => E.setSubpage("Add due")} />
      <Glass ctx={ctx} style={ctx.s.card}>
        {owedToYou.length ? owedToYou.map((d) => <DueRow key={d.id} ctx={ctx} E={E} d={d} />) : <EmptyState ctx={ctx} text="Nobody owes you money right now." />}
      </Glass>

      <Text style={ctx.s.help}>
        ⚠ Due ≠ Bill. This tab tracks one-off personal lending between people (friends, clients, loans). Scheduled recurring obligations like rent or Netflix live in the Bill tab.
      </Text>
    </>
  );
}

function DueRow({ ctx, E, d }: { ctx: ScreenProps["ctx"]; E: ScreenProps["E"]; d: Due }) {
  const remaining = Math.max(0, d.amount - d.paid);
  const overdue = remaining > 0 && new Date(d.date) < new Date(ctx.iso());
  return (
    <Row
      ctx={ctx}
      title={d.person}
      sub={`${ctx.fmtDate(d.date)} · ${ctx.money(d.paid, d.currency)} of ${ctx.money(d.amount, d.currency)} settled`}
      amount={ctx.money(remaining, d.currency)}
      color={d.direction === "i_owe" ? ctx.T.coral : ctx.T.mint}
      icon={HandCoins}
      right={overdue ? <Badge ctx={ctx} label="Overdue" color={ctx.T.coral} /> : undefined}
      onPress={() => { E.setSelected(d); E.setSubpage("Due detail"); }}
    />
  );
}

// ---------------- Add Due ----------------
export function AddDueScreen({ E, ctx }: ScreenProps) {
  const [direction, setDirection] = useState("I owe");
  const [person, setPerson] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(ctx.iso(30));
  const [note, setNote] = useState("");
  const [currency, setCurrency] = useState(E.currency);
  const currencyOptions = [...new Set([...CURRENCIES, E.currency, ...E.accounts.map((account) => account.currency), ...E.dues.map((due) => due.currency)])];
  return (
    <>
      <Header ctx={ctx} title="Add due" sub="Track a promise between two people." />
      <Glass ctx={ctx}>
        <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Direction</Text>
        <Chips ctx={ctx} options={["I owe", "Owed to me"]} value={direction} onChange={setDirection} />
        <Field ctx={ctx} label="Person / entity" value={person} onChangeText={setPerson} placeholder="e.g. Maya, Client invoice, Education loan" />
        <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Currency</Text>
        <Chips ctx={ctx} options={[...currencyOptions, "Other"]} value={currencyOptions.includes(currency) ? currency : "Other"} onChange={(value) => setCurrency(value === "Other" ? "XXX" : value)} />
        {!currencyOptions.includes(currency) && <Field ctx={ctx} label="Other currency (ISO code)" value={currency} onChangeText={(value) => setCurrency(value.toUpperCase().slice(0, 3))} />}
        <AmountField ctx={ctx} symbol={currency} value={amount} onChangeText={setAmount} />
        <Field ctx={ctx} label="Due date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
        <Field ctx={ctx} label="Note" value={note} onChangeText={setNote} multiline placeholder="Optional context" />
        <PrimaryButton
          ctx={ctx}
          label="Save due"
          disabled={!person.trim() || !Number(amount)}
          onPress={() => E.quickAdd({ kind: "Due", name: person, amount: Number(amount), extra: direction, date, currency })}
        />
      </Glass>
      <Text style={ctx.s.help}>Dues never repeat automatically. If it happens every month, add it as a Bill instead.</Text>
    </>
  );
}

// ---------------- Due Detail + Record Payment + History ----------------
export function DueDetailScreen({ E, ctx }: ScreenProps) {
  const d: Due = E.selected;
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  if (!d) return null;
  const remaining = Math.max(0, d.amount - d.paid);
  const history = E.duePayments[d.id] || [];
  const settle = () => {
    const val = Number(amount);
    if (!val || val <= 0) return;
    E.payDue(d.id, Math.min(val, remaining), note || (val >= remaining ? "Full settlement" : "Partial payment"));
    setPaying(false); setAmount(""); setNote("");
  };
  return (
    <>
      <Header ctx={ctx} title={d.person} sub={d.direction === "i_owe" ? "Money you owe someone" : "Money owed to you"} />
      <Glass ctx={ctx}>
        <Text style={ctx.s.meta}>{d.direction === "i_owe" ? "Remaining you owe" : "Remaining to collect"}</Text>
        <Text style={[ctx.s.statBig, { color: d.direction === "i_owe" ? ctx.T.coral : ctx.T.mint }]}>{ctx.money(remaining, d.currency)}</Text>
        <Bar ctx={ctx} value={d.amount ? (d.paid / d.amount) * 100 : 0} color={ctx.T.violet} />
        <Text style={[ctx.s.meta, { marginTop: 6 }]}>{Math.round(d.amount ? (d.paid / d.amount) * 100 : 0)}% settled · {ctx.money(d.paid, d.currency)} of {ctx.money(d.amount, d.currency)}</Text>
        <View style={{ marginTop: 14 }}>
          <Row ctx={ctx} title="Total amount" sub="Original agreement" amount={ctx.money(d.amount, d.currency)} icon={ArrowLeftRight} />
          <Row ctx={ctx} title="Paid so far" sub="All recorded payments" amount={ctx.money(d.paid, d.currency)} icon={CheckCircle2} />
          <Row ctx={ctx} title="Due date" sub={new Date(d.date) < new Date(ctx.iso()) && remaining > 0 ? "Past deadline" : "Scheduled"} amount={ctx.fmtDate(d.date)} icon={CalendarClock} />
          {!!d.note && <Row ctx={ctx} title="Note" sub={d.note} amount="" icon={Users} />}
        </View>
        {!paying ? (
          <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
            <Pressable style={[ctx.s.save, { flex: 1, justifyContent: "center", gap: 5, flexDirection: "row", marginTop: 0 }]} onPress={() => setPaying(true)}>
              <HandCoins size={14} color={ctx.T.primaryBtnText} /><Text style={ctx.s.saveText}>Record payment</Text>
            </Pressable>
            <Pressable style={[ctx.s.deleteButton, { marginTop: 0, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" }]} onPress={() => E.deleteDue(d.id)}>
              <Trash2 size={14} color={ctx.T.coral} />
            </Pressable>
          </View>
        ) : (
          <View style={{ marginTop: 14 }}>
            <AmountField ctx={ctx} symbol={d.currency} value={amount} onChangeText={setAmount} />
            <Field ctx={ctx} label="Payment note" value={note} onChangeText={setNote} placeholder={`e.g. UPI part payment (max ${ctx.money(remaining, d.currency)})`} />
            <PrimaryButton ctx={ctx} label={`Log ${ctx.money(Math.min(Number(amount) || 0, remaining), d.currency)} payment`} onPress={settle} disabled={!Number(amount)} />
            <Pressable onPress={() => setPaying(false)}><Text style={ctx.s.authLink}>Cancel</Text></Pressable>
          </View>
        )}
      </Glass>

      <Section ctx={ctx} title="Payment history" right={`${history.length} entries`} />
      <Glass ctx={ctx} style={ctx.s.card}>
        {history.length ? history.map((p) => (
          <Row key={p.id} ctx={ctx} title={p.note || "Payment"} sub={ctx.fmtDate(p.date)} amount={(d.direction === "i_owe" ? "−" : "+") + ctx.money(p.amount, p.currency || d.currency)} color={ctx.T.mint} icon={CheckCircle2} />
        )) : <EmptyState ctx={ctx} text="No payments logged against this due yet." />}
      </Glass>
    </>
  );
}
