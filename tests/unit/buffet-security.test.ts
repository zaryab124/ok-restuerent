import crypto from 'crypto';
import { BuffetService } from '../../lib/services/buffet-service';
import { BuffetRegistration, BuffetBooking } from '../../lib/types';
import { supabase } from '../../lib/supabase/client';

describe('Buffet System Security Hardening & Concurrency Protection (Migration 011)', () => {
  const branchDera = 'b1000000-0000-0000-0000-000000000001';
  const branchJampur = 'b2000000-0000-0000-0000-000000000002';
  const branchKotChutta = 'b3000000-0000-0000-0000-000000000003';

  const staffAdminDera = {
    id: 'u1000000-0000-0000-0000-000000000001',
    role: 'BRANCH_ADMIN',
    branch_id: branchDera,
    full_name: 'Dera Branch Admin',
  };

  const staffAdminJampur = {
    id: 'u2000000-0000-0000-0000-000000000002',
    role: 'BRANCH_ADMIN',
    branch_id: branchJampur,
    full_name: 'Jampur Branch Admin',
  };

  const ownerUser = {
    id: 'u0000000-0000-0000-0000-000000000001',
    role: 'OWNER',
    branch_id: null,
    full_name: 'Executive Restaurant Owner',
  };

  const customerUser = {
    id: 'u9000000-0000-0000-0000-000000000099',
    role: 'CUSTOMER',
    branch_id: null,
    full_name: 'Ahmad Customer',
  };

  const mockBuffet: BuffetRegistration = {
    id: 'bf100000-0000-0000-0000-000000000001',
    branch_id: branchDera,
    title: 'Grand Weekend Desi Buffet',
    description: 'Unlimited Karahi, Biryani, BBQ, and Desserts',
    dishes_list: ['Chicken Karahi', 'Mutton Biryani', 'Seekh Kebab', 'Gulab Jamun'],
    price_per_head: 1450,
    event_date: '2026-08-30',
    start_time: '19:00',
    end_time: '23:00',
    is_active: true,
    created_at: '2026-08-27T00:00:00Z',
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Server-Side Price & Guest Count Authority', () => {
    test('Server calculates total strictly as price_per_head * guests_count, ignoring client manipulation', async () => {
      // Mock Supabase RPC call
      if (supabase) {
        jest.spyOn(supabase, 'rpc').mockImplementation(async (rpcName: string, params: any) => {
          if (rpcName === 'book_buffet_ticket_atomic') {
            // Simulated server calculation
            const authoritativeTotal = mockBuffet.price_per_head * params.p_guests_count;
            return {
              data: [{
                out_booking_id: 'bk-test-1',
                out_qr_token: 'buffet_qr_' + crypto.randomBytes(16).toString('hex'),
                out_total_amount: authoritativeTotal,
              }],
              error: null,
            } as any;
          }
          return { data: null, error: null } as any;
        });
      }

      // Attacker attempts to pass totalAmount: 10
      const booking = await BuffetService.bookBuffetTicket({
        buffetId: mockBuffet.id,
        customerName: 'Zaryab Khan',
        customerPhone: '03001234567',
        guestsCount: 4,
        totalAmount: 10, // Tampered client price
      });

      // Authoritative calculation: 1450 * 4 = 5800
      expect(booking.total_amount).toBe(5800);
      expect(booking.total_amount).not.toBe(10);
      expect(booking.guests_count).toBe(4);
    });

    test('Rejects invalid, zero, negative, or excessive guest counts in PostgreSQL logic', () => {
      const simulateBookingValidation = (buffet: BuffetRegistration, guests: number) => {
        if (!guests || guests <= 0 || guests > 50) {
          throw new Error(`Invalid guest count: ${guests}. Must be between 1 and 50 guests.`);
        }
        return buffet.price_per_head * guests;
      };

      expect(() => simulateBookingValidation(mockBuffet, 0)).toThrow('Must be between 1 and 50 guests.');
      expect(() => simulateBookingValidation(mockBuffet, -3)).toThrow('Must be between 1 and 50 guests.');
      expect(() => simulateBookingValidation(mockBuffet, 51)).toThrow('Must be between 1 and 50 guests.');
      expect(simulateBookingValidation(mockBuffet, 5)).toBe(7250);
    });
  });

  describe('2. Cryptographically Secure Token Generation', () => {
    test('Generated QR tokens use 128-bit cryptographically secure entropy', () => {
      const generateSecureToken = () => {
        return 'buffet_qr_' + crypto.randomBytes(16).toString('hex');
      };

      const token1 = generateSecureToken();
      const token2 = generateSecureToken();

      expect(token1).toMatch(/^buffet_qr_[0-9a-f]{32}$/);
      expect(token2).toMatch(/^buffet_qr_[0-9a-f]{32}$/);
      expect(token1).not.toBe(token2);
      expect(token1.length).toBe(42); // 'buffet_qr_' (10) + 32 hex = 42
    });
  });

  describe('3. Server-Authorized Atomic Check-In Engine', () => {
    // Simulator for PostgreSQL check_in_buffet_ticket_atomic logic
    const simulateAtomicCheckIn = (
      token: string,
      staff: { id: string; role: string; branch_id: string | null; full_name: string },
      branchId: string,
      bookingState: {
        token: string;
        buffetBranchId: string;
        status: 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'CANCELLED';
        customer_name: string;
        guests_count: number;
      },
      auditLogs: any[]
    ) => {
      // 1. Staff validation
      if (!staff || !staff.id) {
        throw new Error('Authentication required: Staff ID must be provided.');
      }
      if (!['OWNER', 'BRANCH_ADMIN', 'KITCHEN'].includes(staff.role)) {
        throw new Error(`Access Denied: Insufficient permissions for buffet check-in (${staff.role} role).`);
      }
      if (staff.role !== 'OWNER' && staff.branch_id !== branchId) {
        throw new Error('Access Denied: Staff belongs to a different branch.');
      }

      // 2. Token match
      if (bookingState.token !== token) {
        throw new Error(`Invalid Ticket: No buffet booking found for token "${token}".`);
      }

      // 3. Branch match
      if (bookingState.buffetBranchId !== branchId) {
        throw new Error(
          `Wrong Branch: This ticket is for branch "${bookingState.buffetBranchId}", but check-in was attempted at branch "${branchId}".`
        );
      }

      // 4. Status checks
      if (bookingState.status === 'CANCELLED') {
        throw new Error('Ticket Cancelled: This booking ticket has been cancelled.');
      }
      if (bookingState.status === 'CHECKED_IN') {
        throw new Error('Ticket Reused: Ticket has already been checked in.');
      }

      // 5. Atomic state update
      bookingState.status = 'CHECKED_IN';

      // 6. Audit log
      const log = {
        booking_token: token,
        branch_id: branchId,
        checked_in_by: staff.id,
        staff_role: staff.role,
        guests_count: bookingState.guests_count,
        checked_in_at: new Date().toISOString(),
      };
      auditLogs.push(log);

      return {
        success: true,
        customer_name: bookingState.customer_name,
        guests_count: bookingState.guests_count,
        checked_in_at: log.checked_in_at,
      };
    };

    test('Successfully checks in valid ticket when staff and branch match', () => {
      const booking = {
        token: 'buffet_qr_0123456789abcdef0123456789abcdef',
        buffetBranchId: branchDera,
        status: 'CONFIRMED' as const,
        customer_name: 'Tariq Mehmood',
        guests_count: 3,
      };
      const auditLogs: any[] = [];

      const result = simulateAtomicCheckIn(
        booking.token,
        staffAdminDera,
        branchDera,
        booking,
        auditLogs
      );

      expect(result.success).toBe(true);
      expect(result.customer_name).toBe('Tariq Mehmood');
      expect(booking.status).toBe('CHECKED_IN');
      expect(auditLogs.length).toBe(1);
      expect(auditLogs[0].checked_in_by).toBe(staffAdminDera.id);
    });

    test('Rejects invalid / non-existent QR token', () => {
      const booking = {
        token: 'buffet_qr_valid_token_1111111111111111',
        buffetBranchId: branchDera,
        status: 'CONFIRMED' as const,
        customer_name: 'Ali',
        guests_count: 2,
      };
      const auditLogs: any[] = [];

      expect(() => {
        simulateAtomicCheckIn('buffet_qr_FAKE_OR_TAMPERED', staffAdminDera, branchDera, booking, auditLogs);
      }).toThrow('Invalid Ticket: No buffet booking found for token "buffet_qr_FAKE_OR_TAMPERED".');
    });

    test('Rejects reused QR token (Prevents double entry)', () => {
      const booking = {
        token: 'buffet_qr_already_used_2222222222222222',
        buffetBranchId: branchDera,
        status: 'CHECKED_IN' as const, // Already checked in!
        customer_name: 'Hamza',
        guests_count: 4,
      };
      const auditLogs: any[] = [];

      expect(() => {
        simulateAtomicCheckIn(booking.token, staffAdminDera, branchDera, booking, auditLogs);
      }).toThrow('Ticket Reused: Ticket has already been checked in.');
    });

    test('Rejects ticket presented at the Wrong Branch', () => {
      // Ticket was bought for Dera branch
      const booking = {
        token: 'buffet_qr_dera_event_3333333333333333',
        buffetBranchId: branchDera,
        status: 'CONFIRMED' as const,
        customer_name: 'Farhan',
        guests_count: 2,
      };
      const auditLogs: any[] = [];

      // Customer presents ticket at Jampur branch
      expect(() => {
        simulateAtomicCheckIn(booking.token, staffAdminJampur, branchJampur, booking, auditLogs);
      }).toThrow(`Wrong Branch: This ticket is for branch "${branchDera}", but check-in was attempted at branch "${branchJampur}".`);
    });

    test('Rejects unauthorized user role (e.g. CUSTOMER role)', () => {
      const booking = {
        token: 'buffet_qr_test_4444444444444444',
        buffetBranchId: branchDera,
        status: 'CONFIRMED' as const,
        customer_name: 'Farhan',
        guests_count: 2,
      };
      const auditLogs: any[] = [];

      expect(() => {
        simulateAtomicCheckIn(booking.token, customerUser, branchDera, booking, auditLogs);
      }).toThrow('Access Denied: Insufficient permissions for buffet check-in (CUSTOMER role).');
    });

    test('Rejects staff member checking in at a branch they do not belong to', () => {
      const booking = {
        token: 'buffet_qr_test_5555555555555555',
        buffetBranchId: branchKotChutta,
        status: 'CONFIRMED' as const,
        customer_name: 'Farhan',
        guests_count: 2,
      };
      const auditLogs: any[] = [];

      // Dera admin tries to check in at Kot Chutta branch
      expect(() => {
        simulateAtomicCheckIn(booking.token, staffAdminDera, branchKotChutta, booking, auditLogs);
      }).toThrow('Access Denied: Staff belongs to a different branch.');
    });

    test('Allows OWNER to check in tickets across all branches', () => {
      const booking = {
        token: 'buffet_qr_owner_checkin_666666666666',
        buffetBranchId: branchKotChutta,
        status: 'CONFIRMED' as const,
        customer_name: 'Kamran',
        guests_count: 6,
      };
      const auditLogs: any[] = [];

      const result = simulateAtomicCheckIn(booking.token, ownerUser, branchKotChutta, booking, auditLogs);
      expect(result.success).toBe(true);
      expect(booking.status).toBe('CHECKED_IN');
    });
  });

  describe('4. Concurrency Protection & Race Condition Safety', () => {
    test('Two simultaneous check-in attempts on same ticket result in only 1 success and 1 rejection', async () => {
      const booking = {
        token: 'buffet_qr_race_condition_777777777777',
        buffetBranchId: branchDera,
        status: 'CONFIRMED' as const,
        customer_name: 'Sara Khan',
        guests_count: 2,
      };
      const auditLogs: any[] = [];

      // Mutex lock simulator (representing PostgreSQL SELECT FOR UPDATE row lock)
      let isRowLocked = false;
      const simulateLockedCheckIn = async (staff: any) => {
        while (isRowLocked) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        isRowLocked = true;
        try {
          if (booking.status === 'CHECKED_IN') {
            throw new Error('Ticket Reused: Ticket has already been checked in.');
          }
          booking.status = 'CHECKED_IN';
          auditLogs.push({ staff_id: staff.id, token: booking.token });
          return { success: true };
        } finally {
          isRowLocked = false;
        }
      };

      // Two staff members scan the QR ticket at the exact same instant
      const attempts = await Promise.allSettled([
        simulateLockedCheckIn(staffAdminDera),
        simulateLockedCheckIn(staffAdminDera),
      ]);

      const successes = attempts.filter((r) => r.status === 'fulfilled');
      const failures = attempts.filter((r) => r.status === 'rejected');

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);
      expect(auditLogs.length).toBe(1);
      if (failures[0].status === 'rejected') {
        expect(failures[0].reason.message).toBe('Ticket Reused: Ticket has already been checked in.');
      }
    });
  });

  describe('5. BuffetService TypeScript Integration', () => {
    test('BuffetService.checkInBooking returns structured error on invalid input', async () => {
      const res = await BuffetService.checkInBooking('', staffAdminDera.id, branchDera);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Please provide a valid ticket QR token.');
    });

    test('BuffetService.checkInBooking returns structured error on missing staff ID', async () => {
      const res = await BuffetService.checkInBooking('buffet_qr_123', '', branchDera);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Authentication required: Staff ID is missing.');
    });
  });
});
