import { BuffetRegistration, BuffetBooking } from '../types';
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

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch buffets: ${error.message}`);

    return (data || []).map((b: any) => ({
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

  static async bookBuffetTicket(params: {
    buffetId: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    guestsCount: number;
    totalAmount: number;
  }): Promise<BuffetBooking> {
    if (!supabase) throw new Error('Supabase client is not configured.');

    const randomHex = Array.from({ length: 8 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    const token = `buffet_qr_${Date.now()}_${randomHex}`;

    const { data, error } = await supabase
      .from('buffet_bookings')
      .insert({
        buffet_id: params.buffetId,
        customer_name: params.customerName,
        customer_phone: params.customerPhone,
        customer_email: params.customerEmail || null,
        guests_count: params.guestsCount,
        total_amount: params.totalAmount,
        qr_ticket_token: token,
        status: 'CONFIRMED',
      })
      .select('*')
      .single();

    if (error) throw new Error(`Failed to book buffet ticket: ${error.message}`);

    return {
      id: data.id,
      buffet_id: data.buffet_id,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      customer_email: data.customer_email || undefined,
      guests_count: data.guests_count,
      total_amount: Number(data.total_amount),
      qr_ticket_token: data.qr_ticket_token,
      status: data.status,
      created_at: data.created_at,
    };
  }

  static async getBookingByToken(token: string): Promise<BuffetBooking | null> {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('buffet_bookings')
      .select('*')
      .eq('qr_ticket_token', token)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      buffet_id: data.buffet_id,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      customer_email: data.customer_email || undefined,
      guests_count: data.guests_count,
      total_amount: Number(data.total_amount),
      qr_ticket_token: data.qr_ticket_token,
      status: data.status,
      created_at: data.created_at,
    };
  }

  static async getBookingsForBuffet(buffetId: string): Promise<BuffetBooking[]> {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('buffet_bookings')
      .select('*')
      .eq('buffet_id', buffetId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch bookings: ${error.message}`);

    return (data || []).map((b: any) => ({
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

  static async checkInBooking(token: string): Promise<boolean> {
    if (!supabase) throw new Error('Supabase client is not configured.');

    const { data, error } = await supabase
      .from('buffet_bookings')
      .update({ status: 'CHECKED_IN' })
      .eq('qr_ticket_token', token)
      .select('*')
      .maybeSingle();

    if (error || !data) return false;
    return true;
  }
}
