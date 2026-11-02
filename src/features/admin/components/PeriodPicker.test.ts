import { describe, expect, it } from 'vitest';
import { formatPeriod, previousPeriod } from './PeriodPicker';
import { localDate, monthStart, shiftDate } from '../../../services/admin.service';

describe('períodos', () => {
  it('desloca datas sem depender do fuso do aparelho', () => {
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(monthStart('2026-11-17')).toBe('2026-11-01');
  });

  it('data local usa o horário de Brasília', () => {
    // 02:30 UTC de 2 de novembro ainda é 1º de novembro em Brasília (UTC−3)
    expect(localDate(new Date('2026-11-02T02:30:00Z'))).toBe('2026-11-01');
  });

  it('período anterior tem a mesma duração', () => {
    expect(previousPeriod({ preset: '7D', from: '2026-11-10', to: '2026-11-16' })).toMatchObject({ from: '2026-11-03', to: '2026-11-09' });
    expect(previousPeriod({ preset: 'TODAY', from: '2026-11-10', to: '2026-11-10' })).toMatchObject({ from: '2026-11-09', to: '2026-11-09' });
  });

  it('mês corrente compara com os mesmos dias do mês anterior', () => {
    expect(previousPeriod({ preset: 'MONTH', from: '2026-03-01', to: '2026-03-10' })).toMatchObject({ from: '2026-02-01', to: '2026-02-10' });
    // fevereiro tem menos dias: não passa do fim do mês
    expect(previousPeriod({ preset: 'MONTH', from: '2026-03-01', to: '2026-03-31' })).toMatchObject({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('formata período para exibição', () => {
    expect(formatPeriod({ preset: 'CUSTOM', from: '2026-11-01', to: '2026-11-01' })).toBe('01/11/2026');
    expect(formatPeriod({ preset: 'CUSTOM', from: '2026-11-01', to: '2026-11-07' })).toBe('01/11/2026 a 07/11/2026');
  });
});
