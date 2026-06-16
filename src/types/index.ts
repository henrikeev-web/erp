export type { Brand, Product, Category, Customer, Child, CustomerAddress, Order, OrderItem, Payment, Coupon, LoyaltyCard, LoyaltyTransaction, StockItem, StockMovement, DeliveryZone, FollowUp, FiscalDocument, ThematicMenu } from "@/generated/prisma/client";

export type ProductWithImages = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  priceOriginal: number | null;
  ageMin: number | null;
  ageMax: number | null;
  weight: number | null;
  servings: number | null;
  ingredients: string | null;
  allergens: string | null;
  frozen: boolean;
  active: boolean;
  featured: boolean;
  order: number;
  categoryId: string | null;
  brandId: string;
  images: { id: string; url: string; alt: string | null; isMain: boolean }[];
  category: { id: string; name: string; slug: string } | null;
  stockItem: { quantity: number; unit: string } | null;
};

export type OrderWithDetails = {
  id: string;
  number: number;
  status: string;
  type: string;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  scheduledTo: Date | null;
  deliveredAt: Date | null;
  customer: { id: string; name: string; phone: string; email: string | null };
  address: {
    street: string;
    number: string;
    complement: string | null;
    neighborhood: string;
    city: string;
    state: string;
    cep: string;
  } | null;
  deliveryZone: { name: string; fee: number } | null;
  items: { id: string; name: string; price: number; quantity: number; total: number; notes: string | null }[];
  payment: { method: string; status: string; amount: number; changeAmount: number | null } | null;
  couponCode: string | null;
};

export type CustomerWithDetails = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  cpf: string | null;
  active: boolean;
  notes: string | null;
  createdAt: Date;
  lastOrderAt: Date | null;
  children: { id: string; name: string; birthDate: Date }[];
  addresses: { id: string; label: string; street: string; number: string; neighborhood: string; city: string; isDefault: boolean }[];
  loyaltyCard: { points: number; tier: string } | null;
  _count: { orders: number };
};

export type DashboardStats = {
  totalOrders: number;
  totalRevenue: number;
  pendingOrders: number;
  activeCustomers: number;
  ordersToday: number;
  revenueToday: number;
  avgTicket: number;
  topProducts: { name: string; count: number }[];
};
