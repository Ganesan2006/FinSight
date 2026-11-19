from __future__ import annotations

import asyncio
import logging
from uuid import UUID
from typing import Any

import jwt
from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client, create_client

from app.config import (
    get_jwt_secret,
    get_supabase_service_key,
    get_supabase_url,
    get_groq_model,
)
from app.prefilter import fast_prefilter
from app.groq_parser import parse_financial_sms
from app.schemas import (
    ImportRequest,
    ParseTestRequest,
    PreviewResult,
    SmsCommitRequest,
)
from app.service import preview_single_sms

logger = logging.getLogger(__name__)

app = FastAPI(
    title="FinSight Financial SMS Service",
    version="2.0.0",
    description="Regex-gated SMS transaction previews with reviewed, user-authorized imports.",
)

auth_scheme = HTTPBearer(auto_error=False)
_supabase: Client | None = None


def supabase() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(get_supabase_url(), get_supabase_service_key())
    return _supabase


def authenticated_user(credentials: HTTPAuthorizationCredentials | None = Depends(auth_scheme)) -> str:
    """Validates the incoming JWT bearer session."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    try:
        claims = jwt.decode(credentials.credentials, get_jwt_secret(), algorithms=["HS256"])
        return str(UUID(claims["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired session") from exc


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "sms-service",
        "model": get_groq_model(),
    }


@app.post("")
async def parse_test(
    payload: ParseTestRequest,
    _user_id: str = Depends(authenticated_user),
) -> dict[str, Any]:
    """
    Authenticated diagnostic endpoint. Apply the same regex gate as imports before
    sending any message body to the LLM; this endpoint never writes financial data.
    """
    should_ignore, reason = fast_prefilter(payload.sms_body, payload.sender)
    if should_ignore:
        return {"prefilter": {"should_ignore": True, "reason": reason}, "extracted": None}
    extracted = await parse_financial_sms(
        sms_body=payload.sms_body,
        sender=payload.sender,
        country_code=payload.country_code,
    )
    return {
        "prefilter": {"should_ignore": should_ignore, "reason": reason},
        "extracted": extracted.model_dump(),
    }


@app.post("/api/sms/preview", response_model=PreviewResult)
async def preview_sms(
    payload: ImportRequest,
    user_id: str = Depends(authenticated_user),
) -> PreviewResult:
    """
    Reads and parses only after the user starts an import. This endpoint never
    creates accounts, transactions, bills, or subscriptions.
    """
    db = supabase()
    candidates: list[dict[str, Any]] = []
    duplicates = ignored = 0

    # Semaphore to run concurrent Groq requests without bursting limits
    sem = asyncio.Semaphore(5)

    async def handle_message(msg):
        async with sem:
            try:
                return await preview_single_sms(db, user_id, msg)
            except Exception as err:
                logger.error("Error processing SMS %s: %s", msg.id, err, exc_info=True)
                return {"status": "error", "error": str(err)}

    results = await asyncio.gather(*(handle_message(m) for m in payload.messages))

    for res in results:
        status = res.get("status")
        if status == "candidate" and res.get("candidate"):
            candidates.append(res["candidate"])
        elif status == "duplicate":
            duplicates += 1
        else:
            ignored += 1

    return PreviewResult(
        scanned=len(payload.messages),
        duplicates=duplicates,
        ignored=ignored,
        candidates=candidates,
    )


@app.post("/api/sms/commit")
async def commit_sms(payload: SmsCommitRequest, user_id: str = Depends(authenticated_user)) -> dict[str, Any]:
    db = supabase()
    imported = duplicates = 0
    created_accounts: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []
    for candidate in payload.transactions:
        if candidate.type not in ("income", "expense"):
            raise HTTPException(status_code=400, detail="Only reviewed income and expense messages can be imported.")
        try:
            result = db.rpc("commit_reviewed_sms_transaction_v3", {
                "p_user_id": user_id,
                "p_fingerprint": candidate.fingerprint,
                "p_account_id": candidate.account_id,
                "p_amount": candidate.amount,
                "p_currency": candidate.currency.upper(),
                "p_type": candidate.type,
                "p_category": candidate.category,
                "p_description": candidate.description,
                "p_date": candidate.date,
                "p_institution_name": candidate.institution_name,
                "p_account_mask": candidate.account_mask,
                "p_instrument_type": candidate.instrument_type or "bank",
            }).execute()
        except Exception as exc:
            detail = str(getattr(exc, "message", exc))
            if "More than one account matches this SMS" in detail:
                safe_error = "More than one saved account matches this suffix. Choose the account manually."
            elif "no safe account suffix" in detail:
                safe_error = "Choose an existing account because no safe account suffix was detected."
            elif "currency must match" in detail or "instrument type must match" in detail or "suffix does not match" in detail:
                safe_error = "The selected account does not match this transaction. Review the account, currency, and account type."
            elif "Account limit reached" in detail:
                safe_error = "Your account limit is reached. Delete an unused account before importing this transaction."
            else:
                safe_error = "This transaction could not be saved. Review its details and account, then try again."
            errors.append({"fingerprint": candidate.fingerprint, "error": safe_error})
            continue
        result_data = result.data if isinstance(result.data, dict) else {}
        if result_data.get("duplicate"):
            duplicates += 1
        elif result_data:
            imported += 1
            if result_data.get("account_created") and result_data.get("account"):
                account = result_data["account"]
                created_accounts.append({"id": account["id"], "name": account["name"], "currency": account["currency"]})
        else:
            duplicates += 1
    return {"imported": imported, "duplicates": duplicates, "created_accounts": created_accounts, "errors": errors}


@app.post("/api/sms/import")
async def deprecated_sms_import() -> None:
    raise HTTPException(status_code=410, detail="Direct SMS import is disabled. Use preview, review, and commit.")
