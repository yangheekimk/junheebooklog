const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function supabase(method, table, body = null, query = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': method === 'POST' ? 'resolution=merge-duplicates' : ''
    },
    body: body ? JSON.stringify(body) : null
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { action, data } = req.body;

  try {
    // DB 작업
    if (action === 'getAll') {
      const journals = await supabase('GET', 'journals', null, '?select=*&order=id.asc') || [];
      const statusRes = await supabase('GET', 'statuses', null, '?id=eq.main') || [];
      const statuses = statusRes[0]?.data || {};
      return res.status(200).json({
        journals: journals.map(j => j.data),
        statuses
      });
    }

    if (action === 'saveJournals') {
      const { journals } = data;
      for (const j of journals) {
        await supabase('POST', 'journals', { id: j.id, data: j }, '?on_conflict=id');
      }
      return res.status(200).json({ ok: true });
    }

    if (action === 'saveStatuses') {
      const { statuses } = data;
      await supabase('POST', 'statuses', { id: 'main', data: statuses }, '?on_conflict=id');
      return res.status(200).json({ ok: true });
    }

    if (action === 'deleteJournal') {
      const { id } = data;
      await supabase('DELETE', 'journals', null, `?id=eq.${id}`);
      return res.status(200).json({ ok: true });
    }

    // Claude AI 호출
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

    const { system, messages, max_tokens } = req.body;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: max_tokens || 1000,
        system: system || '',
        messages: messages || []
      })
    });
    const aiData = await response.json();
    return res.status(200).json(aiData);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
