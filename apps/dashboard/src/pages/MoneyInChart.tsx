import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cedis, hourLabel } from '../lib/money';
import type { DaySummary } from '../lib/reports';
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
      muted: read('--muted'),
      surface: read('--surface'),
      text: read('--text'),
      dark,
    };
  }, [dark]);
}

/**
 * Money in as the day goes on, adding up hour by hour (by when each order was taken). Loaded on
 * its own, so the chart library doesn't slow down the first screen on mobile data.
 */
export default function MoneyInChart({ byHour }: { byHour: DaySummary['byHour'] }) {
  const colours = useChartColours();
  const points = useMemo(() => {
    const hours = byHour.map((row) => row.hour);
    const first = Math.max(0, Math.min(...hours) - 1);
    const last = Math.max(...hours);
    const amounts = new Map(byHour.map((row) => [row.hour, row.moneyIn]));
    let running = 0;
    const result: { label: string; value: number }[] = [];
    for (let hour = first; hour <= last; hour++) {
      running += amounts.get(hour) ?? 0;
      result.push({ label: hourLabel(hour), value: running });
    }
    return result;
  }, [byHour]);

  return (
    <ResponsiveContainer width="100%" height={150}>
      <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id="money-in-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={colours.brand} stopOpacity={0.18} />
            <stop offset="95%" stopColor={colours.brand} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={colours.border} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: colours.muted }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: colours.muted }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(value: number) => `₵${Math.round(value / 100)}`}
        />
        <Tooltip
          contentStyle={{
            background: colours.surface,
            border: `1px solid ${colours.border}`,
            borderRadius: 8,
            fontSize: 12,
            color: colours.text,
          }}
          formatter={(value) => [cedis(Number(value)), 'Money in']}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={colours.brand}
          strokeWidth={2}
          fill="url(#money-in-fill)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
