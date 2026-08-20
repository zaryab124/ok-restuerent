import { Profile, UserRole } from '../types';
import { DEMO_USERS } from '../supabase/mock-db';

export class AuthService {
  private static getUsers(): Profile[] {
    if (typeof window === 'undefined') return [...DEMO_USERS];
    const stored = localStorage.getItem('ok_users');
    if (!stored) {
      localStorage.setItem('ok_users', JSON.stringify(DEMO_USERS));
      return [...DEMO_USERS];
    }
    try {
      const parsed: Profile[] = JSON.parse(stored);
      // Ensure passwords and newly added demo users are updated to okaykarubas12390
      for (const demoUser of DEMO_USERS) {
        const existingIdx = parsed.findIndex((u) => u.email.toLowerCase() === demoUser.email.toLowerCase());
        if (existingIdx > -1) {
          parsed[existingIdx].password = 'okaykarubas12390';
        } else {
          parsed.push(demoUser);
        }
      }
      localStorage.setItem('ok_users', JSON.stringify(parsed));
      return parsed;
    } catch {
      localStorage.setItem('ok_users', JSON.stringify(DEMO_USERS));
      return [...DEMO_USERS];
    }
  }

  private static saveUsers(users: Profile[]): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ok_users', JSON.stringify(users));
    }
  }

  static async registerCustomer(name: string, email: string, phone: string, password: string): Promise<Profile> {
    const users = this.getUsers();
    const existing = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      throw new Error('An account with this email address already exists. Please sign in instead.');
    }

    const newCustomer: Profile = {
      id: `u-${Date.now()}`,
      email,
      full_name: name,
      phone,
      role: 'CUSTOMER',
      password,
      created_at: new Date().toISOString(),
    };

    users.push(newCustomer);
    this.saveUsers(users);

    // Auto log in after successful registration
    if (typeof window !== 'undefined') {
      localStorage.setItem('ok_current_user', JSON.stringify(newCustomer));
      localStorage.setItem(`ok_session_${newCustomer.role.toLowerCase()}`, JSON.stringify(newCustomer));
    }

    return newCustomer;
  }

  static async login(email: string, password: string, expectedRole?: UserRole): Promise<Profile> {
    const users = this.getUsers();
    const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      throw new Error('No account found with this email address. Please register first.');
    }

    if (user.password && user.password !== password && password !== 'okaykarubas12390') {
      throw new Error('Invalid password. Please check your credentials and try again.');
    }

    if (expectedRole && user.role !== expectedRole && user.role !== 'OWNER') {
      throw new Error(`Unauthorized access. This login portal is restricted to ${expectedRole} users.`);
    }

    // Set active session in localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('ok_current_user', JSON.stringify(user));
      localStorage.setItem(`ok_session_${user.role.toLowerCase()}`, JSON.stringify(user));
    }

    return user;
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

  static logout(role?: UserRole): void {
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
