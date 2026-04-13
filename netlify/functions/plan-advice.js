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
      heightCm = 0,
      weightKg = 0,
      targetWeightKg = 0,
      bmi = "",
      bmiLabel = "",
      mealsPerDay = 0,
      activity = "",
      speed = ""
    } = body;

    if (!weightKg || !heightCm) {
      return { statusCode: 400, body: JSON.stringify({ error: "缺少身高或體重" }) };
    }

    if (Number(weightKg) > 150) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ advice: "建議做法：哈哈哈，建議你去看醫生，讓醫生給點意見。" })
      };
    }

    const system = [
      "你是減重與飲食建議助手。",
      "請用繁體中文回答。",
      "只輸出一小段可直接顯示在 App 首頁的建議，不要條列，不要前言，不要結尾。",
      "不要單純照使用者選的幾餐去說建議幾餐。",
      "要依照體重、BMI、活動量、目標速度與目標體重來判斷。",
      "內容要具體、自然、可信，字數控制在 45 到 90 字。",
      "避免醫療診斷口吻，但可以給一般生活建議。"
    ].join("\n");

    const userPrompt = [
      `身高：${heightCm} cm`,
      `體重：${weightKg} kg`,
      `目標體重：${targetWeightKg} kg`,
      `BMI：${bmi}`,
      `BMI 狀態：${bmiLabel}`,
      `目前每天幾餐：${mealsPerDay}`,
      `活動量：${activity}`,
      `目標速度：${speed}`,
      "請產生一段首頁顯示用的建議做法。"
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
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt }
        ]
      })
    });

    const data = await resp.json();
    if (!resp.ok) {
      return { statusCode: resp.status, body: JSON.stringify({ error: data?.error?.message || "OpenAI API 呼叫失敗" }) };
    }

    const advice = String(data?.choices?.[0]?.message?.content || "").trim() || "建議做法：先從穩定飲食與活動量開始。";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ advice })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err?.message || "伺服器錯誤" }) };
  }
}