// ============================================================
// LIQUID GLASS DESIGN SYSTEM (iOS 26 inspired) — React Native tokens
// Web apps use Tailwind classes like bg-white/10 backdrop-blur-xl;
// in React Native we emulate this with expo-blur + translucent layers,
// 1px inner borders and soft diffused shadows.
// ============================================================
import { Platform, StyleSheet, ViewStyle } from "react-native";

export type ThemeName = "dark" | "light";

export interface GlassTheme {
  name: ThemeName;
  bg: string;
  bgDeep: string;
  text: string;
  muted: string;
  faint: string;
  glassTint: string;          // overlay color on top of BlurView
  glassSolid: string;         // fallback when blur unsupported
  edge: string;               // 1px glass edge border
  edgeStrong: string;
  divider: string;
  scrim: string;              // modal scrim
  sheetBlurIntensity: number;
  cardBlurIntensity: number;
  mint: string;
  violet: string;
  blue: string;
  coral: string;
  gold: string;
  pink: string;
  orbA: [string, string];
  orbB: [string, string];
  orbC: [string, string];
  heroGrad: [string, string];
  investGrad: [string, string];
  billGrad: [string, string];
  fabGrad: [string, string];
  fabText: string;
  primaryBtn: string;
  primaryBtnText: string;
}

export const dark: GlassTheme = {
  name: "dark",
  bg: "#080D18",
  bgDeep: "#050912",
  text: "#F4F7FC",
  muted: "#8B98AE",
  faint: "#66748B",
  glassTint: "rgba(19,28,45,0.42)",
  glassSolid: "rgba(20,30,48,0.86)",
  edge: "rgba(225,237,255,0.13)",
  edgeStrong: "rgba(225,237,255,0.20)",
  divider: "rgba(225,237,255,0.06)",
  scrim: "rgba(2,5,12,0.66)",
  sheetBlurIntensity: 60,
  cardBlurIntensity: 30,
  mint: "#78E5C1",
  violet: "#B69BFF",
  blue: "#82B8FF",
  coral: "#FF9E9E",
  gold: "#F3CD84",
  pink: "#FF9ED2",
  orbA: ["rgba(99,115,255,0.30)", "transparent"],
  orbB: ["rgba(38,207,170,0.20)", "transparent"],
  orbC: ["rgba(255,120,180,0.16)", "transparent"],
  heroGrad: ["#293B59", "#19263B"],
  investGrad: ["#203A42", "#1A2E3C"],
  billGrad: ["#3D3428", "#292A34"],
  fabGrad: ["#B9A3FF", "#8C7AF4"],
  fabText: "#17132A",
  primaryBtn: "#B69BFF",
  primaryBtnText: "#201835",
};

export const light: GlassTheme = {
  name: "light",
  bg: "#EEF1F8",
  bgDeep: "#E3E8F3",
  text: "#141A26",
  muted: "#5A6478",
  faint: "#8A93A6",
  glassTint: "rgba(255,255,255,0.18)",
  glassSolid: "rgba(255,255,255,0.62)",
  edge: "rgba(255,255,255,0.55)",
  edgeStrong: "rgba(255,255,255,0.75)",
  divider: "rgba(20,26,38,0.07)",
  scrim: "rgba(20,26,38,0.30)",
  sheetBlurIntensity: 70,
  cardBlurIntensity: 40,
  mint: "#0FA97F",
  violet: "#7A5AF8",
  blue: "#2F7CF6",
  coral: "#E5484D",
  gold: "#B27B12",
  pink: "#DB2777",
  orbA: ["rgba(122,90,248,0.28)", "transparent"],
  orbB: ["rgba(15,169,127,0.22)", "transparent"],
  orbC: ["rgba(219,39,119,0.18)", "transparent"],
  heroGrad: ["#FFFFFF", "#E7ECF7"],
  investGrad: ["#DDF3EA", "#DCE8F5"],
  billGrad: ["#FBEFD8", "#EDE7F6"],
  fabGrad: ["#8C7AF4", "#6D5AE8"],
  fabText: "#FFFFFF",
  primaryBtn: "#7A5AF8",
  primaryBtnText: "#FFFFFF",
};

export const themes: Record<ThemeName, GlassTheme> = { dark, light };

export function makeGlassStyles(T: GlassTheme) {
  const shadow: ViewStyle =
    Platform.OS === "ios" || Platform.OS === "web"
      ? ({
          shadowColor: T.name === "dark" ? "#01040A" : "#31405F",
          shadowOpacity: T.name === "dark" ? 0.28 : 0.12,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
        } as ViewStyle)
      : { elevation: 5 };

  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: T.bg },
    bg: { flex: 1, backgroundColor: T.bg, overflow: "hidden" },

    orbA: { position: "absolute", width: 320, height: 320, borderRadius: 170, top: -190, right: -140 },
    orbB: { position: "absolute", width: 300, height: 300, borderRadius: 160, top: 280, left: -230 },
    orbC: { position: "absolute", width: 260, height: 260, borderRadius: 140, bottom: -140, right: -110 },

    top: { height: 56, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 10 },
    mark: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: T.mint + "22", borderWidth: 1, borderColor: T.mint + "33" },
    brand: { fontSize: 15, fontWeight: "700", color: T.text },
    topButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 12 },
    avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: T.name === "dark" ? "#29354E" : "#DDE4F2", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: T.edge },

    content: { paddingHorizontal: 18, paddingTop: 10 },

    eyebrow: { color: T.mint, fontSize: 9, letterSpacing: 2, fontWeight: "700", marginBottom: 7 },
    h1: { color: T.text, fontSize: 24, fontWeight: "700", letterSpacing: -0.5 },
    h2: { fontSize: 14, color: T.text, fontWeight: "700" },
    sub: { color: T.muted, fontSize: 11, marginTop: 5 },
    meta: { color: T.muted, fontSize: 10 },
    title: { color: T.text, fontSize: 11, fontWeight: "600" },
    value: { color: T.text, fontSize: 11, fontWeight: "600" },
    big: { fontSize: 34, color: T.text, fontWeight: "700", letterSpacing: -1, marginVertical: 10 },
    statBig: { fontSize: 21, color: T.text, fontWeight: "700", marginTop: 9 },
    statValue: { color: T.text, fontSize: 12, fontWeight: "700", marginTop: 5 },
    help: { color: T.faint, fontSize: 10, lineHeight: 15, marginTop: 12, paddingHorizontal: 3 },
    link: { color: T.mint, fontSize: 10, fontWeight: "600" },

    header: { marginBottom: 20 },
    section: { marginTop: 22, marginBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

    glassWrap: {
      borderRadius: 20,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: T.edge,
      backgroundColor: T.glassSolid,
      ...shadow,
    },
    glass: { padding: 15, backgroundColor: T.glassTint },
    card: { paddingVertical: 3, paddingHorizontal: 13 },
    note: { padding: 16, marginTop: 12 },

    hero: { borderRadius: 24, padding: 19, minHeight: 150, borderWidth: 1, borderColor: T.edgeStrong, marginBottom: 12, ...shadow },
    herotop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    secure: { flexDirection: "row", alignItems: "center", gap: 5 },
    secureText: { color: T.mint, fontSize: 8, letterSpacing: 1.2, fontWeight: "700" },

    stats: { flexDirection: "row", gap: 8 },
    stat: { flex: 1, padding: 11, borderRadius: 16, minHeight: 93 },
    statIcon: { width: 26, height: 26, borderRadius: 9, alignItems: "center", justifyContent: "center", marginBottom: 8 },
    dues: { flex: 1, padding: 15, minHeight: 95 },

    cat: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.divider },
    bar: { height: 4, borderRadius: 4, backgroundColor: T.name === "dark" ? "rgba(230,240,255,0.09)" : "rgba(20,26,38,0.08)", marginTop: 8, overflow: "hidden" },

    row: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: T.divider },
    rowIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: T.blue + "1F", alignItems: "center", justifyContent: "center" },

    badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },

    available: { padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
    targetIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: T.violet + "22", alignItems: "center", justifyContent: "center" },
    availableAmount: { color: T.text, fontSize: 17, fontWeight: "700", marginTop: 4 },
    planButton: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: T.violet, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8 },
    planLabel: { color: T.name === "dark" ? "#201835" : "#FFFFFF", fontSize: 9, fontWeight: "700" },
    analysis: { padding: 15, marginTop: 12 },
    goal: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.divider, gap: 9 },

    billHero: { borderRadius: 22, padding: 18, minHeight: 125, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: T.edge, ...shadow },
    pay: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: T.mint + "1F" },

    fab: { position: "absolute", bottom: 84, right: 20, zIndex: 4, borderRadius: 20, overflow: "hidden", elevation: 8, ...shadow },
    fabGrad: { height: 46, paddingHorizontal: 16, gap: 7, flexDirection: "row", alignItems: "center" },
    fabText: { fontSize: 11, color: T.fabText, fontWeight: "700" },

    navWrap: { position: "absolute", bottom: 8, left: 14, right: 14, borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: T.edgeStrong, ...shadow },
    nav: { height: 64, backgroundColor: T.name === "dark" ? "rgba(13,19,31,0.80)" : "rgba(255,255,255,0.55)", flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
    navItem: { minWidth: 52, alignItems: "center", gap: 2 },
    navIcon: { width: 36, height: 28, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    activeIcon: { backgroundColor: T.mint + "1F" },
    navLabel: { fontSize: 9, color: T.faint, fontWeight: "600" },

    input: { height: 46, borderRadius: 12, paddingHorizontal: 13, color: T.text, backgroundColor: T.name === "dark" ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.65)", borderWidth: 1, borderColor: T.edge, marginBottom: 9, fontSize: 11 },
    amountBox: { height: 54, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 13, backgroundColor: T.name === "dark" ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.65)", borderWidth: 1, borderColor: T.edge, marginBottom: 10 },
    amountInput: { fontSize: 20, color: T.text, flex: 1, fontWeight: "600" },
    save: { height: 48, borderRadius: 13, backgroundColor: T.primaryBtn, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 15, marginTop: 7 },
    saveText: { fontSize: 11, color: T.primaryBtnText, fontWeight: "700" },
    ghostBtn: { height: 44, borderRadius: 13, borderWidth: 1, borderColor: T.edgeStrong, backgroundColor: T.glassTint, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8 },
    deleteButton: { marginTop: 16, borderWidth: 1, borderColor: T.coral + "4D", borderRadius: 12, alignItems: "center", padding: 12, backgroundColor: T.coral + "14" },

    kindGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginVertical: 12 },
    kindTile: { minWidth: "23%", height: 42, paddingHorizontal: 8, borderRadius: 11, backgroundColor: T.name === "dark" ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)", borderWidth: 1, borderColor: T.edge, alignItems: "center", justifyContent: "center" },
    kindActive: { backgroundColor: T.mint + "1C", borderColor: T.mint + "70" },

    modalRoot: { flex: 1, justifyContent: "flex-end" },
    scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: T.scrim },
    modal: { maxHeight: "90%", padding: 19, paddingBottom: Platform.OS === "ios" ? 34 : 22, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden", borderWidth: 1, borderColor: T.edgeStrong, backgroundColor: T.name === "dark" ? "rgba(15,22,37,0.96)" : "rgba(255,255,255,0.92)" },
    modalHandle: { width: 38, height: 4, borderRadius: 3, backgroundColor: T.name === "dark" ? "rgba(220,230,245,0.25)" : "rgba(20,26,38,0.15)", alignSelf: "center", marginBottom: 15 },
    modalTitle: { color: T.text, fontSize: 18, fontWeight: "700", marginBottom: 4 },

    moreModalRoot: { flex: 1, alignItems: "flex-end", paddingTop: 52, paddingRight: 15 },
    moreScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: T.scrim },
    morePanel: { width: 264, maxHeight: "85%", padding: 15, borderRadius: 22, overflow: "hidden", backgroundColor: T.name === "dark" ? "rgba(16,24,40,0.97)" : "rgba(255,255,255,0.95)", borderWidth: 1, borderColor: T.edgeStrong, ...shadow },

    profileCard: { padding: 14, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
    profileAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: T.mint + "24" },
    moreMenu: { borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: T.edge, backgroundColor: T.glassSolid },
    moreRow: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: T.divider },
    moreIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: T.blue + "1C" },
    backButton: { flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 12 },
    securityNote: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 14 },

    auth: { flexGrow: 1, justifyContent: "center", padding: 24 },
    authLink: { textAlign: "center", color: T.mint, fontSize: 10, marginTop: 15 },
  });
}

export type GlassStyles = ReturnType<typeof makeGlassStyles>;
