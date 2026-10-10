'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumber } from '@/lib/client/format';
import type { DayCount } from '@/lib/types';

const short = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const label = (day: string) => short.format(new Date(`${day}T00:00:00Z`));

/**
 * One value per day as a filled line. The same numbers are also available to screen readers as a table.
 */
export function TrendChart({
  title,
  data,
  colour = '#5B3DF5',
  unit,
}: {
  title: string;
  data: DayCount[];
  colour?: string;
  unit: string;
}) {
  const id = `trend-${colour.slice(1)}`;
  return (
    <figure>
      <div
        role="img"
        aria-label={`${title}: ${data.map((d) => `${label(d.day)} ${d.count}`).join(', ')}`}
        className="h-[190px] w-full"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={colour} stopOpacity={0.28} />
                <stop offset="1" stopColor={colour} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#E7E5F2" />
            <XAxis
              dataKey="day"
              tickFormatter={label}
              tick={{ fontSize: 11, fill: '#6B6A85' }}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: '#6B6A85' }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip
              formatter={(v) => [formatNumber(Number(v)), unit]}
              labelFormatter={(d) => label(String(d))}
              contentStyle={{ borderRadius: 10, border: '1px solid #E7E5F2', fontSize: 12 }}
            />
            <Area type="monotone" dataKey="count" stroke={colour} strokeWidth={2.5} fill={`url(#${id})`} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.day}>
                <td>{label(d.day)}</td>
                <td>{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
