import React from 'react';
import { CalendarRange } from 'lucide-react';
import { localDate, monthStart, shiftDate } from '../../../services/admin.service';

export type PeriodPreset = 'TODAY' | 'YESTERDAY' | '7D' | '30D' | 'MONTH' | 'LAST_MONTH' | 'CUSTOM';
export interface Period {
  preset: PeriodPreset;
  from: string; // YYYY-MM-DD (horário de Brasília)
  to: string;
}

const LABELS: Record<Exclude<PeriodPreset, 'CUSTOM'>, string> = {
  TODAY: 'Hoje',
  YESTERDAY: 'Ontem',
  '7D': '7 dias',
  '30D': '30 dias',
  MONTH: 'Este mês',
  LAST_MONTH: 'Mês passado',
};

export function periodFor(preset: Exclude<PeriodPreset, 'CUSTOM'>): Period {
  const today = localDate();
  switch (preset) {
    case 'TODAY':
      return { preset, from: today, to: today };
    case 'YESTERDAY': {
      const y = shiftDate(today, -1);
      return { preset, from: y, to: y };
    }
    case '7D':
      return { preset, from: shiftDate(today, -6), to: today };
    case '30D':
      return { preset, from: shiftDate(today, -29), to: today };
    case 'MONTH':
      return { preset, from: monthStart(today), to: today };
    case 'LAST_MONTH': {
      const lastDay = shiftDate(monthStart(today), -1);
      return { preset, from: monthStart(lastDay), to: lastDay };
    }
  }
}

/** Período anterior de mesma duração (para comparação). */
export function previousPeriod(p: Period): Period {
  const days = Math.round((Date.parse(p.to) - Date.parse(p.from)) / 86_400_000) + 1;
  if (p.preset === 'MONTH' || p.preset === 'LAST_MONTH') {
    const prevEnd = shiftDate(p.from, -1);
    const prevStart = monthStart(prevEnd);
    // Mesmo número de dias do mês corrente (comparação justa no meio do mês)
    const end = shiftDate(prevStart, days - 1);
    return { preset: 'CUSTOM', from: prevStart, to: end > prevEnd ? prevEnd : end };
  }
  return { preset: 'CUSTOM', from: shiftDate(p.from, -days), to: shiftDate(p.from, -1) };
}

export const formatPeriod = (p: Period) => {
  const br = (d: string) => d.split('-').reverse().join('/');
  return p.from === p.to ? br(p.from) : `${br(p.from)} a ${br(p.to)}`;
};

interface Props {
  value: Period;
  onChange: (p: Period) => void;
  presets?: Exclude<PeriodPreset, 'CUSTOM'>[];
}

export const PeriodPicker: React.FC<Props> = ({ value, onChange, presets = ['TODAY', '7D', '30D', 'MONTH', 'LAST_MONTH'] }) => {
  const today = localDate();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap bg-zinc-950 border border-zinc-800 rounded-xl p-1" role="group" aria-label="Período">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(periodFor(p))}
            aria-pressed={value.preset === p}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              value.preset === p ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-white'
            }`}
          >
            {LABELS[p]}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-300">
        <CalendarRange className="w-3.5 h-3.5 text-amber-400" />
        <input
          type="date"
          aria-label="Data inicial"
          value={value.from}
          max={value.to}
          onChange={(e) => e.target.value && onChange({ preset: 'CUSTOM', from: e.target.value, to: value.to })}
          className="bg-transparent text-white focus:outline-none [color-scheme:dark]"
        />
        <span className="text-zinc-500">até</span>
        <input
          type="date"
          aria-label="Data final"
          value={value.to}
          min={value.from}
          max={today}
          onChange={(e) => e.target.value && onChange({ preset: 'CUSTOM', from: value.from, to: e.target.value })}
          className="bg-transparent text-white focus:outline-none [color-scheme:dark]"
        />
      </label>
    </div>
  );
};
