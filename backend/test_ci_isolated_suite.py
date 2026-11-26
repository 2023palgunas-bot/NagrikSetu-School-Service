"""
NagrikSetu School Service - Isolated CI Test Suite
--------------------------------------------------
This suite is specifically designed for automated Continuous Integration (CI)
in isolated runner environments (e.g., GitHub Actions).

Safety and Isolation Guarantees:
1. Runs entirely within a temporary SQLite database created at module start.
2. Never accesses or modifies the local development SQLite database.
3. Never requires production secrets, SMTP credentials, SMS credentials, or external APIs.
4. Independent of pre-existing student or institution records.
5. Cleans up all temporary resources upon test completion.
"""

import os
import sys
import unittest
import tempfile
import shutil
import sqlite3

# Ensure backend directory is in sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

# Global test sandbox variables
CI_TMP_DIR = None
CI_DB_PATH = None
TEST_JWT_SECRET = "ci-isolated-test-jwt-secret-key-32-chars-minimum"


def setUpModule():
    """Sets up the isolated temporary SQLite database for the entire test run."""
    global CI_TMP_DIR, CI_DB_PATH
    CI_TMP_DIR = tempfile.mkdtemp(prefix="nagriksetu_ci_")
    CI_DB_PATH = os.path.join(CI_TMP_DIR, "ci_test_nagriksetu.db")

    os.environ["DATABASE_PATH"] = CI_DB_PATH
    os.environ["JWT_SECRET_KEY"] = TEST_JWT_SECRET

    import database
    database.DATABASE_NAME = CI_DB_PATH
    database.create_tables()

    import institution_support_service
    institution_support_service.init_institution_support_db()


def tearDownModule():
    """Tears down and completely removes the isolated test database."""
    global CI_TMP_DIR
    if CI_TMP_DIR and os.path.exists(CI_TMP_DIR):
        shutil.rmtree(CI_TMP_DIR, ignore_errors=True)


class TestDatabaseIsolation(unittest.TestCase):
    """Verifies SQLite database schema initialization and seeding in an isolated environment."""

    def test_schema_creation_and_tables(self):
        """Verifies that create_tables initializes all core relational tables."""
        import database
        conn = database.get_connection()
        try:
            cursor = conn.cursor()
            tables = [
                row[0]
                for row in cursor.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                ).fetchall()
            ]

            expected_tables = [
                "schools",
                "students",
                "users",
                "guardians",
                "student_guardians",
                "enrollments",
                "academic_results",
                "student_documents",
                "fees",
                "scholarships",
                "service_requests",
                "institution_support_requests",
            ]

            for table in expected_tables:
                self.assertIn(
                    table,
                    tables,
                    f"Expected table '{table}' was not created in isolated database.",
                )

            # Check PRAGMA foreign keys
            fk_status = cursor.execute("PRAGMA foreign_keys").fetchone()[0]
            self.assertEqual(fk_status, 1, "Foreign keys PRAGMA must be ON.")
        finally:
            conn.close()

    def test_seed_data_execution(self):
        """Verifies that seed_data correctly populates initial schools and demo students."""
        import seed_data
        import database

        seed_data.seed_data()

        conn = database.get_connection()
        try:
            school_count = conn.execute("SELECT COUNT(*) FROM schools").fetchone()[0]
            student_count = conn.execute("SELECT COUNT(*) FROM students").fetchone()[0]

            self.assertGreaterEqual(
                school_count, 10, "Expected at least 10 seeded schools."
            )
            self.assertGreater(
                student_count, 0, "Expected seeded students in isolated test database."
            )
        finally:
            conn.close()


class TestAuthenticationSecurity(unittest.TestCase):
    """Verifies password hashing, verification, and JWT token handling without external dependencies."""

    def setUp(self):
        import auth
        self.auth = auth

    def test_password_hash_and_verify(self):
        """Verifies Argon2 password hashing and verification."""
        password = "SecureCitizenPassword2026!"
        h = self.auth.hash_password(password)

        self.assertNotEqual(password, h)
        self.assertTrue(self.auth.verify_password(password, h))
        self.assertFalse(self.auth.verify_password("WrongPassword123!", h))

    def test_short_password_rejection(self):
        """Verifies that passwords under 6 characters are rejected with ValueError."""
        with self.assertRaises(ValueError):
            self.auth.hash_password("12345")

    def test_jwt_access_token_creation(self):
        """Verifies JWT access token generation and claims encoding."""
        import jwt

        user_data = {
            "user_id": "USR-CI-TEST-001",
            "role": "parent",
            "school_id": "SCH001",
            "student_id": "STU001",
        }

        token = self.auth.create_access_token(user_data)
        self.assertIsInstance(token, str)
        self.assertGreater(len(token), 20)

        # Decode using the test secret key
        decoded = jwt.decode(token, TEST_JWT_SECRET, algorithms=["HS256"])
        self.assertEqual(decoded["sub"], "USR-CI-TEST-001")
        self.assertEqual(decoded["role"], "parent")
        self.assertEqual(decoded["school_id"], "SCH001")
        self.assertEqual(decoded["student_id"], "STU001")
        self.assertIn("exp", decoded)


class TestAIEngineComponents(unittest.TestCase):
    """Verifies AI text processing, typo normalization, and tokenization without requiring external LLM APIs."""

    def test_typo_normalization(self):
        """Verifies that known educational terms with common typos are correctly normalized."""
        from ai_engine.question_matcher import QuestionMatcher

        matcher = QuestionMatcher()
        raw_query = "wat is the scool fee and admision date for my child?"
        normalized = matcher._normalize(raw_query)

        self.assertIn("school", normalized)
        self.assertIn("admission", normalized)
        self.assertIn("fees", normalized)

    def test_tokenization_and_stopwords(self):
        """Verifies that stopwords are excluded and informative tokens are extracted."""
        from ai_engine.question_matcher import QuestionMatcher

        matcher = QuestionMatcher()
        query = "What is the scholarship process in Karnataka?"
        tokens = matcher._tokenize(query)

        self.assertIn("scholarship", tokens)
        self.assertIn("process", tokens)
        self.assertIn("karnataka", tokens)
        self.assertNotIn("what", tokens)
        self.assertNotIn("is", tokens)
        self.assertNotIn("the", tokens)
        self.assertNotIn("in", tokens)


class TestRateLimiter(unittest.TestCase):
    """Verifies in-memory rate limiting and brute-force lockout logic."""

    def test_request_rate_limiting(self):
        from main import AuthRateLimiter

        limiter = AuthRateLimiter()
        client_ip = "192.168.1.100"

        # Under the threshold (max 5)
        for _ in range(5):
            self.assertTrue(limiter.record_request(client_ip, max_per_minute=5))

        # Exceeds threshold
        self.assertFalse(limiter.record_request(client_ip, max_per_minute=5))

    def test_failed_login_lockout(self):
        from main import AuthRateLimiter

        limiter = AuthRateLimiter()
        client_ip = "192.168.1.101"
        identifier = "parent@example.com"

        # Record failed attempts up to limit
        for _ in range(4):
            self.assertTrue(limiter.record_failed_login(client_ip, identifier, max_failures=5))
            self.assertFalse(limiter.is_locked_out(client_ip, identifier, max_failures=5))

        # 5th failed attempt triggers lockout
        self.assertFalse(limiter.record_failed_login(client_ip, identifier, max_failures=5))
        self.assertTrue(limiter.is_locked_out(client_ip, identifier, max_failures=5))

        # Reset clears lockout
        limiter.reset_failed_login(client_ip, identifier)
        self.assertFalse(limiter.is_locked_out(client_ip, identifier, max_failures=5))


class TestFastApiAppSchema(unittest.TestCase):
    """Verifies that the entire FastAPI application initializes cleanly and generates valid OpenAPI schema."""

    def test_openapi_schema_generation(self):
        from main import app

        schema = app.openapi()
        self.assertIsInstance(schema, dict)
        self.assertEqual(schema["openapi"], "3.1.0")
        self.assertEqual(schema["info"]["title"], "NagrikSetu School Service")
        self.assertIn("paths", schema)
        self.assertGreater(len(schema["paths"]), 100, "Expected over 100 API endpoints registered.")


if __name__ == "__main__":
    unittest.main(verbosity=2)
