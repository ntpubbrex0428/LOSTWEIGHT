export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: "尚未設定 OPENAI_API_KEY 環境變數" }) };
    }
    const body = JSON.parse(event.body || "{}");
    const kind = String(body.kind || "meal");
    const name = String(body.name || "").trim();
    if (!name) {
      return { statusCode: 400, body: JSON.stringify({ error: "缺少名稱" }) };
    }
    const prompt = [
      "你是熱量估算助手。",
      "請只回傳 JSON，不要加任何前後文字。",
      '格式固定為：{"kcal":整數}',
      `品項類型：${kind === "drink" ? "飲料" : "餐點"}`,
      `品項名稱：${name}`,
      "請給常見成人一份的估算熱量。"
    ].join("\n");

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: prompt }]
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      return { statusCode: resp.status, body: JSON.stringify({ error: data?.error?.message || "OpenAI API 呼叫失敗" }) };
    }
    let parsed = { kcal: 0 };
    try {
      parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}");
    } catch {}
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kcal: Number(parsed.kcal || 0) })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err?.message || "伺服器錯誤" }) };
  }
}