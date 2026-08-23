import { Profile, UserRole } from '../types';
import { supabase } from '../supabase/client';

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
        { onConflict: 'email' }
      );

    if (profileError) {
      throw new Error(`Account created, but profile setup failed: ${profileError.message}`);
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('ok_current_user', JSON.stringify(newProfile));
      localStorage.setItem('ok_session_customer', JSON.stringify(newProfile));
    }

    return newProfile;
  }

  static async login(
    email: string,
    password: string,
    expectedRole?: UserRole
  ): Promise<Profile> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      throw new Error(authError.message);
    }

    if (!authData.user) {
      throw new Error('Authentication failed. User not found.');
    }

    const userId = authData.user.id;
    const userEmail = authData.user.email || email;

    let { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (!profile) {
      const { data: profileByEmail } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', userEmail.toLowerCase())
        .maybeSingle();

      profile = profileByEmail;
    }

    if (!profile) {
      const fallbackRole: UserRole = expectedRole || 'CUSTOMER';
      const newProf = {
        id: userId,
        email: userEmail.toLowerCase(),
        full_name: authData.user.user_metadata?.full_name || userEmail.split('@')[0],
        phone: authData.user.user_metadata?.phone || '',
        role: fallbackRole,
      };

      await supabase.from('profiles').insert(newProf);
      profile = newProf;
    }

    const userRole: UserRole = profile.role as UserRole;

    if (expectedRole && userRole !== expectedRole && userRole !== 'OWNER') {
      await supabase.auth.signOut();
      throw new Error(`Unauthorized access. This login portal is restricted to ${expectedRole} users.`);
    }

    const fullProfile: Profile = {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      phone: profile.phone || undefined,
      role: userRole,
      created_at: profile.created_at || new Date().toISOString(),
    };

    if (typeof window !== 'undefined') {
      localStorage.setItem('ok_current_user', JSON.stringify(fullProfile));
      localStorage.setItem(`ok_session_${userRole.toLowerCase()}`, JSON.stringify(fullProfile));
    }

    return fullProfile;
  }

  static getCurrentUser(role?: UserRole): Profile | null {
    if (typeof window === 'undefined') return null;

    if (role) {
      const roleSession = localStorage.getItem(`ok_session_${role.toLowerCase()}`);
      if (roleSession) {
        try {
          return JSON.parse(roleSession);
        } catch {}
      }
    }

    const generalSession = localStorage.getItem('ok_current_user');
    if (!generalSession) return null;
    try {
      return JSON.parse(generalSession);
    } catch {
      return null;
    }
  }

  static async fetchCurrentUser(): Promise<Profile | null> {
    if (!supabase) return null;

    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session || !session.user) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('ok_current_user');
      }
      return null;
    }

    const userId = session.user.id;
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (!profile) return null;

    const userProfile: Profile = {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      phone: profile.phone || undefined,
      role: profile.role as UserRole,
      created_at: profile.created_at,
    };

    if (typeof window !== 'undefined') {
      localStorage.setItem('ok_current_user', JSON.stringify(userProfile));
      localStorage.setItem(`ok_session_${userProfile.role.toLowerCase()}`, JSON.stringify(userProfile));
    }

    return userProfile;
  }

  static async logout(role?: UserRole): Promise<void> {
    if (supabase) {
      await supabase.auth.signOut();
    }

    if (typeof window !== 'undefined') {
      localStorage.removeItem('ok_current_user');
      if (role) {
        localStorage.removeItem(`ok_session_${role.toLowerCase()}`);
      } else {
        localStorage.removeItem('ok_session_customer');
        localStorage.removeItem('ok_session_branch_admin');
        localStorage.removeItem('ok_session_kitchen');
        localStorage.removeItem('ok_session_rider');
        localStorage.removeItem('ok_session_owner');
      }
    }
  }
}
