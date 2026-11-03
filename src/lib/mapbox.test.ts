import { describe, expect, it } from 'vitest';
import { addressQuery, formatAgo, formatDistance, formatDuration, haversineMeters, storeLngLat } from './mapbox';

describe('mapbox helpers', () => {
  it('monta o endereço no mesmo formato do servidor', () => {
    expect(
      addressQuery({ street: 'Rua A', number: '10', neighborhood: 'Centro', city: 'São Paulo', state: 'SP', postal_code: '01000-000' })
    ).toBe('Rua A 10, Centro, São Paulo - SP, 01000-000');
    expect(addressQuery({ street: ' Rua B ', number: '', neighborhood: 'Sé', city: '', state: 'SP' })).toBe('Rua B, Sé, SP');
  });

  it('formata distância em metros e quilômetros', () => {
    expect(formatDistance(847)).toBe('850 m');
    expect(formatDistance(4230)).toBe('4,2 km');
    expect(formatDistance(undefined)).toBe('');
  });

  it('formata tempo de rota', () => {
    expect(formatDuration(540)).toBe('9 min');
    expect(formatDuration(20)).toBe('1 min');
    expect(formatDuration(3900)).toBe('1 h 05 min');
  });

  it('mostra há quanto tempo a posição foi atualizada', () => {
    const now = Date.parse('2026-11-03T12:10:00Z');
    expect(formatAgo('2026-11-03T12:09:40Z', now)).toBe('agora');
    expect(formatAgo('2026-11-03T12:07:00Z', now)).toBe('há 3 min');
  });

  it('calcula a distância em linha reta', () => {
    // Praça da Sé → Av. Paulista (MASP): ~2,9 km
    const d = haversineMeters([-46.6342, -23.5503], [-46.6559, -23.5614]);
    expect(d).toBeGreaterThan(2400);
    expect(d).toBeLessThan(2700);
    expect(haversineMeters([-46.6, -23.5], [-46.6, -23.5])).toBe(0);
  });

  it('só devolve o ponto da loja quando latitude e longitude existem', () => {
    expect(storeLngLat({ store_latitude: -23.5, store_longitude: -46.6 })).toEqual([-46.6, -23.5]);
    expect(storeLngLat({ store_latitude: -23.5 })).toBeNull();
  });
});
