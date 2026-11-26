import urllib.request
import urllib.parse
import json

BASE_URL = "http://localhost:8001"

def login(email, password, institution_id=None):
    data = urllib.parse.urlencode({
        "username": email,
        "password": password
    }).encode("utf-8")
    query = f"?institution_id={institution_id}" if institution_id else ""
    req = urllib.request.Request(
        f"{BASE_URL}/auth/login{query}",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST"
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode("utf-8"))

def api_call(path, method="GET", data=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(f"{BASE_URL}{path}", data=body, headers=headers, method=method)
    with urllib.request.urlopen(req) as res:
        status_code = res.status
        content = res.read().decode("utf-8")
        return status_code, json.loads(content) if content else {}

print("=== 1. Login as Platform Admin ===")
res = login("admin.central@nagriksetu.gov", "Central@NagrikSetu2026!")
admin_token = res["access_token"]
print("Platform Admin Token acquired OK")

print("\n=== 2. Test /admin/platform-overview-counts ===")
status, counts = api_call("/admin/platform-overview-counts", token=admin_token)
assert status == 200
print("Counts:", counts)
assert "total_registered_institutions" in counts
assert "pending_registration_approvals" in counts
assert "total_support_requests" in counts
assert "open_support_requests" in counts

print("\n=== 3. Submit Support Request as SCH001 ===")
status, req_res = api_call("/institution/support-requests", method="POST", data={
    "institution_id": "SCH001",
    "category": "Frontend Errors & Broken Pages",
    "subject": "Portal Loading Error in Student Marks Page",
    "description": "When clicking student marks modal, it was showing loading for 3 seconds before displaying.",
    "priority": "High"
}, token=admin_token)
print("Create Request Status:", status)
print("Created Ticket Number:", req_res.get("ticket_number"))
req_id = req_res["request_id"]
assert req_res["status"] == "Submitted"

print("\n=== 4. List Institution Support Requests ===")
status, inst_list = api_call("/institution/support-requests?institution_id=SCH001", token=admin_token)
assert status == 200
print(f"Institution requests count: {inst_list['total']}")
assert inst_list["total"] >= 1

print("\n=== 5. Platform Admin List Support Requests ===")
status, admin_list = api_call("/admin/support-requests", token=admin_token)
assert status == 200
print(f"Admin support requests count: {admin_list['total']}")
print(f"Stats: {admin_list['stats']}")
assert admin_list["total"] >= 1

print("\n=== 6. Platform Admin Update Status to 'Under Review' ===")
status, upd_res = api_call(f"/admin/support-requests/{req_id}/update-status", method="POST", data={
    "status": "Under Review",
    "admin_response": "We are inspecting the frontend logs."
}, token=admin_token)
assert status == 200
assert upd_res["status"] == "Under Review"
print("Status updated to Under Review OK")

print("\n=== 7. Platform Admin Update Status to 'More Information Required' ===")
status, upd_res2 = api_call(f"/admin/support-requests/{req_id}/update-status", method="POST", data={
    "status": "More Information Required",
    "admin_response": "Please specify the exact standard and section affected."
}, token=admin_token)
assert status == 200
assert upd_res2["status"] == "More Information Required"
print("Status updated to More Information Required OK")

print("\n=== 8. Institution Responds / Clarifies ===")
status, reply_res = api_call(f"/institution/support-requests/{req_id}/respond", method="POST", data={
    "response": "This was observed in Standard 10-A."
}, token=admin_token)
assert status == 200
assert reply_res["status"] == "Under Review"
print("Institution responded; status moved back to Under Review OK")

print("\n=== 9. Platform Admin Resolves Request ===")
status, final_res = api_call(f"/admin/support-requests/{req_id}/update-status", method="POST", data={
    "status": "Resolved",
    "admin_response": "The marks query index has been verified and latency is now 0.05s."
}, token=admin_token)
assert status == 200
assert final_res["status"] == "Resolved"
print("Support request successfully Resolved OK")

print("\n=== 10. Verify Overview Counts Updated ===")
status, counts_after = api_call("/admin/platform-overview-counts", token=admin_token)
print("Updated Counts:", counts_after)
assert counts_after["total_support_requests"] >= 1

print("\nALL BACKEND SUPPORT REQUEST WORKFLOW CHECKS PASSED (100%)!")
