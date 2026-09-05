/**
 * Mensagem legível para uma falha de gravação no Firestore.
 *
 * O `code` do erro é estável (o texto não é), e o caso que mais aparece aqui é
 * `permission-denied`: as regras de segurança vivem no repositório
 * `cash-organizer-functions` e precisam liberar cada coleção nova, então uma
 * coleção recém-criada no app falha calada até as regras subirem.
 */
export function writeErrorMessage(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';

  if (code.includes('permission-denied')) {
    return 'O banco recusou a gravação por falta de permissão. As regras do Firestore precisam liberar esta operação.';
  }
  if (code.includes('unavailable')) {
    return 'Sem conexão com o banco agora. Tente de novo quando a rede voltar.';
  }
  return 'Não foi possível salvar. Tente de novo.';
}
