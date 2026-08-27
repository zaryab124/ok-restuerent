import { BuffetRegistration, BuffetBooking, BuffetCheckInResult } from '../types';
import { supabase } from '../supabase/client';

export class BuffetService {
  static async getActiveBuffets(branchId?: string): Promise<BuffetRegistration[]> {
    if (!supabase) return [];

    let query = supabase
      .from('buffet_registrations')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    try {
      const { data, error } = await query;
      if (!error && data) {
        return data.map((b: any) => ({
          id: b.id,
          branch_id: b.branch_id,
          title: b.title,
          description: b.description,
          dishes_list: b.dishes_list || [],
          price_per_head: Number(b.price_per_head),
          event_date: b.event_date,
          start_time: b.start_time,
          end_time: b.end_time,
          banner_image_url: b.banner_image_url || undefined,
          is_active: Boolean(b.is_active),
          created_at: b.created_at,
        }));
      }
    } catch {}

    return [];
  }

  static async createBuffet(params: Omit<BuffetRegistration, 'id' | 'created_at'>): Promise<BuffetRegistration> {
    if (!supabase) throw new Error('Supabase client is not configured.');

    const { data, error } = await supabase
      .from('buffet_registrations')
      .insert({
        branch_id: params.branch_id,
        title: params.title,
        description: params.description,
        dishes_list: params.dishes_list,
        price_per_head: params.price_per_head,
        event_date: params.event_date,
        start_time: params.start_time,
        end_time: params.end_time,
        banner_image_url: params.banner_image_url,
        is_active: params.is_active ?? true,
      })
      .select('*')
      .single();

    if (error) throw new Error(`Failed to create buffet: ${error.message}`);

    return {
      id: data.id,
      branch_id: data.branch_id,
      title: data.title,
      description: data.description,
      dishes_list: data.dishes_list || [],
      price_per_head: Number(data.price_per_head),
      event_date: data.event_date,
      start_time: data.start_time,
      end_time: data.end_time,
      banner_image_url: data.banner_image_url || undefined,
      is_active: Boolean(data.is_active),
      created_at: data.created_at,
    };
  }

  /**
   * Server-authoritative buffet ticket booking.
   * Total price (price_per_head * guests_count) is strictly computed in PostgreSQL.
   */
  static async bookBuffetTicket(params: {
    buffetId: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    guestsCount: number;
    totalAmount?: number; // Ignored for zero-trust security
  }): Promise<BuffetBooking> {
    if (!supabase) throw new Error('Supabase client is not configured.');

    const { data, error } = await supabase.rpc('book_buffet_ticket_atomic', {
      p_buffet_id: params.buffetId,
      p_customer_name: params.customerName,
      p_customer_phone: params.customerPhone,
      p_customer_email: params.customerEmail || null,
      p_guests_count: params.guestsCount,
    });

    if (error) {
      throw new Error(`Failed to book buffet ticket: ${error.message}`);
    }

    if (!data || data.length === 0) {
      throw new Error('Buffet booking returned empty result.');
    }

    const row = data[0];
    return {
      id: row.out_booking_id,
      buffet_id: params.buffetId,
      customer_name: params.customerName,
      customer_phone: params.customerPhone,
      customer_email: params.customerEmail || undefined,
      guests_count: params.guestsCount,
      total_amount: Number(row.out_total_amount),
      qr_ticket_token: row.out_qr_token,
      status: 'PENDING',
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Safe public ticket lookup by QR token.
   */
  static async getBookingByToken(token: string): Promise<BuffetBooking | null> {
    if (!supabase) return null;

    const { data, error } = await supabase.rpc('get_buffet_ticket_by_token', {
      p_token: token.trim(),
    });

    if (error || !data || data.length === 0) {
      // Fallback query if direct RPC is initializing
      const { data: fallback, error: fbErr } = await supabase
        .from('buffet_bookings')
        .select('*, buffet_registrations(*)')
        .eq('qr_ticket_token', token.trim())
        .maybeSingle();

      if (fbErr || !fallback) return null;

      return {
        id: fallback.id,
        buffet_id: fallback.buffet_id,
        customer_name: fallback.customer_name,
        customer_phone: fallback.customer_phone,
        customer_email: fallback.customer_email || undefined,
        guests_count: fallback.guests_count,
        total_amount: Number(fallback.total_amount),
        qr_ticket_token: fallback.qr_ticket_token,
        status: fallback.status,
        created_at: fallback.created_at,
      };
    }

    const row = data[0];
    return {
      id: row.out_id,
      buffet_id: row.out_buffet_id,
      customer_name: row.out_customer_name,
      customer_phone: row.out_customer_phone,
      customer_email: row.out_customer_email || undefined,
      guests_count: row.out_guests_count,
      total_amount: Number(row.out_total_amount),
      qr_ticket_token: row.out_qr_ticket_token,
      status: row.out_status,
      created_at: row.out_created_at,
      buffet_registration: {
        id: row.out_buffet_id,
        branch_id: row.out_branch_id,
        title: row.out_buffet_title,
        description: '',
        dishes_list: [],
        price_per_head: Number(row.out_price_per_head),
        event_date: row.out_event_date,
        start_time: row.out_start_time,
        end_time: row.out_end_time,
        is_active: true,
        created_at: row.out_created_at,
      },
    };
  }

  static async getBookingsForBuffet(buffetId: string): Promise<BuffetBooking[]> {
    if (!supabase || !buffetId) return [];

    try {
      const { data, error } = await supabase
        .from('buffet_bookings')
        .select('*')
        .eq('buffet_id', buffetId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data.map((b: any) => ({
          id: b.id,
          buffet_id: b.buffet_id,
          customer_name: b.customer_name,
          customer_phone: b.customer_phone,
          customer_email: b.customer_email || undefined,
          guests_count: b.guests_count,
          total_amount: Number(b.total_amount),
          qr_ticket_token: b.qr_ticket_token,
          status: b.status,
          created_at: b.created_at,
        }));
      }
    } catch {}

    return [];
  }

  /**
   * Atomic, Server-Authorized Buffet Ticket Check-in.
   * Enforces staff authorization, branch ownership, concurrency row locking, and writes an audit log.
   */
  static async checkInBooking(
    token: string,
    staffUserId: string,
    branchId: string
  ): Promise<BuffetCheckInResult> {
    if (!supabase) throw new Error('Supabase client is not configured.');

    if (!token || !token.trim()) {
      return { success: false, error: 'Please provide a valid ticket QR token.' };
    }

    if (!staffUserId) {
      return { success: false, error: 'Authentication required: Staff ID is missing.' };
    }

    if (!branchId) {
      return { success: false, error: 'Branch identification is required for check-in.' };
    }

    const { data, error } = await supabase.rpc('check_in_buffet_ticket_atomic', {
      p_qr_token: token.trim(),
      p_staff_user_id: staffUserId,
      p_branch_id: branchId,
    });

    if (error) {
      return {
        success: false,
        error: error.message || 'Check-in validation failed.',
      };
    }

    return {
      success: true,
      booking_id: data?.booking_id,
      customer_name: data?.customer_name,
      guests_count: data?.guests_count,
      buffet_title: data?.buffet_title,
      checked_in_at: data?.checked_in_at,
    };
  }
}
