from __future__ import annotations

from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


class SmsMessage(BaseModel):
    id: str = Field(min_length=1, max_length=200)
    sender: str = Field(default="", max_length=200)
    body: str = Field(min_length=1, max_length=5000)
    timestamp: int = Field(gt=0, description="Epoch timestamp in milliseconds")
    timezone_offset_minutes: int = Field(default=0, ge=-720, le=840)


class ImportRequest(BaseModel):
    messages: list[SmsMessage] = Field(max_length=100)


class SmsCandidate(BaseModel):
    fingerprint: str = Field(min_length=64, max_length=64)
    amount: float = Field(gt=0)
    currency: str = Field(min_length=3, max_length=3)
    type: Literal["income", "expense"]
    category: str = Field(default="Other", max_length=100)
    description: str = Field(min_length=1, max_length=100)
    date: str
    institution_name: Optional[str] = Field(default=None, max_length=100)
    account_mask: Optional[str] = Field(default=None, max_length=4, pattern=r"^\d{4}$")
    instrument_type: Optional[Literal["bank", "credit", "cash"]] = "bank"


class PreviewResult(BaseModel):
    scanned: int
    duplicates: int
    ignored: int
    candidates: list[dict[str, Any]] = Field(default_factory=list)


class SmsCommitCandidate(SmsCandidate):
    account_id: Optional[str] = Field(default=None, max_length=100)


class SmsCommitRequest(BaseModel):
    transactions: list[SmsCommitCandidate] = Field(max_length=100)


class TransactionItem(BaseModel):
    id: Optional[str] = None
    account_id: Optional[str] = None
    amount: float
    type: Literal["income", "expense", "transfer"]
    category: str = "Other"
    description: str = ""
    note: str = ""
    date: str
    source: str = "sms"
    account_name: Optional[str] = None
    account_type: Optional[str] = None


class BillItem(BaseModel):
    id: Optional[str] = None
    name: str
    amount: float
    frequency: str = "monthly"
    next_due_date: str
    category: str = "Bills & Utilities"
    status: str = "upcoming"
    auto_pay: bool = False
    note: str = ""


class SubscriptionItem(BaseModel):
    id: Optional[str] = None
    name: str
    amount: float
    frequency: str = "monthly"
    next_due_date: str
    category: str = "Entertainment"
    detection_method: Literal["mandate_sms", "historical_ledger_interval"]
    auto_pay: bool = True
    note: str = ""


class ImportResult(BaseModel):
    scanned: int
    imported: int
    duplicates: int
    ignored: int
    transactions: list[dict[str, Any]] = Field(default_factory=list)
    bills: list[dict[str, Any]] = Field(default_factory=list)
    subscriptions: list[dict[str, Any]] = Field(default_factory=list)


class ExtractedFinancialEntity(BaseModel):
    is_financial: bool = Field(
        ..., description="True if this message represents a financial transaction, bill, or recurring mandate"
    )
    domain: Literal["NET_BANKING", "CREDIT_CARD", "BILL_PAYMENT", "SUBSCRIPTION", "NON_FINANCIAL"] = Field(
        ..., description="Primary classification domain"
    )
    transaction_type: Optional[Literal["DEBIT", "CREDIT", "BILL_ALERT", "MANDATE_CREATED", "REFUND", "TRANSFER"]] = Field(
        None, description="Action or nature of event"
    )
    amount: Optional[float] = Field(None, description="Transaction or bill amount, strictly positive")
    currency: Optional[str] = Field("INR", description="ISO 4217 currency code (e.g., INR, USD, EUR, GBP)")
    instrument_type: Optional[Literal["bank", "credit", "cash"]] = Field(
        "bank", description="Instrument type: 'bank' for net banking/debit, 'credit' for credit cards, 'cash' for wallet"
    )
    institution_name: Optional[str] = Field(None, description="Bank or issuer name (e.g., HDFC, Chase, ICICI, Amex)")
    account_mask: Optional[str] = Field(None, description="Account or card mask digits (e.g., '1234', 'XX9876')")
    merchant_raw: Optional[str] = Field(None, description="Raw merchant or payee string extracted from SMS")
    merchant_clean: Optional[str] = Field(None, description="Canonical merchant brand name (e.g., Swiggy, Netflix, Amazon)")
    category: Optional[str] = Field("Other", description="Expense category")
    reference_id: Optional[str] = Field(None, description="Transaction reference ID, UTR, or authorization code")
    balance_after: Optional[float] = Field(None, description="Available balance or remaining credit limit")
    due_date: Optional[str] = Field(None, description="Payment due date in YYYY-MM-DD format if present")
    is_recurring: bool = Field(
        False, description="True if marked as recurring mandate, standing instruction, or auto-debit"
    )


class ParseTestRequest(BaseModel):
    sms_body: str = Field(min_length=1, max_length=5000)
    sender: str = Field(default="")
    timestamp: Optional[int] = None
    country_code: str = Field(default="IN", max_length=5)
