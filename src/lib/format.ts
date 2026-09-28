import { Transaction } from '@/types';

export function formatCurrency(amount: number, currency = 'INR'): string {
  const formatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return formatter.format(amount);
}

export function formatDate(dateStr: string | Date): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export function formatRelativeDate(dateStr: string | Date): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

export function getPercentage(current: number, total: number): number {
  if (total <= 0) return 0;
  const pct = (current / total) * 100;
  return Math.min(Math.max(pct, 0), 100);
}

export function getGainLoss(invested: number, current: number) {
  const amount = current - invested;
  const percentage = invested > 0 ? (amount / invested) * 100 : 0;
  return {
    amount,
    percentage,
    isPositive: amount >= 0
  };
}

export function getDaysUntil(dateStr: string | Date): number {
  const date = new Date(dateStr);
  const today = new Date();
  
  date.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  
  const diffTime = date.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function getBillStatusColor(status: string): string {
  switch (status) {
    case 'paid': return 'status-paid';
    case 'overdue': return 'status-overdue';
    case 'due-soon': return 'status-due-soon';
    case 'upcoming': default: return 'status-upcoming';
  }
}

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'high': return 'text-red-400 bg-red-400/10 border-red-400/20';
    case 'medium': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
    case 'low': return 'text-green-400 bg-green-400/10 border-green-400/20';
    default: return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
  }
}

export function getCategoryIcon(categoryName: string): string {
  const icons: Record<string, string> = {
    'Food': '🍔',
    'Shopping': '🛍️',
    'Salary': '💰',
    'Rent': '🏠',
    'Transport': '🚗',
    'Entertainment': '🎬',
    'Utilities': '⚡',
    'Savings': '🏦',
    'Travel': '✈️',
    'Education': '📚',
    'Real Estate': '🏢'
  };
  return icons[categoryName] || '💵';
}

export function groupTransactionsByDate(transactions: Transaction[]): Record<string, Transaction[]> {
  const grouped: Record<string, Transaction[]> = {};
  
  transactions.forEach(tx => {
    const dateStr = new Date(tx.date).toDateString();
    if (!grouped[dateStr]) {
      grouped[dateStr] = [];
    }
    grouped[dateStr].push(tx);
  });
  
  return grouped;
}
