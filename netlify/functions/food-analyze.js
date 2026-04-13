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
    const image = body.image;
    if (!image || typeof image !== "string" || !image.startsWith("data:image/")) {
      return { statusCode: 400, body: JSON.stringify({ error: "請提供圖片 data URL" }) };
    }

    const prompt = [
      "你是食物熱量估算助手。",
      "請只回傳 JSON，不要加任何前後文字。",
      '格式固定為：{"summary":"一句中文摘要","totalKcal":整數,"items":[{"name":"食物名稱","kcal":整數}]}',
      "請根據圖片估算食物種類與總熱量。",
      "如果不確定，也要盡量估算並在 summary 說明是估算值。"
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
        messages: [
          { role: "system", content: prompt },
          {
            role: "user",
            content: [
              { type: "text", text: "請辨識這張食物照片並估算熱量。" },
              { type: "image_url", image_url: { url: image } }
            ]
          }
        ]
      })
    });

    const data = await resp.json();
    if (!resp.ok) {
      return { statusCode: resp.status, body: JSON.stringify({ error: data?.error?.message || "OpenAI API 呼叫失敗" }) };
    }

    const content = data?.choices?.[0]?.message?.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { summary: String(content).slice(0, 300), totalKcal: 0, items: [] };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: parsed.summary || "已完成估算",
        totalKcal: Number(parsed.totalKcal || 0),
        items: Array.isArray(parsed.items) ? parsed.items : []
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err?.message || "伺服器錯誤" }) };
  }
}