/**
 * Authentication and Authorization Types for X-Ray Reporting App
 * Strictly separates:
 * 1. Auth User (Identity / Security Principal)
 * 2. Technician / Supervisor Profile (Business Identity in profiles)
 * 3. Role-Based Authorization (technician | supervisor)
 */

export type AppRole = 'technician' | 'supervisor';
export type AccountType = 'technician' | 'supervisor' | 'staff';

/**
 * Trusted Application User Profile stored in backend `profiles` table.
 */
export interface FirestoreUserProfile {
  uid: string;
  email: string;
  display_name: string;
  name?: string;
  technician_id?: number | null;
  role: AppRole;
  active: boolean;
  account_type?: AccountType;
  created_at: string;
  updated_at: string;
}

/**
 * Sanitized Firebase User Identity (Safe for client state)
 */
export interface ClientAuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  isAnonymous: boolean;
  providerId: string;
  accountType?: AccountType;
}

/**
 * Global App Authentication State
 */
export interface AuthState {
  user: ClientAuthUser | null;
  profile: FirestoreUserProfile | null;
  isAuthenticated: boolean;
  isAuthorized: boolean;
  role: AppRole | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Result Contract for Auth Operations
 */
export interface AuthOperationResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}
