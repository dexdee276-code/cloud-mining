const RANGES = {
  '1d':  { range: '1d',  interval: '5m'  },
  '5d':  { range: '5d',  interval: '30m' },
  '1mo': { range: '1mo', interval: '1d'  },
  '6mo': { range: '6mo', interval: '1d'  },
  '1y':  { range: '1y',  interval: '1d'  }
};

function toYahoo(sym) {
  if (/^\d+-[A-Z]{1,3}$/.test(sym)) return sym.replace('-', '.');
  return sym;
}

function parse(j) {
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r || !r.timestamp) return null;
  const q = r.indicators && r.indicators.quote && r.indicators.quote[0];
  if (!q || !q.close) return null;
  const t = [], c = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const v = q.close[i];
    if (typeof v === 'number' && isFinite(v) && v > 0) { t.push(r.timestamp[i]); c.push(Math.round(v * 10000) / 10000); }
  }
  if (c.length < 2) return null;
  const m = r.meta || {};
  return { t, c, cur: m.currency || 'USD', prev: m.chartPreviousClose || null };
}

module.exports = async function handler(req, res) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const sym = String(req.query.sym || '').toUpperCase();
    const rg = RANGES[String(req.query.range || '1mo')];
    if (!/^[A-Z0-9\-]{1,10}$/.test(sym) || !rg) { res.status(400).json({ error: 'bad request' }); return; }
    const ys = encodeURIComponent(toYahoo(sym));
    let out = null;
    for (const host of ['query1', 'query2']) {
      try {
        const r = await fetch('https://' + host + '.finance.yahoo.com/v8/finance/chart/' + ys + '?range=' + rg.range + '&interval=' + rg.interval, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
        });
        if (!r.ok) continue;
        out = parse(await r.json());
        if (out) break;
      } catch (e) {}
    }
    if (!out) { res.status(502).json({ error: 'no data' }); return; }
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ error: 'server error' });
  }
};
