from __future__ import annotations

import hashlib
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from supabase import Client

from app.groq_parser import parse_financial_sms
from app.prefilter import fast_prefilter
from app.schemas import SmsMessage


def compute_sms_fingerprint(user_id: str, message: SmsMessage) -> str:
    """Create a stable deduplication key without persisting the SMS body."""
    material = f"{user_id}\0{message.id}\0{message.sender}\0{message.timestamp}\0{message.body}".encode("utf-8")
    return hashlib.sha256(material).hexdigest()


async def preview_single_sms(
    db: Client,
    user_id: str,
    message: SmsMessage,
    country_code: str = "IN",
) -> dict[str, Any]:
    """Regex-filter and parse a message for review; this function never writes finance data."""
    digest = compute_sms_fingerprint(user_id, message)

    # Only likely completed transactions reach either the database duplicate check or the LLM.
    should_ignore, reason = fast_prefilter(message.body, message.sender)
    if should_ignore:
        return {"status": "ignored", "reason": reason, "fingerprint": digest}

    existing_tx = (
        db.table("transactions")
        .select("id")
        .eq("user_id", user_id)
        .eq("sms_fingerprint", digest)
        .limit(1)
        .execute()
    )
    if existing_tx.data:
        return {"status": "duplicate", "fingerprint": digest}

    message_tz = timezone(timedelta(minutes=message.timezone_offset_minutes))
    message_dt = datetime.fromtimestamp(message.timestamp / 1000, message_tz)
    extracted = await parse_financial_sms(
        sms_body=message.body,
        sender=message.sender,
        timestamp_iso=message_dt.isoformat(),
        country_code=country_code,
    )

    if not extracted.is_financial or extracted.domain == "NON_FINANCIAL" or not extracted.amount or extracted.amount <= 0:
        return {"status": "ignored", "reason": "not_financial_or_zero_amount", "fingerprint": digest}
    if extracted.transaction_type not in ("DEBIT", "CREDIT", "REFUND"):
        return {"status": "ignored", "reason": "not_a_classified_completed_transaction", "fingerprint": digest}

    tx_type = "income" if extracted.transaction_type in ("CREDIT", "REFUND") else "expense"
    mask_digits = re.sub(r"\D", "", str(extracted.account_mask or ""))
    safe_mask = mask_digits[-4:] if len(mask_digits) >= 4 else None
    return {
        "status": "candidate",
        "candidate": {
            "fingerprint": digest,
            "amount": round(extracted.amount, 2),
            "currency": (extracted.currency or "INR").upper(),
            "type": tx_type,
            "category": (extracted.category or "Other")[:100],
            "description": (extracted.merchant_clean or extracted.merchant_raw or "SMS transaction")[:100],
            "date": message_dt.date().isoformat(),
            "institution_name": (str(extracted.institution_name).strip()[:100] or None) if extracted.institution_name else None,
            "account_mask": safe_mask,
            "instrument_type": extracted.instrument_type or "bank",
        },
    }
