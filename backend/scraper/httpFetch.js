export async function fetchLastHourTickets(url) {
  const res = await fetch(url, {
    headers: {
      'Accept': 'text/html',
      'Accept-Language': 'en-IN,en;q=0.9'
    },
    signal: AbortSignal.timeout(15000)
  });
  const html = await res.text();

  if (!res.ok) {
    return { ok: false, code: 'HTTP_' + res.status, snippet: html.slice(0, 200) };
  }

  // 1) embedded JSON: "ticket-sold-style" -> "text": "70.48K"
  // 2) rendered HTML: <span>70.48K</span><span> tickets booked in last 1 hour</span>
  const m =
    html.match(/"ticket-sold-style"\s*,\s*"text"\s*:\s*"([^"]+)"/) ||
    html.match(/([\d.,]+\s*[KkMm]?)\s*<\/span>\s*<span[^>]*>\s*tickets booked in last 1 hour/i);

  if (!m) return { ok: false, code: 'NOT_FOUND', snippet: html.slice(0, 200) };

  const raw = m[1].trim();                       // "70.48K"
  const num = parseFloat(raw.replace(/,/g, ''));
  const mult = /k$/i.test(raw) ? 1e3 : /m$/i.test(raw) ? 1e6 : 1;
  return { ok: true, raw, value: Math.round(num * mult) };   // 70480
}