import React from 'react'
import HomePage from '../../pages/public/HomePage.jsx'

/**
 * LandingRoute renders the public Home Page as the primary landing page
 * for ALL visitors, regardless of authentication state or role.
 *
 * Strict Compliance:
 * - New visitors -> Public Home Page.
 * - Registered users -> Public Home Page.
 * - Logged-in parents -> Public Home Page.
 * - Logged-in institution administrators -> Public Home Page.
 * - Logged-in platform administrators -> Public Home Page.
 *
 * An existing auth token or active session NEVER automatically redirects
 * a visitor from '/' to '/parent', '/institution-admin', or '/admin'.
 * Users access their role dashboards explicitly via the header navigation
 * ("My Dashboard" / "Dashboard").
 */
export default function LandingRoute() {
  return <HomePage />
}
