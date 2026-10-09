import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { hourLabel, hourRange } from '../lib/money';
import { busiestHour } from '../lib/reports';
import { useDark } from '../lib/theme';

/** The chart library draws SVG, which needs real colours rather than CSS variables. */
function useChartColours() {
  const dark = useDark();
  return useMemo(() => {
    const style = getComputedStyle(document.documentElement);
    const read = (name: string) => style.getPropertyValue(name).trim();
    return {
      brand: read('--brand'),
      border: read('--border'),
      muted: read('--muted-foreground'),
      surface: read('--surface'),
      text: read('--text'),
      dark,
    };
  }, [dark]);
}

/**
 * Orders taken in each hour, to show the busy hours: one bar per hour from the first order to
 * the last, the busiest one in full colour. Loaded on its own, so the chart library doesn't slow
 * down the first screen on mobile data.
 */
export default function OrdersByHourChart({
  byHour,
}: {
  byHour: { hour: number; orders: number }[];
}) {
  const colours = useChartColours();
  const { points, busiest } = useMemo(() => {
    const counts = new Map(byHour.filter((row) => row.orders > 0).map((r) => [r.hour, r.orders]));
    const hours = [...counts.keys()];
    const result: { hour: number; orders: number }[] = [];
    for (let hour = Math.min(...hours); hour <= Math.max(...hours); hour++) {
      result.push({ hour, orders: counts.get(hour) ?? 0 });
    }
    return { points: result, busiest: busiestHour(byHour)?.hour };
  }, [byHour]);

  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={colours.border} vertical={false} />
        <XAxis
          dataKey="hour"
          tickFormatter={(hour: number) => hourLabel(hour)}
          tick={{ fontSize: 11, fill: colours.muted }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: colours.muted }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: colours.border, opacity: 0.5 }}
          contentStyle={{
            background: colours.surface,
            border: `1px solid ${colours.border}`,
            borderRadius: 8,
            fontSize: 12,
            color: colours.text,
          }}
          labelFormatter={(hour) => hourRange(Number(hour))}
          formatter={(value) => [String(value), 'Orders']}
        />
        <Bar dataKey="orders" radius={[4, 4, 0, 0]} maxBarSize={32}>
          {points.map((point) => (
            <Cell
              key={point.hour}
              fill={colours.brand}
              fillOpacity={point.hour === busiest ? 1 : 0.35}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
