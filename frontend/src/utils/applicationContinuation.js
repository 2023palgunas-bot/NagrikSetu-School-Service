/**
 * applicationContinuation.js — Smart Application Journey Preservation
 *
 * Safely stores, retrieves, and clears pending admission application progress
 * when an unauthenticated visitor clicks "Apply Now" and must authenticate first.
 *
 * Privacy & Security Guarantees:
 * - Stores only non-sensitive institution selection & academic choice metadata.
 * - Never stores passwords, tokens, pins, or sensitive PII.
 * - Stored in sessionStorage; clears automatically when browser session/tab ends.
 */

const PENDING_APP_KEY = 'nagriksetu_pending_admission_application'

/**
 * Capture and store pending application context before redirecting to login/register.
 */
export function savePendingApplication(data) {
  if (!data || !data.institutionId) return
  const payload = {
    institutionId: data.institutionId,
    institutionName: data.institutionName || '',
    educationLevel: data.educationLevel || '',
    standardApplied: data.standardApplied || '',
    selectedProgramId: data.selectedProgramId || '',
    puStream: data.puStream || '',
    puCombination: data.puCombination || '',
    firstLanguage: data.firstLanguage || 'Kannada',
    currentStep: data.currentStep || 1,
    applicantName: data.applicantName || '',
    returnUrl: data.returnUrl || `/schools/${data.institutionId}?apply=true`,
    savedAt: Date.now()
  }
  try {
    sessionStorage.setItem(PENDING_APP_KEY, JSON.stringify(payload))
  } catch (err) {
    console.error('Failed to save pending application in sessionStorage:', err)
  }
}

/**
 * Retrieve saved pending application context.
 * Automatically discards entries older than 2 hours.
 */
export function getPendingApplication() {
  try {
    const raw = sessionStorage.getItem(PENDING_APP_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Expire if older than 2 hours
    if (Date.now() - (parsed.savedAt || 0) > 2 * 60 * 60 * 1000) {
      clearPendingApplication()
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/**
 * Clear pending application from sessionStorage after successful submission or cancellation.
 */
export function clearPendingApplication() {
  try {
    sessionStorage.removeItem(PENDING_APP_KEY)
  } catch (err) {
    console.error('Failed to clear pending application from sessionStorage:', err)
  }
}

/**
 * Quick check if a pending application is currently staged.
 */
export function hasPendingApplication() {
  return getPendingApplication() !== null
}
