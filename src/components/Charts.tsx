import { Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { colors } from '../theme';

export interface TrendRow {
  period: string;
  prepared_kg: number;
  consumed_kg: number;
  wasted_kg: number;
  estimated_cost_inr?: number;
  waste_percentage: number;
}

export interface MealRow {
  meal_category: string;
  prepared_kg: number;
  consumed_kg: number;
  wasted_kg: number;
  records: number;
}

const width = 320;
const chartHeight = 170;
const left = 32;
const right = 12;
const top = 14;
const bottom = 28;

export function TrendChart({ data }: { data: TrendRow[] }) {
  if (!data.length) return null;
  const max = Math.max(5, ...data.map((item) => item.waste_percentage));
  const innerWidth = width - left - right;
  const innerHeight = chartHeight - top - bottom;
  const points = data.slice(-7).map((item, index, list) => ({
    x: left + (list.length === 1 ? innerWidth / 2 : (index / (list.length - 1)) * innerWidth),
    y: top + innerHeight - (item.waste_percentage / max) * innerHeight,
    item,
  }));
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  return <Svg width="100%" height={chartHeight} viewBox={`0 0 ${width} ${chartHeight}`}>
    {[0, 0.5, 1].map((fraction) => {
      const y = top + innerHeight * fraction;
      return <Line key={fraction} x1={left} y1={y} x2={width - right} y2={y} stroke={colors.line} strokeWidth="1" />;
    })}
    <Path d={path} fill="none" stroke={colors.terracotta} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    {points.map((point) => <Circle key={`${point.item.period}-${point.x}`} cx={point.x} cy={point.y} r="4" fill={colors.paper} stroke={colors.terracotta} strokeWidth="2" />)}
    {points.map((point) => <SvgText key={`label-${point.item.period}`} x={point.x} y={chartHeight - 7} fill={colors.muted} fontSize="9" textAnchor="middle">{point.item.period.slice(5)}</SvgText>)}
  </Svg>;
}

export function ComparisonChart({ data }: { data: TrendRow[] }) {
  if (!data.length) return null;
  const rows = data.slice(-5);
  const maximum = Math.max(1, ...rows.map((row) => row.prepared_kg));
  const barWidth = 28;
  const groupGap = (width - left - right - rows.length * barWidth) / rows.length;
  const chartBottom = chartHeight - bottom;
  return <Svg width="100%" height={chartHeight} viewBox={`0 0 ${width} ${chartHeight}`}>
    <Line x1={left} y1={chartBottom} x2={width - right} y2={chartBottom} stroke={colors.line} strokeWidth="1" />
    {rows.map((row, index) => {
      const x = left + index * (barWidth + groupGap) + groupGap / 2;
      const scale = (chartBottom - top) / maximum;
      const preparedHeight = row.prepared_kg * scale;
      const consumedHeight = Math.min(row.consumed_kg, row.prepared_kg) * scale;
      const wastedHeight = Math.min(row.wasted_kg, row.prepared_kg) * scale;
      return <G key={row.period}>
        <Rect x={x} y={chartBottom - preparedHeight} width={barWidth} height={preparedHeight} rx="4" fill={colors.mustard} opacity="0.88" />
        <Rect x={x + 5} y={chartBottom - consumedHeight} width={barWidth - 10} height={consumedHeight} rx="3" fill={colors.green} />
        <Rect x={x + 10} y={chartBottom - wastedHeight} width={barWidth - 20} height={wastedHeight} rx="3" fill={colors.terracotta} />
        <SvgText x={x + barWidth / 2} y={chartHeight - 7} fill={colors.muted} fontSize="9" textAnchor="middle">{row.period.slice(5)}</SvgText>
      </G>;
    })}
  </Svg>;
}

export function MealBars({ data }: { data: MealRow[] }) {
  const rows = data.slice(0, 3);
  const maximum = Math.max(1, ...rows.map((row) => row.wasted_kg));
  return <View style={{ gap: 12 }}>
    {rows.map((row, index) => <View key={row.meal_category} style={{ gap: 5 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.ink, fontSize: 12 }}>{row.meal_category}</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{row.wasted_kg.toFixed(1)} kg</Text>
      </View>
      <View style={{ height: 7, borderRadius: 4, backgroundColor: colors.sand, overflow: 'hidden' }}>
        <View style={{ width: `${Math.min(100, row.wasted_kg / maximum * 100)}%`, height: '100%', backgroundColor: [colors.terracotta, colors.green, colors.mustard][index] }} />
      </View>
    </View>)}
  </View>;
}
