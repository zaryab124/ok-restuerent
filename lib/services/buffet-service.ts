import { BuffetRegistration, BuffetBooking } from '../types';

export class BuffetService {
  private static buffets: BuffetRegistration[] = [
    {
      id: 'buff-1',
      branch_id: 'b1000000-0000-0000-0000-000000000001',
      title: 'Grand Weekend Royal Buffet',
      description: 'Unlimited 40+ dishes including Chicken Karahi, Mutton Handi, BBQ Malai Boti, Seekh Kabab, Biryani, Chinese Starters, Fresh Naan, Desserts & Unlimited Drinks!',
      dishes_list: [
        'OK Special Afghani Karahi',
        'Chicken White Karahi',
        'Mutton Handi',
        'Malai Boti BBQ',
        'Seekh Kabab',
        'Chicken Biryani',
        'Chicken Chowmain',
        'Chicken Hot & Sour Soup',
        'Garlic Naan & Fresh Roti',
        'Special Ice Cream & Badami Chai',
      ],
      price_per_head: 1850,
      event_date: 'Every Saturday & Sunday',
      start_time: '07:00 PM',
      end_time: '11:00 PM',
      banner_image_url: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&auto=format&fit=crop&q=80',
      is_active: true,
      created_at: new Date().toISOString(),
    },
  ];

  private static bookings: BuffetBooking[] = [];

  static async getActiveBuffets(branchId?: string): Promise<BuffetRegistration[]> {
    let result = this.buffets.filter((b) => b.is_active);
    if (branchId) {
      result = result.filter((b) => b.branch_id === branchId);
    }
    return result;
  }

  static async createBuffet(params: Omit<BuffetRegistration, 'id' | 'created_at'>): Promise<BuffetRegistration> {
    const newBuffet: BuffetRegistration = {
      ...params,
      id: `buff-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    this.buffets.push(newBuffet);
    return newBuffet;
  }

  static async bookBuffetTicket(params: {
    buffetId: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    guestsCount: number;
    totalAmount: number;
  }): Promise<BuffetBooking> {
    const token = `buffet_qr_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    const booking: BuffetBooking = {
      id: `book-${Date.now()}`,
      buffet_id: params.buffetId,
      customer_name: params.customerName,
      customer_phone: params.customerPhone,
      customer_email: params.customerEmail,
      guests_count: params.guestsCount,
      total_amount: params.totalAmount,
      qr_ticket_token: token,
      status: 'CONFIRMED',
      created_at: new Date().toISOString(),
    };

    this.bookings.unshift(booking);
    return booking;
  }

  static async getBookingByToken(token: string): Promise<BuffetBooking | null> {
    return this.bookings.find((b) => b.qr_ticket_token === token) || null;
  }

  static async getBookingsForBuffet(buffetId: string): Promise<BuffetBooking[]> {
    return this.bookings.filter((b) => b.buffet_id === buffetId);
  }

  static async checkInBooking(token: string): Promise<boolean> {
    const booking = this.bookings.find((b) => b.qr_ticket_token === token);
    if (!booking) return false;
    booking.status = 'CHECKED_IN';
    return true;
  }
}
