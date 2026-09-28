// ============================================================
// BILL TAB — recurring obligations (strictly separate from Due)
// Support: Add Bill · Bill Detail · Edit Bill · Mark Paid ·
// Bill History · Bill Reminder settings
// ============================================================
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Bell, CalendarClock, Check, CreditCard, Pencil, Repeat, Trash2 } from "lucide-react-native";
import { ScreenProps } from "../types";
import { AmountField, Badge, Chips, EmptyState, Field, Glass, Header, PrimaryButton, Row, Section } from "../../components/glass/primitives";
import { Bill } from "../../lib/engine";

const FREQUENCIES = ["Weekly", "Monthly", "Quarterly", "Yearly"];

export function billStatus(b: Bill, isoToday: string): { label: string; color: "mint" | "gold" | "coral" | "blue" | "violet" } {
  if (b.status === "Paid") return { label: "Paid", color: "mint" };
  const d = new Date(b.date).getTime(), t = new Date(isoToday).getTime();
  if (d < t) return { label: "Overdue", color: "coral" };
  if (d === t) return { label: "Due today", color: "gold" };
  if (d <= t + 3 * 86400000) return { label: "Due soon", color: "violet" };
  return { label: "Upcoming", color: "blue" };
}

export function BillTab({ E, ctx }: ScreenProps) {
  const sorted = [...E.bills].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <>
      <Header ctx={ctx} title="Bills, handled" sub="Stay ahead of what's coming." />
      <LinearGradient colors={ctx.T.billGrad} style={ctx.s.billHero}>
        <View style={{ flex: 1 }}>
          <Text style={ctx.s.meta}>Total due this week</Text>
          <Text style={ctx.s.big}>{ctx.money(E.dueThisWeek)}</Text>
          <Text style={ctx.s.meta}>{E.overdueBills.length ? `${E.overdueBills.length} overdue · ` : ""}${sorted.filter((b) => b.status !== "Paid").length} scheduled payments</Text>
        </View>
        <CreditCard size={25} color={ctx.T.gold} />
      </LinearGradient>

      <Section ctx={ctx} title="Upcoming payments" right="Add bill" onPress={() => E.setSubpage("Add bill")} />
      <Glass ctx={ctx} style={ctx.s.card}>
        {sorted.length ? sorted.map((b) => {
          const st = billStatus(b, ctx.iso());
          return (
            <View key={b.id} style={ctx.s.row}>
              <View style={ctx.s.rowIcon}><CreditCard size={15} color={ctx.T[st.color]} /></View>
              <Pressable style={{ flex: 1 }} onPress={() => { E.setSelected(b); E.setSubpage("Bill detail"); }}>
                <Text style={ctx.s.title}>{b.name}</Text>
                <Text style={ctx.s.meta}>{b.frequency} · {ctx.fmtDate(b.date)}{b.reminderDays ? ` · reminds ${b.reminderDays}d before` : ""}</Text>
              </Pressable>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <Text style={ctx.s.value}>{ctx.money(b.amount)}</Text>
                {st.label === "Paid"
                  ? <Badge ctx={ctx} label="Paid" color={ctx.T.mint} />
                  : <Pressable style={ctx.s.pay} onPress={() => E.markBillPaid(b)}>
                      <Check size={12} color={ctx.T.mint} /><Text style={{ color: ctx.T.mint, fontSize: 9, fontWeight: "700" }}>Mark paid</Text>
                    </Pressable>}
              </View>
            </View>
          );
        }) : <EmptyState ctx={ctx} text="No recurring bills yet." />}
      </Glass>
      <Text style={ctx.s.help}>⚠ Bill ≠ Due. Bills repeat automatically on a schedule (rent, Netflix, insurance). One-off money between people belongs in the Due tab.</Text>
    </>
  );
}

// ---------------- Add / Edit Bill ----------------
export function AddBillScreen({ E, ctx }: ScreenProps) {
  const editing: Bill | null = E.subpage === "Edit bill" ? E.selected : null;
  const [name, setName] = useState(editing?.name || "");
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [frequency, setFrequency] = useState(editing?.frequency || "Monthly");
  const [date, setDate] = useState(editing?.date || ctx.iso(7));
  const [accountId, setAccountId] = useState(editing?.accountId || E.accounts[0]?.id || "");
  const [reminder, setReminder] = useState(String(editing?.reminderDays ?? 3));
  const save = () => {
    const payload = { name: name.trim(), amount: Number(amount), frequency, date, accountId, reminderDays: Number(reminder) || 0 };
    if (editing) E.editBill(editing.id, payload);
    else E.quickAdd({ kind: "Bill", name, amount: Number(amount), extra: frequency, date, accountId });
  };
  return (
    <>
      <Header ctx={ctx} title={editing ? "Edit bill" : "Add bill"} sub="A payment that repeats on a schedule." />
      <Glass ctx={ctx}>
        <Field ctx={ctx} label="Bill name" value={name} onChangeText={setName} placeholder="e.g. Home rent, Netflix" />
        <AmountField ctx={ctx} symbol="₹" value={amount} onChangeText={setAmount} />
        <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Frequency</Text>
        <Chips ctx={ctx} options={FREQUENCIES} value={frequency} onChange={setFrequency} />
        <Field ctx={ctx} label="Next due date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
        {!!E.accounts.length && (
          <>
            <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Payment account</Text>
            <Chips ctx={ctx} options={E.accounts.map((a) => a.name)} value={E.accounts.find((a) => a.id === accountId)?.name || ""} onChange={(n) => setAccountId(E.accounts.find((a) => a.name === n)?.id || "")} />
          </>
        )}
        <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Reminder (days before due)</Text>
        <Chips ctx={ctx} options={["0", "1", "3", "7"]} value={reminder} onChange={setReminder} />
        <PrimaryButton ctx={ctx} label={editing ? "Save changes" : "Create bill"} disabled={!name.trim() || !Number(amount)} onPress={save} />
        {editing && <Pressable onPress={() => E.setSubpage("Bill detail")}><Text style={ctx.s.authLink}>Cancel</Text></Pressable>}
      </Glass>
    </>
  );
}

// ---------------- Bill Detail + Mark Paid + History + Reminder ----------------
export function BillDetailScreen({ E, ctx }: ScreenProps) {
  const b: Bill = E.selected;
  if (!b) return null;
  const st = billStatus(b, ctx.iso());
  const history = E.billPayments[b.id] || [];
  const acc = E.accounts.find((a) => a.id === b.accountId);
  return (
    <>
      <Header ctx={ctx} title={b.name} sub={`${b.frequency} recurring payment`} />
      <Glass ctx={ctx}>
        <View style={ctx.s.herotop}>
          <Text style={[ctx.s.statBig, { marginTop: 0 }]}>{ctx.money(b.amount)}</Text>
          <Badge ctx={ctx} label={st.label} color={ctx.T[st.color]} />
        </View>
        <View style={{ marginTop: 12 }}>
          <Row ctx={ctx} title="Next payment" sub="Scheduled date" amount={ctx.fmtDate(b.date)} icon={CalendarClock} />
          <Row ctx={ctx} title="Frequency" sub="Repeat pattern" amount={b.frequency} icon={Repeat} />
          <Row ctx={ctx} title="Pays from" sub="Payment source" amount={acc ? acc.name : "Main account"} icon={CreditCard} />
          <Row ctx={ctx} title="Reminder" sub={`${b.reminderDays ?? 3} days before due date`} amount="" icon={Bell} />
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
          {st.label !== "Paid" && (
            <Pressable style={[ctx.s.save, { flex: 1, justifyContent: "center", gap: 5, flexDirection: "row", marginTop: 0 }]} onPress={() => E.markBillPaid(b)}>
              <Check size={14} color={ctx.T.primaryBtnText} /><Text style={ctx.s.saveText}>Mark paid</Text>
            </Pressable>
          )}
          <Pressable style={[ctx.s.ghostBtn, { flex: 1, marginTop: 0 }]} onPress={() => E.setSubpage("Edit bill")}>
            <Pencil size={13} color={ctx.T.text} /><Text style={{ color: ctx.T.text, fontSize: 11, fontWeight: "700" }}>Edit bill</Text>
          </Pressable>
        </View>
        <Pressable style={ctx.s.deleteButton} onPress={() => E.deleteBill(b.id)}>
          <View style={{ flexDirection: "row", gap: 5, alignItems: "center" }}>
            <Trash2 size={13} color={ctx.T.coral} /><Text style={{ color: ctx.T.coral, fontSize: 11, fontWeight: "700" }}>Delete bill</Text>
          </View>
        </Pressable>
      </Glass>

      <Section ctx={ctx} title="Payment history" right={`${history.length} payments`} />
      <Glass ctx={ctx} style={ctx.s.card}>
        {history.length ? history.map((p) => (
          <Row key={p.id} ctx={ctx} title={b.name} sub={"Paid on " + ctx.fmtDate(p.date)} amount={"−" + ctx.money(p.amount)} color={ctx.T.mint} icon={Check} />
        )) : <EmptyState ctx={ctx} text="No payments recorded for this bill yet." />}
      </Glass>

      <Section ctx={ctx} title="Reminder settings" />
      <Glass ctx={ctx}>
        <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Notify me</Text>
        <Chips ctx={ctx} options={["0", "1", "3", "7"]} value={String(b.reminderDays ?? 3)} onChange={(v) => E.editBill(b.id, { ...b, reminderDays: Number(v) })} />
        <Text style={[ctx.s.help, { marginTop: 8 }]}>You'll get an in-app notification {b.reminderDays ?? 3} day(s) before each due date.</Text>
      </Glass>
    </>
  );
}
