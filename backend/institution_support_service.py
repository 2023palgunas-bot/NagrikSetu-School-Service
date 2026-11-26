"""
NagrikSetu School Service - Institution Support & Technical Assistance Service
Handles support and help requests submitted by registered schools and educational institutions,
and Platform Admin support request management, status workflow, and communication.
"""

import json
import sqlite3
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from auth import get_current_user
from database import get_connection
from notification_service import dispatch_notification

router = APIRouter(prefix="", tags=["Institution Support Requests"])

VALID_SUPPORT_STATUSES = [
    "Submitted",
    "Under Review",
    "More Information Required",
    "In Progress",
    "Resolved",
    "Rejected",
]

VALID_SUPPORT_CATEGORIES = [
    "Website / Portal Not Working",
    "Frontend Errors & Broken Pages",
    "Login & Authentication Issues",
    "Institution Information Correction",
    "Student Records & Enrollment Issue",
    "General Technical Assistance",
    "Other",
]


# ==========================================
# DATABASE INITIALIZATION
# ==========================================

def init_institution_support_db():
    conn = get_connection()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS institution_support_requests (
                request_id TEXT PRIMARY KEY,
                ticket_number TEXT UNIQUE NOT NULL,
                institution_id TEXT NOT NULL,
                institution_name TEXT NOT NULL,
                requester_user_id TEXT NOT NULL,
                requester_name TEXT,
                requester_email TEXT,
                category TEXT NOT NULL,
                subject TEXT NOT NULL,
                description TEXT NOT NULL,
                attachment_data TEXT,
                attachment_name TEXT,
                status TEXT NOT NULL DEFAULT 'Submitted',
                priority TEXT DEFAULT 'Medium',
                admin_response TEXT,
                admin_user_id TEXT,
                admin_name TEXT,
                responded_at TEXT,
                history_json TEXT DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                resolved_at TEXT,
                FOREIGN KEY (institution_id) REFERENCES schools(school_id)
            );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sup_inst ON institution_support_requests(institution_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sup_status ON institution_support_requests(status);")
        conn.commit()
    finally:
        conn.close()


# ==========================================
# AUTH DEPENDENCIES
# ==========================================

def require_platform_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "platform_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform administrator access required.",
        )
    return user


def require_institution_actor(user: dict = Depends(get_current_user)) -> dict:
    allowed_roles = ("institution_admin", "school_admin", "school_staff")
    if user.get("role") not in allowed_roles and user.get("role") != "platform_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Institution administrator or authorized staff access required.",
        )
    return user


# ==========================================
# PYDANTIC SCHEMAS
# ==========================================

class CreateSupportRequestPayload(BaseModel):
    category: str = Field(..., min_length=2, max_length=100)
    subject: str = Field(..., min_length=3, max_length=255)
    description: str = Field(..., min_length=5)
    institution_id: Optional[str] = None
    priority: Optional[str] = "Medium"
    attachment_data: Optional[str] = None
    attachment_name: Optional[str] = None


class UpdateSupportStatusPayload(BaseModel):
    status: str = Field(..., description="Target status: Submitted, Under Review, More Information Required, In Progress, Resolved, Rejected")
    admin_response: Optional[str] = None


class InstitutionReplyPayload(BaseModel):
    response: str = Field(..., min_length=2, description="Institution's response or clarification")
    attachment_data: Optional[str] = None
    attachment_name: Optional[str] = None


# ==========================================
# INSTITUTION-SIDE ENDPOINTS
# ==========================================

@router.post("/institution/support-requests", status_code=status.HTTP_201_CREATED)
def submit_institution_support_request(
    payload: CreateSupportRequestPayload,
    user: dict = Depends(require_institution_actor)
):
    """
    Submits a technical support or assistance request on behalf of an institution.
    Automatically captures institution ID, institution name, and requester details.
    """
    conn = get_connection()
    try:
        # Determine institution ID
        inst_id = user.get("school_id") or payload.institution_id
        if not inst_id:
            # Try to lookup from user_institution_roles
            role_row = conn.execute(
                "SELECT institution_id FROM user_institution_roles WHERE user_id = ? LIMIT 1",
                (user["user_id"],)
            ).fetchone()
            if role_row and role_row["institution_id"]:
                inst_id = role_row["institution_id"]

        if not inst_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No assigned institution associated with this account. Please specify institution_id."
            )

        # Lookup institution name
        school_row = conn.execute(
            "SELECT school_name FROM schools WHERE school_id = ?",
            (inst_id,)
        ).fetchone()
        inst_name = school_row["school_name"] if school_row else inst_id

        # Generate unique ticket number
        now = datetime.now()
        now_str = now.strftime("%Y-%m-%d %H:%M:%S")
        req_id = f"SUP-{uuid.uuid4().hex[:10].upper()}"
        ticket_number = f"SUP-{now.year}-{uuid.uuid4().hex[:6].upper()}"

        requester_name = user.get("full_name") or user.get("email") or "Institution Administrator"
        requester_email = user.get("email") or ""

        initial_history = [{
            "status": "Submitted",
            "timestamp": now_str,
            "actor": requester_name,
            "role": user.get("role", "institution_admin"),
            "remarks": "Support request submitted by institution."
        }]

        conn.execute("""
            INSERT INTO institution_support_requests (
                request_id, ticket_number, institution_id, institution_name,
                requester_user_id, requester_name, requester_email,
                category, subject, description,
                attachment_data, attachment_name,
                status, priority,
                history_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Submitted', ?, ?, ?, ?)
        """, (
            req_id, ticket_number, inst_id, inst_name,
            user["user_id"], requester_name, requester_email,
            payload.category, payload.subject.strip(), payload.description.strip(),
            payload.attachment_data, payload.attachment_name,
            payload.priority or "Medium",
            json.dumps(initial_history), now_str, now_str
        ))

        # Notify Platform Admin
        try:
            dispatch_notification(
                conn=conn,
                recipient_user_id=None,
                institution_id=None,
                template_code="INSTITUTION_SUPPORT_REQUEST_SUBMITTED",
                channels=["in_app"],
                title=f"New Support Request from {inst_name}",
                message=f"Ticket {ticket_number}: {payload.subject} ({payload.category})",
                priority="normal",
                related_record_type="support_request",
                related_record_id=req_id
            )
        except Exception as notif_err:
            print(f"Warning: Failed to dispatch admin notification: {notif_err}")

        conn.commit()

        row = conn.execute("SELECT * FROM institution_support_requests WHERE request_id = ?", (req_id,)).fetchone()
        row_dict = dict(row)
        try:
            row_dict["history"] = json.loads(row_dict.get("history_json") or "[]")
        except Exception:
            row_dict["history"] = []
        return row_dict
    finally:
        conn.close()


@router.get("/institution/support-requests")
def list_institution_support_requests(
    status_filter: Optional[str] = Query(default="all", alias="status"),
    category: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    institution_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: dict = Depends(require_institution_actor)
):
    """
    Lists support requests belonging strictly to the caller's institution.
    Enforces RBAC data isolation.
    """
    conn = get_connection()
    try:
        inst_id = user.get("school_id") or institution_id
        if not inst_id:
            role_row = conn.execute(
                "SELECT institution_id FROM user_institution_roles WHERE user_id = ? LIMIT 1",
                (user["user_id"],)
            ).fetchone()
            if role_row:
                inst_id = role_row["institution_id"]

        # If platform admin without school_id passes institution_id, allow
        if not inst_id and user.get("role") == "platform_admin" and institution_id:
            inst_id = institution_id

        if not inst_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Institution ID required."
            )

        where = ["institution_id = ?"]
        params = [inst_id]

        if status_filter and status_filter.lower() != "all":
            where.append("LOWER(status) = ?")
            params.append(status_filter.lower())

        if category and category.lower() != "all":
            where.append("category = ?")
            params.append(category)

        if search and search.strip():
            s = f"%{search.strip().lower()}%"
            where.append("(LOWER(subject) LIKE ? OR LOWER(ticket_number) LIKE ? OR LOWER(description) LIKE ?)")
            params.extend([s, s, s])

        where_sql = " AND ".join(where)

        total = conn.execute(f"SELECT COUNT(*) FROM institution_support_requests WHERE {where_sql}", params).fetchone()[0]
        open_count = conn.execute(
            "SELECT COUNT(*) FROM institution_support_requests WHERE institution_id = ? AND LOWER(status) NOT IN ('resolved', 'rejected')",
            (inst_id,)
        ).fetchone()[0]

        rows = conn.execute(
            f"""
            SELECT * FROM institution_support_requests
            WHERE {where_sql}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset]
        ).fetchall()

        items = []
        for r in rows:
            d = dict(r)
            try:
                d["history"] = json.loads(d.get("history_json") or "[]")
            except Exception:
                d["history"] = []
            items.append(d)

        return {
            "items": items,
            "total": total,
            "open_count": open_count,
            "institution_id": inst_id
        }
    finally:
        conn.close()


@router.get("/institution/support-requests/{request_id}")
def get_institution_support_request(
    request_id: str,
    user: dict = Depends(require_institution_actor)
):
    """
    Returns single support request details, strictly ensuring institution isolation.
    """
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM institution_support_requests WHERE request_id = ? OR ticket_number = ?",
            (request_id, request_id)
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Support request not found.")

        # RBAC Check
        if user.get("role") != "platform_admin":
            inst_id = user.get("school_id")
            if not inst_id:
                role_row = conn.execute(
                    "SELECT institution_id FROM user_institution_roles WHERE user_id = ? LIMIT 1",
                    (user["user_id"],)
                ).fetchone()
                if role_row:
                    inst_id = role_row["institution_id"]

            if row["institution_id"] != inst_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied. You do not have permission to view support requests of another institution."
                )

        d = dict(row)
        try:
            d["history"] = json.loads(d.get("history_json") or "[]")
        except Exception:
            d["history"] = []
        return d
    finally:
        conn.close()


@router.post("/institution/support-requests/{request_id}/respond")
def respond_to_support_request(
    request_id: str,
    payload: InstitutionReplyPayload,
    user: dict = Depends(require_institution_actor)
):
    """
    Allows the institution to reply to the Platform Admin or submit requested additional information.
    """
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM institution_support_requests WHERE request_id = ? OR ticket_number = ?",
            (request_id, request_id)
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Support request not found.")

        # RBAC Check
        if user.get("role") != "platform_admin":
            inst_id = user.get("school_id")
            if not inst_id:
                role_row = conn.execute(
                    "SELECT institution_id FROM user_institution_roles WHERE user_id = ? LIMIT 1",
                    (user["user_id"],)
                ).fetchone()
                if role_row:
                    inst_id = role_row["institution_id"]

            if row["institution_id"] != inst_id:
                raise HTTPException(status_code=403, detail="Access denied.")

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        try:
            history = json.loads(row["history_json"] or "[]")
        except Exception:
            history = []

        actor_name = user.get("full_name") or user.get("email") or "Institution Administrator"
        history.append({
            "status": "Under Review",
            "timestamp": now_str,
            "actor": actor_name,
            "role": user.get("role", "institution_admin"),
            "remarks": f"Institution Response: {payload.response.strip()}"
        })

        # Update status back to Under Review
        conn.execute("""
            UPDATE institution_support_requests
            SET status = 'Under Review',
                history_json = ?,
                updated_at = ?
            WHERE request_id = ?
        """, (json.dumps(history), now_str, row["request_id"]))

        # Notify Platform Admin
        try:
            dispatch_notification(
                conn=conn,
                recipient_user_id=None,
                institution_id=None,
                template_code="INSTITUTION_SUPPORT_REPLY",
                channels=["in_app"],
                title=f"Response Received for {row['ticket_number']}",
                message=f"{row['institution_name']} provided clarification on '{row['subject']}': {payload.response.strip()[:100]}",
                priority="normal",
                related_record_type="support_request",
                related_record_id=row["request_id"]
            )
        except Exception as e:
            print(f"Warning: Failed to dispatch notification: {e}")

        conn.commit()

        updated_row = conn.execute("SELECT * FROM institution_support_requests WHERE request_id = ?", (row["request_id"],)).fetchone()
        d = dict(updated_row)
        try:
            d["history"] = json.loads(d.get("history_json") or "[]")
        except Exception:
            d["history"] = []
        return d
    finally:
        conn.close()


# ==========================================
# PLATFORM ADMIN ENDPOINTS
# ==========================================

@router.get("/admin/support-requests")
def list_admin_support_requests(
    status_filter: Optional[str] = Query(default="all", alias="status"),
    institution_id: Optional[str] = Query(default=None),
    category: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: dict = Depends(require_platform_admin)
):
    """
    Platform Admin view: lists support requests across all educational institutions with filters.
    """
    conn = get_connection()
    try:
        where = ["1=1"]
        params = []

        if status_filter and status_filter.lower() != "all":
            where.append("LOWER(status) = ?")
            params.append(status_filter.lower())

        if institution_id and institution_id.lower() != "all":
            where.append("institution_id = ?")
            params.append(institution_id)

        if category and category.lower() != "all":
            where.append("category = ?")
            params.append(category)

        if search and search.strip():
            s = f"%{search.strip().lower()}%"
            where.append("(LOWER(subject) LIKE ? OR LOWER(ticket_number) LIKE ? OR LOWER(institution_name) LIKE ? OR LOWER(institution_id) LIKE ? OR LOWER(description) LIKE ?)")
            params.extend([s, s, s, s, s])

        where_sql = " AND ".join(where)

        total = conn.execute(f"SELECT COUNT(*) FROM institution_support_requests WHERE {where_sql}", params).fetchone()[0]

        # Detailed stats breakdown for platform admin
        stats = {
            "submitted": 0,
            "under_review": 0,
            "more_info": 0,
            "in_progress": 0,
            "resolved": 0,
            "rejected": 0,
            "total": 0,
            "open_count": 0
        }
        status_counts = conn.execute("""
            SELECT status, COUNT(*) as c
            FROM institution_support_requests
            GROUP BY status
        """).fetchall()

        for sc in status_counts:
            st = sc["status"]
            c = sc["c"]
            stats["total"] += c
            if st == "Submitted": stats["submitted"] = c
            elif st == "Under Review": stats["under_review"] = c
            elif st == "More Information Required": stats["more_info"] = c
            elif st == "In Progress": stats["in_progress"] = c
            elif st == "Resolved": stats["resolved"] = c
            elif st == "Rejected": stats["rejected"] = c

        stats["open_count"] = stats["submitted"] + stats["under_review"] + stats["more_info"] + stats["in_progress"]

        rows = conn.execute(
            f"""
            SELECT * FROM institution_support_requests
            WHERE {where_sql}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset]
        ).fetchall()

        items = []
        for r in rows:
            d = dict(r)
            try:
                d["history"] = json.loads(d.get("history_json") or "[]")
            except Exception:
                d["history"] = []
            items.append(d)

        return {
            "items": items,
            "total": total,
            "stats": stats
        }
    finally:
        conn.close()


@router.get("/admin/support-requests/{request_id}")
def get_admin_support_request(
    request_id: str,
    user: dict = Depends(require_platform_admin)
):
    """
    Platform Admin view of a single institution support request with history.
    """
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM institution_support_requests WHERE request_id = ? OR ticket_number = ?",
            (request_id, request_id)
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Support request not found.")

        d = dict(row)
        try:
            d["history"] = json.loads(d.get("history_json") or "[]")
        except Exception:
            d["history"] = []
        return d
    finally:
        conn.close()


@router.post("/admin/support-requests/{request_id}/update-status")
def update_admin_support_status(
    request_id: str,
    payload: UpdateSupportStatusPayload,
    user: dict = Depends(require_platform_admin)
):
    """
    Platform Admin updates status of a support request and adds an administrative response / request for info.
    Statuses allowed: Submitted, Under Review, More Information Required, In Progress, Resolved, Rejected.
    Dispatches in-portal notification to the institution and preserves audit history.
    """
    target_status = payload.status.strip()
    if target_status not in VALID_SUPPORT_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status '{target_status}'. Must be one of: {', '.join(VALID_SUPPORT_STATUSES)}"
        )

    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM institution_support_requests WHERE request_id = ? OR ticket_number = ?",
            (request_id, request_id)
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Support request not found.")

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        admin_name = user.get("full_name") or "Platform Administrator"
        admin_response_text = (payload.admin_response or "").strip()

        try:
            history = json.loads(row["history_json"] or "[]")
        except Exception:
            history = []

        history_remarks = admin_response_text or f"Status changed to {target_status} by Platform Admin."
        history.append({
            "status": target_status,
            "timestamp": now_str,
            "actor": admin_name,
            "role": "platform_admin",
            "remarks": history_remarks
        })

        resolved_at = now_str if target_status in ("Resolved", "Rejected") else row["resolved_at"]

        conn.execute("""
            UPDATE institution_support_requests
            SET status = ?,
                admin_response = ?,
                admin_user_id = ?,
                admin_name = ?,
                responded_at = ?,
                resolved_at = ?,
                history_json = ?,
                updated_at = ?
            WHERE request_id = ?
        """, (
            target_status,
            admin_response_text or row["admin_response"],
            user["user_id"],
            admin_name,
            now_str,
            resolved_at,
            json.dumps(history),
            now_str,
            row["request_id"]
        ))

        # Dispatch In-Portal Notification to Institution
        notif_title = f"Support Ticket Update: {row['ticket_number']}"
        notif_msg = f"Your support ticket '{row['subject']}' status is now '{target_status}'."
        if admin_response_text:
            notif_msg += f" Response: {admin_response_text[:120]}"

        try:
            dispatch_notification(
                conn=conn,
                recipient_user_id=row["requester_user_id"],
                institution_id=row["institution_id"],
                template_code=f"SUPPORT_REQUEST_{target_status.upper().replace(' ', '_')}",
                channels=["in_app"],
                title=notif_title,
                message=notif_msg,
                priority="high" if target_status in ("More Information Required", "Resolved") else "normal",
                related_record_type="support_request",
                related_record_id=row["request_id"]
            )
        except Exception as notif_err:
            print(f"Warning: Failed to dispatch institution notification: {notif_err}")

        conn.commit()

        updated_row = conn.execute("SELECT * FROM institution_support_requests WHERE request_id = ?", (row["request_id"],)).fetchone()
        d = dict(updated_row)
        try:
            d["history"] = json.loads(d.get("history_json") or "[]")
        except Exception:
            d["history"] = []
        return d
    finally:
        conn.close()


# ==========================================
# PLATFORM ADMIN DASHBOARD SUMMARY COUNTS
# ==========================================

@router.get("/admin/platform-overview-counts")
def get_platform_overview_counts(user: dict = Depends(require_platform_admin)):
    """
    Returns the exact 4 summary counts required for the simplified Platform Admin dashboard:
    1. Total Registered Institutions
    2. Pending Registration Approvals
    3. Total Support Requests
    4. Open Support Requests
    """
    conn = get_connection()
    try:
        # 1. Total Registered Institutions
        total_schools = conn.execute("SELECT COUNT(*) FROM schools").fetchone()[0]

        # 2. Pending Registration Approvals
        pending_registrations = conn.execute("""
            SELECT COUNT(*) FROM institution_applications
            WHERE LOWER(status) IN ('pending', 'under_review', 'resubmitted', 'additional_info_required')
        """).fetchone()[0]

        # 3. Total Support Requests
        total_support = conn.execute("SELECT COUNT(*) FROM institution_support_requests").fetchone()[0]

        # 4. Open Support Requests
        open_support = conn.execute("""
            SELECT COUNT(*) FROM institution_support_requests
            WHERE LOWER(status) NOT IN ('resolved', 'rejected')
        """).fetchone()[0]

        return {
            "total_registered_institutions": total_schools,
            "pending_registration_approvals": pending_registrations,
            "total_support_requests": total_support,
            "open_support_requests": open_support
        }
    finally:
        conn.close()
