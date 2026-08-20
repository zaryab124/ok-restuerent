import React from 'react';
import { OrderStatus } from '@/lib/types';

interface Props {
  status: OrderStatus;
}

export const OrderStatusBadge: React.FC<Props> = ({ status }) => {
  const getColors = (s: OrderStatus) => {
    switch (s) {
      case 'PENDING':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/30';
      case 'CONFIRMED':
      case 'PREPARING':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
      case 'READY':
      case 'ASSIGNED':
      case 'PICKED_UP':
      case 'OUT_FOR_DELIVERY':
        return 'bg-indigo-500/10 text-indigo-500 border-indigo-500/30';
      case 'DELIVERED':
      case 'COMPLETED':
        return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
      case 'REJECTED':
      case 'CANCELLED':
        return 'bg-rose-500/10 text-rose-500 border-rose-500/30';
      default:
        return 'bg-slate-500/10 text-slate-500 border-slate-500/30';
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border ${getColors(
        status
      )}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      {status.replace(/_/g, ' ')}
    </span>
  );
};
