// Shared screen props for the Finance Copilot app.
import { Engine } from "../lib/engine";
import { Ctx } from "../components/glass/primitives";

export interface ScreenProps {
  E: Engine;   // global state + actions
  ctx: Ctx;    // liquid-glass design context (theme, styles, money/date helpers)
}
