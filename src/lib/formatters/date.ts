// Utilitários de Data e Horário no fuso horário America/Sao_Paulo

export function formatDateTimeBR(isoString?: string): string {
  if (!isoString) return '--:--';
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return isoString;
  }
}

export function formatTimeBR(isoString?: string): string {
  if (!isoString) return '--:--';
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return isoString;
  }
}

export function getElapsedMinutes(isoString?: string): number {
  if (!isoString) return 0;
  const created = new Date(isoString).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - created) / 60000));
}
