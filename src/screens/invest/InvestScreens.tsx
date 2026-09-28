// ============================================================
// INVEST TAB — Assets & portfolio
// Support: Add Investment · Investment Detail · Investment
// Transactions (SIP/buy log) · Portfolio Breakdown
// ============================================================
import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Coins, Landmark, PlusCircle, TrendingUp, Trash2 } from "lucide-react-native";
import { ScreenProps } from "../types";
import { AmountField, Badge, Bar, Chips, EmptyState, Field, Glass, Header, PrimaryButton, Row, Section } from "../../components/glass/primitives";
import { Asset } from "../../lib/engine";

const ASSET_TYPES = ["Mutual fund", "Stocks", "Gold", "FD", "Crypto", "Real estate", "PPF"];

export function InvestTab({ E, ctx }: ScreenProps) {
  const gain = E.portfolioValue - E.investedTotal;
  const gainPct = E.investedTotal ? (gain / E.investedTotal) * 100 : 0;
  const byType = useMemo(() => {
    const m: Record<string, { invested: number; value: number; count: number }> = {};
    E.assets.forEach((a) => {
      const t = (m[a.type] = m[a.type] || { invested: 0, value: 0, count: 0 });
      t.invested += a.invested; t.value += a.value; t.count += 1;
    });
    return Object.entries(m).sort((x, y) => y[1].value - x[1].value);
  }, [E.assets]);
  return (
    <>
      <Header ctx={ctx} title="Your portfolio" sub="Small steps, long horizons." />
      <LinearGradient colors={ctx.T.investGrad} style={ctx.s.hero}>
        <Text style={ctx.s.meta}>Current portfolio value</Text>
        <Text style={ctx.s.big}>{ctx.money(E.portfolioValue)}</Text>
        <View style={ctx.s.herotop}>
          <Text style={ctx.s.meta}>Invested {ctx.money(E.investedTotal)}</Text>
          <Text style={{ color: gain >= 0 ? ctx.T.mint : ctx.T.coral, fontSize: 11, fontWeight: "700" }}>
            {gain >= 0 ? "▲ +" : "▼ "}{ctx.money(Math.abs(gain))} ({gainPct.toFixed(1)}%)
          </Text>
        </View>
      </LinearGradient>

      <Section ctx={ctx} title="Asset breakdown" right={`${E.assets.length} assets`} onPress={() => E.setSubpage("Portfolio breakdown")} />
      <Glass ctx={ctx} style={ctx.s.card}>
        {byType.length ? byType.map(([type, v]) => (
          <Pressable key={type} style={ctx.s.row} onPress={() => E.setSubpage("Portfolio breakdown")}>
            <View style={ctx.s.rowIcon}><Coins size={15} color={ctx.T.gold} /></View>
            <View style={{ flex: 1 }}>
              <Text style={ctx.s.title}>{type}</Text>
              <Text style={ctx.s.meta}>{v.count} holding{v.count === 1 ? "" : "s"} · cost {ctx.money(v.invested)}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={ctx.s.value}>{ctx.money(v.value)}</Text>
              <Text style={{ color: v.value >= v.invested ? ctx.T.mint : ctx.T.coral, fontSize: 9, fontWeight: "700" }}>
                {v.invested ? (((v.value - v.invested) / v.invested) * 100).toFixed(1) : "0"}%
              </Text>
            </View>
          </Pressable>
        )) : <EmptyState ctx={ctx} text="Add your first investment with Quick Add." />}
      </Glass>

      <Section ctx={ctx} title="Holdings" right="Add" onPress={() => E.setSubpage("Add investment")} />
      <Glass ctx={ctx} style={ctx.s.card}>
        {E.assets.map((a) => {
          const g = a.value - a.invested;
          return (
            <Row key={a.id} ctx={ctx} title={a.name} sub={`${a.type} · invested ${ctx.money(a.invested)}`} amount={ctx.money(a.value)}
              color={g >= 0 ? ctx.T.mint : ctx.T.coral} icon={TrendingUp}
              right={<Badge ctx={ctx} label={`${g >= 0 ? "+" : ""}${a.invested ? ((g / a.invested) * 100).toFixed(1) : "0"}%`} color={g >= 0 ? ctx.T.mint : ctx.T.coral} />}
              onPress={() => { E.setSelected(a); E.setSubpage("Investment detail"); }} />
          );
        })}
        {!E.assets.length && <EmptyState ctx={ctx} text="No assets tracked yet." />}
      </Glass>
      <Text style={ctx.s.help}>Values are updated manually — no live broker feed is connected in this build.</Text>
    </>
  );
}

// ---------------- Add Investment ----------------
export function AddInvestmentScreen({ E, ctx }: ScreenProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState("Mutual fund");
  const [invested, setInvested] = useState("");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(ctx.iso());
  return (
    <>
      <Header ctx={ctx} title="Add investment" sub="Record an asset you already own." />
      <Glass ctx={ctx}>
        <Field ctx={ctx} label="Asset name" value={name} onChangeText={setName} placeholder="e.g. Nifty 50 Index Fund" />
        <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Type</Text>
        <Chips ctx={ctx} options={ASSET_TYPES} value={type} onChange={setType} />
        <AmountField ctx={ctx} symbol="₹" value={invested} onChangeText={setInvested} />
        <Text style={[ctx.s.meta, { marginBottom: 4 }]}>Current value</Text>
        <AmountField ctx={ctx} symbol="₹" value={value} onChangeText={setValue} />
        <Field ctx={ctx} label="Purchase date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
        <PrimaryButton ctx={ctx} label="Save investment" disabled={!name.trim() || !Number(invested)}
          onPress={() => E.quickAdd({ kind: "Investment", name, amount: Number(invested), extra: type, date })} />
      </Glass>
    </>
  );
}

// ---------------- Investment Detail + SIP/buy log ----------------
export function InvestmentDetailScreen({ E, ctx }: ScreenProps) {
  const a: Asset = E.selected;
  const [logging, setLogging] = useState(false);
  const [logType, setLogType] = useState("SIP");
  const [logAmount, setLogAmount] = useState("");
  const [newVal, setNewVal] = useState("");
  if (!a) return null;
  const gain = a.value - a.invested;
  const txs = E.invTx[a.id] || [];
  return (
    <>
      <Header ctx={ctx} title={a.name} sub={`${a.type} · manual valuation`} />
      <Glass ctx={ctx}>
        <Text style={ctx.s.meta}>Current value</Text>
        <Text style={[ctx.s.statBig, { color: ctx.T.mint }]}>{ctx.money(a.value)}</Text>
        <Bar ctx={ctx} value={a.invested ? Math.min(100, (a.value / a.invested) * 100) : 100} color={gain >= 0 ? ctx.T.mint : ctx.T.coral} />
        <Text style={[ctx.s.meta, { marginTop: 6 }]}>
          {gain >= 0 ? "Gain" : "Loss"} {ctx.money(Math.abs(gain))} ({a.invested ? ((gain / a.invested) * 100).toFixed(2) : "0"}%)
        </Text>
        <View style={{ marginTop: 14 }}>
          <Row ctx={ctx} title="Invested" sub="Total principal" amount={ctx.money(a.invested)} icon={Landmark} />
          <Row ctx={ctx} title="Gain / loss" sub="Value minus invested" amount={(gain >= 0 ? "+" : "−") + ctx.money(Math.abs(gain))} color={gain >= 0 ? ctx.T.mint : ctx.T.coral} />
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
          <Pressable style={[ctx.s.save, { flex: 1, justifyContent: "center", gap: 5, flexDirection: "row", marginTop: 0 }]} onPress={() => setLogging((v) => !v)}>
            <PlusCircle size={14} color={ctx.T.primaryBtnText} /><Text style={ctx.s.saveText}>Log activity</Text>
          </Pressable>
          <Pressable style={[ctx.s.deleteButton, { marginTop: 0, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" }]} onPress={() => E.deleteAsset(a.id)}>
            <Trash2 size={14} color={ctx.T.coral} />
          </Pressable>
        </View>
        {logging && (
          <View style={{ marginTop: 12 }}>
            <Chips ctx={ctx} options={["SIP", "Buy", "Sell", "Dividend"]} value={logType} onChange={setLogType} />
            <AmountField ctx={ctx} symbol="₹" value={logAmount} onChangeText={setLogAmount} />
            <PrimaryButton ctx={ctx} label={`Record ${logType.toLowerCase()}`} disabled={!Number(logAmount)}
              onPress={() => { E.logInvestmentTx(a.id, logType.toLowerCase(), Number(logAmount), ctx.iso()); setLogging(false); setLogAmount(""); }} />
          </View>
        )}
      </Glass>

      <Section ctx={ctx} title="Update current value" />
      <Glass ctx={ctx}>
        <AmountField ctx={ctx} symbol="₹" value={newVal} onChangeText={setNewVal} />
        <PrimaryButton ctx={ctx} label="Refresh valuation" disabled={!Number(newVal)} onPress={() => { E.updateAsset(a.id, Number(newVal)); setNewVal(""); }} />
      </Glass>

      <Section ctx={ctx} title="Activity log" right={`${txs.length} entries`} />
      <Glass ctx={ctx} style={ctx.s.card}>
        {txs.length ? txs.map((t) => (
          <Row key={t.id} ctx={ctx} title={t.type.toUpperCase()} sub={ctx.fmtDate(t.date)} amount={(t.type === "sell" ? "−" : "+") + ctx.money(t.amount)} color={t.type === "sell" ? ctx.T.coral : ctx.T.mint} icon={TrendingUp} />
        )) : <EmptyState ctx={ctx} text="No SIPs or buys logged for this asset yet." />}
      </Glass>
    </>
  );
}

// ---------------- Portfolio Breakdown ----------------
export function PortfolioBreakdownScreen({ E, ctx }: ScreenProps) {
  const gain = E.portfolioValue - E.investedTotal;
  return (
    <>
      <Header ctx={ctx} title="Portfolio breakdown" sub="Allocation and performance by asset class." />
      <Glass ctx={ctx} style={ctx.s.note}>
        <View style={ctx.s.herotop}>
          <Text style={ctx.s.meta}>Net worth including portfolio</Text>
          <Text style={{ color: ctx.T.violet, fontSize: 13, fontWeight: "700" }}>{ctx.money(E.balance + E.portfolioValue)}</Text>
        </View>
        <Text style={[ctx.s.meta, { marginTop: 8 }]}>Liquid {ctx.money(E.balance)} + Invested {ctx.money(E.portfolioValue)} − Dues owed {ctx.money(E.owe)}</Text>
      </Glass>
      <Section ctx={ctx} title="Allocation" />
      <Glass ctx={ctx} style={ctx.s.card}>
        {E.assets.map((a, i) => (
          <View key={a.id} style={ctx.s.cat}>
            <View style={ctx.s.herotop}>
              <Text style={ctx.s.title}>{a.name}</Text>
              <Text style={ctx.s.value}>{E.portfolioValue ? Math.round((a.value / E.portfolioValue) * 100) : 0}%</Text>
            </View>
            <Bar ctx={ctx} value={E.portfolioValue ? (a.value / E.portfolioValue) * 100 : 0} color={[ctx.T.violet, ctx.T.mint, ctx.T.gold, ctx.T.blue, ctx.T.pink][i % 5]} />
            <Text style={[ctx.s.meta, { marginTop: 5 }]}>{a.type} · {ctx.money(a.value)} · {a.value >= a.invested ? "+" : "−"}{ctx.money(Math.abs(a.value - a.invested))}</Text>
          </View>
        ))}
        {!E.assets.length && <EmptyState ctx={ctx} text="Add investments to see allocation." />}
      </Glass>
      <Text style={ctx.s.help}>Overall return: {gain >= 0 ? "+" : ""}{ctx.money(gain)} across {E.assets.length} assets.</Text>
    </>
  );
}
