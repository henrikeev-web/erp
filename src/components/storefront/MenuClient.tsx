"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/store/cart";
import { formatCurrency, ageLabel } from "@/lib/utils";
import CartDrawer from "./CartDrawer";
import CheckoutModal from "./CheckoutModal";
import ComboBuilder from "@/components/ComboBuilder";
import type { PublicCombo } from "@/lib/combo-data";

interface BannerSlide {
  id: string;
  desktopImageUrl: string;
  mobileImageUrl: string;
  linkUrl: string | null;
  order: number;
}

interface MenuClientProps {
  brand: {
    id: string; name: string; logoUrl: string | null; primaryColor: string;
    bannerTitle: string | null; bannerSubtitle: string | null;
    bannerBgColor: string | null; bannerBadges: string[];
  };
  bannerSlides: BannerSlide[];
  /** Nível de preço desta sessão, decidido no servidor. RESELLER = revendedor cadastrado e logado. */
  pricingTier?: "RETAIL" | "RESELLER";
  categories: { id: string; name: string; slug: string; ageMin: number | null; ageMax: number | null }[];
  products: {
    id: string; name: string; description: string | null; price: number; priceOriginal: number | null;
    ageMin: number | null; ageMax: number | null; featured: boolean; frozen: boolean;
    categoryId: string | null; weight: number | null; servings: number | null;
    ingredients: string | null; allergens: string | null;
    images: { id: string; url: string; alt: string | null; isMain: boolean }[];
    category: { id: string; name: string; slug: string } | null;
    stockItem: { quantity: number } | null;
    kind?: "SIMPLE" | "COMBO";
    combo?: PublicCombo;
  }[];
  thematicMenus: {
    id: string; name: string; description: string | null; imageUrl: string | null;
    ageMin: number | null; ageMax: number | null;
    products: { product: { id: string; name: string; price: number; priceOriginal: number | null; ageMin: number | null; ageMax: number | null; featured: boolean; images: { url: string; isMain: boolean }[]; stockItem: { quantity: number } | null } }[];
  }[];
}

const PALETTE = [
  { color: "#F26C21", tint: "#FCE6D4" },
  { color: "#62C1B1", tint: "#DBF1ED" },
  { color: "#E55C5A", tint: "#FBE3E2" },
  { color: "#9BCB3B", tint: "#E8F3D2" },
  { color: "#FAD200", tint: "#FEF3C9" },
  { color: "#C7B89D", tint: "#EFE9DC" },
];

function Mascote({ size = 34, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} style={{ display: "block", overflow: "visible", ...style }}>
      <path d="M64 24 C66 7 98 5 102 26 C105 42 87 47 82 34" fill="none" stroke="#231a14" strokeWidth="11" strokeLinecap="round" />
      <circle cx="58" cy="66" r="46" fill="#ffffff" />
      <ellipse cx="46" cy="55" rx="6.5" ry="9.5" fill="#231a14" />
      <ellipse cx="72" cy="55" rx="6.5" ry="9.5" fill="#231a14" />
      <path d="M33 74 C33 71 83 71 83 74 C83 97 64 105 58 105 C50 105 33 97 33 74 Z" fill="#231a14" />
      <path d="M44 90 C48 103 70 103 73 90 C73 86 44 86 44 90 Z" fill="#E55C5A" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C7B89D" strokeWidth="2.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
    </svg>
  );
}

function CheckIcon({ color = "#62C1B1" }: { color?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export default function MenuClient({ brand, bannerSlides, categories, products, pricingTier = "RETAIL" }: MenuClientProps) {
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<typeof products[0] | null>(null);
  const [selectedQty, setSelectedQty] = useState(1);
  const [cartOpen, setCartOpen] = useState(false);
  const [filterCat, setFilterCat] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [builder, setBuilder] = useState<MenuClientProps["products"][0] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [slideIdx, setSlideIdx] = useState(0);
  const [slidePaused, setSlidePaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const activeSlides = bannerSlides.filter((s) => s);

  useEffect(() => {
    if (activeSlides.length <= 1 || slidePaused) return;
    const t = setInterval(() => setSlideIdx((i) => (i + 1) % activeSlides.length), 4000);
    return () => clearInterval(t);
  }, [activeSlides.length, slidePaused]);

  const { items, add, addCombo, remove, updateQty, itemCount, subtotal, syncPrices } = useCart();

  // Carrinho guardado no navegador pode ter preços de outra conta: alinha com o que o servidor enviou agora
  useEffect(() => {
    syncPrices(Object.fromEntries(products.map((p) => [p.id, p.price])));
  }, [products, syncPrices]);

  const productColorMap = useMemo(() => {
    const map = new Map<string, { color: string; tint: string }>();
    products.forEach((p, i) => map.set(p.id, PALETTE[i % PALETTE.length]));
    return map;
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterCat !== null && p.categoryId !== filterCat) return false;
      return true;
    });
  }, [products, search, filterCat]);

  const featured = useMemo(() => filtered.filter((p) => p.featured), [filtered]);

  const byCategory = useMemo(() =>
    categories
      .map((cat) => ({ category: cat, items: filtered.filter((p) => p.categoryId === cat.id) }))
      .filter((g) => g.items.length > 0),
    [categories, filtered]
  );

  const uncategorized = useMemo(() => filtered.filter((p) => !p.categoryId && !p.featured), [filtered]);

  function getMainImage(images: { url: string; isMain: boolean }[]) {
    return images.find((i) => i.isMain)?.url ?? images[0]?.url ?? null;
  }

  function getCartQty(productId: string) {
    return items.find((i) => i.product.id === productId && !i.combo)?.quantity ?? 0;
  }

  function isOutOfStock(p: typeof products[0]) {
    if (p.kind === "COMBO") return !p.combo?.available; // combo só some da venda se não dá para montar (produtos sem estoque)
    return p.stockItem !== null && p.stockItem.quantity <= 0;
  }

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  function cartProduct(p: { id: string; name: string; price: number; ageMin: number | null; ageMax: number | null; images: { url: string; isMain: boolean }[]; stockItem: { quantity: number } | null }) {
    return { id: p.id, name: p.name, price: p.price, imageUrl: getMainImage(p.images) ?? undefined, ageMin: p.ageMin, ageMax: p.ageMax, stock: p.stockItem?.quantity ?? undefined };
  }

  function handleAdd(p: typeof products[0]) {
    if (p.kind === "COMBO") { setBuilder(p); return; }
    const result = add(cartProduct(p));
    if (result === "stock_limit") {
      showToast(`Limite de estoque atingido para ${p.name}`);
    } else {
      showToast(`${p.name} adicionado!`);
    }
  }

  function handleAddSelected() {
    if (!selectedProduct) return;
    if (selectedProduct.kind === "COMBO") { setBuilder(selectedProduct); setSelectedProduct(null); return; }
    const result = add(cartProduct(selectedProduct), selectedQty);
    if (result === "stock_limit") {
      showToast(`Limite de estoque atingido para ${selectedProduct.name}`);
    } else {
      showToast(`${selectedProduct.name} adicionado!`);
    }
    setSelectedProduct(null);
  }

  function openProduct(p: typeof products[0]) {
    setSelectedProduct(p);
    setSelectedQty(1);
  }

  const count = itemCount();
  const sub = subtotal();

  const FREE_FROM = 80;
  const deliveryFee = sub >= FREE_FROM ? 0 : 7.9;
  const showFreeHint = sub > 0 && sub < FREE_FROM;

  return (
    <>
      <style>{`
        @keyframes bgl-float{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-16px) rotate(5deg)}}
        @keyframes bgl-pop{0%{opacity:0;transform:translateY(22px) scale(.96)}100%{opacity:1;transform:none}}
        @keyframes bgl-slide{0%{transform:translateX(105%)}100%{transform:translateX(0)}}
        @keyframes bgl-fade{0%{opacity:0}100%{opacity:1}}
        @keyframes bgl-toast{0%{opacity:0;transform:translate(-50%,24px)}100%{opacity:1;transform:translate(-50%,0)}}
        @keyframes bgl-wig{0%,100%{transform:rotate(0deg)}25%{transform:rotate(-7deg)}75%{transform:rotate(7deg)}}
        .bgl-card{cursor:pointer;background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 2px 0 #EFE4D2,0 10px 22px rgba(74,53,38,.06);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;display:flex;flex-direction:column;border:2px solid #fff;}
        .bgl-card:hover{transform:translateY(-5px);box-shadow:0 7px 0 #EAD9C0,0 22px 34px rgba(74,53,38,.14);border-color:#F6E7CE}
        .bgl-btn-primary{background:#F26C21;color:#fff;border:none;border-radius:16px;padding:15px 20px;font-family:'Baloo 2',sans-serif;font-weight:700;font-size:17px;cursor:pointer;box-shadow:0 5px 0 #C9530C;transition:transform .12s,box-shadow .12s;}
        .bgl-btn-primary:hover{background:#FF7A2E}
        .bgl-btn-primary:active{transform:translateY(4px);box-shadow:0 1px 0 #C9530C}
        .bgl-add-btn{width:44px;height:44px;border-radius:14px;border:none;background:#F26C21;color:#fff;font-size:27px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 0 #C9530C;transition:transform .12s,box-shadow .12s;line-height:0;flex:none;}
        .bgl-add-btn:hover{background:#FF7A2E}
        .bgl-add-btn:active{transform:translateY(3px);box-shadow:0 1px 0 #C9530C}
        .bgl-cart-btn{position:relative;display:flex;align-items:center;gap:9px;background:#F26C21;color:#fff;border:none;border-radius:14px;padding:11px 16px;font-family:'Baloo 2',sans-serif;font-weight:600;font-size:15px;cursor:pointer;box-shadow:0 4px 0 #C9530C;transition:transform .12s,box-shadow .12s;white-space:nowrap;}
        .bgl-cart-btn:active{transform:translateY(3px);box-shadow:0 1px 0 #C9530C}
        .bgl-chip{padding:9px 15px;border-radius:999px;border:2px solid;font-weight:600;font-size:13.5px;white-space:nowrap;cursor:pointer;font-family:'Poppins',sans-serif;transition:all .15s;flex:none;}
        .bgl-tab{padding:8px 16px;border-radius:999px;border:none;font-weight:600;font-size:14px;white-space:nowrap;cursor:pointer;font-family:'Poppins',sans-serif;transition:all .15s;flex:none;}
        .bgl-input{width:100%;border:2px solid #EBDDC8;background:#fff;border-radius:15px;padding:13px 16px 13px 46px;font-size:15px;font-family:'Poppins',sans-serif;color:#4A3526;}
        .bgl-input:focus{outline:none;border-color:#F26C21;}
        ::selection{background:#FAD200;color:#4A3526;}
      `}</style>

      <div style={{ minHeight: "100vh", fontFamily: "'Poppins',sans-serif", color: "#4A3526" }}>

        {pricingTier === "RESELLER" && (
          <div style={{ background: "#4A3526", color: "#FAD200", textAlign: "center", fontSize: 13, fontWeight: 600, padding: "7px 12px" }}>
            Você está vendo os preços de revenda
          </div>
        )}

        {/* ── HEADER ── */}
        <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(251,246,236,.92)", backdropFilter: "blur(12px)", borderBottom: "2px solid #F0E7D6" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto", padding: "12px 20px 10px", display: "flex", flexDirection: "column", gap: 11 }}>

            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
                <img src="/logo.svg" alt="Banguelas" style={{ height: 48, width: "auto", display: "block" }} />
              </div>

              <div style={{ flex: 1 }} />

              <Link
                href="/minha-conta"
                style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#8A7A68", textDecoration: "none", fontWeight: 500, padding: "6px 12px", borderRadius: 20, border: "1.5px solid #EBDDC8", background: "#fff", whiteSpace: "nowrap" }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                </svg>
                Minha conta
              </Link>

              <button className="bgl-cart-btn" onClick={() => setCartOpen(true)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" />
                  <path d="M2 3h3l2.4 12.5a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.5-1.2L22 7H6" />
                </svg>
                <span>{count > 0 ? formatCurrency(sub) : "Carrinho"}</span>
                {count > 0 && (
                  <span style={{ position: "absolute", top: -7, right: -7, minWidth: 22, height: 22, padding: "0 5px", background: "#E55C5A", color: "#fff", border: "2px solid #FBF6EC", borderRadius: 999, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {count}
                  </span>
                )}
              </button>
            </div>

            {/* Search */}
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <span style={{ position: "absolute", left: 16, display: "flex", pointerEvents: "none" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B5A899" strokeWidth="2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" />
                </svg>
              </span>
              <input
                className="bgl-input"
                placeholder="Buscar papinha, refeição, snack…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Category filter chips */}
            <div style={{ display: "flex", gap: 9, overflowX: "auto", paddingBottom: 3 }}>
              <button
                className="bgl-chip"
                style={{ borderColor: filterCat === null ? "#F26C21" : "#EBDDC8", background: filterCat === null ? "#F26C21" : "#fff", color: filterCat === null ? "#fff" : "#7A6A5A" }}
                onClick={() => setFilterCat(null)}
              >
                Todos
              </button>
              {categories.map((cat) => {
                const active = filterCat === cat.id;
                return (
                  <button
                    key={cat.id}
                    className="bgl-chip"
                    style={{ borderColor: active ? "#F26C21" : "#EBDDC8", background: active ? "#F26C21" : "#fff", color: active ? "#fff" : "#7A6A5A" }}
                    onClick={() => setFilterCat(cat.id)}
                  >
                    {cat.name}
                  </button>
                );
              })}
            </div>

          </div>
        </header>

        {/* ── HERO / CARROSSEL ── */}
        <section style={{ maxWidth: 1180, margin: "18px auto 0", padding: "0 20px" }}>
          {activeSlides.length > 0 ? (
            <div
              style={{ position: "relative", overflow: "hidden", borderRadius: 30, boxShadow: "0 16px 34px rgba(74,53,38,.12)", height: "clamp(200px,26vw,308px)" }}
              onMouseEnter={() => setSlidePaused(true)}
              onMouseLeave={() => setSlidePaused(false)}
              onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
              onTouchEnd={(e) => {
                if (touchStartX.current === null) return;
                const dx = e.changedTouches[0].clientX - touchStartX.current;
                if (Math.abs(dx) > 40) setSlideIdx((i) => dx < 0 ? (i + 1) % activeSlides.length : (i - 1 + activeSlides.length) % activeSlides.length);
                touchStartX.current = null;
              }}
            >
              {activeSlides.map((slide, i) => {
                const content = (
                  <picture style={{ display: "block", width: "100%", height: "100%" }}>
                    <source media="(max-width: 640px)" srcSet={slide.mobileImageUrl} />
                    <img
                      src={slide.desktopImageUrl}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      draggable={false}
                    />
                  </picture>
                );
                return (
                  <div
                    key={slide.id}
                    style={{
                      position: "absolute", inset: 0,
                      opacity: i === slideIdx ? 1 : 0,
                      transition: "opacity 0.55s ease",
                      pointerEvents: i === slideIdx ? "auto" : "none",
                    }}
                  >
                    {slide.linkUrl ? (
                      <a href={slide.linkUrl} style={{ display: "block", width: "100%", height: "100%", textDecoration: "none" }}>
                        {content}
                      </a>
                    ) : content}
                  </div>
                );
              })}

              {/* Dots */}
              {activeSlides.length > 1 && (
                <div style={{ position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 7, zIndex: 10 }}>
                  {activeSlides.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setSlideIdx(i)}
                      style={{ width: i === slideIdx ? 22 : 8, height: 8, borderRadius: 999, border: "none", background: i === slideIdx ? "#fff" : "rgba(255,255,255,.5)", padding: 0, cursor: "pointer", transition: "all .3s ease", boxShadow: "0 2px 6px rgba(0,0,0,.25)" }}
                    />
                  ))}
                </div>
              )}

              {/* Arrows */}
              {activeSlides.length > 1 && (
                <>
                  <button
                    onClick={() => setSlideIdx((i) => (i - 1 + activeSlides.length) % activeSlides.length)}
                    style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", zIndex: 10, width: 38, height: 38, borderRadius: "50%", border: "none", background: "rgba(255,255,255,.82)", color: "#4A3526", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,0,0,.15)", backdropFilter: "blur(4px)" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
                  </button>
                  <button
                    onClick={() => setSlideIdx((i) => (i + 1) % activeSlides.length)}
                    style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", zIndex: 10, width: 38, height: 38, borderRadius: "50%", border: "none", background: "rgba(255,255,255,.82)", color: "#4A3526", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,0,0,.15)", backdropFilter: "blur(4px)" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
                  </button>
                </>
              )}
            </div>
          ) : (
            /* Fallback sem slides */
            <div style={{ position: "relative", overflow: "hidden", borderRadius: 30, background: brand.bannerBgColor ?? "#FAD200", height: "clamp(200px,26vw,308px)", boxShadow: "0 16px 34px rgba(74,53,38,.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ position: "absolute", width: 240, height: 240, borderRadius: "46% 54% 62% 38%/45% 55% 45% 55%", background: "#62C1B1", opacity: .35, left: -70, top: -90, animation: "bgl-float 9s ease-in-out infinite" }} />
              <div style={{ position: "absolute", width: 170, height: 170, borderRadius: "58% 42% 40% 60%/52% 44% 56% 48%", background: "#E55C5A", opacity: .3, right: "34%", bottom: -80, animation: "bgl-float 11s ease-in-out infinite .6s" }} />
              <Mascote size={160} style={{ filter: "drop-shadow(0 10px 20px rgba(74,53,38,.18))", animation: "bgl-float 7s ease-in-out infinite" }} />
            </div>
          )}
        </section>

        {/* ── PRODUTOS ── */}
        <main style={{ maxWidth: 1180, margin: "0 auto", padding: "10px 20px 90px" }}>

          {/* Destaques */}
          {featured.length > 0 && (
            <ProductSection
              title="Destaques"
              star
              products={featured}
              productColorMap={productColorMap}
              getMainImage={getMainImage}
              getCartQty={getCartQty}
              isOutOfStock={isOutOfStock}
              onOpen={openProduct}
              onAdd={handleAdd}
              onInc={(p) => updateQty(p.id, getCartQty(p.id) + 1)}
              onDec={(p) => updateQty(p.id, getCartQty(p.id) - 1)}
            />
          )}

          {/* Por categoria */}
          {byCategory.map(({ category, items: catItems }) => (
            <ProductSection
              key={category.id}
              title={category.name}
              age={category.ageMin || category.ageMax ? `${category.ageMin ? ageLabel(category.ageMin) : ""}${category.ageMax ? "–" + ageLabel(category.ageMax) : "+"}` : ""}
              products={catItems}
              productColorMap={productColorMap}
              getMainImage={getMainImage}
              getCartQty={getCartQty}
              isOutOfStock={isOutOfStock}
              onOpen={openProduct}
              onAdd={handleAdd}
              onInc={(p) => updateQty(p.id, getCartQty(p.id) + 1)}
              onDec={(p) => updateQty(p.id, getCartQty(p.id) - 1)}
              collapsed={filterCat === null}
              onVerMais={() => setFilterCat(category.id)}
            />
          ))}

          {/* Sem categoria */}
          {uncategorized.length > 0 && (
            <ProductSection
              title="Outros produtos"
              products={uncategorized}
              productColorMap={productColorMap}
              getMainImage={getMainImage}
              getCartQty={getCartQty}
              isOutOfStock={isOutOfStock}
              onOpen={openProduct}
              onAdd={handleAdd}
              onInc={(p) => updateQty(p.id, getCartQty(p.id) + 1)}
              onDec={(p) => updateQty(p.id, getCartQty(p.id) - 1)}
            />
          )}

          {/* Sem resultados */}
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "70px 20px", color: "#8A7A68" }}>
              <div style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 700, fontSize: 24, color: "#4A3526" }}>Ops, nada por aqui!</div>
              <p style={{ marginTop: 8 }}>Tente outra busca ou faixa de idade. 🍼</p>
            </div>
          )}
        </main>

        {/* ── MODAL PRODUTO ── */}
        {selectedProduct && (() => {
          const colors = productColorMap.get(selectedProduct.id) ?? PALETTE[0];
          const mainImg = getMainImage(selectedProduct.images);
          const discount = selectedProduct.priceOriginal
            ? Math.round((1 - selectedProduct.price / selectedProduct.priceOriginal) * 100)
            : 0;
          const ingredients = selectedProduct.ingredients
            ? selectedProduct.ingredients.split(",").map((s) => s.trim()).filter(Boolean)
            : [];
          const hasSal = selectedProduct.allergens?.toLowerCase().includes("sal") ?? false;
          const badges = ["Sem leite", "Sem ovo", "Sem farinha", ...(hasSal ? ["Sem sal"] : [])];
          const selTotal = selectedProduct.price * selectedQty;

          return (
            <div
              onClick={() => setSelectedProduct(null)}
              style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(40,28,18,.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, animation: "bgl-fade .2s ease" }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{ position: "relative", width: "min(940px,96vw)", maxHeight: "92vh", overflow: "auto", background: "#FBF6EC", borderRadius: 28, boxShadow: "0 34px 80px rgba(0,0,0,.34)", animation: "bgl-pop .3s cubic-bezier(.2,.8,.3,1.25)", display: "flex", flexWrap: "wrap" }}
              >
                {/* Close */}
                <button
                  onClick={() => setSelectedProduct(null)}
                  style={{ position: "absolute", top: 14, right: 14, zIndex: 5, width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(255,255,255,.9)", color: "#4A3526", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,0,0,.15)" }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>

                {/* Left: photo */}
                <div style={{ flex: "1 1 340px", minHeight: 300, position: "relative", background: colors.tint, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(135deg,rgba(255,255,255,0) 0 18px,rgba(255,255,255,.3) 18px 19px)" }} />
                  <div style={{ position: "absolute", width: 200, height: 200, borderRadius: "46% 54% 60% 40%/45% 55% 45% 55%", background: colors.color, opacity: .26, right: -50, bottom: -50 }} />
                  <div style={{ position: "absolute", width: 120, height: 120, borderRadius: "50%", background: colors.color, opacity: .2, left: -30, top: -20 }} />
                  {mainImg ? (
                    <Image src={mainImg} alt={selectedProduct.name} fill style={{ objectFit: "cover" }} />
                  ) : (
                    <div style={{ position: "relative", zIndex: 2, fontFamily: "'Permanent Marker',cursive", fontSize: 16, color: "rgba(74,53,38,.45)", background: "rgba(255,255,255,.75)", padding: "9px 18px", borderRadius: 999 }}>
                      foto real do prato
                    </div>
                  )}
                  {selectedProduct.featured && (
                    <div style={{ position: "absolute", top: 16, left: 16, zIndex: 3, background: "#F26C21", color: "#fff", fontSize: 13, fontWeight: 700, padding: "7px 14px", borderRadius: 999, fontFamily: "'Baloo 2',sans-serif", boxShadow: "0 5px 12px rgba(242,108,33,.4)" }}>
                      Destaque
                    </div>
                  )}
                </div>

                {/* Right: details */}
                <div style={{ flex: "1 1 380px", padding: "clamp(20px,3vw,32px)", display: "flex", flexDirection: "column", gap: 13 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {(selectedProduct.ageMin || selectedProduct.ageMax) && (
                      <span style={{ background: "#DBF1ED", color: "#2E8576", fontWeight: 700, fontSize: 12.5, padding: "6px 13px", borderRadius: 999, display: "flex", alignItems: "center", gap: 5 }}>
                        <ClockIcon />{selectedProduct.ageMin ? ageLabel(selectedProduct.ageMin) : ""}{selectedProduct.ageMax ? `–${ageLabel(selectedProduct.ageMax)}` : "+"}
                      </span>
                    )}
                    {hasSal && (
                      <span style={{ background: "#FBE3E2", color: "#C2403D", fontWeight: 700, fontSize: 12.5, padding: "6px 13px", borderRadius: 999 }}>Sem sal</span>
                    )}
                  </div>

                  <h2 style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 700, fontSize: "clamp(26px,4vw,34px)", lineHeight: 1.02, color: "#4A3526", margin: 0, letterSpacing: "-.4px" }}>
                    {selectedProduct.name}
                  </h2>

                  {discount > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 800, fontSize: 28, color: "#4A3526" }}>{formatCurrency(selectedProduct.price)}</span>
                      <span style={{ fontSize: 15, color: "#B5A899", textDecoration: "line-through" }}>{formatCurrency(selectedProduct.priceOriginal!)}</span>
                      <span style={{ background: "#62C1B1", color: "#fff", fontWeight: 800, fontSize: 13, padding: "4px 9px", borderRadius: 11, fontFamily: "'Baloo 2',sans-serif" }}>-{discount}%</span>
                    </div>
                  )}
                  {discount === 0 && (
                    <div style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 800, fontSize: 28, color: "#4A3526" }}>
                      {formatCurrency(selectedProduct.price)}
                    </div>
                  )}

                  {selectedProduct.description && (
                    <p style={{ fontSize: 15, lineHeight: 1.55, color: "#6B5640", fontWeight: 500, margin: 0 }}>{selectedProduct.description}</p>
                  )}

                  {ingredients.length > 0 && (
                    <div>
                      <div style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 700, fontSize: 17, color: "#4A3526", marginBottom: 9 }}>O que vai dentro 🥕</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                        {ingredients.map((ing, i) => (
                          <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#F26C21", flex: "none", transform: "translateY(4px)" }} />
                            <div style={{ fontSize: 14.5, lineHeight: 1.4, color: "#4A3526" }}>{ing}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ background: "#fff", border: "2px dashed #D9C9AE", borderRadius: 18, padding: "14px 16px" }}>
                    <div style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 700, fontSize: 14.5, color: "#4A3526", marginBottom: 9, display: "flex", alignItems: "center", gap: 7 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="#62C1B1"><path d="M12 2l2.5 5 5.5.8-4 3.9.9 5.5L12 20.5 7.1 17.2l.9-5.5-4-3.9L9.5 7z" /></svg>
                      Comida de verdade, sem perrengue
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                      {badges.map((b) => (
                        <span key={b} style={{ background: "#EAF6E0", color: "#5E8A2B", fontWeight: 600, fontSize: 12.5, padding: "6px 12px", borderRadius: 999, display: "flex", alignItems: "center", gap: 5 }}>
                          <CheckIcon color="#7CB342" /> {b}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Qty + Add */}
                  <div style={{ marginTop: "auto", paddingTop: 6, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    {selectedProduct.kind !== "COMBO" && <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#fff", border: "2px solid #EBDDC8", borderRadius: 14, padding: 5 }}>
                      <button onClick={() => setSelectedQty((q) => Math.max(1, q - 1))} style={{ width: 38, height: 38, border: "none", background: "#F7EEDF", color: "#4A3526", borderRadius: 10, fontSize: 22, fontWeight: 700, cursor: "pointer", lineHeight: 0 }}>−</button>
                      <span style={{ minWidth: 34, textAlign: "center", fontFamily: "'Baloo 2',sans-serif", fontWeight: 700, fontSize: 19, color: "#4A3526" }}>{selectedQty}</span>
                      <button onClick={() => setSelectedQty((q) => q + 1)} style={{ width: 38, height: 38, border: "none", background: "#F7EEDF", color: "#4A3526", borderRadius: 10, fontSize: 22, fontWeight: 700, cursor: "pointer", lineHeight: 0 }}>+</button>
                    </div>}
                    <button
                      className="bgl-btn-primary"
                      style={{ flex: 1, minWidth: 180, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                      onClick={handleAddSelected}
                      disabled={selectedProduct.kind === "COMBO" && !selectedProduct.combo?.available}
                    >
                      {selectedProduct.kind === "COMBO"
                        ? (selectedProduct.combo?.available ? `Montar meu combo • ${formatCurrency(selectedProduct.price)}` : "Sem estoque")
                        : <>Adicionar {selectedQty} • {formatCurrency(selTotal)}</>}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── TOAST ── */}
        {toast && (
          <div style={{ position: "fixed", bottom: 26, left: "50%", zIndex: 70, transform: "translateX(-50%)", background: "#4A3526", color: "#fff", padding: "13px 22px", borderRadius: 999, fontFamily: "'Baloo 2',sans-serif", fontWeight: 600, fontSize: 15, boxShadow: "0 12px 30px rgba(0,0,0,.25)", display: "flex", alignItems: "center", gap: 9, animation: "bgl-toast .3s cubic-bezier(.2,.8,.3,1.2)", whiteSpace: "nowrap" }}>
            <span style={{ display: "flex", width: 22, height: 22, background: "#62C1B1", borderRadius: "50%", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <CheckIcon color="#fff" />
            </span>
            {toast}
          </div>
        )}

        <CartDrawer
          open={cartOpen}
          onClose={() => setCartOpen(false)}
          onCheckout={() => { setCartOpen(false); setCheckoutOpen(true); }}
          freeFrom={FREE_FROM}
          deliveryFee={deliveryFee}
          showFreeHint={showFreeHint}
        />
        {builder && builder.combo && (
          <ComboBuilder
            name={builder.name}
            size={builder.combo.size}
            price={builder.price}
            options={builder.combo.options}
            onClose={() => setBuilder(null)}
            onConfirm={(picks) => {
              const summary = picks.map((pk) => `${pk.quantity}× ${builder.combo!.options.find((o) => o.productId === pk.productId)?.name ?? ""}`).join(" · ");
              addCombo(cartProduct(builder), picks, summary);
              showToast(`${builder.name} adicionado!`);
              setBuilder(null);
            }}
          />
        )}

        <CheckoutModal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} brandId={brand.id} isReseller={pricingTier === "RESELLER"} />
      </div>
    </>
  );
}

// ── Product Section ──────────────────────────────────────────────────────────

interface ProductSectionProps {
  title: string;
  age?: string;
  star?: boolean;
  products: MenuClientProps["products"];
  productColorMap: Map<string, { color: string; tint: string }>;
  getMainImage: (images: { url: string; isMain: boolean }[]) => string | null;
  getCartQty: (id: string) => number;
  isOutOfStock: (p: MenuClientProps["products"][0]) => boolean;
  onOpen: (p: MenuClientProps["products"][0]) => void;
  onAdd: (p: MenuClientProps["products"][0]) => void;
  onInc: (p: MenuClientProps["products"][0]) => void;
  onDec: (p: MenuClientProps["products"][0]) => void;
  collapsed?: boolean;
  onVerMais?: () => void;
}

const COLLAPSED_COUNT = 8;

function ProductSection({ title, age, star, products, productColorMap, getMainImage, getCartQty, isOutOfStock, onOpen, onAdd, onInc, onDec, collapsed, onVerMais }: ProductSectionProps) {
  const visible = collapsed ? products.slice(0, COLLAPSED_COUNT) : products;
  const hasMore = collapsed && products.length > COLLAPSED_COUNT;

  return (
    <section style={{ marginTop: 36 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {star && (
          <svg width="27" height="27" viewBox="0 0 24 24" fill="#F26C21" style={{ flex: "none" }}>
            <path d="M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.6 5 20.4l1.4-6.8L1.3 9l6.9-.7z" />
          </svg>
        )}
        <h2 style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 700, fontSize: "clamp(22px,3.2vw,30px)", color: "#4A3526", margin: 0, letterSpacing: "-.3px" }}>{title}</h2>
        {age && (
          <div style={{ background: "#4A3526", color: "#fff", fontSize: 12.5, fontWeight: 600, padding: "5px 12px", borderRadius: 999, display: "flex", alignItems: "center", gap: 5 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FAD200" strokeWidth="2.6" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            {age}
          </div>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(232px,1fr))", gap: 18, marginTop: 18 }}>
        {visible.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            colors={productColorMap.get(product.id) ?? PALETTE[0]}
            mainImage={getMainImage(product.images)}
            qty={getCartQty(product.id)}
            outOfStock={isOutOfStock(product)}
            onOpen={() => onOpen(product)}
            onAdd={(e) => { e.stopPropagation(); onAdd(product); }}
            onInc={(e) => { e.stopPropagation(); onInc(product); }}
            onDec={(e) => { e.stopPropagation(); onDec(product); }}
          />
        ))}
      </div>
      {hasMore && (
        <div style={{ marginTop: 18, textAlign: "center" }}>
          <button
            onClick={onVerMais}
            style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13.5, color: "#F26C21", background: "#fff", border: "2px solid #F26C21", borderRadius: 999, padding: "9px 26px", cursor: "pointer", letterSpacing: ".1px" }}
          >
            Ver todos ({products.length}) →
          </button>
        </div>
      )}
    </section>
  );
}

// ── Product Card ─────────────────────────────────────────────────────────────

interface ProductCardProps {
  product: MenuClientProps["products"][0];
  colors: { color: string; tint: string };
  mainImage: string | null;
  qty: number;
  outOfStock: boolean;
  onOpen: () => void;
  onAdd: (e: React.MouseEvent) => void;
  onInc: (e: React.MouseEvent) => void;
  onDec: (e: React.MouseEvent) => void;
}

function ProductCard({ product, colors, mainImage, qty, outOfStock, onOpen, onAdd, onInc, onDec }: ProductCardProps) {
  const discount = product.priceOriginal ? Math.round((1 - product.price / product.priceOriginal) * 100) : 0;

  return (
    <div className="bgl-card" onClick={onOpen} role="button" tabIndex={0} style={{ opacity: outOfStock ? .6 : 1 }}>
      {/* Image area */}
      <div style={{ position: "relative", aspectRatio: "4/3", background: colors.tint, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(135deg,rgba(255,255,255,0) 0 15px,rgba(255,255,255,.32) 15px 16px)" }} />
        <div style={{ position: "absolute", width: 130, height: 130, borderRadius: "46% 54% 60% 40%/45% 55% 45% 55%", background: colors.color, opacity: .22, right: -26, bottom: -30 }} />
        <div style={{ position: "absolute", width: 70, height: 70, borderRadius: "50%", background: colors.color, opacity: .16, left: -14, top: -14 }} />

        {mainImage ? (
          <Image src={mainImage} alt={product.name} fill style={{ objectFit: "cover", position: "absolute" }} />
        ) : (
          <div style={{ position: "relative", zIndex: 2, fontFamily: "'Permanent Marker',cursive", fontSize: 13, color: "rgba(74,53,38,.42)", background: "rgba(255,255,255,.72)", padding: "6px 13px", borderRadius: 999 }}>
            foto do prato
          </div>
        )}

        {product.featured && (
          <div style={{ position: "absolute", top: 11, left: 11, zIndex: 3, background: "#F26C21", color: "#fff", fontSize: 11, fontWeight: 700, padding: "5px 11px", borderRadius: 999, fontFamily: "'Baloo 2',sans-serif", letterSpacing: .3, boxShadow: "0 4px 9px rgba(242,108,33,.35)" }}>
            Destaque
          </div>
        )}
        {discount > 0 && (
          <div style={{ position: "absolute", top: 11, right: 11, zIndex: 3, background: "#62C1B1", color: "#fff", fontSize: 13, fontWeight: 800, padding: "5px 9px", borderRadius: 11, fontFamily: "'Baloo 2',sans-serif", boxShadow: "0 4px 9px rgba(98,193,177,.4)" }}>
            -{discount}%
          </div>
        )}
        {outOfStock && (
          <div style={{ position: "absolute", inset: 0, zIndex: 4, background: "rgba(251,246,236,.75)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 700, fontSize: 13, color: "#8A7A68", background: "#fff", padding: "5px 14px", borderRadius: 999, border: "1.5px solid #EBDDC8" }}>Indisponível</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: "14px 15px 15px", display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
        <div style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 600, fontSize: 16.5, lineHeight: 1.12, color: "#4A3526" }}>{product.name}</div>
        {product.description && (
          <div style={{ fontSize: 12, color: "#9A8A78", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{product.description}</div>
        )}
        {(product.ageMin !== null || product.ageMax !== null) && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#9A8A78", fontSize: 12.5, fontWeight: 500 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C7B89D" strokeWidth="2.6" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            {product.ageMin ? ageLabel(product.ageMin) : ""}{product.ageMax ? `–${ageLabel(product.ageMax)}` : "+"}
          </div>
        )}
        <div style={{ marginTop: "auto", paddingTop: 6, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
          <div>
            {discount > 0 && <div style={{ fontSize: 12, color: "#B5A899", textDecoration: "line-through", lineHeight: 1, marginBottom: 2 }}>{formatCurrency(product.priceOriginal!)}</div>}
            <div style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 700, fontSize: 21, color: "#4A3526", lineHeight: 1 }}>{formatCurrency(product.price)}</div>
          </div>

          {!outOfStock && (
            qty === 0 ? (
              <button className="bgl-add-btn" onClick={onAdd} aria-label="Adicionar ao carrinho">+</button>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#fff", border: "2px solid #EBDDC8", borderRadius: 11, padding: 3 }} onClick={(e) => e.stopPropagation()}>
                <button onClick={onDec} style={{ width: 30, height: 30, border: "none", background: "#F7EEDF", color: "#4A3526", borderRadius: 8, fontSize: 18, fontWeight: 700, cursor: "pointer", lineHeight: 0 }}>−</button>
                <span style={{ minWidth: 26, textAlign: "center", fontWeight: 700, fontSize: 14, color: "#4A3526", fontFamily: "'Baloo 2',sans-serif" }}>{qty}</span>
                <button onClick={onInc} style={{ width: 30, height: 30, border: "none", background: "#F26C21", color: "#fff", borderRadius: 8, fontSize: 18, fontWeight: 700, cursor: "pointer", lineHeight: 0 }}>+</button>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
