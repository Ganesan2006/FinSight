from __future__ import annotations

import asyncio
import os
import unittest
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.config import get_groq_model
from app.groq_parser import parse_financial_sms
from app.main import app
from app.prefilter import fast_prefilter
from app.recurrence_engine import detect_interval_frequency


class TestPrefilter(unittest.TestCase):
    def test_rejects_pure_otp(self):
        body = "Your one-time password (OTP) is 749201. Valid for 5 minutes. Do not share with anyone."
        ignore, reason = fast_prefilter(body)
        self.assertTrue(ignore)
        self.assertEqual(reason, "otp_only")

    def test_rejects_marketing_promo(self):
        body = "Congratulations! You have won a pre-approved personal loan of Rs 5,00,000 at lowest interest rate. Apply now!"
        ignore, reason = fast_prefilter(body)
        self.assertTrue(ignore)
        self.assertEqual(reason, "marketing_promo")

    def test_rejects_delivery_updates(self):
        body = "Your Amazon package has been delivered to your front door. Track your shipment here: bit.ly/test"
        ignore, reason = fast_prefilter(body)
        self.assertTrue(ignore)
        self.assertEqual(reason, "delivery_update")

    def test_accepts_net_banking_transaction(self):
        body = "Rs. 1,450.00 debited from A/c XX1234 on 02-Nov-26 to VPA swiggy@icici. Avl Bal: Rs 42,100.00."
        ignore, reason = fast_prefilter(body)
        self.assertFalse(ignore)
        self.assertEqual(reason, "ok")

    def test_accepts_credit_card_charge(self):
        body = "Spent Rs. 3,890.00 on Credit Card ending 9876 at AMAZON RETAIL. Available limit: Rs. 1,45,000.00."
        ignore, reason = fast_prefilter(body)
        self.assertFalse(ignore)
        self.assertEqual(reason, "ok")

    def test_accepts_bill_generated(self):
        body = "Bill of Rs. 4,120.00 generated for Card XX9876. Payment due on 15-Nov-26. Min due: Rs. 500."
        ignore, reason = fast_prefilter(body)
        self.assertFalse(ignore)
        self.assertEqual(reason, "ok")

    def test_accepts_subscription_mandate(self):
        body = "Standing instruction of Rs. 649.00 executed on Card XX9876 towards NETFLIX. Next debit: 02-Dec-26."
        ignore, reason = fast_prefilter(body)
        self.assertFalse(ignore)
        self.assertEqual(reason, "ok")


class TestRecurrenceIntervals(unittest.TestCase):
    def test_monthly_interval_detection(self):
        intervals = [30, 31, 29, 30]
        result = detect_interval_frequency(intervals)
        self.assertIsNotNone(result)
        self.assertEqual(result[0], "monthly")
        self.assertEqual(result[1], 30)

    def test_weekly_interval_detection(self):
        intervals = [7, 7, 6, 8]
        result = detect_interval_frequency(intervals)
        self.assertIsNotNone(result)
        self.assertEqual(result[0], "weekly")
        self.assertEqual(result[1], 7)

    def test_irregular_interval_rejected(self):
        intervals = [3, 45, 12]
        result = detect_interval_frequency(intervals)
        self.assertIsNone(result)


class TestGroqParserIntegration(unittest.TestCase):
    def setUp(self):
        # Grace period for Groq free-tier TPM limit
        import time
        time.sleep(1.0)
    def test_groq_net_banking(self):
        sms = "Rs. 1,450.00 debited from A/c XX1234 on 02-Nov-26 to VPA swiggy@icici. Avl Bal: Rs 42,100.00."
        entity = asyncio.run(parse_financial_sms(sms, sender="HDFCBK", country_code="IN"))
        self.assertTrue(entity.is_financial)
        self.assertEqual(entity.domain, "NET_BANKING")
        self.assertEqual(entity.instrument_type, "bank")
        self.assertAlmostEqual(entity.amount, 1450.0)

    def test_groq_credit_card(self):
        sms = "Spent Rs. 3,890.00 on Credit Card ending 9876 at AMAZON RETAIL. Available limit: Rs. 1,45,000.00."
        entity = asyncio.run(parse_financial_sms(sms, sender="ICICIB", country_code="IN"))
        self.assertTrue(entity.is_financial)
        self.assertEqual(entity.domain, "CREDIT_CARD")
        self.assertEqual(entity.instrument_type, "credit")
        self.assertAlmostEqual(entity.amount, 3890.0)

    def test_groq_bill_payment(self):
        sms = "Bill of Rs. 4,120.00 generated for Card XX9876. Payment due on 15-Nov-26. Min due: Rs. 500."
        entity = asyncio.run(parse_financial_sms(sms, sender="SBICRD", country_code="IN"))
        self.assertTrue(entity.is_financial)
        self.assertEqual(entity.domain, "BILL_PAYMENT")
        self.assertAlmostEqual(entity.amount, 4120.0)
        self.assertIsNotNone(entity.due_date)

    def test_groq_subscription(self):
        sms = "Standing instruction of Rs. 649.00 executed on Card XX9876 towards NETFLIX. Next debit: 02-Dec-26."
        entity = asyncio.run(parse_financial_sms(sms, sender="HDFCBK", country_code="IN"))
        self.assertTrue(entity.is_financial)
        self.assertTrue(entity.is_recurring or entity.domain == "SUBSCRIPTION")
        self.assertAlmostEqual(entity.amount, 649.0)


class TestApiEndpoints(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_endpoint(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["model"], get_groq_model())

    def test_parse_test_endpoint(self):
        payload = {
            "sms_body": "Spent $45.20 on Visa card ending 1234 at Starbucks.",
            "sender": "CHASE",
            "country_code": "US",
        }
        response = self.client.post("/api/sms/parse-test", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data["prefilter"]["should_ignore"])
        self.assertTrue(data["extracted"]["is_financial"])
        self.assertEqual(data["extracted"]["instrument_type"], "credit")
        self.assertAlmostEqual(data["extracted"]["amount"], 45.2)


if __name__ == "__main__":
    unittest.main()
