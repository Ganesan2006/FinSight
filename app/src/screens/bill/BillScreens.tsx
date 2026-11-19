// ============================================================
// BILL TAB — recurring obligations (strictly separate from Due)
// Support: Add Bill · Bill Detail · Edit Bill · Mark Paid ·
// Bill History
// ============================================================
import React, { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { CalendarClock, Check, CreditCard, Pencil, Repeat, Trash2 } from "lucide-react-native";
import { ScreenProps } from "../types";
import { AmountField, Badge, Chips, EmptyState, Field, Glass, Header, PrimaryButton, Row, Section } from "../../components/glass/primitives";
import { Bill } from "../../lib/engine";

const FREQUENCIES = ["Weekly", "Monthly", "Quarterly", "Yearly"];

function confirmBillPayment(E: ScreenProps["E"], bill: Bill, amount: number) {
  Alert.alert(
    "Record bill payment",
    `Record ${bill.currency} ${amount} for ${bill.name}. Add this payment to spending and budgets as an expense?`,
    [
      { text: "Cancel", style: "cancel" },
      { text: "Payment only", onPress: () => E.markBillPaid(bill, amount, false) },
      ...(bill.accountId ? [{ text: "Also add expense", onPress: () => E.markBillPaid(bill, amount, true) }] : []),
    ],
  );
}

export function billStatus(b: Bill, isoToday: string): { label: string; color: "mint" | "gold" | "coral" | "blue" | "violet" } {
  if (b.status.toLowerCase() === "paid") return { label: "Paid", color: "mint" };
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
          <Text style={ctx.s.meta}>{`Due this week · ${E.currency}`}</Text>
          <Text style={ctx.s.big}>{ctx.money(E.dueThisWeek)}</Text>
          <Text style={ctx.s.meta}>{E.overdueBills.length ? `${E.overdueBills.length} overdue · ` : ""}${sorted.filter((b) => b.status.toLowerCase() !== "paid").length} scheduled payments</Text>
          {E.dueThisWeekByCurrency.filter((item) => item.currency !== E.currency).map((item) => <Text key={item.currency} style={[ctx.s.meta, { marginTop: 3 }]}>{item.currency}: {ctx.money(item.amount, item.currency)} · {item.count} due</Text>)}
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
                <Text style={ctx.s.meta}>{b.frequency.charAt(0).toUpperCase() + b.frequency.slice(1)} · {ctx.fmtDate(b.date)}</Text>
              </Pressable>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <Text style={ctx.s.value}>{ctx.money(b.amount, b.currency)}</Text>
                {st.label === "Paid"
                  ? <Badge ctx={ctx} label="Paid" color={ctx.T.mint} />
                  : <Pressable style={ctx.s.pay} onPress={() => confirmBillPayment(E, b, b.amount)}>
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
  const save = () => {
    const payload = { name: name.trim(), amount: Number(amount), frequency, date, accountId };
    if (editing) E.editBill(editing.id, payload);
    else E.quickAdd({ kind: "Bill", name, amount: Number(amount), extra: frequency, date, accountId });
  };
  return (
    <>
      <Header ctx={ctx} title={editing ? "Edit bill" : "Add bill"} sub="A payment that repeats on a schedule." />
      <Glass ctx={ctx}>
        <Field ctx={ctx} label="Bill name" value={name} onChangeText={setName} placeholder="e.g. Home rent, Netflix" />
        <AmountField ctx={ctx} symbol={E.accounts.find((a) => a.id === accountId)?.currency || E.currency} value={amount} onChangeText={setAmount} />
        <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Frequency</Text>
        <Chips ctx={ctx} options={FREQUENCIES} value={frequency} onChange={setFrequency} />
        <Field ctx={ctx} label="Next due date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
        {!!E.accounts.length && (
          <>
            <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Payment account</Text>
            <Chips ctx={ctx} options={E.accounts.map((a) => a.name)} value={E.accounts.find((a) => a.id === accountId)?.name || ""} onChange={(n) => setAccountId(E.accounts.find((a) => a.name === n)?.id || "")} />
          </>
        )}
        <PrimaryButton ctx={ctx} label={editing ? "Save changes" : "Create bill"} disabled={!name.trim() || !Number(amount)} onPress={save} />
        {editing && <Pressable onPress={() => E.setSubpage("Bill detail")}><Text style={ctx.s.authLink}>Cancel</Text></Pressable>}
      </Glass>
    </>
  );
}

// ---------------- Bill Detail + Mark Paid + Payment History ----------------
export function BillDetailScreen({ E, ctx }: ScreenProps) {
  const b: Bill = E.selected;
  const [paymentAmount, setPaymentAmount] = useState(b ? String(b.amount) : "");
  if (!b) return null;
  const st = billStatus(b, ctx.iso());
  const history = E.billPayments[b.id] || [];
  const acc = E.accounts.find((a) => a.id === b.accountId);
  return (
    <>
      <Header ctx={ctx} title={b.name} sub={`${b.frequency.charAt(0).toUpperCase() + b.frequency.slice(1)} recurring payment`} />
      <Glass ctx={ctx}>
        <View style={ctx.s.herotop}>
          <Text style={[ctx.s.statBig, { marginTop: 0 }]}>{ctx.money(b.amount, b.currency)}</Text>
          <Badge ctx={ctx} label={st.label} color={ctx.T[st.color]} />
        </View>
        <View style={{ marginTop: 12 }}>
          <Row ctx={ctx} title="Next payment" sub="Scheduled date" amount={ctx.fmtDate(b.date)} icon={CalendarClock} />
          <Row ctx={ctx} title="Frequency" sub="Repeat pattern" amount={b.frequency.charAt(0).toUpperCase() + b.frequency.slice(1)} icon={Repeat} />
          <Row ctx={ctx} title="Pays from" sub="Payment source" amount={acc ? acc.name : "Main account"} icon={CreditCard} />
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
          {st.label !== "Paid" && (
              <Pressable style={[ctx.s.save, { flex: 1, justifyContent: "center", gap: 5, flexDirection: "row", marginTop: 0 }]} onPress={() => confirmBillPayment(E, b, Number(paymentAmount))}>
              <Check size={14} color={ctx.T.primaryBtnText} /><Text style={ctx.s.saveText}>Record payment</Text>
            </Pressable>
          )}
          <Pressable style={[ctx.s.ghostBtn, { flex: 1, marginTop: 0 }]} onPress={() => E.setSubpage("Edit bill")}>
            <Pencil size={13} color={ctx.T.text} /><Text style={{ color: ctx.T.text, fontSize: 11, fontWeight: "700" }}>Edit bill</Text>
          </Pressable>
        </View>
        {st.label !== "Paid" && <View style={{ marginTop: 12 }}>
          <AmountField ctx={ctx} symbol={b.currency} value={paymentAmount} onChangeText={setPaymentAmount} />
          <Text style={ctx.s.meta}>Enter a full or partial payment. Each payment asks whether to add an expense.</Text>
          <Pressable accessibilityRole="button" style={[ctx.s.ghostBtn, { marginTop: 10, alignSelf: "flex-start" }]} onPress={() => Alert.alert(
            "Skip this bill occurrence?",
            `This will mark ${ctx.fmtDate(b.date)} as skipped and move the recurring bill to its next date. No account balance or spending record will change.`,
            [{ text: "Keep it", style: "cancel" }, { text: "Skip occurrence", onPress: () => E.skipBillOccurrence(b) }],
          )}>
            <Text style={{ color: ctx.T.gold, fontSize: 11, fontWeight: "700" }}>Skip this occurrence</Text>
          </Pressable>
        </View>}
        <Pressable style={ctx.s.deleteButton} onPress={() => E.deleteBill(b.id)}>
          <View style={{ flexDirection: "row", gap: 5, alignItems: "center" }}>
            <Trash2 size={13} color={ctx.T.coral} /><Text style={{ color: ctx.T.coral, fontSize: 11, fontWeight: "700" }}>Delete bill</Text>
          </View>
        </Pressable>
      </Glass>

      <Section ctx={ctx} title="Payment history" right={`${history.length} payments`} />
      <Glass ctx={ctx} style={ctx.s.card}>
        {history.length ? history.map((p) => (
          <Row key={p.id} ctx={ctx} title={b.name} sub={"Paid on " + ctx.fmtDate(p.date)} amount={"−" + ctx.money(p.amount, b.currency)} color={ctx.T.mint} icon={Check} />
        )) : <EmptyState ctx={ctx} text="No payments recorded for this bill yet." />}
      </Glass>


    </>
  );
}
