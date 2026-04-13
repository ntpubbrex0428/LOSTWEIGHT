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
    const {
      weightKg = 0,
      targetWeightKg = 0,
      bmi = "",
      bmiLabel = "",
      activity = "",
      speed = "",
      mealsPerDay = 0
    } = body;

    const prompt = [
      "你是外食減重菜單助手。",
      "請只回傳 JSON，不要加任何前後文字。",
      '格式固定為：{"menus":[{"name":"菜單名稱","items":["食物1","食物2"],"kcal":整數},{"name":"菜單名稱","items":["食物1","食物2"],"kcal":整數}]}',
      "請根據使用者狀況，推薦 2 組適合台灣外食的菜單。",
      "每組都要包含具體食物名稱，並估算整組總熱量。",
      "不要輸出過於極端或不切實際的內容。"
    ].join("\n");

    const userContent = [
      `目前體重：${weightKg} kg`,
      `目標體重：${targetWeightKg} kg`,
      `BMI：${bmi}`,
      `BMI狀態：${bmiLabel}`,
      `活動量：${activity}`,
      `目標速度：${speed}`,
      `每天幾餐：${mealsPerDay}`
    ].join("\n");

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.5,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: userContent }
        ]
      })
    });

    const data = await resp.json();
    if (!resp.ok) {
      return { statusCode: resp.status, body: JSON.stringify({ error: data?.error?.message || "OpenAI API 呼叫失敗" }) };
    }

    let parsed = { menus: [] };
    try {
      parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}");
    } catch {}

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        menus: Array.isArray(parsed.menus) ? parsed.menus.map(m => ({
          name: String(m.name || "AI推薦"),
          items: Array.isArray(m.items) ? m.items.map(x => String(x)) : [],
          kcal: Number(m.kcal || 0)
        })) : []
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err?.message || "伺服器錯誤" }) };
  }
}