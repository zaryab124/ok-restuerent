import { Profile, UserRole } from '../types';
import { supabase } from '../supabase/client';

export interface AuthenticatedUser extends Profile {
  branch_id?: string;
  branch_name?: string;
}

export class AuthService {
  static async registerCustomer(
    name: string,
    email: string,
    phone: string,
    password: string
  ): Promise<Profile> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          phone,
        },
      },
    });

    if (authError) {
      throw new Error(authError.message);
    }

    if (!authData.user) {
      throw new Error('Failed to create account. Please try again.');
    }

    const newProfile: Profile = {
      id: authData.user.id,
      email: email.toLowerCase(),
      full_name: name,
      phone,
      role: 'CUSTOMER',
      created_at: new Date().toISOString(),
    };

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(
        {
          id: newProfile.id,
          email: newProfile.email,
          full_name: newProfile.full_name,
          phone: newProfile.phone,
          role: newProfile.role,
        },
        { onConflict: 'id' }
      );

    if (profileError) {
      throw new Error(`Account created, but profile setup failed: ${profileError.message}`);
    }

    return newProfile;
  }

  static async login(
    rawEmail: string,
    password: string,
    expectedRole?: UserRole
  ): Promise<AuthenticatedUser> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const email = rawEmail.trim().toLowerCase();

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      const errMsg = authError?.message || 'Invalid login credentials. Please verify your email and password.';
      throw new Error(errMsg);
    }

    const userId = authData.user.id;

    // Fetch verified profile from database
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      throw new Error('User profile not found in restaurant database.');
    }

    const userRole: UserRole = profile.role as UserRole;

    // Verify role matches expected portal (OWNER is allowed everywhere)
    if (expectedRole && userRole !== expectedRole && userRole !== 'OWNER') {
      await supabase.auth.signOut();
      throw new Error(`Unauthorized access. This login portal is restricted to ${expectedRole} users.`);
    }

    // Fetch branch assignment if staff member
    let branchId: string | undefined = undefined;
    if (userRole !== 'OWNER' && userRole !== 'CUSTOMER') {
      const { data: branchUser } = await supabase
        .from('branch_users')
        .select('branch_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (branchUser) {
        branchId = branchUser.branch_id;
      }
    }

    return {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      phone: profile.phone || undefined,
      role: userRole,
      created_at: profile.created_at || new Date().toISOString(),
      branch_id: branchId,
    };
  }

  static async fetchCurrentUser(): Promise<AuthenticatedUser | null> {
    if (!supabase) return null;

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return null;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile) return null;

    const userRole: UserRole = profile.role as UserRole;
    let branchId: string | undefined = undefined;

    if (userRole !== 'OWNER' && userRole !== 'CUSTOMER') {
      const { data: branchUser } = await supabase
        .from('branch_users')
        .select('branch_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (branchUser) {
        branchId = branchUser.branch_id;
      }
    }

    return {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      phone: profile.phone || undefined,
      role: userRole,
      created_at: profile.created_at,
      branch_id: branchId,
    };
  }

  static async logout(): Promise<void> {
    if (supabase) {
      await supabase.auth.signOut();
    }
  }
}

