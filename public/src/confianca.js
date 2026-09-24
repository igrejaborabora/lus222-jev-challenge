/**
 * Encaminhamento por confiança, com os limiares documentados pela TypeSafe:
 * ≥ 0,9 o JEV age; entre 0,5 e 0,9 age e fica assinalado para revisão;
 * abaixo de 0,5 pede a decisão ao PIC humano.
 *
 * A confiança do Gateway mede a concentração da distribuição de uma
 * pergunta choice ou score; não é a probabilidade da opção escolhida. Nos
 * 15 eventos gravados, as ameaças físicas ficam entre 0,93 e 1 e as decisões
 * de missão ambíguas (luz, relógio clínico, reserva) entre 0,46 e 0,64.
 */
export const LIMIAR_AGIR = 0.9;
export const LIMIAR_PIC = 0.5;
/** P(true) a partir da qual a pergunta booleana «fora do envelope» conta como sim. */
export const LIMIAR_FORA_ENVELOPE = 0.55;

export const ROTULO_NIVEL = Object.freeze({ agir: 'age', assinalar: 'age e assinala', pic: 'pede o PIC' });

/**
 * Confiança de uma pergunta na resposta do JEV: a do Gateway ou, sem ela
 * (respostas antigas, PIC), a probabilidade máxima da distribuição.
 */
export function confiancaDe(resposta, chave = 'acaoMissao') {
  const c = Number(resposta?.confidence?.[chave]);
  if (Number.isFinite(c)) return { valor: Math.min(1, Math.max(0, c)), fonte: 'confidence' };
  const p = resposta?.answers?.[chave]?.probabilities;
  const valores = p && typeof p === 'object' ? Object.values(p).map(Number).filter(Number.isFinite) : [];
  if (valores.length) return { valor: Math.max(...valores), fonte: 'probabilidade' };
  return { valor: null, fonte: null };
}

/** Sem sinal nenhum não se escala: o supervisor continua a vigiar os limites. */
export function nivelDe(valor) {
  if (!Number.isFinite(valor) || valor >= LIMIAR_AGIR) return 'agir';
  return valor >= LIMIAR_PIC ? 'assinalar' : 'pic';
}

/** Só a acção de missão encaminha: destino e urgência ficam muitas vezes abaixo de 0,4 por natureza. */
export function encaminhar(resposta, chave = 'acaoMissao') {
  const { valor, fonte } = confiancaDe(resposta, chave);
  return { nivel: nivelDe(valor), confianca: valor, fonte, chave };
}

/** A decisão fica marcada para revisão humana no debrief (age e assinala, ou pede o PIC). */
export function revisaoSugerida(resposta) {
  return encaminhar(resposta).nivel !== 'agir';
}
