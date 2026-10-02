const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/** Formata centavos como moeda brasileira. */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}

const brlCompact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/**
 * Centavos em formato curto ("R$ 12 mil", "R$ 1,2 mi"), para eixo de gráfico,
 * onde o valor completo não cabe. O valor exato fica na dica e na listagem.
 */
export function formatBRLCompact(cents: number): string {
  return brlCompact.format(cents / 100);
}

/** Converte o texto digitado (apenas dígitos considerados) em centavos. */
export function digitsToCents(text: string): number {
  const digits = text.replace(/\D/g, '');
  return digits ? Math.min(Number(digits), 999_999_999_99) : 0;
}
