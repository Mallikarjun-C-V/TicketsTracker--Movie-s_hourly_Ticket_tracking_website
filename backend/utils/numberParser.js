const WINDOW_PATTERN = /(?:\b(?:last|past|previous)\s*(?:one|1)\s*(?:hour|hours|hr|hrs)\b|\b(?:last|past|previous)\s*60\s*minutes?\b)/i;
const SALES_CONTEXT_PATTERN = /\b(?:tickets?|bookings?|booked|sold|purchased)\b/i;
const VALUE_PATTERN = /(?<![\w.])([0-9][0-9,]*(?:\.[0-9]+)?)\s*(lakh|lakhs|k|l)?\b/i;

function normalizeValue(token, suffix) {
  const number = Number(token.replaceAll(',', ''));
  if (!Number.isFinite(number) || number < 0) return null;
  const unit = (suffix || '').toLowerCase();
  const multiplier = unit === 'k' ? 1_000 : (unit === 'l' || unit === 'lakh' || unit === 'lakhs') ? 100_000 : 1;
  const normalized = number * multiplier;
  if (!Number.isSafeInteger(Math.round(normalized))) return null;
  // K/L/lakh values are rounded display abbreviations, not exact counts.
  if (multiplier !== 1) return { ticketsSold: Math.round(normalized), precision: 'APPROXIMATE' };
  if (!Number.isSafeInteger(number)) return { ticketsSold: Math.round(number), precision: 'APPROXIMATE' };
  return { ticketsSold: number, precision: 'EXACT' };
}

/**
 * Parse a displayed count only when its surrounding page context confirms
 * that the metric refers to tickets/bookings sold in the previous hour.
 * `rawText` can be the value element alone (for example, "66.45K");
 * `contextText` is the closest surrounding DOM text containing the label.
 */
export function parseTicketCount(rawText, customRegex = '', contextText = '') {
  const valueText = String(rawText || '').replace(/\s+/g, ' ').trim();
  const surroundingText = String(contextText || '').replace(/\s+/g, ' ').trim();
  const verificationText = [valueText, surroundingText].filter(Boolean).join(' ');

  if (!verificationText || !WINDOW_PATTERN.test(verificationText) || !SALES_CONTEXT_PATTERN.test(verificationText)) {
    return { matched: false, ticketsSold: null, rawDisplayedText: valueText || verificationText, precision: 'REVIEW', metricWindowMinutes: null };
  }

  if (customRegex) {
    try {
      const custom = new RegExp(customRegex, 'i');
      const match = verificationText.match(custom);
      if (match?.groups?.value) {
        const valueMatch = match.groups.value.match(/^\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(lakh|lakhs|k|l)?/i);
        if (valueMatch) {
          const normalized = normalizeValue(valueMatch[1], valueMatch[2]);
          if (normalized) return { matched: true, ...normalized, rawDisplayedText: valueText || match.groups.value.trim(), metricWindowMinutes: 60 };
        }
      }
    } catch {
      // An invalid optional custom pattern falls back to the built-in validated parser.
    }
  }

  // Prefer the exact selected counter node. This prevents the "1" in
  // "last 1 hour" or unrelated numbers in a card from being read as sales.
  const valueWithoutWindow = valueText.replace(WINDOW_PATTERN, ' ');
  const valueCandidates = [...valueWithoutWindow.matchAll(new RegExp(VALUE_PATTERN.source, 'gi'))];
  for (const match of valueCandidates) {
    const normalized = normalizeValue(match[1], match[2]);
    if (normalized) {
      return { matched: true, ...normalized, rawDisplayedText: valueText, metricWindowMinutes: 60 };
    }
  }

  // Fallback for pages where the configured selector contains the full metric.
  const withoutWindow = verificationText.replace(WINDOW_PATTERN, ' ');
  const candidates = [...withoutWindow.matchAll(new RegExp(VALUE_PATTERN.source, 'gi'))];
  for (const match of candidates) {
    const normalized = normalizeValue(match[1], match[2]);
    if (normalized) {
      return { matched: true, ...normalized, rawDisplayedText: valueText || verificationText, metricWindowMinutes: 60 };
    }
  }

  return { matched: true, ticketsSold: null, rawDisplayedText: valueText || verificationText, precision: 'REVIEW', metricWindowMinutes: 60 };
}

export function formatCount(value) {
  return new Intl.NumberFormat('en-IN').format(value);
}
