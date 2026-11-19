const { SMS_SERVICE_URL } = require("../core/config");

async function forwardSms(path, payload, authorization) {
  try {
    const response = await fetch(SMS_SERVICE_URL + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify(payload),
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { status: response.status, body: { error: responseBody.detail || responseBody.error || "SMS processing failed." } };
    }
    return { status: response.status, body: responseBody };
  } catch (error) {
    const code = error?.cause?.code || error?.code || error?.name || "unknown";
    console.error("[sms-service] Could not reach " + SMS_SERVICE_URL + ": " + code);
    return {
      status: 503,
      body: { error: "SMS processing service is unavailable. Start the Python SMS service and check SMS_SERVICE_URL." },
    };
  }
}

const forwardSmsPreview = (messages, authorization) => forwardSms("/api/sms/preview", { messages }, authorization);
const forwardSmsCommit = (transactions, authorization) => forwardSms("/api/sms/commit", { transactions }, authorization);

module.exports = { forwardSmsPreview, forwardSmsCommit };
