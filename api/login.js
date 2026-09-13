export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });

  const flowUrl = process.env.PPA_LOGIN_URL;
  if (!flowUrl) {
    return res.status(500).json({ error: "A variável PPA_LOGIN_URL não está configurada no Vercel." });
  }

  const nome = String(req.body?.nome || "").trim();
  const cracha = String(req.body?.cracha || "").trim();
  if (!nome || !cracha) return res.status(400).json({ error: "Nome e crachá são obrigatórios." });

  try {
    const response = await fetch(flowUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ nome, cracha })
    });

    const text = await response.text();
    let payload = {};
    try { payload = JSON.parse(text); } catch {}

    if (!response.ok) {
      return res.status(response.status).json({ error: "O Power Automate retornou um erro.", details: text.slice(0, 1000) });
    }

    return res.status(200).json(payload);
  } catch (error) {
    return res.status(502).json({ error: "Não foi possível conectar ao Power Automate de login.", details: error.message });
  }
}
