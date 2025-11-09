// api/ai-suggest.js (Vercel)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  try {
    const { problem, links } = req.body || {};
    if (!problem || !Array.isArray(links)) return res.status(400).send('Bad Request');

    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    if (!apiKey) return res.status(500).send('Missing OPENAI_API_KEY');

    const norm = s => (s||'').toLowerCase().normalize('NFKD').replace(/[^\w\s]/g,'');
    const q = norm(problem);
    const shortlist = links
      .map(l => ({...l, _score: q.split(/\s+/).filter(Boolean).reduce((acc,t)=>acc+(norm(l.title+' '+l.blurb).includes(t)?1:0),0)}))
      .sort((a,b)=>b._score - a._score)
      .slice(0,8);

    const sys = `Du hjælper danske T1D-patienter. Du må KUN vælge vejledninger fra kataloget.
Returner KUN JSON: {"picks":[{"id":<tal>,"reason":"kort"}]}. Ingen råd.`;
    const user = `Problem: ${problem}
Katalog:
${shortlist.map(l => `- id:${l.id} | title:${l.title} | blurb:${l.blurb}`).join('\n')}
Returner kun JSON som: {"picks":[{"id":123,"reason":"..."}]}`;

    const payload = {
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      temperature: 0.1,
      response_format: { type: "json_object" }
    };

    const resp = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) return res.status(resp.status).send(await resp.text());

    const data = await resp.json();
    let parsed = {}; try { parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}"); } catch {}
    const validIds = new Set(links.map(l => l.id));
    const safeWord = /(?:doser|giv |tag |indspr|korrektion|ændr|øge|reduc|drik|spis|kontakt|ring)/i;

    const picks = (parsed.picks || [])
      .filter(p => validIds.has(p.id))
      .slice(0,6)
      .map((p,i)=>({ id:p.id, reason: String(p.reason||'').slice(0,80) }))
      .filter(p => !safeWord.test(p.reason));

    res.status(200).json({ picks });
  } catch (e) {
    res.status(500).send('Server error: ' + e.message);
  }
}
