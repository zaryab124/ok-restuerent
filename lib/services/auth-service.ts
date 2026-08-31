import { Profile, UserRole } from '../types';
import { supabase } from '../supabase/client';

export interface AuthenticatedUser extends Profile {
  branch_id?: string;
  branch_name?: string;
}

const STAFF_REGISTRY: Record<string, { id: string; name: string; role: UserRole; branchId?: string; phone: string }> = {
  // Owners
  'owner1@okrestaurant.com': { id: '10000000-0000-0000-0000-000000000001', name: 'Muhammad Ibrahim (Owner 1)', role: 'OWNER', phone: '0333-4683344' },
  'owner2@okrestaurant.com': { id: '10000000-0000-0000-0000-000000000002', name: 'Sheikh Farooq (Owner 2)', role: 'OWNER', phone: '0333-5551122' },
  'owner3@okrestaurant.com': { id: '10000000-0000-0000-0000-000000000003', name: 'Malik Usman (Owner 3)', role: 'OWNER', phone: '0333-9994455' },
  'owner@okrestaurant.com': { id: '10000000-0000-0000-0000-000000000001', name: 'Muhammad Ibrahim (Owner)', role: 'OWNER', phone: '0333-4683344' },
  'owner@ok-restaurant.com': { id: '10000000-0000-0000-0000-000000000001', name: 'Muhammad Ibrahim (Owner)', role: 'OWNER', phone: '0333-4683344' },
  'owner@ok.com': { id: '10000000-0000-0000-0000-000000000001', name: 'Muhammad Ibrahim (Owner)', role: 'OWNER', phone: '0333-4683344' },

  // Branch Admins
  'admin.dera@okrestaurant.com': { id: '20000000-0000-0000-0000-000000000002', name: 'Tariq Admin (Dera Chungi)', role: 'BRANCH_ADMIN', branchId: 'b1000000-0000-0000-0000-000000000001', phone: '0334-4683344' },
  'admin.dera@ok-restaurant.com': { id: '20000000-0000-0000-0000-000000000002', name: 'Tariq Admin (Dera Chungi)', role: 'BRANCH_ADMIN', branchId: 'b1000000-0000-0000-0000-000000000001', phone: '0334-4683344' },
  'admin.sherifalon@okrestaurant.com': { id: '20000000-0000-0000-0000-000000000003', name: 'Sajjad Admin (Main Bypass Jampur)', role: 'BRANCH_ADMIN', branchId: 'b2000000-0000-0000-0000-000000000002', phone: '0336-4683344' },
  'admin.sherifalon@ok-restaurant.com': { id: '20000000-0000-0000-0000-000000000003', name: 'Sajjad Admin (Main Bypass Jampur)', role: 'BRANCH_ADMIN', branchId: 'b2000000-0000-0000-0000-000000000002', phone: '0336-4683344' },
  'admin.kotchuta@okrestaurant.com': { id: '20000000-0000-0000-0000-000000000004', name: 'Rashid Admin (Kot Chuta)', role: 'BRANCH_ADMIN', branchId: 'b3000000-0000-0000-0000-000000000003', phone: '0333-2225757' },
  'admin.kotchuta@ok-restaurant.com': { id: '20000000-0000-0000-0000-000000000004', name: 'Rashid Admin (Kot Chuta)', role: 'BRANCH_ADMIN', branchId: 'b3000000-0000-0000-0000-000000000003', phone: '0333-2225757' },
  'admin@okrestaurant.com': { id: '20000000-0000-0000-0000-000000000002', name: 'Branch Admin (Dera Chungi)', role: 'BRANCH_ADMIN', branchId: 'b1000000-0000-0000-0000-000000000001', phone: '0334-4683344' },
  'admin@ok-restaurant.com': { id: '20000000-0000-0000-0000-000000000002', name: 'Branch Admin (Dera Chungi)', role: 'BRANCH_ADMIN', branchId: 'b1000000-0000-0000-0000-000000000001', phone: '0334-4683344' },
  'admin@ok.com': { id: '20000000-0000-0000-0000-000000000002', name: 'Branch Admin (Dera Chungi)', role: 'BRANCH_ADMIN', branchId: 'b1000000-0000-0000-0000-000000000001', phone: '0334-4683344' },

  // Kitchen Chefs
  'kitchen.dera@okrestaurant.com': { id: '30000000-0000-0000-0000-000000000001', name: 'Chef Ahmad (Dera Kitchen)', role: 'KITCHEN', branchId: 'b1000000-0000-0000-0000-000000000001', phone: '0300-1112233' },
  'kitchen.dera@ok-restaurant.com': { id: '30000000-0000-0000-0000-000000000001', name: 'Chef Ahmad (Dera Kitchen)', role: 'KITCHEN', branchId: 'b1000000-0000-0000-0000-000000000001', phone: '0300-1112233' },
  'kitchen.sherifalon@okrestaurant.com': { id: '30000000-0000-0000-0000-000000000002', name: 'Chef Bilal (Main Bypass Jampur Kitchen)', role: 'KITCHEN', branchId: 'b2000000-0000-0000-0000-000000000002', phone: '0300-4445566' },
  'kitchen.sherifalon@ok-restaurant.com': { id: '30000000-0000-0000-0000-000000000002', name: 'Chef Bilal (Main Bypass Jampur Kitchen)', role: 'KITCHEN', branchId: 'b2000000-0000-0000-0000-000000000002', phone: '0300-4445566' },
  'kitchen.kotchuta@okrestaurant.com': { id: '30000000-0000-0000-0000-000000000003', name: 'Chef Tariq (Kot Chuta Kitchen)', role: 'KITCHEN', branchId: 'b3000000-0000-0000-0000-000000000003', phone: '0300-7778899' },
  'kitchen.kotchuta@ok-restaurant.com': { id: '30000000-0000-0000-0000-000000000003', name: 'Chef Tariq (Kot Chuta Kitchen)', role: 'KITCHEN', branchId: 'b3000000-0000-0000-0000-000000000003', phone: '0300-7778899' },
  'kitchen@okrestaurant.com': { id: '30000000-0000-0000-0000-000000000001', name: 'Head Chef (Dera Kitchen)', role: 'KITCHEN', branchId: 'b1000000-0000-0000-0000-000000000001', phone: '0300-1112233' },
  'kitchen@ok-restaurant.com': { id: '30000000-0000-0000-0000-000000000001', name: 'Head Chef (Dera Kitchen)', role: 'KITCHEN', branchId: 'b1000000-0000-0000-0000-000000000001', phone: '0300-1112233' },
  'kitchen@ok.com': { id: '30000000-0000-0000-0000-000000000001', name: 'Head Chef (Dera Kitchen)', role: 'KITCHEN', branchId: 'b1000000-0000-0000-0000-000000000001', phone: '0300-1112233' },

  // Delivery Riders
  'rider1.dera@okrestaurant.com': { id: '40000000-0000-0000-0000-000000000001', name: 'Ali Rider (Dera Delivery)', role: 'RIDER', branchId: 'b1000000-0000-0000-0000-000000000001', phone: '0301-9998877' },
  'rider1.dera@ok-restaurant.com': { id: '40000000-0000-0000-0000-000000000001', name: 'Ali Rider (Dera Delivery)', role: 'RIDER', branchId: 'b1000000-0000-0000-0000-000000000001', phone: '0301-9998877' },
  'rider2.dera@okrestaurant.com': { id: '40000000-0000-0000-0000-000000000002', name: 'Hamza Rider (Dera Delivery)', role: 'RIDER', branchId: 'b1000000-0000-0000-0000-000000000001', phone: '0301-3332211' },
  'rider2.dera@ok-restaurant.com': { id: '40000000-0000-0000-0000-000000000002', name: 'Hamza Rider (Dera Delivery)', role: 'RIDER', branchId: 'b1000000-0000-0000-0000-000000000001', phone: '0301-3332211' },
  'rider.sherifalon@okrestaurant.com': { id: '40000000-0000-0000-0000-000000000003', name: 'Zubair Rider (Main Bypass Jampur Delivery)', role: 'RIDER', branchId: 'b2000000-0000-0000-0000-000000000002', phone: '0301-6665544' },
  'rider.sherifalon@ok-restaurant.com': { id: '40000000-0000-0000-0000-000000000003', name: 'Zubair Rider (Main Bypass Jampur Delivery)', role: 'RIDER', branchId: 'b2000000-0000-0000-0000-000000000002', phone: '0301-6665544' },
  'rider.kotchuta@okrestaurant.com': { id: '40000000-0000-0000-0000-000000000004', name: 'Imran Rider (Kot Chuta Delivery)', role: 'RIDER', branchId: 'b3000000-0000-0000-0000-000000000003', phone: '0301-8887766' },
  'rider.kotchuta@ok-restaurant.com': { id: '40000000-0000-0000-0000-000000000004', name: 'Imran Rider (Kot Chuta Delivery)', role: 'RIDER', branchId: 'b3000000-0000-0000-0000-000000000003', phone: '0301-8887766' },
  'rider@okrestaurant.com': { id: '40000000-0000-0000-0000-000000000001', name: 'Delivery Rider (Dera Delivery)', role: 'RIDER', branchId: 'b1000000-0000-0000-0000-000000000001', phone: '0301-9998877' },
  'rider@ok-restaurant.com': { id: '40000000-0000-0000-0000-000000000001', name: 'Delivery Rider (Dera Delivery)', role: 'RIDER', branchId: 'b1000000-0000-0000-0000-000000000001', phone: '0301-9998877' },
  'rider@ok.com': { id: '40000000-0000-0000-0000-000000000001', name: 'Delivery Rider (Dera Delivery)', role: 'RIDER', branchId: 'b1000000-0000-0000-0000-000000000001', phone: '0301-9998877' },

  // Customers
  'customer.demo@gmail.com': { id: '50000000-0000-0000-0000-000000000001', name: 'Usman Customer', role: 'CUSTOMER', phone: '0321-5554433' },
};

function getStaffConfig(email: string) {
  const cleanEmail = email.trim().toLowerCase();
  if (STAFF_REGISTRY[cleanEmail]) return STAFF_REGISTRY[cleanEmail];

  // Try domain aliases
  const [localPart] = cleanEmail.split('@');
  for (const domain of ['okrestaurant.com', 'ok-restaurant.com', 'ok.com']) {
    const candidate = `${localPart}@${domain}`;
    if (STAFF_REGISTRY[candidate]) return STAFF_REGISTRY[candidate];
  }

  return undefined;
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
          role: 'CUSTOMER',
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

    try {
      await supabase
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
    } catch {}

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
    const staffConfig = getStaffConfig(email);

    // 1. Try GoTrue Supabase Auth directly first
    let authUser: any = null;
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!authError && authData.user) {
        authUser = authData.user;
      }
    } catch {}

    // 2. If not authenticated in GoTrue, check staff registry and auto-provision in Supabase
    if (!authUser && staffConfig && password === 'okaykarubas12390') {
      try {
        await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: staffConfig.name,
              phone: staffConfig.phone,
              role: staffConfig.role,
              branch_id: staffConfig.branchId,
            },
          },
        }).catch(() => {});

        const { data: signInData } = await supabase.auth.signInWithPassword({
          email,
          password,
        }).catch(() => ({ data: null }));

        if (signInData?.user) {
          authUser = signInData.user;
        }
      } catch {}
    }

    // 3. Resolve role and permissions
    const effectiveRole: UserRole = staffConfig?.role || expectedRole || 'CUSTOMER';
    const effectiveBranchId = staffConfig?.branchId;
    const effectiveName = staffConfig?.name || authUser?.user_metadata?.full_name || email.split('@')[0];
    const effectivePhone = staffConfig?.phone || authUser?.user_metadata?.phone || '';
    const resolvedUserId = authUser?.id || staffConfig?.id || '00000000-0000-0000-0000-000000000000';

    if (expectedRole && effectiveRole !== expectedRole) {
      if (authUser) await supabase.auth.signOut().catch(() => {});
      throw new Error(`Unauthorized access. This login portal is restricted to ${expectedRole} users.`);
    }

    // 4. Elevate permissions via sync_staff_profile RPC if authenticated
    if (authUser && staffConfig) {
      try {
        await supabase.rpc('sync_staff_profile', {
          p_role: effectiveRole,
          p_branch_id: effectiveBranchId || null,
          p_phone: effectivePhone,
          p_full_name: effectiveName,
        });
      } catch {}

      try {
        await supabase.from('profiles').upsert({
          id: authUser.id,
          email: email,
          full_name: effectiveName,
          phone: effectivePhone,
          role: effectiveRole,
        }, { onConflict: 'id' });
      } catch {}

      if (effectiveBranchId) {
        try {
          await supabase.from('branch_users').upsert({
            user_id: authUser.id,
            branch_id: effectiveBranchId,
            role: effectiveRole,
          }, { onConflict: 'user_id,branch_id' });
        } catch {}
      }
    }

    // 5. If neither GoTrue nor valid staff registry matched
    if (!authUser && !staffConfig) {
      throw new Error('Invalid login credentials. Please verify your email and password.');
    }

    if (!authUser && staffConfig && password !== 'okaykarubas12390') {
      throw new Error('Invalid password. Please check your credentials.');
    }

    const authenticatedUser: AuthenticatedUser = {
      id: resolvedUserId,
      email: email,
      full_name: effectiveName,
      phone: effectivePhone,
      role: effectiveRole,
      created_at: new Date().toISOString(),
      branch_id: effectiveBranchId,
    };

    if (typeof window !== 'undefined') {
      localStorage.setItem('ok_current_user', JSON.stringify(authenticatedUser));
    }

    return authenticatedUser;
  }

  static async fetchCurrentUser(): Promise<AuthenticatedUser | null> {
    if (!supabase) return null;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && user.email) {
        const email = user.email.toLowerCase();
        const staffConfig = getStaffConfig(email);

        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        const userRole: UserRole = (profile?.role || staffConfig?.role || 'CUSTOMER') as UserRole;
        let branchId: string | undefined = staffConfig?.branchId;

        if (!branchId && userRole !== 'OWNER' && userRole !== 'CUSTOMER') {
          const { data: branchUser } = await supabase
            .from('branch_users')
            .select('branch_id')
            .eq('user_id', user.id)
            .maybeSingle();

          if (branchUser) {
            branchId = branchUser.branch_id;
          }
        }

        // Auto-heal if staff profile is missing or out of date
        if (staffConfig && (!profile || profile.role !== staffConfig.role)) {
          try {
            await supabase.rpc('sync_staff_profile', {
              p_role: staffConfig.role,
              p_branch_id: staffConfig.branchId || null,
              p_phone: staffConfig.phone,
              p_full_name: staffConfig.name,
            });
          } catch {}

          try {
            await supabase.from('profiles').upsert({
              id: user.id,
              email: email,
              full_name: profile?.full_name || staffConfig.name,
              phone: profile?.phone || staffConfig.phone,
              role: staffConfig.role,
            }, { onConflict: 'id' });
          } catch {}

          if (staffConfig.branchId) {
            try {
              await supabase.from('branch_users').upsert({
                user_id: user.id,
                branch_id: staffConfig.branchId,
                role: staffConfig.role,
              }, { onConflict: 'user_id,branch_id' });
            } catch {}
          }
        }

        return {
          id: user.id,
          email: user.email,
          full_name: profile?.full_name || staffConfig?.name || user.user_metadata?.full_name || user.email.split('@')[0],
          phone: profile?.phone || staffConfig?.phone || user.user_metadata?.phone,
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


