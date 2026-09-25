import { MANOBRAS_TATICAS } from './decisao.mjs';

/**
 * As mesmas perguntas em inglês, a língua principal do JEV, para o banco de
 * casos (scripts/avaliar-jev.mjs) comparar com as instruções em português.
 * Chaves, tipos e opções são iguais; o estado continua em português.
 */
const CONTEXT =
  'You are the typed decision layer of JEV aboard a LUS-222 (Portuguese twin-engine STOL aircraft, CEiiA/EEA Aircraft). ' +
  'You are not a stick pilot and you do not write prose. You read the shared state and choose mission actions and avoidance axes. ' +
  'You apply the action and the axes immediately — the LUS-222 avoids on its own. ' +
  'This is not certifiable Detect-and-Avoid: minimum separation stays outside this model. ' +
  'Weigh fuel, payload, souls on board, clinical clock, weather, runway, current flight, computed alternates, commander restrictions and geometry. ';

export const PERGUNTAS_INCIDENTE_EN = {
  acaoMissao: {
    type: 'choice',
    instructions:
      CONTEXT +
      'Choose the mission action now. It is not a pixel correction: it is the commander decision. ' +
      'A one-off lateral or vertical avoidance can preserve the destination: in that case choose prosseguir and state the manoeuvre. ' +
      'desviar_alternativo changes the destination airport and is only justified if the route or the arrival remain unviable. ' +
      'If the commander set nunca_desviar, only divert or abort when integrity or souls require it.',
    criteria: {
      prosseguir: 'the plan holds — sky, fuel, runway and clock allow continuing, even if a one-off manoeuvre separates a threat',
      desviar_alternativo: 'the destination or the corridor stay unviable after a one-off manoeuvre — change airport',
      orbitar: 'buy time: light, visual contact or weather about to change',
      regressar_base: 'return to origin — overload, fuel or mission unviable ahead',
      abortar_emergencia: 'end the flight now — critical integrity or mission emergency',
    },
  },
  manobraVertical: {
    type: 'choice',
    instructions:
      CONTEXT +
      'Choose the vertical axis of the avoidance now. The LUS-222 applies it immediately. ' +
      'Climb if the best clearance is above (corridor towers, bird flock, low traffic). ' +
      'Descend only with margin below and no terrain. Keep if there is no vertical threat.',
    criteria: {
      subir: 'best clearance above, or obstacle below the aircraft ceiling',
      descer: 'best clearance below and terrain clear',
      manter: 'no vertical threat — the mission action is enough, or the ceiling prevents climbing',
    },
  },
  manobraLateral: {
    type: 'choice',
    instructions:
      CONTEXT +
      'Choose the lateral axis of the avoidance now. The LUS-222 applies it immediately. ' +
      'Left and right are from the pilot point of view; positive offset_lateral_m = obstacle on the right. ' +
      'Compare folga_pela_esquerda_m with folga_pela_direita_m of the nearest obstacle and turn towards the larger one.',
    criteria: {
      esquerda: 'folga_pela_esquerda_m is larger than folga_pela_direita_m and positive',
      direita: 'folga_pela_direita_m is larger than folga_pela_esquerda_m and positive',
      manter: 'no nearby obstacle, or both lateral clearances are worse than keeping the heading',
    },
  },
  destinoPreferido: {
    type: 'choice',
    instructions:
      'Where should the LUS-222 go if the action is not simply to continue the plan? Read the alternates and do not choose runways below pista_necessaria_m nor destinations without fuel reserve. ' +
      'If the commander prefers STOL, favour stol_proximo when it makes operational sense.',
    criteria: {
      planeado: 'keep the briefing destination',
      stol_proximo: 'nearest short / STOL runway with margin',
      hospital_alternativo: 'alternate clinical facility (MEDEVAC)',
      aeroporto_alternativo: 'regional alternate airport with enough runway and reserve (Porto)',
      origem: 'return to origin or FAL',
    },
  },
  urgencia: {
    type: 'score',
    instructions:
      'Urgency of the manoeuvre and of the mission decision. Look at time to contact, the MEDEVAC clock, light and integrity. ' +
      'A nearby geometric threat is priority or emergency — the LUS-222 must avoid now.',
    criteria: [
      'monitor: the situation is stable; the decision can wait for the next incident',
      'act: a window is closing (weather, fuel or clock) but no emergency',
      'priority: the clinical or operational window closes within minutes',
      'mission emergency: souls, integrity or fuel require immediate action',
    ],
  },
  riscoMeteorologico: {
    type: 'score',
    instructions: 'Assess the weather risk for this LUS-222 right now: ceiling, visibility, wind and daylight.',
    criteria: [
      'calm: ceiling and visibility generous, light wind, daylight',
      'attention: ceiling lowering or wind increasing, still flyable',
      'adverse: low ceiling, reduced visibility or wind that penalises STOL/payload',
      'impediment: visual flight or landing as planned is no longer defensible',
    ],
  },
  precisaRevisaoPIC: {
    type: 'boolean',
    instructions:
      'Is this situation outside the normal mission envelope? Mark true when the data contradict each other, ' +
      'when souls and aircraft integrity collide, when the visual contact is uncertain, ' +
      'or when the commander restrictions contradict what the situation requires. Judge only the situation described in the state.',
    criteria: {
      true: 'outside the envelope — a human PIC must review',
      false: 'inside the envelope — routine case',
    },
  },
  continuarVoo: {
    type: 'boolean',
    instructions:
      'Should the flight continue (even if diverted or orbiting)? Combine integrity, weather and fuel — not just the obstacle.',
    criteria: {
      true: 'the aircraft and the environment allow continuing the flight with a mission action',
      false: 'integrity, fuel or weather make the flight indefensible — abort',
    },
  },
};

const CONTEXT_TACTICAL =
  'You are the tactical decision layer of JEV aboard a LUS-222 (twin-engine STOL). Every second you choose the manoeuvre for the next second. ' +
  'The maths is already done: for each candidate manoeuvre, the state gives the predicted separation to every threat over the next 30 s, ' +
  'the rule of the air, cloud entry, terrain, route deviation and comfort. The deterministic supervisor vetoes conflicts; you choose among what is left. ';

const MANOEUVRE = {
  manter: 'keep heading and altitude',
  esquerda: 'turn left (pilot left)',
  direita: 'turn right (pilot right)',
  subir: 'climb without turning',
  descer: 'descend without turning',
  esquerda_subir: 'turn left and climb',
  direita_subir: 'turn right and climb',
};

export function perguntasTaticoEn(estado) {
  const manobras = MANOBRAS_TATICAS.filter((m) => estado?.manobras?.[m]);
  const ameacas = Array.isArray(estado?.ameacas) ? estado.ameacas : [];
  return {
    manobraTactica: {
      type: 'choice',
      instructions:
        CONTEXT_TACTICAL +
        'Choose the manoeuvre now. Priorities: first separation (never «conflito» when there is an alternative; «folgada» beats «marginal»); ' +
        'then the rule of the air («cumpre» or «neutra» before «incumpre»); then avoid cloud and terrain; finally the smallest route deviation and, with a patient on board, smooth manoeuvres.',
      criteria: Object.fromEntries(manobras.map((m) => [m, MANOEUVRE[m]])),
    },
    // Uma escolha precisa de duas opções (o Gateway recusa uma só): com uma ameaça, é essa.
    ...(ameacas.length >= 2 ? {
      ameacaPrioritaria: {
        type: 'choice',
        instructions:
          CONTEXT_TACTICAL +
          'Which threat drives this second\'s manoeuvre? The one with the shortest time to CPA whose CPA is in conflict or marginal; on a tie, the converging one.',
        criteria: Object.fromEntries(ameacas.map((a) => [a.id, `${a.tipo}, at ${a.posicao}, ${a.movimento}`])),
      },
    } : {}),
    urgencia: {
      type: 'score',
      instructions: CONTEXT_TACTICAL + 'Urgency of the manoeuvre: how much time is left to the most critical threat and how small the separation gets if nothing changes.',
      criteria: [
        'monitor: no threat in conflict',
        'act: conflict with a long time to CPA',
        'priority: conflict with a short time to CPA',
        'immediate: conflict with an immediate time to CPA',
      ],
    },
    foraDoEnvelope: {
      type: 'boolean',
      instructions:
        CONTEXT_TACTICAL +
        'Is the situation outside the envelope that the candidate manoeuvres cover? True when no manoeuvre avoids the conflict, ' +
        'when threats contradict each other, or when every safe manoeuvre breaks the rule of the air or enters cloud.',
      criteria: {
        true: 'outside the envelope — the PIC must decide',
        false: 'there is at least one safe and acceptable manoeuvre',
      },
    },
  };
}
