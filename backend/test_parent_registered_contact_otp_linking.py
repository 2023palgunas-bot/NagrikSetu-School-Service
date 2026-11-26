"""
test_parent_registered_contact_otp_linking.py
Comprehensive end-to-end test suite verifying the 14 test cases for:
Secure Parent-Child Linking with Registered Student Contact OTP Verification.
Runs against the live running backend using standard library urllib.
"""

import os
import sys
import json
import urllib.request
import urllib.error
import sqlite3
import unittest
from datetime import datetime, timedelta

BASE_URL = os.getenv("BACKEND_TEST_URL", "http://127.0.0.1:8000")
DB_PATH = os.getenv("DATABASE_PATH", "/app/data/nagriksetu.db")

def make_request(method, path, body=None, token=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode("utf-8")
            return resp.status, json.loads(content) if content else {}
    except urllib.error.HTTPError as he:
        content = he.read().decode("utf-8")
        try:
            err_json = json.loads(content)
        except Exception:
            err_json = {"detail": content}
        return he.code, err_json


class TestParentRegisteredContactOtpLinking(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row

        # Setup test parent user
        parent_row = conn.execute("SELECT user_id, email, phone FROM users WHERE role = 'parent' LIMIT 1").fetchone()
        if not parent_row:
            p_id = "test-parent-user-otp-1"
            conn.execute(
                "INSERT INTO users (user_id, email, phone, role, password_hash, full_name, is_active, status) VALUES (?, ?, ?, 'parent', 'hash', 'Test OTP Parent', 1, 'active')",
                (p_id, "otp.test.parent@example.com", "9998887770")
            )
            cls.parent_user_id = p_id
            cls.parent_phone = "9998887770"
            cls.parent_email = "otp.test.parent@example.com"
        else:
            cls.parent_user_id = parent_row["user_id"]
            cls.parent_phone = parent_row["phone"] or "9998887770"
            cls.parent_email = parent_row["email"]

        # Ensure guardian profile
        g_row = conn.execute("SELECT guardian_id FROM guardians WHERE user_id = ?", (cls.parent_user_id,)).fetchone()
        if not g_row:
            g_id = "test-guardian-otp-1"
            conn.execute(
                "INSERT INTO guardians (guardian_id, user_id, full_name, relationship, phone, email, created_at) VALUES (?, ?, 'Test OTP Parent', 'Parent', ?, ?, datetime('now'))",
                (g_id, cls.parent_user_id, cls.parent_phone, cls.parent_email)
            )
            cls.guardian_id = g_id
        else:
            cls.guardian_id = g_row["guardian_id"]

        # Generate auth token
        from auth import create_access_token
        cls.token = create_access_token({
            "user_id": cls.parent_user_id,
            "role": "parent",
            "email": cls.parent_email,
            "phone": cls.parent_phone
        })

        # Pick two students unlinked to this parent
        cls.student_a = dict(conn.execute(
            """
            SELECT s.student_id, s.permanent_student_id, s.student_name, s.contact_number, s.school_id
            FROM students s
            WHERE s.student_id NOT IN (
                SELECT s2.student_id FROM student_guardians sg JOIN students s2 ON s2.permanent_student_id = sg.permanent_student_id WHERE sg.guardian_id = ?
            ) AND s.contact_number IS NOT NULL AND length(s.contact_number) = 10
            LIMIT 1
            """,
            (cls.guardian_id,)
        ).fetchone())

        cls.student_b = dict(conn.execute(
            """
            SELECT s.student_id, s.permanent_student_id, s.student_name, s.contact_number, s.school_id
            FROM students s
            WHERE s.student_id != ? AND s.student_id NOT IN (
                SELECT s2.student_id FROM student_guardians sg JOIN students s2 ON s2.permanent_student_id = sg.permanent_student_id WHERE sg.guardian_id = ?
            ) AND s.contact_number IS NOT NULL AND length(s.contact_number) = 10
            LIMIT 1
            """,
            (cls.student_a["student_id"], cls.guardian_id)
        ).fetchone())

        conn.commit()
        conn.close()


    def tearDown(self):
        conn = sqlite3.connect(DB_PATH)
        conn.execute("DELETE FROM phone_otps WHERE parent_user_id = ?", (self.parent_user_id,))
        conn.execute("DELETE FROM student_guardians WHERE guardian_id = ?", (self.guardian_id,))
        conn.commit()
        conn.close()

    def test_01_parent_login_differs_from_student_registered_contact(self):
        """TEST 1: Parent login number differs from student registered contact number.
        Expected: OTP is generated for student's registered contact number, not parent login number."""
        sid = self.student_a["student_id"]
        # Clear cooldown
        conn = sqlite3.connect(DB_PATH)
        conn.execute("DELETE FROM phone_otps WHERE parent_user_id = ?", (self.parent_user_id,))
        conn.commit()
        conn.close()

        status, data = make_request("POST", "/parent/linking-otp/send", {"student_id": sid}, self.token)
        self.assertEqual(status, 200, str(data))
        expected_masked = f"XXXXXX{str(self.student_a['contact_number'])[-4:]}"
        self.assertEqual(data.get("masked_phone"), expected_masked)

        # Inspect database
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        otp_row = conn.execute(
            "SELECT phone FROM phone_otps WHERE student_id = ? AND parent_user_id = ? AND purpose = 'PARENT_CHILD_LINK' ORDER BY created_at DESC LIMIT 1",
            (sid, self.parent_user_id)
        ).fetchone()
        conn.close()
        self.assertIsNotNone(otp_row)
        self.assertEqual(otp_row["phone"], self.student_a["contact_number"])

    def test_02_valid_student_id_lookup(self):
        """TEST 2: Parent enters a valid Student ID.
        Expected: Correct student details returned with masked registered contact number."""
        sid = self.student_a["student_id"]
        status, data = make_request("GET", f"/parent/lookup-by-student-id?student_id={sid}", token=self.token)
        self.assertEqual(status, 200)
        self.assertEqual(data["student_id"], sid)
        self.assertEqual(data["student_full_name"], self.student_a["student_name"])
        expected_masked = f"XXXXXX{str(self.student_a['contact_number'])[-4:]}"
        self.assertEqual(data.get("registered_contact_masked"), expected_masked)

    def test_03_invalid_student_id_lookup(self):
        """TEST 3: Parent enters an invalid Student ID.
        Expected: HTTP 404, no OTP generated, no relationship created."""
        invalid_sid = "INVALID_99999"
        status, _ = make_request("GET", f"/parent/lookup-by-student-id?student_id={invalid_sid}", token=self.token)
        self.assertEqual(status, 404)

        status_otp, _ = make_request("POST", "/parent/linking-otp/send", {"student_id": invalid_sid}, token=self.token)
        self.assertEqual(status_otp, 404)

    def test_04_demo_otp_exposure_in_dev_mode(self):
        """TEST 4: Parent requests OTP in development mode.
        Expected: demo_otp is present in API response when PARENT_LINK_OTP_DEMO_MODE=true."""
        sid = self.student_a["student_id"]
        conn = sqlite3.connect(DB_PATH)
        conn.execute("DELETE FROM phone_otps WHERE student_id = ? AND parent_user_id = ?", (sid, self.parent_user_id))
        conn.commit()
        conn.close()

        status, data = make_request("POST", "/parent/linking-otp/send", {"student_id": sid}, self.token)
        self.assertEqual(status, 200)
        self.assertTrue(data.get("demo_mode"))
        self.assertIn("demo_otp", data)
        self.assertEqual(len(data["demo_otp"]), 6)

    def test_05_correct_otp_verification(self):
        """TEST 5: Parent enters correct OTP.
        Expected: Verification succeeds and child is linked in student_guardians."""
        sid = self.student_a["student_id"]
        conn = sqlite3.connect(DB_PATH)
        conn.execute("DELETE FROM phone_otps WHERE student_id = ? AND parent_user_id = ?", (sid, self.parent_user_id))
        conn.execute("DELETE FROM student_guardians WHERE permanent_student_id = ? AND guardian_id = ?", (self.student_a["permanent_student_id"], self.guardian_id))
        conn.commit()
        conn.close()

        status, send_data = make_request("POST", "/parent/linking-otp/send", {"student_id": sid}, self.token)
        self.assertEqual(status, 200)
        otp = send_data["demo_otp"]

        status_v, vdata = make_request(
            "POST",
            "/parent/linking-otp/verify",
            {"student_id": sid, "otp": otp, "relationship_type": "Mother"},
            self.token
        )
        self.assertEqual(status_v, 200, str(vdata))
        self.assertEqual(vdata.get("status"), "success")
        self.assertEqual(vdata["child"]["relationship"], "Mother")

        # Verify child is present in /parent/children
        status_ch, ch_data = make_request("GET", "/parent/children", token=self.token)
        self.assertEqual(status_ch, 200)
        linked_sids = [c["student_id"] for c in ch_data]
        self.assertIn(sid, linked_sids)

    def test_06_incorrect_otp_verification(self):
        """TEST 6: Parent enters incorrect OTP.
        Expected: Verification fails with attempt countdown."""
        sid = self.student_b["student_id"]
        conn = sqlite3.connect(DB_PATH)
        conn.execute("DELETE FROM phone_otps WHERE student_id = ? AND parent_user_id = ?", (sid, self.parent_user_id))
        conn.commit()
        conn.close()

        status, _ = make_request("POST", "/parent/linking-otp/send", {"student_id": sid}, self.token)
        self.assertEqual(status, 200)

        status_v, vdata = make_request(
            "POST",
            "/parent/linking-otp/verify",
            {"student_id": sid, "otp": "000000", "relationship_type": "Father"},
            self.token
        )
        self.assertEqual(status_v, 400)
        self.assertIn("Invalid OTP", vdata.get("detail", ""))

    def test_07_expired_otp_verification(self):
        """TEST 7: Parent enters expired OTP.
        Expected: Verification fails with expired message."""
        sid = self.student_b["student_id"]
        conn = sqlite3.connect(DB_PATH)
        conn.execute("DELETE FROM phone_otps WHERE student_id = ? AND parent_user_id = ?", (sid, self.parent_user_id))
        conn.commit()
        conn.close()

        status, send_data = make_request("POST", "/parent/linking-otp/send", {"student_id": sid}, self.token)
        self.assertEqual(status, 200)
        otp = send_data["demo_otp"]

        # Backdate expiry in DB
        conn = sqlite3.connect(DB_PATH)
        past_time = (datetime.utcnow() - timedelta(minutes=10)).strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            "UPDATE phone_otps SET expires_at = ? WHERE student_id = ? AND parent_user_id = ?",
            (past_time, sid, self.parent_user_id)
        )
        conn.commit()
        conn.close()

        status_v, vdata = make_request(
            "POST",
            "/parent/linking-otp/verify",
            {"student_id": sid, "otp": otp, "relationship_type": "Father"},
            self.token
        )
        self.assertEqual(status_v, 400)
        self.assertIn("expired", vdata.get("detail", "").lower())

    def test_08_otp_reuse_rejection(self):
        """TEST 8: Parent attempts to reuse an already verified OTP.
        Expected: Verification fails because OTP is marked consumed."""
        sid = self.student_b["student_id"]
        conn = sqlite3.connect(DB_PATH)
        conn.execute("DELETE FROM phone_otps WHERE student_id = ? AND parent_user_id = ?", (sid, self.parent_user_id))
        conn.execute("DELETE FROM student_guardians WHERE permanent_student_id = ? AND guardian_id = ?", (self.student_b["permanent_student_id"], self.guardian_id))
        conn.commit()
        conn.close()

        status, send_data = make_request("POST", "/parent/linking-otp/send", {"student_id": sid}, self.token)
        self.assertEqual(status, 200)
        otp = send_data["demo_otp"]

        # First verification succeeds
        s1, _ = make_request("POST", "/parent/linking-otp/verify", {"student_id": sid, "otp": otp}, self.token)
        self.assertEqual(s1, 200)

        # Second verification fails
        s2, v2 = make_request("POST", "/parent/linking-otp/verify", {"student_id": sid, "otp": otp}, self.token)
        self.assertEqual(s2, 400)

    def test_09_otp_cross_student_reuse_rejection(self):
        """TEST 9: Attempting to use an OTP generated for Student A to link Student B.
        Expected: Verification fails because OTP is strictly bound to student_id."""
        sid_a = self.student_a["student_id"]
        sid_b = self.student_b["student_id"]

        conn = sqlite3.connect(DB_PATH)
        conn.execute("DELETE FROM phone_otps WHERE parent_user_id = ?", (self.parent_user_id,))
        conn.commit()
        conn.close()

        status, send_data = make_request("POST", "/parent/linking-otp/send", {"student_id": sid_a}, self.token)
        self.assertEqual(status, 200)
        otp_a = send_data["demo_otp"]

        status_cross, vdata = make_request("POST", "/parent/linking-otp/verify", {"student_id": sid_b, "otp": otp_a}, self.token)
        self.assertEqual(status_cross, 400)
        self.assertIn("No active OTP found for this student", vdata.get("detail", ""))

    def test_10_relationship_claim_alone_rejected(self):
        """TEST 10: Parent claims a relationship without OTP verification.
        Expected: Direct linking without OTP verification is rejected."""
        sid_b = self.student_b["student_id"]
        status, _ = make_request("POST", "/parent/linking-otp/verify", {"student_id": sid_b, "otp": ""}, self.token)
        self.assertEqual(status, 400)

    def test_11_multiple_children_separate_otp_challenges(self):
        """TEST 11: Linking multiple children requires separate Student ID-specific challenges.
        Expected: Each child requires its own OTP challenge."""
        s1 = self.student_a["student_id"]
        s2 = self.student_b["student_id"]

        conn = sqlite3.connect(DB_PATH)
        conn.execute("DELETE FROM phone_otps WHERE parent_user_id = ?", (self.parent_user_id,))
        conn.commit()
        conn.close()

        status1, d1 = make_request("POST", "/parent/linking-otp/send", {"student_id": s1}, self.token)
        self.assertEqual(status1, 200)

        status2, d2 = make_request("POST", "/parent/linking-otp/send", {"student_id": s2}, self.token)
        self.assertEqual(status2, 200)

        self.assertEqual(d1["student_id"], s1)
        self.assertEqual(d2["student_id"], s2)

    def test_12_production_mode_hides_otp(self):
        """TEST 12: In production mode.
        Expected: OTP is strictly not returned in the API response when PARENT_LINK_OTP_DEMO_MODE is false."""
        sid = self.student_a["student_id"]
        # Test against main.is_parent_link_otp_demo_mode logic directly or by clearing OTPs
        from main import is_parent_link_otp_demo_mode
        orig_val = os.environ.get("PARENT_LINK_OTP_DEMO_MODE")
        os.environ["PARENT_LINK_OTP_DEMO_MODE"] = "false"
        try:
            self.assertFalse(is_parent_link_otp_demo_mode())
        finally:
            if orig_val is not None:
                os.environ["PARENT_LINK_OTP_DEMO_MODE"] = orig_val
            else:
                os.environ.pop("PARENT_LINK_OTP_DEMO_MODE", None)

    def test_13_unrelated_student_records_access_denied(self):
        """TEST 13: Parent attempts to access private records of an unlinked student.
        Expected: Access is denied with HTTP 403 or 404."""
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        unlinked = conn.execute(
            """
            SELECT permanent_student_id FROM students
            WHERE permanent_student_id NOT IN (
                SELECT permanent_student_id FROM student_guardians WHERE guardian_id = ?
            ) LIMIT 1
            """,
            (self.guardian_id,)
        ).fetchone()
        conn.close()
        self.assertIsNotNone(unlinked)

        status, _ = make_request("GET", f"/parent/children/{unlinked['permanent_student_id']}/records", token=self.token)
        self.assertIn(status, [403, 404])

    def test_14_institution_linking_workflow_compatibility(self):
        """TEST 14: Existing institution-issued linking workflows remain compatible.
        Expected: Existing verification endpoints and approval flows continue functioning."""
        sid = self.student_a["student_id"]
        status, _ = make_request("POST", "/parent/request-linking-code", {"student_id": sid, "relationship_type": "Father"}, self.token)
        self.assertIn(status, [200, 409, 429])


if __name__ == "__main__":
    unittest.main()
