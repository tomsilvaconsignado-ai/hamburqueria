/** Exibe ao usuário o erro de uma operação assíncrona que não tem tela de feedback própria. */
export function reportResult(res: { success: boolean; error?: string }): void {
  if (!res.success && res.error) alert(res.error);
}
