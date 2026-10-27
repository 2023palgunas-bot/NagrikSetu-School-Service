
import os
import sqlite3

DATABASE_NAME = os.getenv(
    "DATABASE_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "nagriksetu.db"),
)


def get_connection():
    connection = sqlite3.connect(DATABASE_NAME)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def create_tables():
    database_directory = os.path.dirname(
        os.path.abspath(DATABASE_NAME)
    )
    os.makedirs(database_directory, exist_ok=True)

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS schools (
            school_id TEXT PRIMARY KEY,
            school_name TEXT NOT NULL,
            district TEXT NOT NULL,
            state TEXT NOT NULL,
            school_type TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS students (
            student_id TEXT PRIMARY KEY,
            student_name TEXT NOT NULL,
            school_id TEXT NOT NULL,
            standard INTEGER NOT NULL,
            section TEXT NOT NULL,
            age INTEGER NOT NULL,
            FOREIGN KEY (school_id)
                REFERENCES schools(school_id)
        )
    """)

    connection.commit()
    connection.close()


if __name__ == "__main__":
    create_tables()
    print("NagrikSetu database tables created successfully.")
