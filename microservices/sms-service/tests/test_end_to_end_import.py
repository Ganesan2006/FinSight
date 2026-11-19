from __future__ import annotations

import os
import time
import unittest
import uuid
import jwt
from fastapi.testclient import TestClient

from app.config import get_jwt_secret, get_supabase_service_key, get_supabase_url
from app.main import app, supabase


class TestEndToEndImport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.db = supabase()
        # Find or create a test user
        user_res = cls.db.table("users").select("id").limit(1).execute()
        if user_res.data:
            cls.test_user_id = user_res.data[0]["id"]
        else:
            cls.test_user_id = str(uuid.uuid4())

        # Generate a valid session JWT token
        token_payload = {
            "sub": cls.test_user_id,
            "iat": int(time.time()),
            "exp": int(time.time()) + 3600,
        }
        cls.token = jwt.encode(token_payload, get_jwt_secret(), algorithm="HS256")
        cls.headers = {"Authorization": f"Bearer {cls.token}"}

    def test_full_pipeline_import(self):
        # 6 diverse messages
        now_ms = int(time.time() * 1000)
        messages = [
            # 1. Net Banking UPI debit
            {
                "id": f"msg_net_{uuid.uuid4().hex[:8]}",
                "sender": "HDFCBK",
                "body": "Rs. 750.00 debited from A/c XX5544 on 02-Nov-26 to VPA uber@icici. Avl Bal: Rs 34,200.00.",
                "timestamp": now_ms,
            },
            # 2. Credit Card swipe
            {
                "id": f"msg_card_{uuid.uuid4().hex[:8]}",
                "sender": "AMEX",
                "body": "Spent Rs. 2,100.00 on Credit Card ending 3004 at TAJ HOTEL. Available limit: Rs. 95,000.00.",
                "timestamp": now_ms - 1000,
            },
            # 3. Bill Payment alert
            {
                "id": f"msg_bill_{uuid.uuid4().hex[:8]}",
                "sender": "SBICRD",
                "body": "Bill of Rs. 3,500.00 generated for Card XX3004. Payment due on 18-Nov-26. Min due: Rs. 400.",
                "timestamp": now_ms - 2000,
            },
            # 4. Recurring Mandate / Subscription
            {
                "id": f"msg_sub_{uuid.uuid4().hex[:8]}",
                "sender": "HDFCBK",
                "body": "Standing instruction of Rs. 199.00 executed on Card XX3004 towards SPOTIFY. Next debit: 02-Dec-26.",
                "timestamp": now_ms - 3000,
            },
            # 5. OTP (Noise)
            {
                "id": f"msg_otp_{uuid.uuid4().hex[:8]}",
                "sender": "VERIFY",
                "body": "Your one-time password is 654321 for login. Do not disclose.",
                "timestamp": now_ms - 4000,
            },
            # 6. Promo (Noise)
            {
                "id": f"msg_promo_{uuid.uuid4().hex[:8]}",
                "sender": "LOANS",
                "body": "Congratulations! You have won a pre-approved loan of 10 Lakhs. Apply now at lowest interest rate.",
                "timestamp": now_ms - 5000,
            },
        ]

        response = self.client.post("/api/sms/import", json={"messages": messages}, headers=self.headers)
        self.assertEqual(response.status_code, 200, f"Error: {response.text}")
        data = response.json()

        print("\n--- Pipeline Import Summary ---")
        print(f"Scanned: {data['scanned']}")
        print(f"Imported Tx: {data['imported']}")
        print(f"Bills Detected: {len(data['bills'])}")
        print(f"Subscriptions Detected: {len(data['subscriptions'])}")
        print(f"Ignored Noise: {data['ignored']}")
        print(f"Duplicates: {data['duplicates']}")

        self.assertEqual(data["scanned"], 6)
        # 2 noise messages ignored (OTP and Promo)
        self.assertGreaterEqual(data["ignored"], 2)
        # Transactions imported
        self.assertGreaterEqual(data["imported"], 2)
        # Bills detected
        self.assertGreaterEqual(len(data["bills"]), 1)
        # Test Deduplication on re-import
        re_response = self.client.post("/api/sms/import", json={"messages": messages}, headers=self.headers)
        self.assertEqual(re_response.status_code, 200)
        re_data = re_response.json()
        print(f"Re-import duplicates: {re_data['duplicates']}")
        self.assertGreaterEqual(re_data["duplicates"], 2)


if __name__ == "__main__":
    unittest.main()
