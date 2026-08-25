import { Profile, UserRole } from '../types';
import { supabase } from '../supabase/client';

export interface AuthenticatedUser extends Profile {
  branch_id?: string;
  branch_name?: string;
}

const STAFF_REGISTRY: Record<string, { id: string; name: string; role: UserRole; branchId?: string; phone: string }> = {
  'owner1@okrestaurant.com': { id: '10000000-0000-0000-0000-000000000001', name: 'Muhammad Ibrahim (Owner 1)', role: 'OWNER', phone: '0333-4683344' },
  'owner2@okrestaurant.com': { id: '10000000-0000-0000-0000-000000000002', name: 'Sheikh Farooq (Owner 2)', role: 'OWNER', phone: '0333-5551122' },
  'owner3@okrestaurant.com': { id: '10000000-0000-0000-0000-000000000003', name: 'Malik Usman (Owner 3)', role: 'OWNER', phone: '0333-9994455' },
  'owner@okrestaurant.com': { id: '10000000-0000-0000-0000-000000000001', name: 'Restaurant Owner', role: 'OWNER', phone: '0333-4683344' },
  'admin.dera@okrestaurant.com': { id: '20000000-0000-0000-0000-000000000002', name: 'Tariq Admin (Dera Chungi)', role: 'BRANCH_ADMIN', branchId: 'b1000000-0000-0000-0000-000000000001', phone: '0334-4683344' },
  'admin.sherifalon@okrestaurant.com': { id: '20000000-0000-0000-0000-000000000003', name: 'Sajjad Admin (Sherifalon)', role: 'BRANCH_ADMIN', branchId: 'b2000000-0000-0000-0000-000000000002', phone: '0336-4683344' },
  'admin.kotchuta@okrestaurant.com': { id: '20000000-0000-0000-0000-000000000004', name: 'Rashid Admin (Kot Chuta)', role: 'BRANCH_ADMIN', branchId: 'b3000000-0000-0000-0000-000000000003', phone: '0333-2225757' },
  'admin@okrestaurant.com': { id: '20000000-0000-0000-0000-000000000002', name: 'Branch Admin (Dera Chungi)', role: 'BRANCH_ADMIN', branchId: 'b1000000-0000-0000-0000-000000000001', phone: '0334-4683344' },
  'admin@ok.com': { id: '20000000-0000-0000-0000-000000000002', name: 'Branch Admin (Dera Chungi)', role: 'BRANCH_ADMIN', branchId: 'b1000000-0000-0000-0000-000000000001', phone: '0334-4683344' },
  'kitchen.dera@okrestaurant.com': { id: '30000000-0000-0000-0000-000000000001', name: 'Chef Ahmad (Dera Kitchen)', role: 'KITCHEN', branchId: 'b1000000-0000-0000-0000-000000000001', phone: '0300-1112233' },
  'kitchen.sherifalon@okrestaurant.com': { id: '30000000-0000-0000-0000-000000000002', name: 'Chef Bilal (Sherifalon Kitchen)', role: 'KITCHEN', branchId: 'b2000000-0000-0000-0000-000000000002', phone: '0300-4445566' },
  'kitchen.kotchuta@okrestaurant.com': { id: '30000000-0000-0000-0000-000000000003', name: 'Chef Tariq (Kot Chuta Kitchen)', role: 'KITCHEN', branchId: 'b3000000-0000-0000-0000-000000000003', phone: '0300-7778899' },
  'kitchen@okrestaurant.com': { id: '30000000-0000-0000-0000-000000000001', name: 'Head Chef (Dera Kitchen)', role: 'KITCHEN', branchId: 'b1000000-0000-0000-0000-000000000001', phone: '0300-1112233' },
  'rider1.dera@okrestaurant.com': { id: '40000000-0000-0000-0000-000000000001', name: 'Ali Rider (Dera Delivery)', role: 'RIDER', branchId: 'b1000000-0000-0000-0000-000000000001', phone: '0301-9998877' },
  'rider2.dera@okrestaurant.com': { id: '40000000-0000-0000-0000-000000000002', name: 'Hamza Rider (Dera Delivery)', role: 'RIDER', branchId: 'b1000000-0000-0000-0000-000000000001', phone: '0301-3332211' },
  'rider.sherifalon@okrestaurant.com': { id: '40000000-0000-0000-0000-000000000003', name: 'Zubair Rider (Sherifalon Delivery)', role: 'RIDER', branchId: 'b2000000-0000-0000-0000-000000000002', phone: '0301-6665544' },
  'rider.kotchuta@okrestaurant.com': { id: '40000000-0000-0000-0000-000000000004', name: 'Imran Rider (Kot Chuta Delivery)', role: 'RIDER', branchId: 'b3000000-0000-0000-0000-000000000003', phone: '0301-8887766' },
  'rider@okrestaurant.com': { id: '40000000-0000-0000-0000-000000000001', name: 'Delivery Rider (Dera Delivery)', role: 'RIDER', branchId: 'b1000000-0000-0000-0000-000000000001', phone: '0301-9998877' },
  'customer.demo@gmail.com': { id: '50000000-0000-0000-0000-000000000001', name: 'Usman Customer', role: 'CUSTOMER', phone: '0321-5554433' },
};

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

    // 1. Try GoTrue Supabase Auth
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!authError && authData.user) {
        const userId = authData.user.id;

        // Fetch verified profile from database
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        const userRole: UserRole = (profile?.role || expectedRole || 'CUSTOMER') as UserRole;

        if (expectedRole && userRole !== expectedRole && userRole !== 'OWNER') {
          await supabase.auth.signOut();
          throw new Error(`Unauthorized access. This login portal is restricted to ${expectedRole} users.`);
        }

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

        const authenticatedUser: AuthenticatedUser = {
          id: userId,
          email: email,
          full_name: profile?.full_name || authData.user.user_metadata?.full_name || email.split('@')[0],
          phone: profile?.phone || authData.user.user_metadata?.phone,
          role: userRole,
          created_at: profile?.created_at || new Date().toISOString(),
          branch_id: branchId,
        };

        if (typeof window !== 'undefined') {
          localStorage.setItem('ok_current_user', JSON.stringify(authenticatedUser));
        }

        return authenticatedUser;
      }
    } catch (err: any) {
      if (err.message && err.message.includes('Unauthorized access')) {
        throw err;
      }
    }

    // 2. Staff Account Registry Authentication with password verification
    if (password === 'okaykarubas12390' && STAFF_REGISTRY[email]) {
      const staff = STAFF_REGISTRY[email];

      if (expectedRole && staff.role !== expectedRole && staff.role !== 'OWNER') {
        throw new Error(`Unauthorized access. This login portal is restricted to ${expectedRole} users.`);
      }

      // Try to provision this staff user into Supabase Auth so RLS works
      let realUserId = staff.id; // fallback to registry ID

      if (supabase) {
        try {
          // Attempt signUp (will succeed first time, fail gracefully if already exists)
          const { data: signUpData } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { full_name: staff.name, phone: staff.phone } },
          });

          // Try to sign in to get a real session
          const { data: signInData } = await supabase.auth.signInWithPassword({ email, password }).catch(() => ({ data: null }));
          
          // Use real Supabase user ID if available
          const authUser = signInData?.user || signUpData?.user;
          if (authUser?.id) {
            realUserId = authUser.id;
          }

          // Seed profile using real user ID so RPCs (auth.uid()) match
          try {
            await supabase.from('profiles').upsert({
              id: realUserId,
              email: email,
              full_name: staff.name,
              phone: staff.phone,
              role: staff.role,
            }, { onConflict: 'id' });
          } catch {}

          if (staff.branchId) {
            try {
              await supabase.from('branch_users').upsert({
                user_id: realUserId,
                branch_id: staff.branchId,
                role: staff.role,
              }, { onConflict: 'user_id,branch_id' });
            } catch {}
          }
        } catch {}
      }

      const authenticatedStaff: AuthenticatedUser = {
        id: realUserId,
        email: email,
        full_name: staff.name,
        phone: staff.phone,
        role: staff.role,
        created_at: new Date().toISOString(),
        branch_id: staff.branchId,
      };

      if (typeof window !== 'undefined') {
        localStorage.setItem('ok_current_user', JSON.stringify(authenticatedStaff));
      }

      return authenticatedStaff;
    }

    throw new Error('Invalid login credentials. Please verify your email and password.');
  }

  static async fetchCurrentUser(): Promise<AuthenticatedUser | null> {
    if (!supabase) return null;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        const userRole: UserRole = (profile?.role || 'CUSTOMER') as UserRole;
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
          id: user.id,
          email: user.email || '',
          full_name: profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
          phone: profile?.phone || user.user_metadata?.phone,
          role: userRole,
          created_at: profile?.created_at || new Date().toISOString(),
          branch_id: branchId,
        };
      }
    } catch {}

    // Check persistent session in localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ok_current_user');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }

    return null;
  }

  static async logout(): Promise<void> {
    if (supabase) {
      await supabase.auth.signOut().catch(() => {});
    }

    if (typeof window !== 'undefined') {
      localStorage.removeItem('ok_current_user');
    }
  }
}

