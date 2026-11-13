import { randomUUID } from 'node:crypto';

export const DEFAULT_SAMPLE_LIST = `LISTA FUT ⚽
📅 DATA: SEXTA FEIRA
💸 VALOR: R$ 10 reais
🕘 HORÁRIO: 22:00 (cheguem 10 minutos antes)
1- Lucas
2- Mateus
3- Rafael
4-Pedro
5- André
6- Tiago (convidado)
7- Rodrigo
8- felipe: chega 10 min depois
9-  Gustavo ( dúvida - joelho )
10-Diego
11-
12- Caio
13- Vitor
14-Bruno
14-Daniel
16-vinicius
17-henrique (Conv. Lucas)
18-gabriel
Goleiros:
19- Eduardo
20- Marcelo
21- Renato.`;

/**
 * Normalizes single-line or messy copy-pasted WhatsApp text into clean lines
 * while keeping inline parenthetical notes intact.
 */
function normalizeListLines(rawText) {
  const trimmed = String(rawText ?? '').replace(/\r\n?/g, '\n').trim();
  if (!trimmed) return [];

  let lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);

  // If the entire list was pasted on 1-2 lines (e.g. from chat), split cleanly at known tokens.
  if (lines.length <= 3) {
    const collapsed = lines.join(' ');
    const expanded = collapsed
      .replace(/\s+(📅|💸|🕘|⏰|🧤)/g, '\n$1')
      .replace(/\s+(DATA:|VALOR:|HOR[ÁA]RIO:|GOLEIROS?:|LINHA:|ESPERA:|LISTA DE ESPERA:)/gi, '\n$1')
      .replace(/\s+(?=\d{1,2}\s*[-.)–—])/g, '\n');
    lines = expanded.split('\n').map((l) => l.trim()).filter(Boolean);
  }

  return lines;
}

function cleanDisplayName(text) {
  return text
    .replace(/^[-–—:\s]+/, '')
    .replace(/[\s.,;]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function stripDiacritics(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function extractPlayerDetails(rawContent, inGoalkeeperSection, inWaitingSection) {
  let working = rawContent.trim();
  let role = inGoalkeeperSection ? 'gk' : 'outfield';
  let status = inWaitingSection ? 'waiting' : 'confirmed';
  let isGuest = false;
  const notes = [];

  // Extract parenthetical segments like "(convidado)", "( dúvida - joelho )", "(Conv. Lucas)"
  working = working.replace(/\(([^)]*)\)/g, (_, inner) => {
    const tag = inner.trim();
    const normalizedTag = stripDiacritics(tag);

    if (/(duvida|talvez|confirmar|\?)/.test(normalizedTag)) {
      status = 'doubt';
    }
    if (/\bconv\b|convidado|amigo/.test(normalizedTag)) {
      isGuest = true;
    }
    if (/^(gl|gol|goleiro)$/.test(normalizedTag)) {
      role = 'gk';
      return '';
    }
    if (tag) {
      notes.push(tag.replace(/\s{2,}/g, ' '));
    }
    return '';
  });

  // Extract colon note like "felipe: chega 10 min depois"
  const colonMatch = working.match(/^([^:]+):\s*(.+)$/);
  if (colonMatch) {
    const possibleName = colonMatch[1].trim();
    const colonNote = colonMatch[2].trim();
    if (possibleName.length > 0 && colonNote.length > 0) {
      working = possibleName;
      const normNote = stripDiacritics(colonNote);
      if (/(duvida|talvez|nao sei|a confirmar)/.test(normNote)) {
        status = 'doubt';
      }
      if (/\bconv\b|convidado/.test(normNote)) {
        isGuest = true;
      }
      notes.push(colonNote);
    }
  }

  // Handle inline tags like "- goleiro" or "- duvida"
  working = working.replace(/\s+-\s+(goleiro|gol|gl)$/i, () => {
    role = 'gk';
    return '';
  });

  const name = cleanDisplayName(working);
  const note = notes.join(' · ').replace(/[.,;]+$/, '').trim();

  return { name, role, status, isGuest, note };
}

/**
 * Parses a WhatsApp pelada message into structured match metadata,
 * players (outfield + goalkeepers), open slots, and diagnostic warnings.
 */
export function parseWhatsAppList(rawText) {
  const lines = normalizeListLines(rawText);

  let title = 'LISTA FUT';
  let dateLabel = 'SEXTA FEIRA';
  let feeLabel = 'R$ 10';
  let feeAmount = 10;
  let timeLabel = '22:00';
  let arrivalNote = '';

  let hasCustomTitle = false;
  let inGoalkeeperSection = false;
  let inWaitingSection = false;

  const players = [];
  const openSlots = [];
  const seenNumbers = new Map();
  const warnings = [];

  for (const line of lines) {
    const cleanLine = line.trim();
    const norm = stripDiacritics(cleanLine);

    // Check section headers
    if (/^(?:🧤\s*)?goleiros?\s*:?$/i.test(norm)) {
      inGoalkeeperSection = true;
      inWaitingSection = false;
      continue;
    }
    if (/^(?:jogadores?|linha|confirmados?)\s*:?$/i.test(norm)) {
      inGoalkeeperSection = false;
      inWaitingSection = false;
      continue;
    }
    if (/^(?:lista\s+de\s+)?(?:espera|suplentes?|fora)\s*:?$/i.test(norm)) {
      inWaitingSection = true;
      inGoalkeeperSection = false;
      continue;
    }

    // Check metadata lines
    if (/^(?:📅\s*)?data\s*:/i.test(norm)) {
      const value = cleanLine.replace(/^.*?data\s*:\s*/i, '').trim();
      if (value) dateLabel = value;
      continue;
    }
    if (/^(?:💸|💰)?\s*valor\s*:/i.test(norm)) {
      const value = cleanLine.replace(/^.*?valor\s*:\s*/i, '').trim();
      if (value) {
        feeLabel = value;
        const numMatch = value.match(/(\d+(?:[.,]\d{1,2})?)/);
        if (numMatch) {
          feeAmount = Number(numMatch[1].replace(',', '.'));
        }
      }
      continue;
    }
    if (/^(?:🕘|⏰|🕒)?\s*hor[áa]rio\s*:/i.test(norm)) {
      const value = cleanLine.replace(/^.*?hor[áa]rio\s*:\s*/i, '').trim();
      if (value) {
        const parenMatch = value.match(/^([^(]+?)\s*\(([^)]+)\)\s*$/);
        if (parenMatch) {
          timeLabel = parenMatch[1].trim();
          arrivalNote = parenMatch[2].trim();
        } else {
          timeLabel = value;
        }
      }
      continue;
    }

    // Check numbered player line: "1- Name", "4-Pedro", "11-", "14-Bruno", "19- Eduardo"
    const numberedMatch = cleanLine.match(/^(\d{1,2})\s*[-.)–—]+\s*(.*)$/);
    if (numberedMatch) {
      const listNumber = Number(numberedMatch[1]);
      const remainder = numberedMatch[2].trim();

      if (!remainder || /^[-_.]+$/.test(remainder) || /^(vago|vaga|livre|aberta?)$/i.test(stripDiacritics(remainder))) {
        openSlots.push({ listNumber });
        continue;
      }

      const details = extractPlayerDetails(remainder, inGoalkeeperSection, inWaitingSection);
      if (!details.name) {
        openSlots.push({ listNumber });
        continue;
      }

      if (seenNumbers.has(listNumber)) {
        seenNumbers.get(listNumber).push(details.name);
      } else {
        seenNumbers.set(listNumber, [details.name]);
      }

      players.push({
        id: randomUUID(),
        listNumber,
        name: details.name,
        role: details.role,
        status: details.status,
        isGuest: details.isGuest,
        note: details.note,
        paid: false,
        arrived: false,
        teamId: null,
        revealed: false,
        revealedAt: null,
        sortOrder: players.length + 1
      });
      continue;
    }

    // Bullet/unnumbered player inside Goalkeepers section (e.g. "- Eduardo" or "Eduardo")
    if (inGoalkeeperSection || inWaitingSection) {
      const bulletContent = cleanLine.replace(/^[-•*]\s*/, '').trim();
      if (bulletContent) {
        const details = extractPlayerDetails(bulletContent, inGoalkeeperSection, inWaitingSection);
        if (details.name) {
          players.push({
            id: randomUUID(),
            listNumber: null,
            name: details.name,
            role: details.role,
            status: details.status,
            isGuest: details.isGuest,
            note: details.note,
            paid: false,
            arrived: false,
            teamId: null,
            revealed: false,
            revealedAt: null,
            sortOrder: players.length + 1
          });
          continue;
        }
      }
    }

    // First unmatched header line becomes the list title (e.g. "LISTA FUT ⚽")
    if (!hasCustomTitle && players.length === 0) {
      title = cleanLine;
      hasCustomTitle = true;
    }
  }

  for (const [num, names] of seenNumbers.entries()) {
    if (names.length > 1) {
      warnings.push(`Número ${num} repetido na lista (${names.join(' e ')}) — todos mantidos.`);
    }
  }
  if (openSlots.length > 0) {
    const slotNums = openSlots.map((s) => `#${s.listNumber}`).join(', ');
    warnings.push(
      openSlots.length === 1
        ? `Vaga ${slotNums} está em aberto na lista.`
        : `Vagas ${slotNums} estão em aberto na lista.`
    );
  }

  const gkCount = players.filter((p) => p.role === 'gk' && p.status !== 'out').length;
  const outfieldCount = players.filter((p) => p.role === 'outfield' && p.status !== 'out').length;
  const doubtCount = players.filter((p) => p.status === 'doubt').length;

  return {
    meta: {
      title,
      dateLabel,
      feeLabel,
      feeAmount: Number.isFinite(feeAmount) ? feeAmount : 10,
      timeLabel,
      arrivalNote
    },
    players,
    openSlots,
    warnings,
    summary: {
      totalPlayers: players.length,
      outfieldCount,
      gkCount,
      doubtCount,
      openSlotCount: openSlots.length,
      suggestedTeams: gkCount >= 4 ? 4 : gkCount === 2 ? 2 : 3
    }
  };
}
