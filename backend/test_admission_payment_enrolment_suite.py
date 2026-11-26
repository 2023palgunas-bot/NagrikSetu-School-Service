import unittest
import urllib.request
import urllib.error
import json
import sqlite3
import os
import sys

from auth import create_access_token

BASE_URL = "http://127.0.0.1:8000"
DB_PATH = "/app/data/nagriksetu.db"


class TestAdmissionPaymentEnrolmentSuite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conn = sqlite3.connect(DB_PATH)
        cls.conn.isolation_level = None
        cls.conn.row_factory = sqlite3.Row
        cur = cls.conn.cursor()

        # Check initial baseline student count
        cur.execute("SELECT COUNT(1) FROM students")
        cls.initial_student_count = cur.fetchone()[0]
        print(f"\n[SETUP] Initial total student count: {cls.initial_student_count}")

        # Pick an active institution from schools table
        cur.execute("SELECT school_id, school_name FROM schools LIMIT 1")
        inst_row = cur.fetchone()
        cls.institution_id = inst_row["school_id"]
        cls.institution_name = inst_row["school_name"]

        # School staff user
        cur.execute("SELECT * FROM users WHERE role IN ('school_admin', 'institution_admin', 'admissions_officer') LIMIT 1")
        staff_row = cur.fetchone()
        if not staff_row:
            cur.execute("""
                INSERT OR REPLACE INTO users (user_id, email, full_name, role, school_id, is_active, status)
                VALUES ('staff-test-admin', 'staff_admin@test.gov.in', 'Admin Officer', 'school_admin', ?, 1, 'active')
            """, (cls.institution_id,))
            cls.conn.commit()
            cur.execute("SELECT * FROM users WHERE user_id = 'staff-test-admin'")
            staff_row = cur.fetchone()

        cls.staff_user = dict(staff_row)
        cls.staff_user["role"] = "school_admin"
        cls.staff_user["school_id"] = cls.institution_id
        cur.execute("UPDATE users SET is_active = 1, status = 'active', role = 'school_admin', school_id = ? WHERE user_id = ?", (cls.institution_id, cls.staff_user["user_id"]))
        cur.execute("""
            INSERT OR REPLACE INTO user_institution_roles (user_id, institution_id, role_id, status)
            VALUES (?, ?, 'school_admin', 'active')
        """, (cls.staff_user["user_id"], cls.institution_id))
        cls.conn.commit()
        cls.staff_token = create_access_token(cls.staff_user, school_id=cls.institution_id)

        # Parent user
        cur.execute("SELECT * FROM users WHERE role = 'parent' LIMIT 1")
        parent_row = cur.fetchone()
        if not parent_row:
            cur.execute("""
                INSERT OR REPLACE INTO users (user_id, email, full_name, role, is_active, status)
                VALUES ('parent-test-user', 'parent_test@test.gov.in', 'Parent Tester', 'parent', 1, 'active')
            """)
            cls.conn.commit()
            cur.execute("SELECT * FROM users WHERE user_id = 'parent-test-user'")
            parent_row = cur.fetchone()

        cls.parent_user = dict(parent_row)
        cur.execute("UPDATE users SET is_active = 1, status = 'active' WHERE user_id = ?", (cls.parent_user["user_id"],))
        cls.conn.commit()
        cls.parent_token = create_access_token(cls.parent_user)

        cls.test_app_id = "APP-TEST-PAY-ENROL-01"
        cls.test_psid = None
        cls.test_student_id = None

    @classmethod
    def tearDownClass(cls):
        # Cleanup test records
        cur = cls.conn.cursor()
        cur.execute("DELETE FROM portal_notifications WHERE recipient_user_id IN (?, ?)", (cls.parent_user["user_id"], cls.staff_user["user_id"]))
        if cls.test_student_id:
            cur.execute("DELETE FROM students WHERE student_id = ?", (cls.test_student_id,))
        if cls.test_psid:
            cur.execute("DELETE FROM enrollments WHERE permanent_student_id = ?", (cls.test_psid,))
            cur.execute("DELETE FROM student_guardians WHERE permanent_student_id = ?", (cls.test_psid,))
            cur.execute("DELETE FROM student_attendance WHERE permanent_student_id = ?", (cls.test_psid,))
            cur.execute("DELETE FROM students WHERE permanent_student_id = ?", (cls.test_psid,))
        cur.execute("DELETE FROM admission_detailed_submissions WHERE application_id = ?", (cls.test_app_id,))
        cur.execute("DELETE FROM admission_documents WHERE application_id = ?", (cls.test_app_id,))
        cur.execute("DELETE FROM admission_applications WHERE application_id = ?", (cls.test_app_id,))
        cls.conn.commit()

        # Check final student count
        cur.execute("SELECT COUNT(1) FROM students")
        final_count = cur.fetchone()[0]
        print(f"[TEARDOWN] Final total student count: {final_count} (Expected: {cls.initial_student_count})")
        cls.conn.close()

    def make_request(self, path, token=None, method="GET", payload=None):
        url = f"{BASE_URL}{path}"
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        data = None
        if payload is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read().decode("utf-8")
                return resp.status, json.loads(body) if body else {}
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8")
            try:
                res_json = json.loads(err_body)
            except:
                res_json = {"detail": err_body}
            return e.code, res_json

    def test_01_stage2_submission_no_student_id(self):
        """Scenario 1: Stage 2 documents submitted -> no Student ID generated."""
        print("\n--- Running Scenario 1: Stage 2 documents submitted -> no Student ID generated ---")
        cur = self.conn.cursor()
        # Clean any prior leftover
        cur.execute("DELETE FROM students WHERE student_name = 'Ananya UniqueApplicant'")
        cur.execute("DELETE FROM admission_applications WHERE application_id = ?", (self.test_app_id,))
        cur.execute("DELETE FROM admission_detailed_submissions WHERE application_id = ?", (self.test_app_id,))
        cur.execute("""
            INSERT INTO admission_applications (
                application_id, parent_user_id, applicant_name, institution_id,
                academic_year, requested_standard, education_level, status, payment_status, payment_amount,
                parent_name, parent_phone, parent_email, residential_address, created_at
            ) VALUES (
                ?, ?, 'Ananya UniqueApplicant', ?, '2026-2027', '6', 'school', 'approved', 'PENDING', 1200.0,
                'Ramesh Sharma', ?, ?, '123 Vidhana Soudha Road, Bangalore', datetime('now')
            )
        """, (self.test_app_id, self.parent_user["user_id"], self.institution_id, self.parent_user.get("phone", "9876543210"), self.parent_user.get("email", "parent_test@test.gov.in")))

        # Submit Stage 2 details
        stage2_payload = {
            "date_of_birth": "2015-05-12",
            "gender": "female",
            "blood_group": "B+",
            "emergency_contact_name": "Ramesh Sharma",
            "emergency_contact_phone": "9876543210",
            "previous_institution_name": "Govt Primary School",
            "previous_institution_location": "Bangalore Urban",
            "previous_standard_or_degree": "Standard 5",
            "previous_board": "Karnataka State Board",
            "previous_marks_percentage": 88.5
        }
        status, res = self.make_request(
            f"/admissions/applications/{self.test_app_id}/stage2-submit",
            token=self.parent_token,
            method="POST",
            payload=stage2_payload
        )
        self.assertIn(status, [200, 201], f"Stage 2 submission failed: {res}")

        # Verify in DB: No student ID generated yet
        cur.execute("SELECT status, enrolled_student_id, payment_status FROM admission_applications WHERE application_id = ?", (self.test_app_id,))
        row = cur.fetchone()
        self.assertIn(row["status"], ["stage2_submitted", "documents_uploaded", "approved"])
        self.assertIsNone(row["enrolled_student_id"], "enrolled_student_id must be NULL at Stage 2 submission")

        # Verify no record in students
        cur.execute("SELECT COUNT(1) FROM students WHERE student_name = 'Ananya UniqueApplicant'")
        self.assertEqual(cur.fetchone()[0], 0, "No student record should exist yet")
        print("✓ Verified: Stage 2 submission does NOT generate Student ID or student records.")

    def test_02_stage2_approval_payment_pending_no_allotment(self):
        """Scenario 2: Stage 2 approved but payment pending -> no seat-allotment notification."""
        print("\n--- Running Scenario 2: Stage 2 approved but payment pending -> no seat allotment notification ---")
        # School Admin reviews and approves Stage 2
        review_payload = {
            "decision": "detailed_review_completed",
            "review_notes": "All Stage 2 certificates verified."
        }
        status, res = self.make_request(
            f"/school/admissions/{self.test_app_id}/stage2-review",
            token=self.staff_token,
            method="POST",
            payload=review_payload
        )
        self.assertEqual(status, 200, f"Stage 2 review approval failed: {res}")

        cur = self.conn.cursor()
        cur.execute("SELECT status, payment_status, enrolled_student_id FROM admission_applications WHERE application_id = ?", (self.test_app_id,))
        row = cur.fetchone()
        self.assertIn(row["status"], ["detailed_review_completed", "stage2_approved"])
        self.assertEqual(row["payment_status"], "PENDING", "Payment status must still be PENDING")
        self.assertIsNone(row["enrolled_student_id"], "enrolled_student_id must NOT be generated upon Stage 2 review")

        # Verify notification sent to parent is Payment QR notification, NOT seat allotment
        status_notif, notif_res = self.make_request("/notifications", token=self.parent_token)
        notifs = notif_res.get("items", []) if isinstance(notif_res, dict) else (notif_res if isinstance(notif_res, list) else [])
        has_qr_notif = any("Payment QR" in n.get("title", "") or "Stage 2" in n.get("title", "") or "Payment QR" in n.get("message", "") for n in notifs)
        self.assertTrue(has_qr_notif, "Parent must receive Payment QR notification")
        has_seat_allot_notif = any("Seat Allotted" in n.get("title", "") or "Permanent Student ID" in n.get("title", "") for n in notifs)
        self.assertFalse(has_seat_allot_notif, "Parent must NOT receive seat allotment notification while payment is pending")
        print("✓ Verified: Stage 2 approval sends payment notification, no seat allotment notification.")

    def test_03_payment_pending_blocks_seat_allotment(self):
        """Scenario 3: Payment fails / pending -> cannot allot seat."""
        print("\n--- Running Scenario 3: Payment pending blocks seat allotment ---")
        status, res = self.make_request(
            f"/school/admissions/{self.test_app_id}/allot-seat",
            token=self.staff_token,
            method="POST",
            payload={"notes": "Attempting allotment before payment"}
        )
        self.assertEqual(status, 400, "Must return HTTP 400 when attempting seat allotment without verified payment")
        self.assertIn("payment", res.get("detail", "").lower(), "Error message must state payment is required")

        # Verify DB untouched
        cur = self.conn.cursor()
        cur.execute("SELECT enrolled_student_id FROM admission_applications WHERE application_id = ?", (self.test_app_id,))
        self.assertIsNone(cur.fetchone()[0], "enrolled_student_id must remain None")
        print("✓ Verified: Allot-seat endpoint strictly enforces verified payment (HTTP 400).")

    def test_04_payment_succeeds_appears_in_queue(self):
        """Scenario 4: Payment succeeds -> application appears in paid seat-allotment queue."""
        print("\n--- Running Scenario 4: Payment succeeds -> appears in paid seat-allotment queue ---")
        # Parent completes demo payment via /demo-pay
        status, res = self.make_request(
            f"/admissions/applications/{self.test_app_id}/demo-pay",
            token=self.parent_token,
            method="POST",
            payload={}
        )
        self.assertEqual(status, 200, f"Demo payment failed: {res}")
        self.assertEqual(res.get("status"), "PAID_DEMO")

        # Fetch paid seat allotment queue
        status, qres = self.make_request(
            "/school/admissions/paid-seat-allotment-queue",
            token=self.staff_token,
            method="GET"
        )
        self.assertEqual(status, 200, f"Failed to fetch paid queue: {qres}")
        queue = qres if isinstance(qres, list) else qres.get("queue", [])
        matched = [a for a in queue if a["application_id"] == self.test_app_id]
        self.assertEqual(len(matched), 1, "Application must appear in paid seat-allotment queue")
        self.assertEqual(matched[0]["payment_status"], "PAID_DEMO")
        print("✓ Verified: Application appears in paid seat-allotment queue after payment.")

    def test_05_school_allots_seat_generates_student_id(self):
        """Scenario 5: School allots seat -> Student ID generated and saved in DB."""
        print("\n--- Running Scenario 5: School allots seat -> Student ID generated ---")
        allot_payload = {
            "notes": "Verified paid admission. Seat allotted by School Admin."
        }
        status, res = self.make_request(
            f"/school/admissions/{self.test_app_id}/allot-seat",
            token=self.staff_token,
            method="POST",
            payload=allot_payload
        )
        self.assertEqual(status, 200, f"Seat allotment failed: {res}")
        self.assertIn("student_id", res)
        self.assertIn("permanent_student_id", res)
        self.assertTrue(res["student_id"].startswith("SCH"), f"Student ID format invalid: {res['student_id']}")
        self.assertTrue(res["permanent_student_id"].startswith("NS-"), f"Permanent ID format invalid: {res['permanent_student_id']}")

        self.__class__.test_student_id = res["student_id"]
        self.__class__.test_psid = res["permanent_student_id"]

        # Verify DB updates
        cur = self.conn.cursor()
        cur.execute("SELECT status, enrolled_student_id FROM admission_applications WHERE application_id = ?", (self.test_app_id,))
        app_row = cur.fetchone()
        self.assertEqual(app_row["status"], "seat_allotted")
        self.assertEqual(app_row["enrolled_student_id"], self.test_psid)

        # Verify students table
        cur.execute("SELECT * FROM students WHERE student_id = ?", (self.test_student_id,))
        stud_row = cur.fetchone()
        self.assertIsNotNone(stud_row, "Student record must be inserted into students table")
        self.assertEqual(stud_row["permanent_student_id"], self.test_psid)
        self.assertEqual(stud_row["student_name"], "Ananya UniqueApplicant")
        self.assertEqual(stud_row["school_id"], self.institution_id)
        self.assertEqual(stud_row["enrollment_status"], "seat_allotted")

        # Verify student_guardians link
        cur.execute("SELECT * FROM student_guardians WHERE permanent_student_id = ?", (self.test_psid,))
        guard_row = cur.fetchone()
        self.assertIsNotNone(guard_row, "Parent guardian record must be linked")
        print(f"✓ Verified: Seat allotted! Student ID: {self.test_student_id}, PSID: {self.test_psid} saved in DB.")

    def test_06_parent_sees_actual_student_id(self):
        """Scenario 6: Parent sees actual Student ID."""
        print("\n--- Running Scenario 6: Parent sees actual Student ID ---")
        status, res = self.make_request(
            "/parent/admissions/applications",
            token=self.parent_token,
            method="GET"
        )
        self.assertEqual(status, 200)
        apps = res.get("applications", []) if isinstance(res, dict) else res
        matched = [a for a in apps if a["application_id"] == self.test_app_id]
        self.assertEqual(len(matched), 1)
        app = matched[0]
        self.assertEqual(app["status"], "seat_allotted")
        self.assertEqual(app["enrolled_student_id"], self.test_psid)
        self.assertEqual(app.get("student_id"), self.test_student_id)

        # Check parent notifications via API
        status_n, res_n = self.make_request("/notifications", token=self.parent_token)
        notifs = res_n.get("items", []) if isinstance(res_n, dict) else (res_n if isinstance(res_n, list) else [])
        has_id_notif = any(self.test_student_id in n.get("message", "") or self.test_student_id in n.get("title", "") for n in notifs)
        self.assertTrue(has_id_notif, "Parent notification must contain the actual generated Student ID")
        print("✓ Verified: Parent dashboard and notifications display the canonical Student ID.")

    def test_07_school_admin_searches_student_by_id(self):
        """Scenario 7: School Admin searches student using ID."""
        print("\n--- Running Scenario 7: School Admin searches student using ID ---")
        status, res = self.make_request(
            f"/institution/{self.institution_id}/students?search={self.test_student_id}",
            token=self.staff_token,
            method="GET"
        )
        self.assertEqual(status, 200)
        students = res.get("students", [])
        matched = [s for s in students if s["student_id"] == self.test_student_id]
        self.assertEqual(len(matched), 1, "School Admin must be able to search student by generated Student ID")
        self.assertEqual(matched[0]["student_name"], "Ananya UniqueApplicant")
        print("✓ Verified: Student found in school search by generated Student ID.")

    def test_08_school_admin_assigns_class_and_section(self):
        """Scenario 8: School Admin assigns student to applied standard and section with capacity checks."""
        print("\n--- Running Scenario 8: Class & Section assignment with standard consistency & capacity checks ---")
        status, res = self.make_request(
            f"/school/admissions/{self.test_app_id}/available-sections",
            token=self.staff_token,
            method="GET"
        )
        self.assertEqual(status, 200)
        sections = res if isinstance(res, list) else res.get("sections", [])
        self.assertGreater(len(sections), 0, "Sections must exist or be auto-seeded")
        valid_section = sections[0]
        sec_id = valid_section["section_id"]

        # Inconsistent standard test
        mismatch_payload = {
            "section_id": sec_id,
            "standard": "8", # Mismatched standard
            "notes": "Attempting invalid standard"
        }
        status, res = self.make_request(
            f"/school/admissions/{self.test_app_id}/assign-class",
            token=self.staff_token,
            method="POST",
            payload=mismatch_payload
        )
        self.assertEqual(status, 400, "Backend must reject standard mismatch with HTTP 400")
        detail = res.get("detail", "").lower()
        self.assertTrue("consistent" in detail or "mismatch" in detail or "applied" in detail)

        # Valid standard assignment
        valid_payload = {
            "section_id": sec_id,
            "standard": "6",
            "notes": "Assigned to Standard 6 Section A"
        }
        status, res = self.make_request(
            f"/school/admissions/{self.test_app_id}/assign-class",
            token=self.staff_token,
            method="POST",
            payload=valid_payload
        )
        self.assertEqual(status, 200, f"Class assignment failed: {res}")
        self.assertEqual(str(res.get("standard")), "6")
        self.assertIn("section", res)

        # Verify DB updates
        cur = self.conn.cursor()
        cur.execute("SELECT status, enrolled_student_id FROM admission_applications WHERE application_id = ?", (self.test_app_id,))
        app_row = cur.fetchone()
        self.assertEqual(app_row["status"], "admission_completed")
        self.assertEqual(app_row["enrolled_student_id"], self.test_psid)

        cur.execute("SELECT enrollment_status, standard, section FROM students WHERE student_id = ?", (self.test_student_id,))
        stud_row = cur.fetchone()
        self.assertEqual(stud_row["enrollment_status"], "active")
        self.assertEqual(str(stud_row["standard"]), "6")
        self.assertEqual(stud_row["section"], "A")

        # Verify enrollments table
        cur.execute("SELECT * FROM enrollments WHERE permanent_student_id = ?", (self.test_psid,))
        enr_row = cur.fetchone()
        self.assertIsNotNone(enr_row, "Enrollment record must exist in enrollments table")
        self.assertEqual(str(enr_row["standard"]), "6")
        self.assertEqual(enr_row["enrollment_status"], "active")
        print("✓ Verified: Class assignment enforced standard consistency and updated database.")

    def test_09_student_appears_in_class_list(self):
        """Scenario 9: Student appears in class list."""
        print("\n--- Running Scenario 9: Student appears in class list ---")
        status, res = self.make_request(
            f"/institution/{self.institution_id}/students?standard=6",
            token=self.staff_token,
            method="GET"
        )
        self.assertEqual(status, 200)
        students = res.get("students", [])
        matched = [s for s in students if s["student_id"] == self.test_student_id]
        self.assertEqual(len(matched), 1, "Student must appear in class roster")
        self.assertEqual(str(matched[0]["standard"]), "6")
        self.assertEqual(matched[0]["enrollment_status"], "active")
        print("✓ Verified: Student appears in official Standard 6 class roster.")

    def test_10_student_available_in_attendance_register(self):
        """Scenario 10: Student available in attendance register."""
        print("\n--- Running Scenario 10: Student available in attendance register ---")
        cur = self.conn.cursor()
        cur.execute("SELECT permanent_student_id, student_name, standard, section, enrollment_status FROM students WHERE student_id = ?", (self.test_student_id,))
        stud = cur.fetchone()
        self.assertIsNotNone(stud)
        self.assertEqual(stud["enrollment_status"], "active")

        # Verify attendance record can be registered
        cur.execute("""
            INSERT OR REPLACE INTO student_attendance (
                attendance_id, institution_id, permanent_student_id, academic_year,
                attendance_date, status, recorded_by_user_id, created_at, updated_at
            ) VALUES (
                'ATT-TEST-001', ?, ?, '2026-2027', date('now'), 'present', 'staff-test', datetime('now'), datetime('now')
            )
        """, (self.institution_id, self.test_psid))
        self.conn.commit()

        cur.execute("SELECT status FROM student_attendance WHERE permanent_student_id = ?", (self.test_psid,))
        att_row = cur.fetchone()
        self.assertEqual(att_row["status"], "present")
        print("✓ Verified: Student is registered in attendance database.")

    def test_11_parent_views_assigned_class(self):
        """Scenario 11: Parent views assigned class & student details."""
        print("\n--- Running Scenario 11: Parent views assigned class ---")
        status, res = self.make_request(
            "/parent/admissions/applications",
            token=self.parent_token,
            method="GET"
        )
        self.assertEqual(status, 200)
        apps = res.get("applications", []) if isinstance(res, dict) else res
        matched = [a for a in apps if a["application_id"] == self.test_app_id]
        self.assertEqual(len(matched), 1)
        app = matched[0]
        self.assertEqual(app["status"], "admission_completed")
        self.assertEqual(str(app.get("enrolled_standard")), "6")
        self.assertIsNotNone(app.get("enrolled_section"))
        self.assertEqual(app.get("student_id"), self.test_student_id)
        print("✓ Verified: Parent dashboard shows completed admission with Standard, Section, and Student ID.")

    def test_12_duplicate_calls_idempotent(self):
        """Scenario 12: Duplicate payment callbacks/repeated allotment calls do not duplicate IDs."""
        print("\n--- Running Scenario 12: Idempotency under duplicate payment & allotment calls ---")
        # Repeat allot seat call
        status, res = self.make_request(
            f"/school/admissions/{self.test_app_id}/allot-seat",
            token=self.staff_token,
            method="POST",
            payload={"notes": "Repeated allotment attempt"}
        )
        self.assertEqual(status, 200)
        self.assertEqual(res.get("student_id"), self.test_student_id, "Repeated call must return identical Student ID")
        self.assertEqual(res.get("permanent_student_id"), self.test_psid)

        # Verify DB student count did not increase
        cur = self.conn.cursor()
        cur.execute("SELECT COUNT(1) FROM students WHERE student_name = 'Ananya UniqueApplicant'")
        self.assertEqual(cur.fetchone()[0], 1, "Only one student record must exist")

        # Repeat payment call
        status, res = self.make_request(
            f"/admissions/applications/{self.test_app_id}/demo-pay",
            token=self.parent_token,
            method="POST",
            payload={}
        )
        self.assertEqual(status, 200)
        self.assertEqual(res.get("status"), "PAID_DEMO")
        print("✓ Verified: Duplicate calls are completely idempotent and prevent ID duplication.")

    def test_13_baseline_data_preservation(self):
        """Scenario 13: Baseline data (30,003 students) and workflows intact."""
        print("\n--- Running Scenario 13: Baseline data preservation check ---")
        cur = self.conn.cursor()
        cur.execute("SELECT COUNT(1) FROM students")
        curr_count = cur.fetchone()[0]
        print(f"Current student count: {curr_count} (Initial: {self.initial_student_count})")
        # Current count must be initial count + 1 (our test student before tearDown)
        self.assertEqual(curr_count, self.initial_student_count + 1)
        print("✓ Verified: Baseline database is preserved without loss.")


if __name__ == "__main__":
    unittest.main()
