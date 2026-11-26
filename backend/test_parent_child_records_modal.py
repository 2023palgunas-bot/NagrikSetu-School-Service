import unittest
import urllib.request
import urllib.error
import json
import sqlite3
import time
import os
from auth import create_access_token

BASE_URL = "http://127.0.0.1:8000"
DB_PATH = "/app/data/nagriksetu.db"


class TestParentChildRecordsModal(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conn = sqlite3.connect(DB_PATH)
        cls.conn.row_factory = sqlite3.Row
        cur = cls.conn.cursor()

        # Authorized parent for SCH171203 (Ronith)
        cur.execute("SELECT * FROM users WHERE email = 'ronith123@gmail.com'")
        cls.parent_user = dict(cur.fetchone())
        cls.parent_token = create_access_token(cls.parent_user)

        # Create or find an unauthorized parent (Parent 2)
        cur.execute("SELECT * FROM users WHERE role = 'parent' AND user_id != ? LIMIT 1", (cls.parent_user["user_id"],))
        unauth_row = cur.fetchone()
        if not unauth_row:
            # Create a second parent for testing
            cur.execute(
                "INSERT INTO users (user_id, email, full_name, role) VALUES ('test-unauth-parent', 'unauth_parent@test.com', 'Unauth Parent', 'parent')"
            )
            cur.execute(
                "INSERT INTO guardians (guardian_id, user_id, full_name, relationship) VALUES ('test-unauth-guardian', 'test-unauth-parent', 'Unauth Parent', 'Mother')"
            )
            cls.conn.commit()
            cur.execute("SELECT * FROM users WHERE user_id = 'test-unauth-parent'")
            unauth_row = cur.fetchone()
        cls.unauth_user = dict(unauth_row)
        cls.unauth_token = create_access_token(cls.unauth_user)

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()

    def make_request(self, path, token=None, method="GET"):
        url = f"{BASE_URL}{path}"
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        req = urllib.request.Request(url, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = resp.read().decode()
                return resp.status, json.loads(body) if body else {}
        except urllib.error.HTTPError as e:
            err_body = e.read().decode()
            try:
                data = json.loads(err_body)
            except Exception:
                data = {"detail": err_body}
            return e.code, data

    def test_01_verify_correct_student_sch171203(self):
        """Test with linked student SCH171203: student identity, school, academic & attendance belong to them."""
        t0 = time.time()
        status, data = self.make_request("/parent/children/SCH171203/records", token=self.parent_token)
        elapsed = time.time() - t0

        self.assertEqual(status, 200)
        self.assertLess(elapsed, 2.0, f"Response too slow: {elapsed:.2f}s")

        student = data.get("student", {})
        self.assertEqual(student.get("student_id"), "SCH171203")
        self.assertEqual(student.get("permanent_student_id"), "NS-SCH017-STD05-099")
        self.assertEqual(student.get("student_name"), "Manoj Bhat 15299")
        self.assertEqual(student.get("school_id"), "SCH017")
        self.assertEqual(student.get("school_name"), "Dharwad Vidya School")

        # Verify institution ID and details
        school = data.get("school", {})
        self.assertEqual(school.get("school_id"), "SCH017")

        # Verify academic results belong to student
        results = data.get("academic_results", [])
        self.assertGreater(len(results), 0)
        for r in results:
            self.assertIn("subject_name", r)
            self.assertIn("marks_obtained", r)

        # Verify attendance belongs to student
        att = data.get("attendance_summary", {})
        self.assertIsNotNone(att.get("total_working_days"))
        self.assertGreater(att.get("total_working_days"), 0)

    def test_02_student_ref_both_psid_and_student_id(self):
        """Verify accessing via PSID and student_id returns identical record."""
        status_psid, data_psid = self.make_request("/parent/children/NS-SCH017-STD05-099/records", token=self.parent_token)
        status_sid, data_sid = self.make_request("/parent/children/SCH171203/records", token=self.parent_token)

        self.assertEqual(status_psid, 200)
        self.assertEqual(status_sid, 200)
        self.assertEqual(data_psid["student"]["permanent_student_id"], data_sid["student"]["permanent_student_id"])
        self.assertEqual(len(data_psid["academic_results"]), len(data_sid["academic_results"]))
        self.assertEqual(data_psid["attendance_summary"]["total_working_days"], data_sid["attendance_summary"]["total_working_days"])

    def test_03_unauthorized_parent_denied(self):
        """Unauthorized parent attempting to access SCH171203 must be rejected (404/403)."""
        status, data = self.make_request("/parent/children/SCH171203/records", token=self.unauth_token)
        self.assertIn(status, [403, 404])

    def test_04_unauthenticated_request_rejected(self):
        """Unauthenticated request must return 401."""
        status, data = self.make_request("/parent/children/SCH171203/records", token=None)
        self.assertEqual(status, 401)

    def test_05_nonexistent_student_rejected(self):
        """Accessing a nonexistent student ID returns 404."""
        status, data = self.make_request("/parent/children/SCH99999999/records", token=self.parent_token)
        self.assertEqual(status, 404)

    def test_06_synthetic_edge_case_results_without_attendance(self):
        """Test student scenario: academic results exist, attendance empty."""
        cur = self.conn.cursor()
        test_psid = "NS-TEST-ACAD-ONLY"
        test_sid = "TESTACAD01"
        try:
            # Set up temporary student linked to parent
            cur.execute("INSERT OR REPLACE INTO students (student_id, permanent_student_id, student_name, school_id, standard, section, age) VALUES (?, ?, 'Test Student Acad', 'SCH017', 5, 'A', 10)", (test_sid, test_psid))
            cur.execute("SELECT guardian_id FROM guardians WHERE user_id = ?", (self.parent_user["user_id"],))
            gid = cur.fetchone()[0]
            cur.execute("INSERT OR REPLACE INTO student_guardians (student_guardian_id, permanent_student_id, guardian_id, can_view_records, is_verified) VALUES ('sg-test-acad', ?, ?, 1, 1)", (test_psid, gid))
            cur.execute("INSERT OR REPLACE INTO enrollments (enrollment_id, permanent_student_id, school_id, academic_year, standard, section, first_language) VALUES ('en-test-acad', ?, 'SCH017', '2025-26', 5, 'A', 'Kannada')", (test_psid,))
            cur.execute("INSERT OR REPLACE INTO academic_results (result_id, enrollment_id, permanent_student_id, academic_year, subject_name, exam_name, marks_obtained, maximum_marks) VALUES ('ar-test-1', 'en-test-acad', ?, '2025-26', 'Math', 'Midterm', 85, 100)", (test_psid,))
            self.conn.commit()

            status, data = self.make_request(f"/parent/children/{test_sid}/records", token=self.parent_token)
            self.assertEqual(status, 200)
            self.assertEqual(len(data.get("academic_results", [])), 1)
            # Attendance should be clean empty state without crashing
            self.assertEqual(data.get("attendance_summary", {}).get("total_working_days"), 0)
            self.assertIsNone(data.get("attendance_summary", {}).get("attendance_percentage"))
        finally:
            cur.execute("DELETE FROM academic_results WHERE permanent_student_id = ?", (test_psid,))
            cur.execute("DELETE FROM enrollments WHERE permanent_student_id = ?", (test_psid,))
            cur.execute("DELETE FROM student_guardians WHERE permanent_student_id = ?", (test_psid,))
            cur.execute("DELETE FROM students WHERE permanent_student_id = ?", (test_psid,))
            self.conn.commit()

    def test_07_synthetic_edge_case_attendance_without_results(self):
        """Test student scenario: attendance exists, academic results empty."""
        cur = self.conn.cursor()
        test_psid = "NS-TEST-ATT-ONLY"
        test_sid = "TESTATT01"
        try:
            cur.execute("INSERT OR REPLACE INTO students (student_id, permanent_student_id, student_name, school_id, standard, section, age) VALUES (?, ?, 'Test Student Att', 'SCH017', 5, 'A', 10)", (test_sid, test_psid))
            cur.execute("SELECT guardian_id FROM guardians WHERE user_id = ?", (self.parent_user["user_id"],))
            gid = cur.fetchone()[0]
            cur.execute("INSERT OR REPLACE INTO student_guardians (student_guardian_id, permanent_student_id, guardian_id, can_view_records, is_verified) VALUES ('sg-test-att', ?, ?, 1, 1)", (test_psid, gid))
            cur.execute("INSERT OR REPLACE INTO student_attendance (attendance_id, institution_id, permanent_student_id, academic_year, attendance_date, status, recorded_by_user_id) VALUES ('att-test-1', 'SCH017', ?, '2025-26', '2026-01-10', 'present', 'system')", (test_psid,))
            self.conn.commit()

            status, data = self.make_request(f"/parent/children/{test_sid}/records", token=self.parent_token)
            self.assertEqual(status, 200)
            self.assertEqual(len(data.get("academic_results", [])), 0)
            self.assertEqual(data.get("attendance_summary", {}).get("total_working_days"), 1)
            self.assertEqual(data.get("attendance_summary", {}).get("present_days"), 1)
            self.assertEqual(data.get("attendance_summary", {}).get("attendance_percentage"), 100.0)
        finally:
            cur.execute("DELETE FROM student_attendance WHERE permanent_student_id = ?", (test_psid,))
            cur.execute("DELETE FROM student_guardians WHERE permanent_student_id = ?", (test_psid,))
            cur.execute("DELETE FROM students WHERE permanent_student_id = ?", (test_psid,))
            self.conn.commit()

    def test_08_synthetic_edge_case_neither_record(self):
        """Test student scenario: neither academic results nor attendance records exist."""
        cur = self.conn.cursor()
        test_psid = "NS-TEST-NEITHER"
        test_sid = "TESTNEITHER01"
        try:
            cur.execute("INSERT OR REPLACE INTO students (student_id, permanent_student_id, student_name, school_id, standard, section, age) VALUES (?, ?, 'Test Student Neither', 'SCH017', 5, 'A', 10)", (test_sid, test_psid))
            cur.execute("SELECT guardian_id FROM guardians WHERE user_id = ?", (self.parent_user["user_id"],))
            gid = cur.fetchone()[0]
            cur.execute("INSERT OR REPLACE INTO student_guardians (student_guardian_id, permanent_student_id, guardian_id, can_view_records, is_verified) VALUES ('sg-test-neither', ?, ?, 1, 1)", (test_psid, gid))
            self.conn.commit()

            status, data = self.make_request(f"/parent/children/{test_sid}/records", token=self.parent_token)
            self.assertEqual(status, 200)
            self.assertEqual(len(data.get("academic_results", [])), 0)
            self.assertEqual(data.get("attendance_summary", {}).get("total_working_days"), 0)
            self.assertEqual(data.get("student", {}).get("student_name"), "Test Student Neither")
        finally:
            cur.execute("DELETE FROM student_guardians WHERE permanent_student_id = ?", (test_psid,))
            cur.execute("DELETE FROM students WHERE permanent_student_id = ?", (test_psid,))
            self.conn.commit()

    def test_09_database_student_count_preserved(self):
        """Verify the 30,003 student records remain completely intact."""
        cur = self.conn.cursor()
        cur.execute("SELECT COUNT(*) FROM students")
        count = cur.fetchone()[0]
        self.assertEqual(count, 30003)


if __name__ == "__main__":
    unittest.main()
