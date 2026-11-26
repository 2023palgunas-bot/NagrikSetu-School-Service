# NagrikSetu School Service – Project State

**Project Root:** `C:\Users\callm\Nagriksetu School Service`
**Last Inspected:** November 24, 2026
**Status:** Operational (Containers Healthy, Database Verified)

---

## 1. Project Architecture
- **Architecture Pattern:** Containerized Client-Server Web Application.
- **Frontend Layer:** Single Page Application (SPA) built with React 19 and Vite 8, served in production via Nginx (reverse-proxying static bundles).
- **Backend Layer:** RESTful API service built with FastAPI and Uvicorn.
- **Database Layer:** SQLite embedded database with persistent volume binding.
- **External Integration:** Decoupled NagrikSetu Employment Service running independently on port 8005.

---

## 2. Core Technologies
- **Backend:** Python 3.11+, FastAPI (0.128.8), Uvicorn (0.39.0), Pydantic (2.10.6), PyJWT, pwdlib[argon2], python-multipart.
- **Frontend:** React (19.3.1), Vite (8.3.4), React Router DOM (7.0.2), Oxlint (1.88.0), Nginx (1.31.10).
- **Deployment:** Docker & Docker Compose (`docker-compose.yml`).

---

## 3. Docker Containers & Port Mappings
| Container Name | Image / Build Context | Status | Host Port | Internal Port | Health / HTTP Status |
|---|---|---|---|---|---|
| `nagriksetu-backend` | `./backend` | Up | `8001` | `8000` | Healthy (`HTTP 200 /health`) |
| `nagriksetu-frontend` | `./frontend` | Up | `5173` | `80` | Healthy (`HTTP 200 /`) |

---

## 4. SQLite Database & Volume Mapping
- **Host Location:** `C:\Users\callm\Nagriksetu School Service\backend\data\nagriksetu.db` (Size: ~437 MB)
- **Container Path:** `/app/data/nagriksetu.db` (Environment: `DATABASE_PATH=/app/data/nagriksetu.db`)
- **Docker Mounts:**
  - `Source: ./backend` -> `Destination: /app` (rw)
  - `Source: ./backend/data` -> `Destination: /app/data` (rw)
- **Data Integrity:** Fully preserved. Contains 31 institutions and 30,003 enrolled student records across K-12, PU, and Higher Education.

---

## 5. Important API Entry Points
- **Health & Root:**
  - `GET /health` — Service health probe (`{"status": "healthy"}`)
  - `GET /` — Service summary (total schools, total students)
- **Authentication & Authorization:**
  - `POST /auth/login` — Password / JWT login (Role-based)
  - `POST /auth/register` — Citizen / parent self-registration
  - `POST /auth/otp/login`, `POST /auth/otp/send` — Mobile OTP authentication
  - `POST /auth/email/login`, `POST /auth/email/otp/send` — Email OTP authentication
  - `POST /auth/student/lookup`, `POST /auth/student/register` — Student profile activation
  - `GET /auth/me` — Current authenticated user profile
- **Public & Discovery:**
  - `GET /schools` — Paginated school listing
  - `GET /schools/{school_id}` — Detailed institutional profile
  - `GET /search-schools` — Keyword search
  - `GET /schools/{school_id}/programs` — Institutional academic programs
- **Parent Portal:**
  - `GET /parent/children` — Verified linked children
  - `POST /parent/lookup-student` — Centralised student discovery with masked contact number
  - `POST /parent/linking-otp/send` — Generate and dispatch OTP to student's registered contact number
  - `POST /parent/linking-otp/verify` — Verify registered contact OTP and atomically link child
  - `POST /parent/request-linking-code` — Parent-child link initiation (legacy institution-issued workflow)
  - `POST /parent/verify-and-link-child` — Verification & linking completion (legacy code workflow)
  - `GET /parent/children/{psid}/records` — Private academic records
  - `POST /requests/raise` — Submit record correction or service request
  - `GET /requests/my-requests` — Citizen tracking dashboard
- **Institution Administration Desk:**
  - `GET /institution/{id}/dashboard-overview` — Overview metrics & status
  - `GET /institution/{id}/students` — Filtered student directory
  - `GET /institution/{id}/students/{student_id}` — Complete student dossier (7 tabs)
  - `GET /institution/{id}/requests` — Pending data correction requests
  - `POST /institution/{id}/requests/{request_id}/execute-correction` — Apply audited record change
- **Admissions Management:**
  - `POST /admissions/apply` — Public application submission
  - `GET /school/admissions/applications` — School admission inbox
  - `POST /school/admissions/{id}/final-admission-confirm` — Admission finalization
- **AI & Notifications:**
  - `POST /ai/chat` — AI assistance question answering
  - `GET /notifications` — User notifications inbox

---

## 6. Main Application Modules
1. **Public Information & School Discovery:** Directory, search, academic hierarchy, course details.
2. **Unified Authentication & Security:** Multi-role RBAC (Parent, Student, Staff, Institution Admin, Central Admin), OTP/Email verification, Argon2 hashing.
3. **Citizen & Parent Portal:** Parent-child verification, dossier view, request/complaint submission and tracking.
4. **Institution Administrator Desk:** Institution-isolated student management, dossier editing with audit logging, attendance and results administration.
5. **Admissions Lifecycle System:** 2-stage admission workflows, seat allocation, document verification with OCR.
6. **Notification Engine & AI Assistant:** In-app notification center, SMS/Email provider integration, AI guidance widget.

---

## 7. Current Implementation Status
- **Phase 1 & Phase 2:** Completed and verified.
- **Academic Classification:** All 31 institutions configured with appropriate divisions (K-12 School, PU College, Higher Education).
- **Recent Fixes & Imports:**
  - Parent request visibility defect (`TRK-548751`) resolved: parent-submitted requests route cleanly into institution administrator desks with status synchronisation (Nov 23, 2026).
  - Parent contact number batch import from `Student_Register_Parent_Contacts_Updated.xlsx`: 30,003 records matched and updated in `students.contact_number` with pre-backup and integrity validation (Nov 24, 2026).
  - Secure parent-child linking with registered student contact OTP verification implemented and tested (14/14 automated tests passing). Closes unauthorized linking vulnerability while preserving all 30,003 student records and existing linking workflows (Nov 24, 2026).
  - Parent Child Academic & Attendance Records Modal Infinite Loading Defect resolved: Eliminated unindexed full table scan (180k rows) in `academic_results`, reducing query response from 45s+ to 0.13s; added 15s network timeout with AbortController, Retry recovery, and independent section resilience (Nov 24, 2026).
  - Platform Admin Dashboard Tabs Streamlined: Completely removed "Platform Overview", "Institution Management", and "Reports & Analytics" tabs, associated panels, and dead modals from `AdminDashboard.jsx`. Retained 6 active operational tabs (`admissions` [default], `activity-feed`, `audit-logs`, `staff-activity`, `academic-monitoring`, `requests`), verified production build, and confirmed backend APIs and database remain 100% intact (Nov 24, 2026).
  - Platform Admin Governance Dashboard & School Registration Approval Workflow Implemented: Resolved empty tab views by adding a Directorate Authentication Gate with direct single-click administrative sign-in (`admin.central@nagriksetu.gov`). Implemented complete public school registration gateway (`POST /institutions/apply`), Review Centre inside Platform Request Oversight, Application Dossier modal, all four administrative actions (Approve, Reject with mandatory remarks, Request Additional Info, Mark Under Review), and Notification Centre with persistent `portal_notifications` and live polling. Verified all 6 tabs with authentic database data (87 admissions, 739+ activities, 739+ audit logs, 35 staff roster, 73 academic events, 25 service requests) and all 13 automated tests passing. Preserved exact 30,003 student records and confirmed the 3 removed tabs remain completely absent (Nov 25, 2026).
  - Demo QR Payment & Automatic Student Enrollment Workflow Implemented: Built simulated UPI QR payment and institutional enrollment pipeline post-Stage 2 approval. Stage 2 approval updates status to `stage2_approved`, sets `payment_status = 'PENDING'` (₹1,200), sends notification to parent, and logs audit event. Parent Dashboard renders interactive Demo QR Code and modal with explicit `MARK AS PAID – DEMO` button. On payment confirmation, status transitions to `PAID_DEMO` with unique reference ID (`PAY-DEMO-2026-XXXX`). Final enrollment desk strictly validates `PAID_DEMO` before permitting seat assignment, atomically increments section strength, creates/links student in `students` with standardized ID (`SCH...`) and PSID (`NS-...`), links parent in `student_guardians`, and guarantees clean empty states for attendance and academic results. End-to-end verified across 18 test points with 30,003 baseline students completely preserved (Nov 25, 2026).
  - Stage 2 Payment Notification & Student ID Visibility Improvements Completed: Dispatches persistent notification titled "Payment QR has been sent to you!" with deep-link action upon Stage 2 approval. Renders prominent payment banner and "PROCEED TO PAYMENT" button on Parent Dashboard. Post-enrollment, displays dedicated "STUDENT ENROLLMENT DETAILS" card with Student Name, Permanent Student ID, Institutional Student ID (`SCH...`), School Name, Academic Year, Standard, Section, and status `ENROLLED`. Includes one-click "Copy Student ID" with visual feedback and "VIEW STUDENT ACADEMICS" button opening the authenticated child records modal with verified clean empty states. All 6 automated verification steps passing and 30,003 baseline student records 100% preserved (Nov 25, 2026).
  - Public Website Access & Smart Application Redirection Architecture Implemented: Public Home Page (`/`) established as universal default landing page without automatic role dashboard redirections. Full public browsing enabled for school directory, profiles, programs, contact, and AI assistance. Smart application journey continuation implemented via `applicationContinuation.js`: unauthenticated "Apply Now" captures institution and draft parameters, guides user through login/registration with continuation reassurance banners, and automatically returns directly to the selected institution's admission application (`/schools/:id?apply=true`), never dumping them into the generic Parent Dashboard. Direct logged-in parent applications preserved with duplicate submission prevention. Role-based dashboard protection and clean logout redirecting to `'/'` verified across 12 automated test cases with 30,003 baseline student records 100% preserved (Nov 25, 2026).
  - AI Assistance Bug Fix and UI Redesign Completed: Fixed root causes of the `[object Object]` error: (1) `POST /ai/chat` in FastAPI previously required `prompt: str` while frontend submitted `{ message, session_id }`, triggering HTTP 422 with an array of validation errors converted improperly to `[object Object]`; (2) connected the full 200-question `ai_engine.assistant_orchestrator` knowledge retrieval pipeline supporting multi-turn conversation memory, official Karnataka scholarship schemes (SSP Pre-Matric, Post-Matric, NMMS, Vidyasiri), RTE regulations, admissions requirements, and district discovery; (3) updated frontend error extraction to safely parse strings, arrays, or objects and added a friendly error banner with a functional Retry button. Completely redesigned both floating widget and full-page `/ai-assistance` interfaces: authoritative header ("NagrikSetu AI" / "Your Karnataka Education Assistant"), removed all noisy technical status lines ("Active Provider", "200 Questions Connected", "Verified DB Schema & RBAC Active"), added welcome state with 4 one-click suggested questions, rich markdown message formatting (tables, lists, bold, clickable `/schools/...` links), pulsing typing indicator, and modern rounded input bar. 100% verified across 11 test suites and 200 question bank evaluations; 30,003 student records and 35 institutions fully preserved (Nov 25, 2026).
  - Platform Admin Simplified to Two Core Responsibilities: Completely removed all unrelated administrative dashboards, menus, pages, and telemetry from the Platform Admin role (Admission monitoring, Platform Activity Feed, Audit Logs, Staff Activity, Academic Monitoring). Platform Admin interface now contains ONLY TWO main sections: (1) Institution Registration Approvals and (2) Institution Support Requests. Dashboard displays strictly 4 summary counts: Total Registered Institutions, Pending Registration Approvals, Total Support Requests, and Open Support Requests. Built dedicated `institution_support_requests` service supporting full institution-side "Support & Help Requests" submission, inspection, and clarification replies, and Platform Admin-side status updates (Submitted, Under Review, More Information Required, In Progress, Resolved, Rejected) with mandatory reasons, audit history, and in-portal notifications. Enforced strict RBAC data isolation between institutions. Fully verified across all 10 scenario suites with 100% pass rate; exact 30,003 student records and baseline institution accounts preserved (Nov 25, 2026).
  - Admission Payment, Student ID Generation & Class Enrolment Correction Completed: Enforced strict 10-step admission lifecycle across backend APIs and frontend dashboards. Seat allotment strictly requires verified payment (`payment_status == 'PAID_DEMO'`), rejecting unpaid applications with HTTP 400. Allotment generates canonical Student ID (`SCH...`) and PSID (`NS-...`), inserting persistent records in `students` and `student_guardians` with automated parent notifications. Class assignment enforces applied standard consistency (`target_std == applied_std`) and section capacity constraints, atomically updating `enrollments` ledger and activating the student record (`enrollment_status = 'active'`). Built 3-tab workflow in Admission Desk (`All Applications`, `Paid Admissions Awaiting Seat Allotment`, `Student ID & Class Assignment`) with live section capacity checks, and 10-step visual progress stepper on Parent Dashboard. End-to-end verified with 13/13 automated test scenarios passing; exact baseline student count (30,003 records) 100% preserved (Nov 25, 2026).
  - Institution isolation enforced on all request review endpoints.

---

## 8. Known Issues
- **Background Notification Polling:** Client polling to `/notifications/unread-count` returns 401 Unauthorized when browsing unauthenticated pages.
- **Legacy Script Hardcoded Paths:** Several standalone debug scripts in `backend/` contain obsolete paths (`C:/Users/callm/nagriksetu/...`) and should be run through Docker or updated when invoked.
- **Root Directory Cleanliness:** Numerous one-off CSV and test artifacts exist in the root folder; these must not be ingested into AI context.

---

## 9. Next Development Task
- Ready for next development directive from user (e.g., feature enhancements, additional admin workflow extensions, or UI refinements).
