// Liquid Glass reusable primitives — every panel in the app is built from these.
import React from "react";
import { Modal, Platform, Pressable, ScrollView, TextInput, View, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { ChevronRight, X } from "lucide-react-native";
import { GlassStyles, GlassTheme } from "../../theme/glass";

export interface Ctx {
  s: GlassStyles;
  T: GlassTheme;
  money: (n: number) => string;
  iso: (offsetDays?: number) => string;
  fmtDate: (d: string) => string;
}

// Glass panel: 1px inner edge + blur tint + soft diffused shadow
export function Glass({ ctx, children, style }: { ctx: Ctx; children: React.ReactNode; style?: ViewStyle }) {
  const androidSolid = Platform.OS === "android";
  return (
    <View style={[ctx.s.glassWrap, style]}>
      {androidSolid ? (
        <View style={ctx.s.glass}>{children}</View>
      ) : (
        <BlurView intensity={ctx.T.cardBlurIntensity} tint={ctx.T.name as any} style={ctx.s.glass}>
          {children}
        </BlurView>
      )}
    </View>
  );
}

export function Header({ ctx, title, sub }: { ctx: Ctx; title: string; sub?: string }) {
  return (
    <View style={ctx.s.header}>
      <Text style={ctx.s.eyebrow}>FINANCE COPILOT</Text>
      <Text style={ctx.s.h1}>{title}</Text>
      {!!sub && <Text style={ctx.s.sub}>{sub}</Text>}
    </View>
  );
}

import { Text } from "react-native";

export function Section({ ctx, title, right, onPress }: { ctx: Ctx; title: string; right?: string; onPress?: () => void }) {
  return (
    <View style={ctx.s.section}>
      <Text style={ctx.s.h2}>{title}</Text>
      {!!right && (
        <Pressable onPress={onPress} hitSlop={8}>
          <Text style={ctx.s.link}>{right}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function Bar({ ctx, value, color }: { ctx: Ctx; value: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <View style={ctx.s.bar}>
      <View style={{ width: `${pct}%` as any, height: "100%", backgroundColor: color || ctx.T.mint, borderRadius: 4 }} />
    </View>
  );
}

export function Badge({ ctx, label, color }: { ctx: Ctx; label: string; color?: string }) {
  const c = color || ctx.T.mint;
  return (
    <View style={[ctx.s.badge, { borderColor: c + "55", backgroundColor: c + "18" }]}>
      <Text style={{ color: c, fontSize: 9, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

export function Row({ ctx, title, sub, amount, color, icon: Icon, onPress, right }: { ctx: Ctx; title: string; sub?: string; amount?: string; color?: string; icon?: any; onPress?: () => void; right?: React.ReactNode }) {
  const body = (
    <>
      <View style={ctx.s.rowIcon}>
        {Icon ? <Icon size={16} color={color || ctx.T.blue} /> : <Text style={{ color: color || ctx.T.text, fontWeight: "700", fontSize: 12 }}>{title.slice(0, 1).toUpperCase()}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={ctx.s.title}>{title}</Text>
        {!!sub && <Text style={[ctx.s.meta, { marginTop: 2 }]} numberOfLines={2}>{sub}</Text>}
      </View>
      {!!amount && <Text style={[ctx.s.value, { color: color || ctx.T.text }]}>{amount}</Text>}
      {right}
    </>
  );
  return onPress ? <Pressable onPress={onPress} style={ctx.s.row}>{body}</Pressable> : <View style={ctx.s.row}>{body}</View>;
}

export function Field({ ctx, label, value, onChangeText, placeholder, keyboardType, secure, multiline }: { ctx: Ctx; label?: string; value: string; onChangeText: (v: string) => void; placeholder?: string; keyboardType?: any; secure?: boolean; multiline?: boolean }) {
  return (
    <>
      {!!label && <Text style={[ctx.s.meta, { marginBottom: 5, color: ctx.T.muted }]}>{label}</Text>}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={ctx.T.faint}
        keyboardType={keyboardType}
        secureTextEntry={secure}
        multiline={multiline}
        autoCapitalize="none"
        style={[ctx.s.input, multiline ? { height: 74, paddingTop: 12, textAlignVertical: "top" } : null]}
      />
    </>
  );
}

export function AmountField({ ctx, symbol, value, onChangeText }: { ctx: Ctx; symbol: string; value: string; onChangeText: (v: string) => void }) {
  return (
    <View style={ctx.s.amountBox}>
      <Text style={{ color: ctx.T.muted, fontSize: 19, fontWeight: "600" }}>{symbol}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholder="0" keyboardType="decimal-pad" placeholderTextColor={ctx.T.faint} style={ctx.s.amountInput} />
    </View>
  );
}

export function Chips({ ctx, options, value, onChange }: { ctx: Ctx; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={ctx.s.kindGrid}>
      {options.map((o) => (
        <Pressable key={o} onPress={() => onChange(o)} style={[ctx.s.kindTile, value === o && ctx.s.kindActive]}>
          <Text style={{ color: value === o ? ctx.T.mint : ctx.T.muted, fontSize: 9, fontWeight: "600" }}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function PrimaryButton({ ctx, label, onPress, disabled, loading, danger }: { ctx: Ctx; label: string; onPress: () => void; disabled?: boolean; loading?: boolean; danger?: boolean }) {
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={[ctx.s.save, danger && { backgroundColor: "transparent", borderWidth: 1, borderColor: ctx.T.coral + "66" }, (disabled || loading) && { opacity: 0.55 }]}
    >
      <Text style={[ctx.s.saveText, danger && { color: ctx.T.coral }]}>{loading ? "Please wait…" : label}</Text>
      {!danger && <ChevronRight size={17} color={ctx.T.primaryBtnText} />}
    </Pressable>
  );
}

export function GhostButton({ ctx, label, icon: Icon, onPress }: { ctx: Ctx; label: string; icon?: any; onPress: () => void }) {
  return (
    <Pressable style={ctx.s.ghostBtn} onPress={onPress}>
      {!!Icon && <Icon size={15} color={ctx.T.mint} />}
      <Text style={{ color: ctx.T.mint, fontSize: 11, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

// Bottom sheet with glass material (Quick Add, forms, pickers)
export function GlassSheet({ ctx, visible, title, subtitle, onClose, children }: { ctx: Ctx; visible: boolean; title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  const androidSolid = Platform.OS === "android";
  const body = <SheetBody ctx={ctx} title={title} subtitle={subtitle} onClose={onClose}>{children}</SheetBody>;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={ctx.s.modalRoot}>
        <Pressable style={ctx.s.scrim} onPress={onClose} />
        {androidSolid ? <View style={ctx.s.modal}>{body}</View> : (
          <BlurView intensity={ctx.T.sheetBlurIntensity} tint={ctx.T.name as any} style={ctx.s.modal}>{body}</BlurView>
        )}
      </View>
    </Modal>
  );
}

function SheetBody({ ctx, title, subtitle, onClose, children }: { ctx: Ctx; title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <View style={ctx.s.modalHandle} />
      <View style={ctx.s.herotop}>
        <View>
          <Text style={ctx.s.modalTitle}>{title}</Text>
          {!!subtitle && <Text style={ctx.s.meta}>{subtitle}</Text>}
        </View>
        <Pressable onPress={onClose} hitSlop={10}>
          <X color={ctx.T.muted} size={18} />
        </Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {children}
        <View style={{ height: 10 }} />
      </ScrollView>
    </>
  );
}

export function EmptyState({ ctx, text }: { ctx: Ctx; text: string }) {
  return <Text style={[ctx.s.help, { paddingVertical: 14, textAlign: "center" }]}>{text}</Text>;
}
