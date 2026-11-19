from __future__ import annotations

import re

# Only completed money movements should reach the LLM. These deliberately
# exclude statement, due-date, offer, and mandate-setup notices.
TRANSACTION_EVENT_PATTERNS = [
    r"\bdebited\b",
    r"\bcredited\b",
    r"\bspent\b",
    r"\bcharged\b",
    r"\bpaid\s+(?:to|towards|for)\b",
    r"\bsent\b.{0,40}\bto\b",
    r"\breceived\b.{0,40}\bfrom\b",
    r"\bpayment\b.{0,40}\b(?:successful|successfully|completed|received)\b",
    r"\b(?:successful|successfully|completed)\b.{0,25}\b(?:payment|purchase|transaction|txn|transfer|withdrawal)\b",
    r"\b(?:purchase|transaction|txn)\b.{0,40}\b(?:at|to|from|using|successful|completed|approved)\b",
    r"\b(?:withdrawn|withdrawal)\b",
    r"\btransferred\s+(?:to|from)\b",
    r"\btransfer\s+(?:of|to|from)\b",
    r"\bstanding instruction\b.{0,100}\bexecuted\b",
    r"\bauto[- ]debit(?:ed)?\b",
    r"\brefund(?:ed)?\b.{0,40}\b(?:credited|received|processed|successful)\b",
    r"\bcashback\b.{0,30}\b(?:credited|received)\b",
]

# Require a currency and an amount, not just a currency symbol or an unrelated
# number such as an account suffix, date, OTP, or available balance.
NUMBER = r"\d[\d,]*(?:\.\d{1,2})?"
AMOUNT_PATTERNS = [
    rf"(?:₹|\$|€|£)\s*{NUMBER}",
    rf"\b(?:rs\.?|inr|usd|eur|gbp|aed|sgd|cad|aud)\s*{NUMBER}\b",
    rf"\b{NUMBER}\s*(?:inr|usd|eur|gbp|aed|sgd|cad|aud)\b",
    rf"\b(?:amount|amt)\s*(?:of|is|:)?\s*(?:(?:rs\.?|inr|usd|eur|gbp|aed|sgd|cad|aud)\s*)?{NUMBER}\b",
]

PROMO_PATTERNS = [
    r"pre-approved (?:personal )?loan",
    r"apply for (?:instant )?loan",
    r"congratulations[,!]? (?:you have )?won",
    r"claim your (?:cash )?reward",
    r"special (?:discount|offer) valid till",
    r"use coupon code",
    r"instant cash loan",
    r"lowest interest rate",
    r"lottery winner",
]

OTP_PATTERNS = [
    r"\botp\b",
    r"one[- ]time password",
    r"verification code",
    r"security code",
    r"login code",
    r"secret code",
    r"do not share this",
]

FAILED_TRANSACTION_PATTERNS = [
    r"\btransaction\b.{0,40}\b(?:declined|failed|unsuccessful|not completed)\b",
    r"\bpayment\b.{0,40}\b(?:declined|failed|unsuccessful|not completed)\b",
    r"\b(?:declined|failed|unsuccessful)\b.{0,40}\b(?:transaction|payment|purchase)\b",
]

COMPILED_EVENTS = [re.compile(pattern, re.IGNORECASE | re.DOTALL) for pattern in TRANSACTION_EVENT_PATTERNS]
COMPILED_AMOUNTS = [re.compile(pattern, re.IGNORECASE) for pattern in AMOUNT_PATTERNS]
COMPILED_PROMOS = [re.compile(pattern, re.IGNORECASE) for pattern in PROMO_PATTERNS]
COMPILED_OTPS = [re.compile(pattern, re.IGNORECASE) for pattern in OTP_PATTERNS]
COMPILED_FAILED = [re.compile(pattern, re.IGNORECASE | re.DOTALL) for pattern in FAILED_TRANSACTION_PATTERNS]


def fast_prefilter(body: str, sender: str = "") -> tuple[bool, str]:
    """Allow only likely completed transaction alerts through to the LLM."""
    clean_text = body.strip()
    if len(clean_text) < 10:
        return True, "too_short"

    if any(pattern.search(clean_text) for pattern in COMPILED_FAILED):
        return True, "failed_transaction"

    has_transaction_event = any(pattern.search(clean_text) for pattern in COMPILED_EVENTS)
    if not has_transaction_event:
        if any(pattern.search(clean_text) for pattern in COMPILED_OTPS):
            return True, "otp_only"
        if any(pattern.search(clean_text) for pattern in COMPILED_PROMOS):
            return True, "marketing_promo"
        return True, "no_completed_transaction_signal"

    if not any(pattern.search(clean_text) for pattern in COMPILED_AMOUNTS):
        return True, "no_transaction_amount"

    return False, "transaction_candidate"
