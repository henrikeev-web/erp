"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartProduct {
  id: string;
  name: string;
  price: number;
  imageUrl?: string;
  ageMin?: number | null;
  ageMax?: number | null;
  stock?: number; // undefined = unlimited
}

export interface CartItem {
  product: CartProduct;
  quantity: number;
  notes?: string;
}

interface CartStore {
  items: CartItem[];
  couponCode: string | null;
  discount: number;
  add: (product: CartProduct, quantity?: number) => "ok" | "stock_limit";
  remove: (productId: string) => void;
  updateQty: (productId: string, quantity: number) => "ok" | "stock_limit";
  updateNotes: (productId: string, notes: string) => void;
  clear: () => void;
  syncPrices: (prices: Record<string, number>) => void;
  setCoupon: (code: string, discount: number) => void;
  clearCoupon: () => void;
  subtotal: () => number;
  total: (deliveryFee: number) => number;
  itemCount: () => number;
}

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      couponCode: null,
      discount: 0,

      add: (product, quantity = 1) => {
        const maxQty = product.stock ?? Infinity;
        let result: "ok" | "stock_limit" = "ok";

        set((state) => {
          const existing = state.items.find((i) => i.product.id === product.id);
          if (existing) {
            const desired = existing.quantity + quantity;
            const capped = Math.min(desired, maxQty);
            if (capped <= existing.quantity) {
              result = "stock_limit";
              return state;
            }
            if (capped < desired) result = "stock_limit";
            return {
              items: state.items.map((i) =>
                i.product.id === product.id ? { ...i, quantity: capped, product } : i
              ),
            };
          }
          const capped = Math.min(quantity, maxQty);
          if (capped === 0) { result = "stock_limit"; return state; }
          if (capped < quantity) result = "stock_limit";
          return { items: [...state.items, { product, quantity: capped }] };
        });

        return result;
      },

      remove: (productId) => {
        set((state) => ({
          items: state.items.filter((i) => i.product.id !== productId),
        }));
      },

      updateQty: (productId, quantity) => {
        if (quantity <= 0) {
          get().remove(productId);
          return "ok";
        }
        let result: "ok" | "stock_limit" = "ok";
        set((state) => {
          const existing = state.items.find((i) => i.product.id === productId);
          const maxQty = existing?.product.stock ?? Infinity;
          const capped = Math.min(quantity, maxQty);
          if (capped < quantity) result = "stock_limit";
          return {
            items: state.items.map((i) =>
              i.product.id === productId ? { ...i, quantity: capped } : i
            ),
          };
        });
        return result;
      },

      updateNotes: (productId, notes) => {
        set((state) => ({
          items: state.items.map((i) =>
            i.product.id === productId ? { ...i, notes } : i
          ),
        }));
      },

      clear: () => set({ items: [], couponCode: null, discount: 0 }),

      // O carrinho fica no navegador (localStorage). Ao trocar de conta (varejo <-> revendedor) os preços
      // guardados ficam errados: reaplica os que o servidor enviou para a sessão atual.
      syncPrices: (prices) =>
        set((state) => {
          let changed = false;
          const items = state.items.map((i) => {
            const p = prices[i.product.id];
            if (p === undefined || p === i.product.price) return i;
            changed = true;
            return { ...i, product: { ...i.product, price: p } };
          });
          return changed ? { items, couponCode: null, discount: 0 } : state;
        }),

      setCoupon: (code, discount) => set({ couponCode: code, discount }),
      clearCoupon: () => set({ couponCode: null, discount: 0 }),

      subtotal: () => get().items.reduce((sum, i) => sum + i.product.price * i.quantity, 0),

      total: (deliveryFee) => {
        const { subtotal, discount } = get();
        return Math.max(0, subtotal() - discount + deliveryFee);
      },

      itemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
    }),
    {
      name: "banguelas-cart",
    }
  )
);
