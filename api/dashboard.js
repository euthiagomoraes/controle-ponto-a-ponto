export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });

  const flowUrl = process.env.PPA_DASHBOARD_URL;
  if (!flowUrl) {
    return res.status(500).json({
      error: "A variável PPA_DASHBOARD_URL não está configurada no Vercel."
    });
  }

  const body = req.body || {};
  const requestBody = {
    perfil: String(body.perfil || "SUPERVISOR"),
    mode: String(body.mode || "summary"),
    week: String(body.week || ""),
    forn: String(body.forn || ""),
    sys: String(body.sys || ""),
    subsys: String(body.subsys || "")
  };

  try {
    const response = await fetch(flowUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    const text = await response.text();
    if (!response.ok) {
      return res.status(response.status).json({
        error: "O Power Automate do dashboard retornou um erro.",
        details: text.slice(0, 1000)
      });
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      return res.status(502).json({
        error: "A resposta do Power Automate não é um JSON válido."
      });
    }

    // O fluxo otimizado pode devolver o objeto pronto para o dashboard.
    if (payload && (payload.stats || payload.options || payload.mode === "summary" || payload.mode === "schedule")) {
      if (typeof payload.rows === "string") {
        try { payload.rows = JSON.parse(payload.rows); } catch { payload.rows = []; }
      }
      return res.status(200).json(payload);
    }

    // Compatibilidade com a versão anterior do fluxo, que retornava somente rows.
    let rows;
    if (Array.isArray(payload)) rows = payload;
    else if (Array.isArray(payload?.rows)) rows = payload.rows;
    else if (typeof payload?.rows === "string") {
      try { rows = JSON.parse(payload.rows); }
      catch {
        return res.status(502).json({
          error: "O campo rows recebido do Power Automate não contém um JSON válido."
        });
      }
    } else if (Array.isArray(payload?.value)) rows = payload.value;
    else rows = [];

    return res.status(200).json({ mode: requestBody.mode, rows });
  } catch (error) {
    return res.status(502).json({
      error: "Não foi possível conectar ao Power Automate do dashboard.",
      details: error.message
    });
  }
}
