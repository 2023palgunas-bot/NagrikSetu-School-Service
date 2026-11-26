import json
import sqlite3
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from auth import get_current_user, hash_password
from database import get_connection
from notification_service import dispatch_notification

router = APIRouter(prefix="", tags=["School Registration & Approval Workflow"])


# ==========================================
# AUTH DEPENDENCY
# ==========================================

def require_platform_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "platform_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform administrator access required.",
        )
    return user


# ==========================================
# AUDIT LOGGING HELPER
# ==========================================

def log_registration_audit(
    conn: sqlite3.Connection,
    event_type: str,
    institution_id: Optional[str],
    actor_user_id: Optional[str],
    actor_name: Optional[str],
    actor_role: Optional[str],
    entity_id: str,
    action: str,
    old_values: Optional[dict] = None,
    new_values: Optional[dict] = None,
    remarks: Optional[str] = None,
    request_id: Optional[str] = None
):
    try:
        conn.execute("""
            INSERT INTO platform_audit_logs (
                id, event_type, event_category, institution_id,
                actor_user_id, actor_name, actor_role,
                entity_type, entity_id, action,
                old_values, new_values, remarks, request_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        """, (
            f"EVT-REG-{uuid.uuid4().hex[:10].upper()}",
            event_type,
            "SCHOOL_REGISTRATION",
            institution_id,
            actor_user_id,
            actor_name or "System",
            actor_role or "system",
            "institution_application",
            entity_id,
            action,
            json.dumps(old_values) if old_values else None,
            json.dumps(new_values) if new_values else None,
            remarks,
            request_id or entity_id
        ))
    except Exception as e:
        print(f"Warning: Failed to log platform audit event: {e}")


# ==========================================
# PYDANTIC SCHEMAS
# ==========================================

class InstitutionApplicationPayload(BaseModel):
    institution_id: str = Field(..., min_length=2, max_length=32)
    institution_name: str = Field(..., min_length=3, max_length=255)
    institution_type: str = Field(..., min_length=2)
    institution_category: str = Field(..., min_length=2)
    established_year: Optional[int] = None
    affiliation: Optional[str] = "Karnataka State Board"
    recognition: Optional[str] = ""
    udise_code: Optional[str] = None
    management_type: Optional[str] = "Private Unaided"
    address_line1: str = Field(..., min_length=3)
    address_line2: Optional[str] = None
    city: str = Field(..., min_length=2)
    district: str = Field(..., min_length=2)
    state: Optional[str] = "Karnataka"
    pincode: str = Field(..., min_length=6, max_length=6)
    country: Optional[str] = "India"
    official_email: str = Field(...)
    official_phone: str = Field(...)
    website: Optional[str] = None
    academic_info_json: Optional[str] = "{}"
    applicant_name: str = Field(..., min_length=2)
    applicant_designation: Optional[str] = "Principal"
    applicant_email: str = Field(...)
    applicant_phone: str = Field(...)
    password: str = Field(..., min_length=6)
    principal_name: Optional[str] = None
    principal_phone: Optional[str] = None
    principal_email: Optional[str] = None
    student_strength: Optional[int] = 0
    staff_strength: Optional[int] = 0
    documents_json: Optional[str] = "[]"


class ApprovalPayload(BaseModel):
    remarks: Optional[str] = "Registration verified and approved by Central Directorate."


class RejectionPayload(BaseModel):
    remarks: str = Field(..., min_length=5, description="Mandatory detailed reason for rejection.")


class RequestInfoPayload(BaseModel):
    instructions: str = Field(..., min_length=5, description="Specific missing information or instructions required.")


class ResubmissionPayload(BaseModel):
    applicant_response: str = Field(..., min_length=5, description="Explanation or details of resubmitted information.")
    updated_documents: Optional[List[Dict[str, Any]]] = None
    updated_info: Optional[Dict[str, Any]] = None


# ==========================================
# PUBLIC ENDPOINTS: REGISTRATION & RESUBMISSION
# ==========================================

@router.post("/institutions/apply", status_code=status.HTTP_201_CREATED)
def apply_institution(payload: InstitutionApplicationPayload):
    """
    Submits a new institution registration application.
    Creates persistent record, assigns unique application ref, dispatches
    persistent Platform Admin notification, and creates audit log.
    """
    conn = get_connection()
    try:
        inst_id = payload.institution_id.strip().upper()
        inst_name = payload.institution_name.strip()

        # Check duplicate against existing activated schools
        existing_school = conn.execute(
            "SELECT school_id, school_name FROM schools WHERE school_id = ?", (inst_id,)
        ).fetchone()
        if existing_school:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"An institution with ID '{inst_id}' ({existing_school['school_name']}) is already registered and active."
            )

        # Check duplicate against pending or approved applications
        existing_app = conn.execute(
            "SELECT application_ref, status FROM institution_applications WHERE institution_id = ? AND status IN ('pending', 'under_review', 'approved')",
            (inst_id,)
        ).fetchone()
        if existing_app:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"An application for institution ID '{inst_id}' is already registered with status '{existing_app['status']}' ({existing_app['application_ref']})."
            )

        # Generate unique application ID and sequential reference
        app_id = str(uuid.uuid4())
        count_row = conn.execute("SELECT COUNT(*) FROM institution_applications").fetchone()
        next_seq = (count_row[0] if count_row else 0) + 1
        current_year = datetime.now().year
        app_ref = f"APP-INST-{current_year}-{next_seq:04d}"

        pwd_hash = hash_password(payload.password)
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        principal_name = payload.principal_name or payload.applicant_name
        principal_phone = payload.principal_phone or payload.applicant_phone
        principal_email = payload.principal_email or payload.applicant_email

        conn.execute("""
            INSERT INTO institution_applications (
                application_id, application_ref, institution_id, institution_name,
                institution_type, institution_category, established_year, affiliation,
                recognition, address_line1, address_line2, city, district, state,
                pincode, country, official_email, official_phone, website,
                academic_info_json, applicant_name, applicant_designation,
                applicant_email, applicant_phone, password_hash, status,
                udise_code, management_type, principal_name, principal_phone,
                principal_email, student_strength, staff_strength, documents_json,
                created_at, updated_at
            ) VALUES (
                ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?,
                ?, ?, ?, 'pending',
                ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?
            )
        """, (
            app_id, app_ref, inst_id, inst_name,
            payload.institution_type, payload.institution_category, payload.established_year, payload.affiliation,
            payload.recognition, payload.address_line1, payload.address_line2, payload.city, payload.district, payload.state or "Karnataka",
            payload.pincode, payload.country or "India", payload.official_email, payload.official_phone, payload.website,
            payload.academic_info_json or "{}", payload.applicant_name, payload.applicant_designation or "Principal",
            payload.applicant_email, payload.applicant_phone, pwd_hash,
            payload.udise_code, payload.management_type or "Private Unaided", principal_name, principal_phone,
            principal_email, payload.student_strength or 0, payload.staff_strength or 0, payload.documents_json or "[]",
            now_str, now_str
        ))

        # 1. Dispatch persistent notification for Platform Admin
        dispatch_notification(
            conn=conn,
            recipient_role="platform_admin",
            category="registration_request",
            title="New School Registration Request",
            message=f"New registration request {app_ref} submitted for {inst_name} ({inst_id}), {payload.district}. Status: PENDING_REVIEW.",
            action_url=f"/admin?tab=requests&app_ref={app_ref}",
            priority="high",
            related_record_type="institution_application",
            related_record_id=app_id,
            idempotency_key=f"notif-app-submit-{app_id}"
        )

        # 2. Immutable audit log
        log_registration_audit(
            conn=conn,
            event_type="SCHOOL_REGISTRATION_SUBMITTED",
            institution_id=inst_id,
            actor_user_id=None,
            actor_name=payload.applicant_name,
            actor_role="applicant",
            entity_id=app_id,
            action=f"Registration application {app_ref} submitted for {inst_name}",
            new_values={
                "application_ref": app_ref,
                "institution_id": inst_id,
                "institution_name": inst_name,
                "district": payload.district,
                "status": "pending"
            },
            remarks="Application submitted via Public Institution Registration Gateway"
        )

        conn.commit()

        return {
            "status": "success",
            "message": "Registration application successfully submitted. Your application is now pending Platform Admin review.",
            "application_id": app_id,
            "application_ref": app_ref,
            "institution_id": inst_id,
            "institution_name": inst_name,
            "registration_status": "PENDING_REVIEW",
            "submitted_at": now_str
        }
    finally:
        conn.close()


@router.post("/institutions/applications/{id_or_ref}/resubmit")
def resubmit_additional_information(id_or_ref: str, payload: ResubmissionPayload):
    """
    Allows applicant institution to resubmit requested missing information or documents.
    Updates application and moves it back to PENDING_REVIEW queue.
    """
    conn = get_connection()
    try:
        app = conn.execute(
            "SELECT * FROM institution_applications WHERE application_id = ? OR application_ref = ?",
            (id_or_ref, id_or_ref)
        ).fetchone()

        if not app:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Registration application '{id_or_ref}' was not found."
            )

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Update documents if provided
        docs_json = app["documents_json"] or "[]"
        if payload.updated_documents:
            try:
                curr_docs = json.loads(docs_json)
                curr_docs.extend(payload.updated_documents)
                docs_json = json.dumps(curr_docs)
            except Exception:
                docs_json = json.dumps(payload.updated_documents)

        conn.execute("""
            UPDATE institution_applications
            SET status = 'pending',
                applicant_response = ?,
                resubmitted_at = ?,
                documents_json = ?,
                updated_at = ?
            WHERE application_id = ?
        """, (
            payload.applicant_response.strip(),
            now_str,
            docs_json,
            now_str,
            app["application_id"]
        ))

        # Notify Platform Admin
        dispatch_notification(
            conn=conn,
            recipient_role="platform_admin",
            category="registration_resubmitted",
            title="School Registration Resubmitted",
            message=f"Additional information resubmitted for {app['institution_name']} ({app['application_ref']}). Returned to review queue.",
            action_url=f"/admin?tab=requests&app_ref={app['application_ref']}",
            priority="normal",
            related_record_type="institution_application",
            related_record_id=app["application_id"],
            idempotency_key=f"notif-app-resubmit-{app['application_id']}-{int(datetime.now().timestamp())}"
        )

        # Audit log
        log_registration_audit(
            conn=conn,
            event_type="SCHOOL_REGISTRATION_RESUBMITTED",
            institution_id=app["institution_id"],
            actor_user_id=None,
            actor_name=app["applicant_name"],
            actor_role="applicant",
            entity_id=app["application_id"],
            action=f"Additional information resubmitted for {app['application_ref']}",
            old_values={"status": app["status"]},
            new_values={"status": "pending", "applicant_response": payload.applicant_response},
            remarks=payload.applicant_response
        )

        conn.commit()

        return {
            "status": "success",
            "message": "Additional information successfully submitted. The application has returned to the Platform Admin review queue.",
            "application_ref": app["application_ref"],
            "registration_status": "PENDING_REVIEW",
            "resubmitted_at": now_str
        }
    finally:
        conn.close()


# ==========================================
# PLATFORM ADMIN ENDPOINTS: REVIEW & APPROVALS
# ==========================================

@router.get("/admin/institutions/applications")
def list_institution_applications(
    status_filter: Optional[str] = Query(default="all", alias="status"),
    search: Optional[str] = Query(default=None),
    category: Optional[str] = Query(default=None),
    district: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: dict = Depends(require_platform_admin)
):
    """
    Returns filtered school registration applications with status counts and search support.
    """
    conn = get_connection()
    try:
        # Calculate status breakdown
        stats = {
            "pending": 0,
            "under_review": 0,
            "additional_info_required": 0,
            "approved": 0,
            "rejected": 0,
            "total": 0,
            "pending_approval_count": 0
        }

        counts = conn.execute("""
            SELECT status, COUNT(*) as c
            FROM institution_applications
            GROUP BY status
        """).fetchall()

        for row in counts:
            st = row["status"].lower()
            c = row["c"]
            stats["total"] += c
            if st in stats:
                stats[st] = c

        stats["pending_approval_count"] = stats["pending"] + stats["under_review"]

        where_clauses = ["1=1"]
        params = []

        if status_filter and status_filter.lower() != "all":
            sf = status_filter.lower()
            if sf in ("pending", "under_review", "additional_info_required", "approved", "rejected"):
                where_clauses.append("LOWER(status) = ?")
                params.append(sf)

        if category and category.lower() != "all":
            where_clauses.append("institution_category = ?")
            params.append(category)

        if district and district.lower() != "all":
            where_clauses.append("district = ?")
            params.append(district)

        if search and search.strip():
            term = f"%{search.strip().lower()}%"
            where_clauses.append("""
                (LOWER(institution_name) LIKE ?
                 OR LOWER(application_ref) LIKE ?
                 OR LOWER(institution_id) LIKE ?
                 OR LOWER(district) LIKE ?
                 OR LOWER(COALESCE(udise_code, '')) LIKE ?
                 OR LOWER(applicant_name) LIKE ?)
            """)
            params.extend([term, term, term, term, term, term])

        where_sql = " AND ".join(where_clauses)

        total_row = conn.execute(
            f"SELECT COUNT(*) FROM institution_applications WHERE {where_sql}",
            tuple(params)
        ).fetchone()
        total_matching = total_row[0] if total_row else 0

        rows = conn.execute(f"""
            SELECT application_id, application_ref, institution_id, institution_name,
                   institution_type, institution_category, established_year, affiliation,
                   recognition, address_line1, address_line2, city, district, state,
                   pincode, country, official_email, official_phone, website,
                   applicant_name, applicant_designation, applicant_email, applicant_phone,
                   status, review_comments, reviewed_by, reviewed_at,
                   udise_code, management_type, principal_name, principal_phone,
                   principal_email, student_strength, staff_strength,
                   assigned_to, assigned_at, applicant_response, resubmitted_at,
                   created_at, updated_at
            FROM institution_applications
            WHERE {where_sql}
            ORDER BY
                CASE status
                    WHEN 'pending' THEN 1
                    WHEN 'under_review' THEN 2
                    WHEN 'additional_info_required' THEN 3
                    ELSE 4
                END,
                created_at DESC
            LIMIT ? OFFSET ?
        """, tuple(params + [limit, offset])).fetchall()

        items = [dict(r) for r in rows]

        return {
            "items": items,
            "total": total_matching,
            "stats": stats,
            "pending_count": stats["pending_approval_count"],
            "limit": limit,
            "offset": offset
        }
    finally:
        conn.close()


@router.get("/admin/institutions/applications/{id_or_ref}")
def get_institution_application_dossier(
    id_or_ref: str,
    user: dict = Depends(require_platform_admin)
):
    """
    Returns complete application dossier including applicant details, management,
    affiliation, infrastructure, student/staff metrics, and full audit trail.
    """
    conn = get_connection()
    try:
        row = conn.execute("""
            SELECT * FROM institution_applications
            WHERE application_id = ? OR application_ref = ?
        """, (id_or_ref, id_or_ref)).fetchone()

        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Registration application '{id_or_ref}' was not found."
            )

        app_data = dict(row)
        # Redact password hash
        if "password_hash" in app_data:
            del app_data["password_hash"]

        # Parse academic info
        try:
            app_data["academic_info"] = json.loads(app_data.get("academic_info_json") or "{}")
        except Exception:
            app_data["academic_info"] = {}

        # Parse documents
        try:
            app_data["documents"] = json.loads(app_data.get("documents_json") or "[]")
        except Exception:
            app_data["documents"] = []

        # Fetch reviewer name if reviewed
        if app_data.get("reviewed_by"):
            rev = conn.execute(
                "SELECT full_name, email FROM users WHERE user_id = ?",
                (app_data["reviewed_by"],)
            ).fetchone()
            if rev:
                app_data["reviewer_name"] = rev["full_name"] or rev["email"]

        # Fetch assigned reviewer name if assigned
        if app_data.get("assigned_to"):
            assigned = conn.execute(
                "SELECT full_name, email FROM users WHERE user_id = ?",
                (app_data["assigned_to"],)
            ).fetchone()
            if assigned:
                app_data["assigned_to_name"] = assigned["full_name"] or assigned["email"]

        # Fetch audit history
        audit_rows = conn.execute("""
            SELECT id, event_type, actor_name, actor_role, action, remarks, created_at
            FROM platform_audit_logs
            WHERE entity_id = ? OR request_id = ? OR institution_id = ?
            ORDER BY created_at DESC
            LIMIT 30
        """, (app_data["application_id"], app_data["application_ref"], app_data["institution_id"])).fetchall()

        app_data["audit_history"] = [dict(a) for a in audit_rows]

        return app_data
    finally:
        conn.close()


@router.post("/admin/institutions/applications/{application_id}/under-review")
def mark_application_under_review(
    application_id: str,
    user: dict = Depends(require_platform_admin)
):
    """
    Marks application as UNDER_REVIEW, assigning it to the reviewing Platform Admin.
    """
    conn = get_connection()
    try:
        app = conn.execute(
            "SELECT * FROM institution_applications WHERE application_id = ?",
            (application_id,)
        ).fetchone()

        if not app:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Application '{application_id}' not found."
            )

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        reviewer_name = user.get("full_name") or user.get("email") or "Platform Administrator"

        conn.execute("""
            UPDATE institution_applications
            SET status = 'under_review',
                assigned_to = ?,
                assigned_at = ?,
                updated_at = ?
            WHERE application_id = ?
        """, (user["user_id"], now_str, now_str, application_id))

        log_registration_audit(
            conn=conn,
            event_type="SCHOOL_REGISTRATION_ASSIGNED",
            institution_id=app["institution_id"],
            actor_user_id=user["user_id"],
            actor_name=reviewer_name,
            actor_role="platform_admin",
            entity_id=application_id,
            action=f"Application marked UNDER_REVIEW by {reviewer_name}",
            old_values={"status": app["status"], "assigned_to": app["assigned_to"]},
            new_values={"status": "under_review", "assigned_to": user["user_id"]},
            remarks="Reviewer assigned to application dossier."
        )

        conn.commit()
        return {
            "status": "success",
            "message": f"Application {app['application_ref']} marked Under Review and assigned to {reviewer_name}.",
            "registration_status": "UNDER_REVIEW",
            "assigned_to": user["user_id"],
            "assigned_at": now_str
        }
    finally:
        conn.close()


@router.post("/admin/institutions/applications/{application_id}/request-info")
def request_additional_information(
    application_id: str,
    payload: RequestInfoPayload,
    user: dict = Depends(require_platform_admin)
):
    """
    Sets application status to ADDITIONAL_INFORMATION_REQUIRED, recording instructions
    and notifying applicant school.
    """
    conn = get_connection()
    try:
        app = conn.execute(
            "SELECT * FROM institution_applications WHERE application_id = ?",
            (application_id,)
        ).fetchone()

        if not app:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Application '{application_id}' not found."
            )

        instructions = payload.instructions.strip()
        if not instructions:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Specific missing information instructions are required."
            )

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        reviewer_name = user.get("full_name") or user.get("email") or "Platform Administrator"

        conn.execute("""
            UPDATE institution_applications
            SET status = 'additional_info_required',
                review_comments = ?,
                reviewed_by = ?,
                reviewed_at = ?,
                updated_at = ?
            WHERE application_id = ?
        """, (instructions, user["user_id"], now_str, now_str, application_id))

        # Notify applicant school
        dispatch_notification(
            conn=conn,
            recipient_role="school_admin",
            institution_id=app["institution_id"],
            category="registration_clarification",
            title="Additional Information Required for School Registration",
            message=f"The Directorate requires additional clarification or documents for {app['institution_name']}: {instructions}",
            action_url="/apply-institution",
            priority="urgent",
            related_record_type="institution_application",
            related_record_id=application_id,
            idempotency_key=f"notif-app-reqinfo-{application_id}-{int(datetime.now().timestamp())}"
        )

        # Audit log
        log_registration_audit(
            conn=conn,
            event_type="SCHOOL_REGISTRATION_INFO_REQUESTED",
            institution_id=app["institution_id"],
            actor_user_id=user["user_id"],
            actor_name=reviewer_name,
            actor_role="platform_admin",
            entity_id=application_id,
            action=f"Additional information requested for {app['application_ref']}",
            old_values={"status": app["status"]},
            new_values={"status": "additional_info_required", "instructions": instructions},
            remarks=instructions
        )

        conn.commit()
        return {
            "status": "success",
            "message": "Additional information requested. Applicant has been notified.",
            "registration_status": "ADDITIONAL_INFORMATION_REQUIRED",
            "review_comments": instructions,
            "reviewed_at": now_str
        }
    finally:
        conn.close()


@router.post("/admin/institutions/applications/{application_id}/approve")
def approve_institution_application(
    application_id: str,
    payload: ApprovalPayload,
    user: dict = Depends(require_platform_admin)
):
    """
    Approves institution registration application.
    Activates institution in `schools` according to lifecycle rules.
    Prevents duplicate institution creation.
    Creates or activates administrator account.
    Records immutable audit log and dispatches notifications.
    """
    conn = get_connection()
    try:
        app = conn.execute(
            "SELECT * FROM institution_applications WHERE application_id = ?",
            (application_id,)
        ).fetchone()

        if not app:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Application '{application_id}' not found."
            )

        if app["status"] == "approved":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Application '{app['application_ref']}' has already been approved."
            )

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        reviewer_name = user.get("full_name") or user.get("email") or "Platform Administrator"
        inst_id = app["institution_id"]

        # 1. Activate in `schools` table (prevent duplicate creation)
        existing_school = conn.execute(
            "SELECT school_id FROM schools WHERE school_id = ?", (inst_id,)
        ).fetchone()

        if not existing_school:
            conn.execute("""
                INSERT INTO schools (
                    school_id, school_name, district, state, category, school_type, address,
                    email, public_phone, established_year, affiliation, recognition
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?
                )
            """, (
                inst_id,
                app["institution_name"],
                app["district"],
                app["state"] or "Karnataka",
                app["institution_category"],
                app["institution_type"],
                app["address_line1"],
                app["official_email"],
                app["official_phone"],
                app["established_year"],
                app["affiliation"],
                app["recognition"]
            ))

        # 2. Create or activate School Administrator user account
        applicant_email = app["applicant_email"].strip().lower()
        applicant_phone = app["applicant_phone"].strip() if app["applicant_phone"] else None

        existing_user = conn.execute(
            "SELECT user_id, role, school_id, phone FROM users WHERE LOWER(email) = ? OR (phone IS NOT NULL AND phone = ?)",
            (applicant_email, applicant_phone)
        ).fetchone()

        admin_user_id = None
        if not existing_user:
            admin_user_id = str(uuid.uuid4())
            phone_taken = None
            if applicant_phone:
                phone_taken = conn.execute("SELECT user_id FROM users WHERE phone = ?", (applicant_phone,)).fetchone()
            user_phone = None if phone_taken else applicant_phone

            conn.execute("""
                INSERT INTO users (
                    user_id, email, phone, password_hash, role, school_id,
                    is_active, full_name, status, is_email_verified, created_at
                ) VALUES (
                    ?, ?, ?, ?, 'school_admin', ?,
                    1, ?, 'active', 1, ?
                )
            """, (
                admin_user_id,
                applicant_email,
                user_phone,
                app["password_hash"],
                inst_id,
                app["applicant_name"],
                now_str
            ))
        else:
            admin_user_id = existing_user["user_id"]
            conn.execute("""
                UPDATE users
                SET is_active = 1, status = 'active', school_id = ?, role = 'school_admin'
                WHERE user_id = ?
            """, (inst_id, admin_user_id))

        # 3. Ensure role mapping exists in `user_institution_roles`
        existing_mapping = conn.execute("""
            SELECT id FROM user_institution_roles
            WHERE user_id = ? AND institution_id = ?
        """, (admin_user_id, inst_id)).fetchone()

        if not existing_mapping:
            conn.execute("""
                INSERT INTO user_institution_roles (
                    id, user_id, institution_id, role_id, status, created_at
                ) VALUES (
                    ?, ?, ?, 'school_admin', 'active', ?
                )
            """, (str(uuid.uuid4()), admin_user_id, inst_id, now_str))
        else:
            conn.execute("""
                UPDATE user_institution_roles
                SET status = 'active'
                WHERE user_id = ? AND institution_id = ?
            """, (admin_user_id, inst_id))

        # 4. Update application status
        remarks_text = payload.remarks or "Registration verified and approved by Central Directorate."
        conn.execute("""
            UPDATE institution_applications
            SET status = 'approved',
                review_comments = ?,
                reviewed_by = ?,
                reviewed_at = ?,
                updated_at = ?
            WHERE application_id = ?
        """, (remarks_text, user["user_id"], now_str, now_str, application_id))

        # 5. Dispatch notification to applicant school
        dispatch_notification(
            conn=conn,
            recipient_user_id=admin_user_id,
            recipient_role="school_admin",
            institution_id=inst_id,
            category="registration_approved",
            title="School Registration Approved",
            message=f"Registration application {app['application_ref']} for {app['institution_name']} ({inst_id}) has been approved by Central Directorate. Your institution portal is now active.",
            action_url="/login?category=admin",
            priority="high",
            related_record_type="institution_application",
            related_record_id=application_id,
            idempotency_key=f"notif-app-approved-{application_id}"
        )

        # 6. Dispatch notification to Platform Admin
        dispatch_notification(
            conn=conn,
            recipient_role="platform_admin",
            category="registration_approved",
            title="Institution Registration Approved",
            message=f"Application {app['application_ref']} for {app['institution_name']} ({inst_id}) was approved by {reviewer_name}. Institution activated.",
            action_url=f"/admin?tab=requests&app_ref={app['application_ref']}",
            priority="normal",
            related_record_type="institution_application",
            related_record_id=application_id,
            idempotency_key=f"notif-admin-approved-{application_id}"
        )

        # 7. Immutable audit log
        log_registration_audit(
            conn=conn,
            event_type="SCHOOL_REGISTRATION_APPROVED",
            institution_id=inst_id,
            actor_user_id=user["user_id"],
            actor_name=reviewer_name,
            actor_role="platform_admin",
            entity_id=application_id,
            action=f"Registration {app['application_ref']} approved. Institution {inst_id} activated.",
            old_values={"status": app["status"]},
            new_values={
                "status": "approved",
                "institution_id": inst_id,
                "institution_name": app["institution_name"],
                "admin_user_id": admin_user_id
            },
            remarks=remarks_text
        )

        conn.commit()

        return {
            "status": "success",
            "message": f"Registration {app['application_ref']} successfully approved. Institution '{app['institution_name']}' ({inst_id}) has been activated.",
            "registration_status": "APPROVED",
            "institution_id": inst_id,
            "reviewed_by": user["user_id"],
            "reviewed_at": now_str
        }
    finally:
        conn.close()


@router.post("/admin/institutions/applications/{application_id}/reject")
def reject_institution_application(
    application_id: str,
    payload: RejectionPayload,
    user: dict = Depends(require_platform_admin)
):
    """
    Rejects institution registration application with mandatory remarks.
    Dispatches notification to applicant school and logs immutable audit.
    """
    conn = get_connection()
    try:
        app = conn.execute(
            "SELECT * FROM institution_applications WHERE application_id = ?",
            (application_id,)
        ).fetchone()

        if not app:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Application '{application_id}' not found."
            )

        remarks_text = payload.remarks.strip()
        if not remarks_text:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Mandatory rejection remarks/reason must be provided."
            )

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        reviewer_name = user.get("full_name") or user.get("email") or "Platform Administrator"

        conn.execute("""
            UPDATE institution_applications
            SET status = 'rejected',
                review_comments = ?,
                reviewed_by = ?,
                reviewed_at = ?,
                updated_at = ?
            WHERE application_id = ?
        """, (remarks_text, user["user_id"], now_str, now_str, application_id))

        # Notify applicant school
        dispatch_notification(
            conn=conn,
            recipient_role="school_admin",
            institution_id=app["institution_id"],
            category="registration_rejected",
            title="School Registration Application Declined",
            message=f"Your registration application {app['application_ref']} for {app['institution_name']} was declined. Reason: {remarks_text}",
            action_url="/apply-institution",
            priority="high",
            related_record_type="institution_application",
            related_record_id=application_id,
            idempotency_key=f"notif-app-reject-{application_id}"
        )

        # Notify Platform Admin
        dispatch_notification(
            conn=conn,
            recipient_role="platform_admin",
            category="registration_rejected",
            title="Institution Registration Rejected",
            message=f"Application {app['application_ref']} for {app['institution_name']} was rejected by {reviewer_name}. Reason: {remarks_text}",
            action_url=f"/admin?tab=requests&app_ref={app['application_ref']}",
            priority="normal",
            related_record_type="institution_application",
            related_record_id=application_id,
            idempotency_key=f"notif-admin-reject-{application_id}"
        )

        # Audit log
        log_registration_audit(
            conn=conn,
            event_type="SCHOOL_REGISTRATION_REJECTED",
            institution_id=app["institution_id"],
            actor_user_id=user["user_id"],
            actor_name=reviewer_name,
            actor_role="platform_admin",
            entity_id=application_id,
            action=f"Registration {app['application_ref']} rejected by {reviewer_name}",
            old_values={"status": app["status"]},
            new_values={"status": "rejected", "remarks": remarks_text},
            remarks=remarks_text
        )

        conn.commit()

        return {
            "status": "success",
            "message": f"Registration application {app['application_ref']} has been rejected.",
            "registration_status": "REJECTED",
            "remarks": remarks_text,
            "reviewed_at": now_str
        }
    finally:
        conn.close()


@router.get("/admin/notifications/registrations")
def get_registration_notifications(
    limit: int = Query(default=20, ge=1, le=100),
    user: dict = Depends(require_platform_admin)
):
    """
    Returns registration-specific notifications for Platform Admin with pending count.
    """
    conn = get_connection()
    try:
        rows = conn.execute("""
            SELECT notification_id, title, message, action_url, is_read, created_at,
                   priority, category, related_record_id
            FROM portal_notifications
            WHERE category IN ('registration_request', 'registration_approved', 'registration_rejected', 'registration_resubmitted', 'registration_clarification')
               OR message LIKE '%registration%'
            ORDER BY created_at DESC
            LIMIT ?
        """, (limit,)).fetchall()

        unread_count_row = conn.execute("""
            SELECT COUNT(*) FROM portal_notifications
            WHERE is_read = 0
              AND (category IN ('registration_request', 'registration_approved', 'registration_rejected', 'registration_resubmitted', 'registration_clarification')
                   OR message LIKE '%registration%')
        """).fetchone()

        pending_apps_row = conn.execute("""
            SELECT COUNT(*) FROM institution_applications
            WHERE status IN ('pending', 'under_review')
        """).fetchone()

        return {
            "notifications": [dict(r) for r in rows],
            "unread_count": unread_count_row[0] if unread_count_row else 0,
            "pending_approval_count": pending_apps_row[0] if pending_apps_row else 0
        }
    finally:
        conn.close()
