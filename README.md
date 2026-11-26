# NagrikSetu School Service

**Unified Karnataka State Educational Gateway, Admissions Lifecycle & Institutional Governance Platform**

[![Docker Compose](https://img.shields.io/badge/Docker%20Compose-Ready-blue.svg)](docker-compose.yml)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg)](https://fastapi.tiangolo.com/)
[![SQLite](https://img.shields.io/badge/Database-SQLite-003B57.svg)](https://www.sqlite.org/)
[![React 19](https://img.shields.io/badge/Frontend-React%2019-61DAFB.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Bundler-Vite%208-646CFF.svg)](https://vitejs.dev/)
[![Nginx](https://img.shields.io/badge/Reverse%20Proxy-Nginx-009639.svg)](https://nginx.org/)

---

## 1. Overview

**NagrikSetu School Service** is a state-level citizen and educational administration platform built for the Karnataka Department of Education. It unifies academic governance, school discovery, student admission workflows, student record management, and citizen services across three institutional tiers:
1. **K-12 Primary & Secondary Schools** (Standards 1 to 10)
2. **Pre-University (PU) Colleges** (PUC I & PUC II across Science, Commerce, and Arts)
3. **Higher Education Institutions & Universities** (Undergraduate & Postgraduate Degree Programs)

---

## 2. Key Architecture & Features

### Public Discovery & Citizen Access
- **Universal Default Landing:** Public home page (`/`) accessible without mandatory authentication.
- **Directory & Search:** Multi-faceted search across 31 institutions by district, taluk, board affiliation, and medium of instruction.
- **Smart Application Continuation:** Unauthenticated visitors clicking "Apply Now" are guided through seamless citizen login/registration with continuation reassurance banners, automatically returning directly to the selected institution's admission form (`/schools/:id?apply=true`).

### 10-Stage Admissions & Payment Lifecycle
1. **Stage 1 Submission:** Applicant details and basic preferences submitted by parent.
2. **Stage 1 Approval:** Institutional review and provisional eligibility clearance.
3. **Stage 2 Detailed Submission:** Upload of required verification documents and certificates.
4. **Stage 2 Verification:** Detailed document verification and approval by school administration.
5. **Fee Payment Notice:** Persistent notification dispatched with admission fee instructions.
6. **Simulated Payment Gate:** Parent completes payment confirmation (`PAID_DEMO`).
7. **Seat Allotment Gate:** Backend strictly enforces verified payment prior to seat allotment.
8. **Canonical ID Generation:** School Admin allots seat, generating the permanent state identifier (`NS-...`) and the institution-scoped Student ID (`SCH...`).
9. **Class & Section Assignment:** Admin assigns standard and section with strict standard consistency and live section capacity validation.
10. **Official Enrolment:** Student profile activated in class lists, academic ledgers, and attendance registers.

### Parent & Student Portal
- **Secure Parent-Child Linking:** Verification via OTP dispatched to student's registered contact number, preventing unauthorized access.
- **Student Academic Dossier:** 7-tab student record view (Profile, Academics, Attendance, Documents, Examinations, Guardian Links, and Status History).
- **Service & Correction Requests:** Formal channel for parents to request record corrections or technical assistance with status tracking.

### Institution & Platform Governance
- **Institution Admin Desk:** Student directory, section capacity management, admissions review, and data correction processing.
- **Platform Admin Module:** Focused governance covering (1) School Registration Approvals and (2) Institution Technical Support Requests with audit logging.
- **NagrikSetu AI Assistant:** Contextual bilingual guidance answering 200+ Karnataka education queries (scholarships, RTE, admissions, curriculum).

---

## 3. Technology Stack & Dependencies

- **Backend Framework:** Python 3.11+, FastAPI (0.128.8), Uvicorn (0.39.0), Pydantic (2.10.6).
- **Security & Cryptography:** PyJWT, pwdlib[argon2], python-multipart.
- **Database Engine:** SQLite 3.x (ACID-compliant embedded database with persistent volume binding).
- **Frontend Framework:** React 19.3.1, Vite 8.3.4, React Router DOM 7.0.2, Modern CSS.
- **Containerization & Deployment:** Docker 24.0+, Docker Compose 2.20+, Nginx 1.31 reverse proxy.

---

## 4. Database Architecture & SQLite Configuration

The application is engineered natively around **SQLite**:
- **Host Location:** `backend/data/nagriksetu.db`
- **Container Mount:** `/app/data/nagriksetu.db` (bound via Docker volume `./backend/data:/app/data`)
- **Persistence:** All institutional records, admissions, audit logs, and student ledgers persist directly in the SQLite database file across container restarts and image rebuilds.
- **Auto-Initialization:** On backend startup, `database.py` validates database connectivity and creates all required tables, triggers, and indices if they do not exist.
- **ACID Integrity:** Uses WAL (Write-Ahead Logging) and atomic transaction boundaries for data consistency during concurrent parent/admin requests.

---

## 5. Environment Variables & Configuration

The application is configured through environment variables. A template is provided in `backend/.env.example`:

| Variable | Description | Default / Example |
|---|---|---|
| `DATABASE_PATH` | Path to the SQLite database file | `/app/data/nagriksetu.db` |
| `JWT_SECRET_KEY` | Cryptographic secret for signing JWT access tokens | *Secure random string* |
| `OTP_SALT` | Salt for secure one-way hashing of verification OTPs | `nagriksetu_secure_otp_salt_v1` |
| `OTP_PROVIDER` | SMS gateway provider (`mock`, `otpdev`, `msg91`) | `mock` (development mode) |
| `SMS_PROVIDER` | SMS dispatch provider mode | `mock` |
| `OTPDEV_API_KEY` | API key for OTP.dev gateway (when provider is `otpdev`) | *Optional* |
| `OTPDEV_SENDER_ID` | Approved Sender UUID for OTP.dev | *Optional* |
| `OTPDEV_SMS_TEMPLATE_ID` | Approved DLT template UUID | *Optional* |
| `EMAIL_PROVIDER` | Email delivery service (`smtp`, `mock`) | `smtp` |
| `SMTP_HOST` | Outgoing SMTP server hostname | `smtp.karnataka.gov.in` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USERNAME` | SMTP authentication username | `noreply@nagriksetu.karnataka.gov.in` |
| `SMTP_PASSWORD` | SMTP authentication password | *Configured credential* |
| `SMTP_FROM_EMAIL` | Sender email address | `noreply@nagriksetu.karnataka.gov.in` |
| `SMTP_FROM_NAME` | Sender display name | `NagrikSetu` |
| `GOOGLE_CLIENT_ID` | Google Identity Services OAuth Client ID | *Optional Google Client ID* |

---

## 6. Repository Structure

```text
NagrikSetu-School-Service/
├── backend/
│   ├── ai_engine/               # AI Educational Assistant knowledge & orchestrator
│   ├── migrations/              # Database schema migrations & structure scripts
│   ├── auth.py                  # JWT, Argon2, and RBAC authentication guards
│   ├── database.py              # SQLite connection and schema management
│   ├── main.py                  # FastAPI application routes & endpoints
│   ├── requirements.txt         # Python dependencies
│   ├── Dockerfile               # Backend container specification
│   ├── .env.example             # Backend environment template
│   └── test_*_suite.py          # Automated verification test suites
├── frontend/
│   ├── src/
│   │   ├── components/          # React components (admissions, academic, ui, ai)
│   │   ├── pages/               # Role-based pages (admin, parent, public, staff)
│   │   ├── utils/               # API clients, authentication, and continuation
│   │   ├── App.jsx              # Application router and layout hierarchy
│   │   └── main.jsx             # React entry point
│   ├── nginx.conf               # Production Nginx reverse-proxy configuration
│   ├── package.json             # NPM dependencies
│   ├── vite.config.js           # Vite build configuration
│   └── Dockerfile               # Multi-stage frontend container build
├── deploy/
│   ├── env/                     # Staging & production environment templates
│   └── nginx/                   # Environment-specific reverse proxy configs
├── docs/
│   ├── ARCHITECTURE.md          # Comprehensive architectural documentation
│   ├── PROJECT_STATUS.md        # Technical ledger of features and milestones
│   └── master_plan.md           # Implementation blueprint and phases
├── docker-compose.yml           # Local multi-container orchestration
├── docker-compose.prod.yml      # Production container deployment
├── docker-compose.staging.yml   # Staging container deployment
├── PROJECT_STATE.md             # Current project state and verified metrics
└── README.md                    # Project documentation
```

---

## 7. Getting Started

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) (24.0+)
- [Docker Compose](https://docs.docker.com/compose/) (2.20+)

### Running Locally with Docker Compose

1. **Clone the repository:**
   ```bash
   git clone https://github.com/2023palgunas-bot/NagrikSetu-School-Service.git
   cd NagrikSetu-School-Service
   ```

2. **Configure environment:**
   ```bash
   cp backend/.env.example backend/.env
   ```

3. **Build and launch the containers:**
   ```bash
   docker compose up --build -d
   ```

4. **Verify container status:**
   ```bash
   docker compose ps
   ```

5. **Access the application:**
   - **Frontend Web Portal:** [http://localhost:5173](http://localhost:5173)
   - **Backend API & Swagger Docs:** [http://localhost:8001/docs](http://localhost:8001/docs)
   - **Health Probe:** [http://localhost:8001/health](http://localhost:8001/health)

---

## 8. Running Automated Verification Tests

### Admission Lifecycle & Payment Verification Suite
Executes all 13 scenarios covering Stage 1/2 review, payment prerequisites, seat allotment, canonical ID generation, and section capacity checks:
```bash
docker exec nagriksetu-backend python /app/test_admission_payment_enrolment_suite.py
```

### Parent Registered Contact OTP Linking Suite
Executes 14 end-to-end security test cases verifying OTP delivery, verification, and parent-child association:
```bash
docker exec nagriksetu-backend python /app/test_parent_registered_contact_otp_linking.py
```

### Platform Admin Governance Suite
Verifies Platform Admin two core responsibilities (School Registration Approvals and Institution Support Requests):
```bash
python backend/test_platform_admin_two_responsibilities_suite.py
```

---

## 9. License & Attribution

Developed for the **Government of Karnataka – Department of School Education and Literacy**.
Proprietary & Confidential demonstration system. All demo student datasets are synthetic.
