// Explicit deployment diagnostic: never prints API keys or customer evidence.
if (process.env.OBSERI_VERIFY_CHAT === "1") {
  const base = (process.env.OBSERI_CHAT_API_URL || process.env.OBSERI_AI_API_URL || "").trim();
  const model = (process.env.OBSERI_CHAT_MODEL || process.env.OBSERI_AI_MODEL || "").trim();
  const key = process.env.OBSERI_CHAT_API_KEY || process.env.OBSERI_AI_API_KEY;
  const url = new URL(base);
  const result = {
    host: url.host,
    path: url.pathname,
    modelPlaceholder: /redacted|sensitive/i.test(model),
  };
  try {
    const r = await fetch(base.replace(/\/$/, "") + "/models", {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    const data = await r.json();
    result.modelsStatus = r.status;
    result.configuredModelAvailable = (data.data || []).some((x) => x.id === model);
    if (process.env.OBSERI_PROBE_CHAT_MODEL) {
      const response = await fetch(base.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: process.env.OBSERI_PROBE_CHAT_MODEL,
          reasoning_effort: "low",
          max_tokens: 1024,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: "Reply with JSON containing answer: Ready." }],
        }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await response.json();
      result.probe = {
        status: response.status,
        hasAnswer: Boolean(data.choices?.[0]?.message?.content),
        finishReason: data.choices?.[0]?.finish_reason,
      };
    }
  } catch (e) {
    result.error = e.name;
  }
  console.log("OBSERI_CHAT_READINESS=" + JSON.stringify(result));
}
