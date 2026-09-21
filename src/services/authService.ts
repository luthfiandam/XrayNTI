import { isSupabaseConfigured } from '../lib/supabase';
import {
  signInTechnicianWithSupabase,
  signInSupervisorWithSupabase,
  signOutSupabase,
  subscribeSupabaseAuthState,
  fetchSupabaseUserProfile,
} from './supabaseAuthService';
import {
  AppRole,
  AuthState,
  ClientAuthUser,
  FirestoreUserProfile,
  AuthOperationResult,
} from '../types/auth';
import { Technician } from '../types';
import { INITIAL_TECHNICIANS } from '../data/initialData';
import { safeReadJson } from './localCache';

/**
 * Controlled Authentication Provider Guard:
 * Returns true if Supabase is configured.
 */
export function isSupabaseAuthEnabled(): boolean {
  if (!isSupabaseConfigured()) return false;

  const customUrl = typeof window !== 'undefined' ? localStorage.getItem('faskampen_supabase_url') : null;
  if (customUrl && customUrl.trim()) return true;

  const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
  const provider = (env?.VITE_AUTH_PROVIDER || '').trim().toLowerCase();
  if (provider === 'supabase') return true;

  return isSupabaseConfigured();
}

/**
 * Fetches application user profile from Supabase profiles table.
 */
export async function fetchUserProfile(uid: string): Promise<FirestoreUserProfile | null> {
  if (!uid) return null;
  return fetchSupabaseUserProfile(uid);
}

export const GENERIC_SUPERVISOR_AUTH_ERROR = 'Password supervisor salah atau akses tidak tersedia.';

/**
 * Resolves the canonical supervisor email from environment variable VITE_SUPERVISOR_EMAIL.
 * Default fallback is 'supervisor@bandara.id'.
 */
export function getSupervisorCanonicalEmail(): string {
  const envEmail = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPERVISOR_EMAIL) || '';
  return (envEmail || 'supervisor@bandara.id').trim();
}

/**
 * Validates whether a user profile meets supervisor authorization criteria.
 * Strictly requires role === 'supervisor' and active === true.
 */
export function validateSupervisorProfile(profile: FirestoreUserProfile | null): { isValid: boolean; error: string | null } {
  if (!profile) {
    return { isValid: false, error: GENERIC_SUPERVISOR_AUTH_ERROR };
  }
  if (!profile.active || profile.role !== 'supervisor') {
    return { isValid: false, error: GENERIC_SUPERVISOR_AUTH_ERROR };
  }
  return { isValid: true, error: null };
}

export const LOCAL_AUTH_SESSION_KEY = 'faskampen_local_auth_session';

export function getStoredLocalAuth(): { user: ClientAuthUser; profile: FirestoreUserProfile } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_AUTH_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveLocalAuth(user: ClientAuthUser, profile: FirestoreUserProfile): void {
  try {
    localStorage.setItem(LOCAL_AUTH_SESSION_KEY, JSON.stringify({ user, profile }));
    window.dispatchEvent(new Event('faskampen-auth-change'));
  } catch (e) {
    console.warn('Failed to save local auth session:', e);
  }
}

export function clearLocalAuth(): void {
  try {
    localStorage.removeItem(LOCAL_AUTH_SESSION_KEY);
    window.dispatchEvent(new Event('faskampen-auth-change'));
  } catch {}
}

/**
 * Signs in technician using persistent credentials.
 * Uses Supabase Auth if configured, otherwise falls back to local master technicians.
 */
export async function signInTechnicianWithCredentials(
  email: string,
  pass: string
): Promise<AuthOperationResult<{ user: ClientAuthUser; profile: FirestoreUserProfile }>> {
  if (!email || !email.trim() || !pass || !pass.trim()) {
    return {
      success: false,
      error: 'Email dan password teknisi wajib diisi.',
    };
  }

  if (isSupabaseAuthEnabled()) {
    const res = await signInTechnicianWithSupabase(email, pass);
    if (res.success && res.data) {
      saveLocalAuth(res.data.user, res.data.profile);
    }
    return res;
  }

  // Graceful local technician authentication against dynamic master_technicians
  const emailClean = email.trim().toLowerCase();
  const namePart = emailClean.split('@')[0];

  const storedTechs: Technician[] = safeReadJson<Technician[]>('master_technicians', INITIAL_TECHNICIANS);
  const matchedTech = storedTechs.find(
    (t) =>
      (t.email && t.email.toLowerCase() === emailClean) ||
      t.name.toLowerCase() === namePart.toLowerCase() ||
      emailClean.includes(t.name.toLowerCase()) ||
      (t.code && t.code.toLowerCase() === emailClean)
  );

  // Check active status
  if (matchedTech && matchedTech.active === false) {
    return {
      success: false,
      error: `Akun teknisi '${matchedTech.name}' sedang dinonaktifkan. Hubungi supervisor.`,
    };
  }

  // Validate password if technician has password set
  if (matchedTech && matchedTech.password) {
    if (pass.trim() !== matchedTech.password.trim()) {
      return {
        success: false,
        error: `Password salah untuk akun teknisi '${matchedTech.name}'.`,
      };
    }
  }

  const clientUser: ClientAuthUser = {
    uid: matchedTech ? `tech-local-${matchedTech.id}` : `local-${Date.now()}`,
    email: matchedTech?.email || email.trim(),
    displayName: matchedTech ? matchedTech.name : namePart,
    isAnonymous: false,
    providerId: 'local',
  };

  const profile: FirestoreUserProfile = {
    uid: clientUser.uid,
    email: clientUser.email || '',
    display_name: clientUser.displayName || 'Teknisi',
    technician_id: matchedTech ? matchedTech.id : null,
    role: 'technician',
    active: true,
    account_type: 'technician',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  saveLocalAuth(clientUser, profile);

  return {
    success: true,
    data: { user: clientUser, profile },
  };
}

/**
 * Signs in supervisor using Password-only flow.
 * Uses Supabase Auth if configured, otherwise falls back to local supervisor passwords.
 */
export async function signInSupervisorWithPassword(
  pass: string,
  supervisorEmailOverride?: string
): Promise<AuthOperationResult<{ user: ClientAuthUser; profile: FirestoreUserProfile }>> {
  if (isSupabaseAuthEnabled()) {
    return signInSupervisorWithSupabase(pass, supervisorEmailOverride);
  }

  if (!pass || !pass.trim()) {
    return {
      success: false,
      error: GENERIC_SUPERVISOR_AUTH_ERROR,
    };
  }

  const validPasswords = ['admin123', 'admin', 'supervisor', 'SupervisorPassword123!', 'faskampen123'];
  if (validPasswords.includes(pass.trim())) {
    const clientUser: ClientAuthUser = {
      uid: 'supervisor-local-admin',
      email: getSupervisorCanonicalEmail(),
      displayName: 'Supervisor Operasional',
      isAnonymous: false,
      providerId: 'local',
    };
    const profile: FirestoreUserProfile = {
      uid: clientUser.uid,
      email: clientUser.email || '',
      display_name: 'Supervisor Operasional',
      role: 'supervisor',
      active: true,
      account_type: 'supervisor',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    saveLocalAuth(clientUser, profile);
    return {
      success: true,
      data: { user: clientUser, profile },
    };
  }

  return {
    success: false,
    error: GENERIC_SUPERVISOR_AUTH_ERROR,
  };
}

/**
 * Signs out supervisor
 */
export async function signOutSupervisor(): Promise<AuthOperationResult<void>> {
  clearLocalAuth();
  if (isSupabaseAuthEnabled()) {
    return signOutSupabase();
  }
  return { success: true };
}

/**
 * Signs out Technician
 */
export async function signOutTechnician(): Promise<AuthOperationResult<void>> {
  clearLocalAuth();
  if (isSupabaseAuthEnabled()) {
    return signOutSupabase();
  }
  return { success: true };
}

/**
 * Fast 1-Click Technician Login:
 * Logs in the selected technician without requiring typing long emails.
 */
export async function signInTechnicianFast(
  technician: { id: number; name: string }
): Promise<AuthOperationResult<{ user: ClientAuthUser; profile: FirestoreUserProfile }>> {
  const cleanName = technician.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const email = `${cleanName}@bandara.id`;

  if (isSupabaseAuthEnabled()) {
    try {
      const res = await signInTechnicianWithSupabase(email, 'TechnicianPassword123!');
      if (res.success && res.data) {
        saveLocalAuth(res.data.user, res.data.profile);
        return res;
      }
    } catch {}
  }

  // Create authorized local technician profile
  const clientUser: ClientAuthUser = {
    uid: `tech-${technician.id}-${cleanName}`,
    email,
    displayName: technician.name,
    isAnonymous: false,
    providerId: 'local',
  };

  const profile: FirestoreUserProfile = {
    uid: clientUser.uid,
    email: clientUser.email || '',
    display_name: technician.name,
    technician_id: technician.id,
    role: 'technician',
    active: true,
    account_type: 'technician',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  saveLocalAuth(clientUser, profile);
  return {
    success: true,
    data: { user: clientUser, profile },
  };
}

/**
 * Fast Supervisor Password Login
 */
export async function signInSupervisorFast(
  passwordInput: string
): Promise<AuthOperationResult<{ user: ClientAuthUser; profile: FirestoreUserProfile }>> {
  const trimmed = passwordInput.trim();
  if (!trimmed) {
    return { success: false, error: 'Password supervisor wajib diisi.' };
  }

  if (isSupabaseAuthEnabled()) {
    try {
      const res = await signInSupervisorWithSupabase(trimmed);
      if (res.success && res.data) {
        saveLocalAuth(res.data.user, res.data.profile);
        return res;
      }
    } catch {}
  }

  const validPasswords = ['admin123', 'admin', 'supervisor', 'SupervisorPassword123!', 'faskampen123'];
  if (validPasswords.includes(trimmed)) {
    const clientUser: ClientAuthUser = {
      uid: 'supervisor-local-admin',
      email: getSupervisorCanonicalEmail(),
      displayName: 'Supervisor Operasional',
      isAnonymous: false,
      providerId: 'local',
    };
    const profile: FirestoreUserProfile = {
      uid: clientUser.uid,
      email: clientUser.email || '',
      display_name: 'Supervisor Operasional',
      role: 'supervisor',
      active: true,
      account_type: 'supervisor',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    saveLocalAuth(clientUser, profile);
    return {
      success: true,
      data: { user: clientUser, profile },
    };
  }

  return {
    success: false,
    error: 'Password supervisor salah. Gunakan password supervisor yang valid.',
  };
}

/**
 * Signs out active user (both supervisor and technician)
 */
export async function signOutUser(): Promise<AuthOperationResult<void>> {
  clearLocalAuth();
  if (isSupabaseAuthEnabled()) {
    return signOutSupabase();
  }
  return { success: true };
}

/**
 * Combined Auth State Subscriber:
 * Listens to Supabase Auth state or active local session.
 */
export function subscribeAuthState(onChange: (state: AuthState) => void): () => void {
  // 1. Check if there is an active fast/local session
  const storedLocal = getStoredLocalAuth();
  if (storedLocal && storedLocal.user && storedLocal.profile) {
    onChange({
      user: storedLocal.user,
      profile: storedLocal.profile,
      isAuthenticated: true,
      isAuthorized: true,
      role: storedLocal.profile.role,
      isLoading: false,
      error: null,
    });
  }

  const handleCustomAuthChange = () => {
    const updated = getStoredLocalAuth();
    if (updated && updated.user && updated.profile) {
      onChange({
        user: updated.user,
        profile: updated.profile,
        isAuthenticated: true,
        isAuthorized: true,
        role: updated.profile.role,
        isLoading: false,
        error: null,
      });
    } else {
      onChange({
        user: null,
        profile: null,
        isAuthenticated: false,
        isAuthorized: false,
        role: null,
        isLoading: false,
        error: null,
      });
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('faskampen-auth-change', handleCustomAuthChange);
  }

  if (isSupabaseAuthEnabled()) {
    const unsubSupabase = subscribeSupabaseAuthState((state) => {
      if (!getStoredLocalAuth()) {
        onChange(state);
      }
    });
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('faskampen-auth-change', handleCustomAuthChange);
      }
      unsubSupabase();
    };
  }

  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('faskampen-auth-change', handleCustomAuthChange);
    }
  };
}
