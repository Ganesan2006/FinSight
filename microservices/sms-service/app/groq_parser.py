from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Optional
from groq import AsyncGroq, RateLimitError
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.config import get_groq_api_key, get_groq_model
from app.schemas import ExtractedFinancialEntity

logger = logging.getLogger(__name__)

_groq_client: AsyncGroq | None = None


def get_client() -> AsyncGroq:
    global _groq_client
    if _groq_client is None:
        _groq_client = AsyncGroq(api_key=get_groq_api_key())
    return _groq_client


SCHEMA_INSTRUCTION = """{
  "is_financial": boolean,
  "domain": "NET_BANKING" | "CREDIT_CARD" | "BILL_PAYMENT" | "SUBSCRIPTION" | "NON_FINANCIAL",
  "transaction_type": "DEBIT" | "CREDIT" | "REFUND" | "TRANSFER" | "BILL_ALERT" | "MANDATE_CREATED" | null,
  "amount": number | null,
  "currency": ISO 4217 currency code | null,
  "instrument_type": "bank" | "credit" | "cash",
  "institution_name": string | null,
  "account_mask": string | null,
  "merchant_raw": string | null,
  "merchant_clean": string | null,
  "category": string | null,
  "reference_id": string | null,
  "balance_after": number | null,
  "due_date": "YYYY-MM-DD" | null,
  "is_recurring": boolean
}"""

SYSTEM_PROMPT = f"""You are a financial SMS parser. Output only a valid JSON object matching this schema:
{SCHEMA_INSTRUCTION}

Rules:
1. domain:
   - "NET_BANKING": Debits, credits, transfers, UPI, NEFT, IMPS, RTGS on savings/checking accounts. Set instrument_type="bank".
   - "CREDIT_CARD": Swipes, charges, online card payments, card limits. Set instrument_type="credit".
   - "BILL_PAYMENT": Bill generated alerts, statement notices, due date reminders. Set transaction_type="BILL_ALERT".
   - "SUBSCRIPTION": Standing instructions (SI), e-mandates, recurring debits (Netflix, Spotify, Gym, AWS). Set is_recurring=true.
   - "NON_FINANCIAL": Pure OTPs without debits, spam, or promotional texts. Set is_financial=false.
2. Amount must be a positive number.
3. Clean messy merchants (e.g., 'swiggy@icici' -> 'Swiggy', 'AMZN MKTP' -> 'Amazon', 'NFLX' -> 'Netflix').
4. If due date is present, normalize to YYYY-MM-DD format.
5. Classify only a completed movement as DEBIT, CREDIT, REFUND, or TRANSFER. A pending, declined, failed, bill-generated, or mandate-setup message is not a completed transaction.
6. Use REFUND only when a merchant refund is credited back. Use TRANSFER for money moved between the user's own accounts; never label a payment to a merchant as a transfer.
7. account_mask must contain only the final four digits when the message explicitly shows an account/card suffix. Return null when absent or unclear; never return a full account number.
8. Use the issuer/bank named in the SMS or sender when clear. Do not guess an institution, account suffix, amount, or currency.
"""


@retry(
    retry=retry_if_exception_type(RateLimitError),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    stop=stop_after_attempt(3),
    reraise=True,
)
async def _call_groq_with_retry(client: AsyncGroq, model: str, user_prompt: str):
    return await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.0,
        response_format={"type": "json_object"},
        max_tokens=1024,
        timeout=25.0,
    )


async def parse_financial_sms(
    sms_body: str,
    sender: str = "",
    timestamp_iso: Optional[str] = None,
    country_code: str = "IN",
) -> ExtractedFinancialEntity:
    """
    Parses unstructured SMS text using Groq with the configured model.
    Includes automatic retry for rate limits.
    """
    client = get_client()
    model = get_groq_model()

    user_prompt = f"Sender: {sender or 'UNKNOWN'}\nCountry: {country_code}\nTimestamp: {timestamp_iso or 'Unknown'}\nSMS: \"\"\"{sms_body}\"\"\""

    try:
        completion = await _call_groq_with_retry(client, model, user_prompt)
        content = completion.choices[0].message.content or "{}"
        data = json.loads(content)

        # Normalize domain if bill indicators exist
        if data.get("due_date") and ("bill" in sms_body.lower() or data.get("transaction_type") == "BILL_ALERT"):
            data["domain"] = "BILL_PAYMENT"

        return ExtractedFinancialEntity(**data)
    except Exception as exc:
        logger.warning("Groq parsing failed or produced invalid JSON: %s", exc)
        return ExtractedFinancialEntity(
            is_financial=False,
            domain="NON_FINANCIAL",
            transaction_type=None,
        )
