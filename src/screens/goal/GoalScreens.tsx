// ============================================================
// GOAL TAB — hackathon core feature
// Support: Add Goal · Goal Detail · Goal Contribution ·
// Goal Conflict Analysis · Goal Priority · What-if Scenario
// ============================================================
import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { AlertCircle, Sparkles, Target, TrendingUp, Trash2 } from "lucide-react-native";
import { ScreenProps } from "../types";
import { AmountField, Badge, Bar, Chips, EmptyState, Field, Glass, Header, PrimaryButton, Row, Section } from "../../components/glass/primitives";
import { Goal } from "../../lib/engine";
import { analyzeGoals, Priority, ScenarioInput } from "../../lib/goalEngine";

const PRIORITIES: Priority[] = ["Essential", "Important", "Flexible"];
const prioColor = (ctx: ScreenProps["ctx"], p: Priority) => (p === "Essential" ? ctx.T.coral : p === "Important" ? ctx.T.gold : ctx.T.blue);

export function GoalTab({ E, ctx }: ScreenProps) {
  const analysis = useMemo(() => analyzeGoals(E.goals, E.availableSavings), [E.goals, E.availableSavings]);
  return (
    <>
      <Header ctx={ctx} title="Goals with a plan" sub="Your future, one contribution at a time." />
      <Glass ctx={ctx} style={ctx.s.available}>
        <View style={ctx.s.targetIcon}><Target color={ctx.T.violet} size={19} /></View>
        <View style={{ flex: 1 }}>
          <Text style={ctx.s.meta}>Monthly savings available</Text>
          <Text style={ctx.s.availableAmount}>{ctx.money(E.availableSavings)}</Text>
        </View>
        <Pressable style={ctx.s.planButton} onPress={() => E.setSubpage("Goal conflict analysis")}>
          <Sparkles size={13} color={ctx.T.primaryBtnText} /><Text style={ctx.s.planLabel}>Analyze</Text>
        </Pressable>
      </Glass>

      {!analysis.onTrack && (
        <Pressable onPress={() => E.setSubpage("Goal conflict analysis")}>
          <Glass ctx={ctx} style={{ ...ctx.s.analysis, borderColor: ctx.T.coral + "55" }}>
            <View style={ctx.s.herotop}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <AlertCircle size={16} color={ctx.T.coral} />
                <Text style={ctx.s.title}>Goal conflict detected</Text>
              </View>
              <Badge ctx={ctx} label={ctx.money(analysis.shortfall) + " /mo short"} color={ctx.T.coral} />
            </View>
            <Text style={[ctx.s.help, { marginTop: 8 }]}>
              {analysis.conflicts.slice(0, 2).map((c) => `${c.a} ↔ ${c.b}`).join("  ·  ") || "Some goals compete for the same monthly savings."} Tap to open the planner.
            </Text>
          </Glass>
        </Pressable>
      )}

      <Section ctx={ctx} title="Your goals" right="Add goal" onPress={() => E.setSubpage("Add goal")} />
      <Glass ctx={ctx} style={ctx.s.card}>
        {analysis.plans.map((g) => (
          <Pressable key={g.id} style={ctx.s.goal} onPress={() => { E.setSelected(E.goals.find((x) => x.id === g.id)); E.setSubpage("Goal detail"); }}>
            <View style={ctx.s.herotop}>
              <View style={{ flex: 1 }}>
                <Text style={ctx.s.title}>{g.name}</Text>
                <Text style={ctx.s.meta}>{ctx.money(g.saved)} of {ctx.money(g.target)}</Text>
              </View>
              <Pressable onPress={() => { E.cyclePriority(g.id); }}>
                <Badge ctx={ctx} label={g.priority} color={prioColor(ctx, g.priority)} />
              </Pressable>
            </View>
            <Bar ctx={ctx} value={g.progress} color={ctx.T.violet} />
            <View style={ctx.s.herotop}>
              <Text style={ctx.s.meta}>{Math.round(g.progress)}% · {g.months} months left</Text>
              <Text style={{ color: g.funded ? ctx.T.mint : ctx.T.coral, fontSize: 10, fontWeight: "700" }}>
                {ctx.money(Math.round(g.allocated))}/mo {g.funded ? "✓" : "⚠"}
              </Text>
            </View>
          </Pressable>
        ))}
        {!E.goals.length && <EmptyState ctx={ctx} text="No goals yet — add your first target." />}
      </Glass>
      <Text style={ctx.s.help}>Allocations recalculate instantly when you change priorities in the planner.</Text>
    </>
  );
}

// ---------------- Add Goal ----------------
export function AddGoalScreen({ E, ctx }: ScreenProps) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [saved, setSaved] = useState("");
  const [date, setDate] = useState(ctx.iso(365));
  const [priority, setPriority] = useState<Priority>("Important");
  return (
    <>
      <Header ctx={ctx} title="Add goal" sub="A target amount with a deadline." />
      <Glass ctx={ctx}>
        <Field ctx={ctx} label="Goal name" value={name} onChangeText={setName} placeholder="e.g. Emergency fund" />
        <Text style={[ctx.s.meta, { marginBottom: 4 }]}>Target amount</Text>
        <AmountField ctx={ctx} symbol="₹" value={target} onChangeText={setTarget} />
        <Text style={[ctx.s.meta, { marginBottom: 4 }]}>Already saved</Text>
        <AmountField ctx={ctx} symbol="₹" value={saved} onChangeText={setSaved} />
        <Field ctx={ctx} label="Target date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
        <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Priority</Text>
        <Chips ctx={ctx} options={PRIORITIES} value={priority} onChange={(v) => setPriority(v as Priority)} />
        <PrimaryButton ctx={ctx} label="Create goal" disabled={!name.trim() || !Number(target)}
          onPress={() => E.quickAdd({ kind: "Goal", name, amount: Number(target), extra: "", priority, date })} />
      </Glass>
    </>
  );
}

// ---------------- Goal Detail + Contribution ----------------
export function GoalDetailScreen({ E, ctx }: ScreenProps) {
  const g: Goal = E.selected;
  const [amount, setAmount] = useState("");
  if (!g) return null;
  const plan = analyzeGoals([g], E.availableSavings).plans[0];
  return (
    <>
      <Header ctx={ctx} title={g.name} sub={`${g.priority} priority · target ${ctx.fmtDate(g.date)}`} />
      <Glass ctx={ctx}>
        <Text style={ctx.s.statBig}>{ctx.money(g.saved)} <Text style={ctx.s.meta}>of {ctx.money(g.target)}</Text></Text>
        <Bar ctx={ctx} value={plan.progress} color={ctx.T.violet} />
        <View style={{ marginTop: 14 }}>
          <Row ctx={ctx} title="Remaining" sub="To reach target" amount={ctx.money(plan.remaining)} />
          <Row ctx={ctx} title="Required saving" sub={`Over ${plan.months} months`} amount={ctx.money(Math.round(plan.required)) + "/mo"} color={ctx.T.gold} />
          <Row ctx={ctx} title="Current allocation" sub="After prioritization" amount={ctx.money(Math.round(plan.allocated)) + "/mo"} color={plan.funded ? ctx.T.mint : ctx.T.coral} />
          <Row ctx={ctx} title="Monthly shortfall" sub={plan.funded ? "Fully funded" : "Gap to close"} amount={ctx.money(Math.round(plan.shortfall))} color={plan.shortfall > 0 ? ctx.T.coral : ctx.T.mint} />
          <Row ctx={ctx} title="Projected finish" sub={plan.delayMonths > 0 ? `${plan.delayMonths} mo past deadline` : "On track"} amount={plan.projectedDate === "—" ? "—" : ctx.fmtDate(plan.projectedDate)} />
        </View>
      </Glass>

      <Section ctx={ctx} title="Goal contribution" />
      <Glass ctx={ctx}>
        <AmountField ctx={ctx} symbol="₹" value={amount} onChangeText={setAmount} />
        <PrimaryButton ctx={ctx} label="Add contribution" disabled={!Number(amount)}
          onPress={() => { E.contributeGoal(g.id, Number(amount)); setAmount(""); }} />
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          {[1000, 5000, 10000].map((v) => (
            <Pressable key={v} style={ctx.s.kindTile} onPress={() => setAmount(String(v))}><Text style={ctx.s.meta}>{ctx.money(v)}</Text></Pressable>
          ))}
        </View>
      </Glass>

      <Section ctx={ctx} title="Manage" />
      <Glass ctx={ctx} style={ctx.s.card}>
        <Row ctx={ctx} title="Change priority" sub="Open the ranking screen" amount="" icon={Sparkles} onPress={() => E.setSubpage("Goal priority")} />
        <Row ctx={ctx} title="What-if scenario" sub="Test income boosts & timelines" amount="" icon={TrendingUp} onPress={() => E.setSubpage("Goal scenario")} />
        <Pressable style={ctx.s.deleteButton} onPress={() => E.deleteGoal(g.id)}>
          <Text style={{ color: ctx.T.coral, fontSize: 11, fontWeight: "700" }}>Delete this goal</Text>
        </Pressable>
      </Glass>
    </>
  );
}

// ---------------- Goal Conflict Analysis (⭐ core feature) ----------------
export function GoalConflictScreen({ E, ctx }: ScreenProps) {
  const [scenario, setScenario] = useState<ScenarioInput>({});
  const savings = useMemo(() => {
    const cut = Math.max(0, Math.min(100, scenario.cutPercent || 0)) / 100;
    return Math.max(0, E.availableSavings + E.spent * cut + Math.max(0, scenario.extraMonthly || 0));
  }, [E.availableSavings, E.spent, scenario]);
  const analysis = useMemo(() => analyzeGoals(E.goals, savings), [E.goals, savings]);
  return (
    <>
      <Header ctx={ctx} title="Goal planning" sub="Conflict detector · prioritization · realistic timelines." />
      <Glass ctx={ctx} style={ctx.s.note}>
        <View style={ctx.s.herotop}>
          <View>
            <Text style={ctx.s.meta}>Available monthly savings</Text>
            <Text style={ctx.s.statBig}>{ctx.money(savings)}</Text>
          </View>
          <Badge ctx={ctx} label={analysis.onTrack ? "On track" : ctx.money(Math.round(analysis.shortfall)) + " short"} color={analysis.onTrack ? ctx.T.mint : ctx.T.coral} />
        </View>
        <View style={{ marginTop: 12 }}>
          <Text style={ctx.s.meta}>Total required by all goals: {ctx.money(Math.round(analysis.totalRequired))}/mo · allocated {ctx.money(Math.round(analysis.totalAllocated))}/mo</Text>
        </View>
      </Glass>

      <Section ctx={ctx} title="Conflicting goals" right={`${analysis.conflicts.length}`} />
      <Glass ctx={ctx} style={ctx.s.card}>
        {analysis.conflicts.length ? analysis.conflicts.map((c, i) => (
          <View key={i} style={ctx.s.cat}>
            <View style={ctx.s.herotop}>
              <Text style={[ctx.s.title, { color: ctx.T.coral }]}>{c.a} ↔ {c.b}</Text>
              <AlertCircle size={14} color={ctx.T.coral} />
            </View>
            <Text style={[ctx.s.meta, { marginTop: 5, lineHeight: 15 }]}>{c.reason}</Text>
          </View>
        )) : <EmptyState ctx={ctx} text="No conflicts — every goal is fully funded at current priorities." />}
      </Glass>

      <Section ctx={ctx} title="Prioritization waterfall" right="Rank goals" onPress={() => E.setSubpage("Goal priority")} />
      <Glass ctx={ctx} style={ctx.s.card}>
        {analysis.plans.map((p, i) => (
          <View key={p.id} style={ctx.s.cat}>
            <View style={ctx.s.herotop}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={[ctx.s.meta, { width: 16 }]}>{i + 1}</Text>
                <Text style={ctx.s.title}>{p.name}</Text>
              </View>
              <Badge ctx={ctx} label={p.priority} color={prioColor(ctx, p.priority)} />
            </View>
            <Bar ctx={ctx} value={p.required ? (p.allocated / p.required) * 100 : 100} color={p.funded ? ctx.T.mint : ctx.T.coral} />
            <Text style={[ctx.s.meta, { marginTop: 5 }]}>
              Needs {ctx.money(Math.round(p.required))}/mo → gets {ctx.money(Math.round(p.allocated))}/mo{p.delayMonths > 0 ? ` · finishes ${ctx.fmtDate(p.projectedDate)} (+${p.delayMonths} mo)` : " · on track"}
            </Text>
          </View>
        ))}
        {!analysis.plans.length && <EmptyState ctx={ctx} text="Add goals to run the analysis." />}
      </Glass>

      <Section ctx={ctx} title="Quick fixes" />
      <Glass ctx={ctx}>
        <Text style={[ctx.s.meta, { marginBottom: 5 }]}>Try a scenario below, then apply it to the plan:</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable style={ctx.s.kindTile} onPress={() => setScenario({ extraMonthly: 5000 })}><Text style={ctx.s.meta}>+₹5k income</Text></Pressable>
          <Pressable style={ctx.s.kindTile} onPress={() => setScenario({ cutPercent: 15 })}><Text style={ctx.s.meta}>Cut spend 15%</Text></Pressable>
          <Pressable style={ctx.s.kindTile} onPress={() => setScenario({ extendFlexible: 12 })}><Text style={ctx.s.meta}>+12mo flexible</Text></Pressable>
          <Pressable style={ctx.s.kindTile} onPress={() => { E.setSubpage("Goal scenario"); }}><Text style={ctx.s.meta}>Full editor</Text></Pressable>
        </View>
        {!!Object.keys(scenario).length && (
          <Text style={[ctx.s.help, { marginTop: 10 }]}>
            With this scenario {analysis.onTrack ? "all goals are funded 🎉" : `you are still ${ctx.money(Math.round(analysis.shortfall))}/mo short. Demote a Flexible goal or extend its deadline.`}
          </Text>
        )}
      </Glass>
      <Text style={ctx.s.help}>The waterfall funds Essential goals first, then Important, then Flexible — exactly like a real budget review.</Text>
    </>
  );
}

// ---------------- Goal Priority Ranking ----------------
export function GoalPriorityScreen({ E, ctx }: ScreenProps) {
  const analysis = useMemo(() => analyzeGoals(E.goals, E.availableSavings), [E.goals, E.availableSavings]);
  return (
    <>
      <Header ctx={ctx} title="Goal priority" sub="Rank targets — savings are redistributed live." />
      <Glass ctx={ctx} style={ctx.s.note}>
        <Text style={ctx.s.meta}>Essential goals are always funded first. Flexible goals absorb any shortfall.</Text>
      </Glass>
      {analysis.plans.map((p) => (
        <Glass key={p.id} ctx={ctx} style={{ marginBottom: 10 }}>
          <View style={ctx.s.herotop}>
            <Text style={ctx.s.title}>{p.name}</Text>
            <Text style={{ color: p.funded ? ctx.T.mint : ctx.T.coral, fontSize: 10, fontWeight: "700" }}>{ctx.money(Math.round(p.allocated))}/mo</Text>
          </View>
          <Text style={[ctx.s.meta, { marginTop: 3 }]}>Needs {ctx.money(Math.round(p.required))}/mo · {ctx.fmtDate(p.date)}</Text>
          <View style={{ flexDirection: "row", gap: 7, marginTop: 10 }}>
            {PRIORITIES.map((pr) => (
              <Pressable key={pr} style={[ctx.s.kindTile, { minWidth: "30%" }, p.priority === pr && ctx.s.kindActive]} onPress={() => E.setPriority(p.id, pr)}>
                <Text style={{ color: p.priority === pr ? ctx.T.mint : ctx.T.muted, fontSize: 9, fontWeight: "600" }}>{pr}</Text>
              </Pressable>
            ))}
          </View>
        </Glass>
      ))}
      {!E.goals.length && <EmptyState ctx={ctx} text="No goals to rank yet." />}
      <PrimaryButton ctx={ctx} label="Back to conflict analysis" onPress={() => E.setSubpage("Goal conflict analysis")} />
    </>
  );
}

// ---------------- What-if Scenario ----------------
export function GoalScenarioScreen({ E, ctx }: ScreenProps) {
  const [extra, setExtra] = useState("");
  const [cut, setCut] = useState("");
  const [extend, setExtend] = useState("");
  const [stretch, setStretch] = useState(false);
  const scenario: ScenarioInput = {
    extraMonthly: Number(extra) || 0,
    cutPercent: Number(cut) || 0,
    extendFlexible: Number(extend) || 0,
    reduceImportant: stretch,
  };
  const savings = Math.max(0, E.availableSavings + E.spent * (Math.min(100, Number(cut) || 0) / 100) + (Number(extra) || 0));
  const base = useMemo(() => analyzeGoals(E.goals, E.availableSavings), [E.goals, E.availableSavings]);
  const whatIf = useMemo(() => analyzeGoals(E.goals, savings, Date.now(), scenario), [E.goals, savings, JSON.stringify(scenario)]);
  return (
    <>
      <Header ctx={ctx} title="What-if scenario" sub="Simulate changes before committing to them." />
      <Glass ctx={ctx}>
        <AmountField ctx={ctx} symbol="₹" value={extra} onChangeText={setExtra} />
        <Text style={[ctx.s.meta, { marginTop: -4, marginBottom: 8 }]}>Extra monthly income (raise, side hustle)</Text>
        <Field ctx={ctx} label="Cut spending by %" value={cut} onChangeText={setCut} keyboardType="numeric" placeholder="e.g. 15" />
        <Field ctx={ctx} label="Extend flexible deadlines by N months" value={extend} onChangeText={setExtend} keyboardType="numeric" placeholder="e.g. 12" />
        <Pressable style={[ctx.s.kindTile, stretch && ctx.s.kindActive]} onPress={() => setStretch((v) => !v)}>
          <Text style={{ color: stretch ? ctx.T.mint : ctx.T.muted, fontSize: 10 }}>Stretch important goals to 1.5× timeline</Text>
        </Pressable>
      </Glass>

      <Section ctx={ctx} title="Simulation result" />
      <Glass ctx={ctx} style={ctx.s.note}>
        <View style={ctx.s.herotop}>
          <View>
            <Text style={ctx.s.meta}>Monthly savings in scenario</Text>
            <Text style={ctx.s.statBig}>{ctx.money(savings)}</Text>
          </View>
          <Badge ctx={ctx} label={whatIf.onTrack ? "All goals funded" : ctx.money(Math.round(whatIf.shortfall)) + " short"} color={whatIf.onTrack ? ctx.T.mint : ctx.T.coral} />
        </View>
        <Text style={[ctx.s.meta, { marginTop: 10 }]}>
          Shortfall moves from {ctx.money(Math.round(base.shortfall))} → {ctx.money(Math.round(whatIf.shortfall))}/mo
          {base.shortfall - whatIf.shortfall > 1 ? " ✅ improved" : base.shortfall <= 0.01 ? " (already on track)" : ""}
        </Text>
      </Glass>

      <Glass ctx={ctx} style={ctx.s.card}>
        {whatIf.plans.map((p) => (
          <View key={p.id} style={ctx.s.cat}>
            <View style={ctx.s.herotop}>
              <Text style={ctx.s.title}>{p.name}</Text>
              <Text style={{ color: p.funded ? ctx.T.mint : ctx.T.coral, fontSize: 10, fontWeight: "700" }}>{ctx.money(Math.round(p.allocated))}/mo</Text>
            </View>
            <Text style={[ctx.s.meta, { marginTop: 4 }]}>
              {p.priority} · projected {p.projectedDate === "—" ? "—" : ctx.fmtDate(p.projectedDate)}{p.delayMonths > 0 ? ` (+${p.delayMonths} mo late)` : " · on time"}
            </Text>
          </View>
        ))}
      </Glass>
      <Text style={ctx.s.help}>Scenarios are simulations only — nothing is saved until you change a real goal.</Text>
    </>
  );
}
