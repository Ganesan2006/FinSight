// ============================================================
// GOAL CONFLICT DETECTOR — pure planning engine (hackathon core)
// Deterministic, unit-testable math used by the Goal tab.
// ============================================================

export type Priority = "Essential" | "Important" | "Flexible";

export interface PlanGoal {
  id: string;
  name: string;
  target: number;        // target amount
  saved: number;         // current amount already in the goal
  date: string;          // target date ISO
  priority: Priority;
}

export interface GoalPlan extends PlanGoal {
  months: number;            // months left to deadline (>=1)
  remaining: number;         // target - saved
  required: number;          // monthly saving needed to hit deadline
  progress: number;          // 0..100
  allocated: number;         // realistic monthly allocation after prioritization
  funded: boolean;           // allocation covers requirement
  shortfall: number;         // required - allocated (>=0)
  projectedDate: string;     // realistic finish date at allocated rate
  delayMonths: number;       // months beyond deadline (0 if on track)
}

export interface ConflictPair {
  a: string;
  b: string;
  reason: string;
}

export interface ScenarioInput {
  extraMonthly?: number;      // additional income per month
  cutPercent?: number;        // percent cut from spending (frees savings)
  extendFlexible?: number;    // add N months to flexible-goal deadlines
  reduceImportant?: boolean;  // stretch important goals to 1.5x timeline
}

export interface Analysis {
  available: number;               // monthly savings available now
  totalRequired: number;           // sum of required contributions
  totalAllocated: number;
  shortfall: number;               // max(0, required - available)
  surplus: number;                 // max(0, available - required)
  conflicts: ConflictPair[];
  plans: GoalPlan[];               // ordered Essential -> Important -> Flexible
  onTrack: boolean;
}

const PRIORITY_ORDER: Record<Priority, number> = { Essential: 0, Important: 1, Flexible: 2 };
const MS_PER_MONTH = 30 * 86400000;

export function monthsLeft(dateIso: string, nowMs: number): number {
  const diff = new Date(dateIso + "T12:00:00").getTime() - nowMs;
  return Math.max(1, Math.ceil(diff / MS_PER_MONTH));
}

export function addMonths(dateIso: string, months: number): string {
  const d = new Date(dateIso + "T12:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function isoFromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// Waterfall allocation: Essential first, then Important, then Flexible.
// Each goal gets min(required, pool), pool = available savings this month.
export function analyzeGoals(goals: PlanGoal[], availableSavings: number, nowMs: number = Date.now(), scenario?: ScenarioInput): Analysis {
  const extra = Math.max(0, scenario?.extraMonthly || 0);
  const freed = Math.max(0, Math.min(100, scenario?.cutPercent || 0)) / 100;
  const available = Math.max(0, availableSavings * (1 - freed) + freed * Math.max(0, availableSavings) + extra);
  // note: cutting spending doesn't change savings here unless caller passes spent; we keep it simple:
  // available stays availableSavings + extra. cutPercent is applied by caller via modified inputs.

  const sorted = [...goals].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || new Date(a.date).getTime() - new Date(b.date).getTime());

  let pool = Math.max(0, availableSavings + extra);
  const plans: GoalPlan[] = sorted.map((g) => {
    const deadlineAdj =
      (g.priority === "Flexible" && scenario?.extendFlexible ? addMonths(g.date, scenario.extendFlexible) : g.date);
    const monthsBase = monthsLeft(deadlineAdj, nowMs);
    const months = g.priority === "Important" && scenario?.reduceImportant ? Math.round(monthsBase * 1.5) || monthsBase : monthsBase;
    const remaining = Math.max(0, g.target - g.saved);
    const required = remaining / months;
    const allocated = Math.min(required, pool);
    pool -= allocated;
    const projectedMs = allocated > 0 ? nowMs + (remaining / allocated) * MS_PER_MONTH : Infinity;
    const deadlineMs = new Date(deadlineAdj + "T12:00:00").getTime();
    const delayMonths = Number.isFinite(projectedMs) ? Math.max(0, Math.ceil((projectedMs - deadlineMs) / MS_PER_MONTH)) : months;
    return {
      ...g,
      date: deadlineAdj,
      months,
      remaining,
      required,
      progress: g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0,
      allocated,
      funded: allocated >= required - 0.01,
      shortfall: Math.max(0, required - allocated),
      projectedDate: Number.isFinite(projectedMs) ? isoFromMs(projectedMs) : "—",
      delayMonths,
    };
  });

  const totalRequired = plans.reduce((n, p) => n + p.required, 0);
  const totalAllocated = plans.reduce((n, p) => n + p.allocated, 0);
  const shortfall = Math.max(0, totalRequired - (availableSavings + extra));
  const surplus = Math.max(0, availableSavings + extra - totalRequired);

  // Conflicts: two unfunded goals competing for the same pool, or any
  // goal that will land later than its deadline once priorities are applied.
  const conflicts: ConflictPair[] = [];
  const unfunded = plans.filter((p) => !p.funded && p.required > 0);
  for (let i = 0; i < unfunded.length; i++) {
    for (let j = i + 1; j < unfunded.length; j++) {
      conflicts.push({
        a: unfunded[i].name,
        b: unfunded[j].name,
        reason: `Both need monthly savings but only ${Math.round(availableSavings + extra)} is available — the lower-priority goal gets delayed.`,
      });
    }
  }
  plans.forEach((p) => {
    if (p.delayMonths > 0 && !unfunded.includes(p)) {
      conflicts.push({ a: p.name, b: "Timeline", reason: `Projected completion is about ${p.delayMonths} month(s) past the target date.` });
    }
  });

  return {
    available: availableSavings + extra,
    totalRequired,
    totalAllocated,
    shortfall,
    surplus,
    conflicts: conflicts.slice(0, 6),
    plans,
    onTrack: shortfall <= 0.01,
  };
}

// What-if: recompute with an adjusted monthly spend/savings figure.
export function scenarioSavings(income: number, spent: number, billsMonthly: number, scenario?: ScenarioInput): number {
  const base = Math.max(0, income - spent - billsMonthly);
  const cut = Math.max(0, Math.min(100, scenario?.cutPercent || 0)) / 100;
  return base + spent * cut + Math.max(0, scenario?.extraMonthly || 0);
}
