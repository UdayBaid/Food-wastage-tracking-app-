import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

export function Screen({ title, eyebrow, subtitle, right, children }: PropsWithChildren<{ title: string; eyebrow?: string; subtitle?: string; right?: ReactNode }>) {
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.headerRow}>
      <View style={styles.headerCopy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
    {children}
  </ScrollView>;
}

export function Panel({ title, subtitle, children, action }: PropsWithChildren<{ title?: string; subtitle?: string; action?: ReactNode }>) {
  return <View style={styles.panel}>
    {(title || action) ? <View style={styles.panelHeader}>
      <View style={styles.headerCopy}>{title ? <Text style={styles.panelTitle}>{title}</Text> : null}{subtitle ? <Text style={styles.panelSubtitle}>{subtitle}</Text> : null}</View>
      {action}
    </View> : null}
    {children}
  </View>;
}

export function ActionButton({ label, onPress, kind = 'primary', disabled = false, loading = false, compact = false }: {
  label: string; onPress: () => void; kind?: 'primary' | 'light' | 'danger'; disabled?: boolean; loading?: boolean; compact?: boolean;
}) {
  return <Pressable onPress={onPress} disabled={disabled || loading} style={({ pressed }) => [
    styles.button,
    kind === 'primary' ? styles.primaryButton : kind === 'danger' ? styles.dangerButton : styles.lightButton,
    compact && styles.compactButton,
    (disabled || loading) && styles.buttonDisabled,
    pressed && !disabled && styles.buttonPressed,
  ]}>
    {loading ? <ActivityIndicator size="small" color={kind === 'primary' ? colors.white : colors.terracotta} /> : <Text style={[styles.buttonText, kind !== 'primary' && styles.lightButtonText]}>{label}</Text>}
  </Pressable>;
}

export function TextField({ label, value, onChangeText, placeholder, keyboardType = 'default', multiline = false, helper, secureTextEntry = false }: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad'; multiline?: boolean; helper?: string; secureTextEntry?: boolean;
}) {
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={keyboardType} multiline={multiline} secureTextEntry={secureTextEntry} style={[styles.input, multiline && styles.multiline]} />
    {helper ? <Text style={styles.fieldHelper}>{helper}</Text> : null}
  </View>;
}

export function Segment<T extends string>({ label, value, options, onChange }: { label?: string; value: T; options: readonly T[]; onChange: (value: T) => void }) {
  return <View style={styles.segmentWrap}>
    {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
    <View style={styles.segment}>
      {options.map((option) => <Pressable key={option} onPress={() => onChange(option)} style={[styles.segmentItem, value === option && styles.segmentActive]}>
        <Text style={[styles.segmentText, value === option && styles.segmentTextActive]}>{option}</Text>
      </Pressable>)}
    </View>
  </View>;
}

export function StatTile({ label, value, unit, tone = 'terracotta' }: { label: string; value: string; unit?: string; tone?: 'terracotta' | 'green' | 'mustard' | 'ink' }) {
  const toneColor = tone === 'green' ? colors.green : tone === 'mustard' ? colors.mustard : tone === 'ink' ? colors.ink : colors.terracotta;
  return <View style={styles.statTile}>
    <View style={[styles.statMark, { backgroundColor: toneColor }]} />
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}<Text style={styles.statUnit}>{unit ? ` ${unit}` : ''}</Text></Text>
  </View>;
}

export function StatusBanner({ title, detail, tone = 'neutral' }: { title: string; detail?: string; tone?: 'neutral' | 'good' | 'warning' | 'error' }) {
  const background = tone === 'good' ? colors.greenSoft : tone === 'warning' ? colors.mustardSoft : tone === 'error' ? colors.terracottaSoft : colors.sand;
  const accent = tone === 'good' ? colors.green : tone === 'warning' ? colors.mustard : tone === 'error' ? colors.terracotta : colors.ink;
  return <View style={[styles.status, { backgroundColor: background }]}>
    <View style={[styles.statusDot, { backgroundColor: accent }]} />
    <View style={styles.headerCopy}><Text style={[styles.statusTitle, { color: accent }]}>{title}</Text>{detail ? <Text style={styles.statusDetail}>{detail}</Text> : null}</View>
  </View>;
}

export function LoadingState({ label = 'Opening local FoodWise data' }: { label?: string }) {
  return <View style={styles.loading}><ActivityIndicator color={colors.terracotta} /><Text style={styles.subtitle}>{label}</Text></View>;
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return <View style={styles.empty}><Text style={styles.emptyTitle}>{title}</Text>{detail ? <Text style={styles.subtitle}>{detail}</Text> : null}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 44, gap: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm, marginBottom: 2 },
  headerCopy: { flex: 1, gap: 5 },
  eyebrow: { color: colors.green, fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  title: { color: colors.ink, fontFamily: 'serif', fontSize: 29, lineHeight: 34 },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  panel: { backgroundColor: colors.paper, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  panelTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  panelSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  button: { minHeight: 46, borderRadius: radius.sm, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  primaryButton: { backgroundColor: colors.terracotta },
  lightButton: { backgroundColor: colors.sand },
  dangerButton: { backgroundColor: colors.terracottaSoft },
  buttonText: { color: colors.white, fontSize: 14, fontWeight: '700' },
  lightButtonText: { color: colors.ink },
  compactButton: { minHeight: 38, paddingHorizontal: 13 },
  buttonDisabled: { opacity: 0.55 },
  buttonPressed: { opacity: 0.78 },
  field: { gap: 7 },
  fieldLabel: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 12, color: colors.ink, backgroundColor: colors.white, fontSize: 15 },
  multiline: { minHeight: 92, textAlignVertical: 'top', paddingTop: 12 },
  fieldHelper: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  segmentWrap: { gap: 7 },
  segment: { flexDirection: 'row', backgroundColor: colors.sand, borderRadius: radius.sm, padding: 3, gap: 3 },
  segmentItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 40, paddingHorizontal: 6, borderRadius: 6 },
  segmentActive: { backgroundColor: colors.paper, borderColor: colors.line, borderWidth: 1 },
  segmentText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  segmentTextActive: { color: colors.terracotta, fontWeight: '700' },
  statTile: { flex: 1, minWidth: '46%', backgroundColor: colors.paper, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 9 },
  statMark: { width: 22, height: 3, borderRadius: 2 },
  statLabel: { color: colors.muted, fontSize: 12 },
  statValue: { color: colors.ink, fontFamily: 'serif', fontSize: 23 },
  statUnit: { color: colors.muted, fontFamily: 'System', fontSize: 12 },
  status: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: radius.sm, padding: 12 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  statusTitle: { fontSize: 12, fontWeight: '700' },
  statusDetail: { marginTop: 4, color: colors.muted, fontSize: 11, lineHeight: 16 },
  loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 12 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.lg, gap: 6 },
  emptyTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
});

export const uiStyles = styles;
