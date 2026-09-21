import { User as SupabaseUser } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured, getSupabaseUrl } from '../lib/supabase';
import {
  AppRole,
  AuthState,
  ClientAuthUser,
  FirestoreUserProfile,
  AuthOperationResult,
} from '../types/auth';
import { getSupervisorCanonicalEmail } from './authService';

/**
 * Converts Supabase User object into clean ClientAuthUser identity
 */
export function sanitizeSupabaseUser(user: SupabaseUser | null): ClientAuthUser | null {
  if (!user) return null;
  return {
    uid: user.id,
    email: user.email || null,
    displayName: user.user_metadata?.full_name || user.user_metadata?.display_name || user.email?.split('@')[0] || null,
    isAnonymous: false,
    providerId: 'supabase',
  };
}

/**
 * Fetches user profile from Supabase `profiles` table by user ID (uid).
 */
export async function fetchSupabaseUserProfile(uid: string): Promise<FirestoreUserProfile | null> {
  if (!uid || !isSupabaseConfigured()) return null;

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();

    if (error || !data) {
      // Fallback: If profile row doesn't exist yet, construct from user metadata if possible
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user && userData.user.id === uid) {
        const email = userData.user.email || '';
        const isSupervisor = email === getSupervisorCanonicalEmail() || userData.user.user_metadata?.role === 'supervisor';
        return {
          uid,
          email,
          display_name: userData.user.user_metadata?.display_name || email.split('@')[0] || 'User',
          technician_id: userData.user.user_metadata?.technician_id ? Number(userData.user.user_metadata.technician_id) : null,
          role: isSupervisor ? 'supervisor' : 'technician',
          active: true,
          account_type: isSupervisor ? 'supervisor' : 'technician',
          created_at: userData.user.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
      return null;
    }

    return {
      uid: data.id,
      email: data.email || '',
      display_name: data.display_name || '',
      technician_id: data.technician_id != null ? Number(data.technician_id) : null,
      role: (data.role as AppRole) || 'technician',
      active: Boolean(data.active),
      account_type: data.account_type || 'technician',
      created_at: data.created_at || '',
      updated_at: data.updated_at || '',
    };
  } catch (err) {
    console.warn('[SupabaseAuth] Error fetching user profile:', err);
    return null;
  }
}

/**
 * Upserts / provisions user profile in `profiles` table
 */
export async function upsertSupabaseUserProfile(profile: Partial<FirestoreUserProfile> & { uid: string; email: string }): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('profiles').upsert(
      {
        id: profile.uid,
        email: profile.email,
        display_name: profile.display_name || profile.email.split('@')[0],
        technician_id: profile.technician_id ?? null,
        role: profile.role || 'technician',
        active: profile.active ?? true,
        account_type: profile.account_type || profile.role || 'technician',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (error) {
      console.warn('[SupabaseAuth] Upsert profile warning:', error.message);
    }
    return !error;
  } catch (err) {
    console.warn('[SupabaseAuth] Failed to upsert profile:', err);
    return false;
  }
}

function normalizeEmail(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return '';
  if (!trimmed.includes('@')) {
    return `${trimmed}@bandara.id`;
  }
  return trimmed;
}

/**
 * Signs in technician using Supabase Auth credentials.
 */
export async function signInTechnicianWithSupabase(
  emailInput: string,
  pass: string
): Promise<AuthOperationResult<{ user: ClientAuthUser; profile: FirestoreUserProfile }>> {
  if (!emailInput || !emailInput.trim() || !pass || !pass.trim()) {
    return {
      success: false,
      error: 'Email/Username dan password teknisi wajib diisi.',
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      success: false,
      error: 'Supabase Auth belum terkonfigurasi.',
    };
  }

  const normalizedEmail = normalizeEmail(emailInput);

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: pass.trim(),
    });

    if (error || !data.user) {
      const msg = (error?.message || '').toLowerCase();
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch')) {
        return {
          success: false,
          error: `Gagal terhubung ke server Supabase (${getSupabaseUrl()}). Silakan klik tombol 'Tes Supabase' untuk memeriksa Project URL.`,
        };
      }

      // Check if user exists in Supabase public.technicians table (registered via Master Data)
      try {
        const { data: techRow, error: techDbError } = await supabase
          .from('technicians')
          .select('*')
          .or(`email.ilike.${normalizedEmail},name.ilike.${normalizedEmail.split('@')[0]}`)
          .maybeSingle();

        if (!techDbError && techRow) {
          if (!techRow.active) {
            return {
              success: false,
              error: `Akun teknisi '${techRow.name}' sedang dinonaktifkan di database Supabase. Hubungi supervisor.`,
            };
          }
          if (techRow.password && techRow.password.trim() === pass.trim()) {
            const techUser: ClientAuthUser = {
              uid: `supa-tech-${techRow.id}`,
              email: techRow.email || normalizedEmail,
              displayName: techRow.name || normalizedEmail.split('@')[0],
              isAnonymous: false,
              providerId: 'supabase-db',
            };
            const profile: FirestoreUserProfile = {
              uid: techUser.uid,
              email: techRow.email || normalizedEmail,
              display_name: techRow.name,
              technician_id: techRow.id,
              role: (techRow.role as AppRole) || 'technician',
              active: true,
              account_type: 'technician',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            return {
              success: true,
              data: {
                user: techUser,
                profile,
              },
            };
          } else {
            return {
              success: false,
              error: `Kata sandi salah untuk teknisi '${techRow.name}' di database Supabase.`,
            };
          }
        }
      } catch (dbErr) {
        console.warn('[SupabaseAuth] Check technicians table fallback:', dbErr);
      }

      if (msg.includes('invalid login credentials')) {
        return {
          success: false,
          error: `Email/Password salah untuk '${normalizedEmail}'. Pastikan user ini sudah dibuat di Master Data atau Dashboard Supabase.`,
        };
      }
      if (msg.includes('email not confirmed')) {
        return {
          success: false,
          error: `Email '${normalizedEmail}' belum dikonfirmasi. Nonaktifkan 'Confirm Email' di Dashboard Supabase > Authentication > Providers > Email.`,
        };
      }
      return {
        success: false,
        error: error?.message || 'Email atau password teknisi salah di Supabase.',
      };
    }

    const clientUser = sanitizeSupabaseUser(data.user);
    if (!clientUser) {
      await supabase.auth.signOut();
      return {
        success: false,
        error: 'Gagal melakukan otentikasi akun teknisi.',
      };
    }

    let profile = await fetchSupabaseUserProfile(clientUser.uid);
    if (!profile) {
      // Auto-provision default technician profile if first-time login
      const defaultProfile: FirestoreUserProfile = {
        uid: clientUser.uid,
        email: clientUser.email || normalizedEmail.trim(),
        display_name: clientUser.displayName || normalizedEmail.split('@')[0],
        technician_id: null,
        role: 'technician',
        active: true,
        account_type: 'technician',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await upsertSupabaseUserProfile(defaultProfile);
      profile = defaultProfile;
    }

    if (!profile.active) {
      await supabase.auth.signOut();
      return {
        success: false,
        error: 'Akun teknisi berstatus nonaktif. Hubungi supervisor.',
      };
    }

    if (profile.role !== 'technician') {
      await supabase.auth.signOut();
      return {
        success: false,
        error: 'Akun ini bukan akun teknisi operasional.',
      };
    }

    return {
      success: true,
      data: {
        user: clientUser,
        profile,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Terjadi kesalahan saat masuk dengan Supabase.',
    };
  }
}

/**
 * Signs in supervisor using Supabase Auth.
 */
export async function signInSupervisorWithSupabase(
  pass: string,
  supervisorEmailOverride?: string
): Promise<AuthOperationResult<{ user: ClientAuthUser; profile: FirestoreUserProfile }>> {
  if (!pass || !pass.trim()) {
    return {
      success: false,
      error: 'Password supervisor salah atau akses tidak tersedia.',
    };
  }

  const supervisorEmail = (supervisorEmailOverride || getSupervisorCanonicalEmail()).trim();

  if (!isSupabaseConfigured()) {
    return {
      success: false,
      error: 'Supabase Auth belum terkonfigurasi.',
    };
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: supervisorEmail,
      password: pass.trim(),
    });

    if (error || !data.user) {
      const msg = (error?.message || '').toLowerCase();
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch')) {
        return {
          success: false,
          error: `Gagal terhubung ke server Supabase (${getSupabaseUrl()}). Silakan klik tombol 'Tes Supabase' untuk memeriksa Project URL.`,
        };
      }
      if (msg.includes('invalid login credentials')) {
        return {
          success: false,
          error: `Password supervisor salah untuk '${supervisorEmail}'. Pastikan user '${supervisorEmail}' sudah dibuat di Dashboard Supabase > Auth > Users.`,
        };
      }
      if (msg.includes('email not confirmed')) {
        return {
          success: false,
          error: `Email '${supervisorEmail}' belum dikonfirmasi di Supabase. Nonaktifkan 'Confirm Email' di Dashboard Supabase > Authentication > Providers > Email.`,
        };
      }
      return {
        success: false,
        error: error?.message || 'Password supervisor salah atau akses tidak tersedia.',
      };
    }

    const clientUser = sanitizeSupabaseUser(data.user);
    if (!clientUser) {
      await supabase.auth.signOut();
      return {
        success: false,
        error: 'Password supervisor salah atau akses tidak tersedia.',
      };
    }

    let profile = await fetchSupabaseUserProfile(clientUser.uid);
    if (!profile) {
      // Auto-provision supervisor profile if needed
      const supProfile: FirestoreUserProfile = {
        uid: clientUser.uid,
        email: supervisorEmail,
        display_name: 'Supervisor',
        technician_id: null,
        role: 'supervisor',
        active: true,
        account_type: 'supervisor',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await upsertSupabaseUserProfile(supProfile);
      profile = supProfile;
    }

    if (!profile.active || profile.role !== 'supervisor') {
      await supabase.auth.signOut();
      return {
        success: false,
        error: 'Password supervisor salah atau akses tidak tersedia.',
      };
    }

    return {
      success: true,
      data: {
        user: clientUser,
        profile,
      },
    };
  } catch {
    return {
      success: false,
      error: 'Password supervisor salah atau akses tidak tersedia.',
    };
  }
}

/**
 * Signs out from Supabase Auth
 */
export async function signOutSupabase(): Promise<AuthOperationResult<void>> {
  if (!isSupabaseConfigured()) return { success: true };
  try {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Subscribes to Supabase Auth State changes & handles Session Restore
 */
export function subscribeSupabaseAuthState(onChange: (state: AuthState) => void): () => void {
  if (!isSupabaseConfigured()) {
    onChange({
      user: null,
      profile: null,
      isAuthenticated: false,
      isAuthorized: false,
      role: null,
      isLoading: false,
      error: 'Supabase Auth belum terkonfigurasi.',
    });
    return () => {};
  }

  const supabase = getSupabaseClient();

  // Initial session restoration
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (!session?.user) {
      onChange({
        user: null,
        profile: null,
        isAuthenticated: false,
        isAuthorized: false,
        role: null,
        isLoading: false,
        error: null,
      });
      return;
    }

    const clientUser = sanitizeSupabaseUser(session.user);
    const profile = await fetchSupabaseUserProfile(session.user.id);
    const isAuthorized = Boolean(profile && profile.active);

    onChange({
      user: clientUser,
      profile,
      isAuthenticated: true,
      isAuthorized,
      role: isAuthorized && profile ? profile.role : null,
      isLoading: false,
      error: !profile ? 'Profil pengguna tidak ditemukan.' : !profile.active ? 'Akun berstatus nonaktif.' : null,
    });
  });

  // Auth state change listener
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT' || !session?.user) {
      onChange({
        user: null,
        profile: null,
        isAuthenticated: false,
        isAuthorized: false,
        role: null,
        isLoading: false,
        error: null,
      });
      return;
    }

    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
      const clientUser = sanitizeSupabaseUser(session.user);
      const profile = await fetchSupabaseUserProfile(session.user.id);
      const isAuthorized = Boolean(profile && profile.active);

      onChange({
        user: clientUser,
        profile,
        isAuthenticated: true,
        isAuthorized,
        role: isAuthorized && profile ? profile.role : null,
        isLoading: false,
        error: !profile ? 'Profil pengguna tidak ditemukan.' : !profile.active ? 'Akun berstatus nonaktif.' : null,
      });
    }
  });

  return () => {
    subscription.unsubscribe();
  };
}
