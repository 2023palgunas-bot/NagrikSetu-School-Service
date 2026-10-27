
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from database import get_connection

app = FastAPI(
    title="NagrikSetu School Service",
    description="School discovery and student information service for ANVAYA.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {
        "service": "NagrikSetu School Service",
        "status": "running",
        "database": "SQLite",
        "total_schools": 10,
        "total_students": 6000,
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.get("/schools")
def list_schools(
    limit: int = Query(default=10, ge=1, le=100)
):
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT *
            FROM schools
            ORDER BY school_id
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


@app.get("/schools/{school_id}")
def get_school(school_id: str):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM schools WHERE school_id = ?",
            (school_id,),
        ).fetchone()

        if row is None:
            raise HTTPException(status_code=404, detail="School not found")

        return dict(row)
    finally:
        conn.close()


@app.get("/search-schools")
def search_schools(keyword: str = Query(min_length=1)):
    conn = get_connection()
    try:
        search_term = f"%{keyword}%"
        rows = conn.execute(
            """
            SELECT *
            FROM schools
            WHERE school_name LIKE ?
               OR district LIKE ?
               OR school_id LIKE ?
            ORDER BY school_id
            """,
            (search_term, search_term, search_term),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


@app.get("/schools/{school_id}/students")
def get_school_students(
    school_id: str,
    limit: int = Query(default=50, ge=1, le=100),
    standard: Optional[int] = Query(default=None, ge=1, le=10),
):
    conn = get_connection()
    try:
        school = conn.execute(
            "SELECT school_id FROM schools WHERE school_id = ?",
            (school_id,),
        ).fetchone()

        if school is None:
            raise HTTPException(status_code=404, detail="School not found")

        if standard is None:
            rows = conn.execute(
                """
                SELECT *
                FROM students
                WHERE school_id = ?
                ORDER BY standard, student_id
                LIMIT ?
                """,
                (school_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT *
                FROM students
                WHERE school_id = ? AND standard = ?
                ORDER BY student_id
                LIMIT ?
                """,
                (school_id, standard, limit),
            ).fetchall()

        return [dict(row) for row in rows]
    finally:
        conn.close()


@app.get("/students/{student_id}")
def get_student(student_id: str):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM students WHERE student_id = ?",
            (student_id,),
        ).fetchone()

        if row is None:
            raise HTTPException(status_code=404, detail="Student not found")

        return dict(row)
    finally:
        conn.close()
