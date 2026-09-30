import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/delivery_erp" });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma: any = new (PrismaClient as any)({ adapter });

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function hoursAgo(n: number) {
  return new Date(Date.now() - n * 60 * 60 * 1000);
}

async function main() {
  console.log("🌱 Iniciando seed...");

  // Brand principal
  const brand = await prisma.brand.upsert({
    where: { slug: "banguelas" },
    update: {},
    create: {
      name: "Banguelas",
      slug: "banguelas",
      primaryColor: "#F97316",
    },
  });

  console.log("✓ Brand criada:", brand.name);

  // Unidade matriz — todo dado de negócio pertence a uma unidade
  const unit = await prisma.unit.upsert({
    where: { slug: "matriz" },
    update: {},
    create: { brandId: brand.id, type: "HQ", name: brand.name, slug: "matriz", city: "São José do Rio Preto", state: "SP" },
  });

  // Admin user
  const passwordHash = await bcrypt.hash("admin123", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@banguelas.com.br" },
    update: {},
    create: {
      name: "Administrador",
      email: "admin@banguelas.com.br",
      passwordHash,
      role: "ADMIN",
      unitId: unit.id,
    },
  });

  console.log("✓ Admin criado:", admin.email);

  // Categorias por faixa etária
  const categories = [
    { name: "Primeiras papinhas", slug: "primeiras-papinhas", ageMin: 4, ageMax: 6, order: 1 },
    { name: "Papinhas 6+ meses", slug: "papinhas-6-meses", ageMin: 6, ageMax: 9, order: 2 },
    { name: "Papinhas 9+ meses", slug: "papinhas-9-meses", ageMin: 9, ageMax: 12, order: 3 },
    { name: "Refeições 1+ ano", slug: "refeicoes-1-ano", ageMin: 12, ageMax: 24, order: 4 },
    { name: "Refeições 2+ anos", slug: "refeicoes-2-anos", ageMin: 24, ageMax: null, order: 5 },
    { name: "Snacks saudáveis", slug: "snacks", ageMin: 8, ageMax: null, order: 6 },
    { name: "Kits especiais", slug: "kits", ageMin: null, ageMax: null, order: 7 },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { unitId_slug: { unitId: unit.id, slug: cat.slug } },
      update: {},
      create: { ...cat, unitId: unit.id },
    });
  }

  console.log("✓ Categorias criadas:", categories.length);

  // Produtos exemplo
  const catMap = await prisma.category.findMany({ where: { unitId: unit.id }, select: { id: true, slug: true } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catBySlug = Object.fromEntries(catMap.map((c: any) => [c.slug, c.id]));

  const products = [
    {
      name: "Papinha de Abóbora com Frango",
      description: "Abóbora orgânica com frango desfiado e azeite extravirgem. Rica em betacaroteno.",
      price: 12.9,
      categoryId: catBySlug["primeiras-papinhas"],
      ageMin: 4, ageMax: 8,
      weight: 100, servings: 1,
      ingredients: "Abóbora, frango caipira, azeite extravirgem, água",
      frozen: true, featured: true, order: 1,
    },
    {
      name: "Papinha de Cenoura com Arroz e Carne",
      description: "Cenoura, arroz integral e carne bovina moída. Equilíbrio perfeito de nutrientes.",
      price: 13.5,
      categoryId: catBySlug["papinhas-6-meses"],
      ageMin: 6, ageMax: 10,
      weight: 120, servings: 1,
      frozen: true, featured: true, order: 1,
    },
    {
      name: "Papinha de Espinafre com Batata Doce",
      description: "Espinafre, batata doce e azeite. Excelente fonte de ferro e vitaminas.",
      price: 12.9,
      categoryId: catBySlug["primeiras-papinhas"],
      ageMin: 4, ageMax: 8,
      weight: 100, servings: 1,
      frozen: true, order: 2,
    },
    {
      name: "Risoto de Frango com Ervilhas",
      description: "Arroz cremoso com frango e ervilhas frescas. Para bebês que já exploram texturas.",
      price: 15.9,
      categoryId: catBySlug["papinhas-9-meses"],
      ageMin: 9, ageMax: 14,
      weight: 150, servings: 1,
      frozen: true, featured: false, order: 1,
    },
    {
      name: "Macarrão com Molho de Tomate e Carne",
      description: "Macarrão parafuso integral com molho caseiro e carne moída.",
      price: 16.5,
      categoryId: catBySlug["refeicoes-1-ano"],
      ageMin: 12, ageMax: 24,
      weight: 180, servings: 1,
      frozen: true, order: 1,
    },
    {
      name: "Kit Semana Completa 4-6m",
      description: "5 papinhas variadas para a semana toda. Abóbora, cenoura, batata doce, abobrinha e ervilha.",
      price: 59.9,
      priceOriginal: 70.0,
      categoryId: catBySlug["kits"],
      ageMin: 4, ageMax: 8,
      weight: 500, servings: 5,
      frozen: true, featured: true, order: 1,
    },
    {
      name: "Kit Semana Completa 6-9m",
      description: "5 papinhas proteicas para a semana. Frango, carne, peixe, ovo e leguminosas.",
      price: 64.9,
      priceOriginal: 75.0,
      categoryId: catBySlug["kits"],
      ageMin: 6, ageMax: 10,
      weight: 600, servings: 5,
      frozen: true, featured: true, order: 2,
    },
  ];

  const productIds: Record<string, string> = {};

  for (const prod of products) {
    const existing = await prisma.product.findFirst({
      where: { name: prod.name, unitId: unit.id },
    });

    if (!existing) {
      const created = await prisma.product.create({
        data: { ...prod, brandId: brand.id, unitId: unit.id },
      });
      await prisma.stockItem.create({
        data: { productId: created.id, quantity: 50, minQuantity: 5 },
      });
      productIds[prod.name] = created.id;
    } else {
      productIds[prod.name] = existing.id;
      // Garante que o stock existe
      const stock = await prisma.stockItem.findUnique({ where: { productId: existing.id } });
      if (!stock) {
        await prisma.stockItem.create({ data: { productId: existing.id, quantity: 50, minQuantity: 5 } });
      }
    }
  }

  console.log("✓ Produtos criados:", products.length);

  // Zona de entrega exemplo
  const zone = await prisma.deliveryZone.upsert({
    where: { id: "zone-sp-centro" },
    update: {},
    create: {
      id: "zone-sp-centro",
      unitId: unit.id,
      name: "SP - Centro / Vila Mariana",
      neighborhoods: ["Centro", "Vila Mariana", "Moema", "Ibirapuera", "Paraíso"],
      cities: ["São Paulo"],
      fee: 8.0,
      freeAbove: 80.0,
      minOrder: 30.0,
      estimatedMin: 30,
      estimatedMax: 60,
    },
  });

  console.log("✓ Zona de entrega criada:", zone.name);

  // Cupom exemplo
  await prisma.coupon.upsert({
    where: { unitId_code: { unitId: unit.id, code: "BEMVINDO10" } },
    update: {},
    create: {
      brandId: brand.id,
      unitId: unit.id,
      code: "BEMVINDO10",
      description: "10% de desconto no primeiro pedido",
      type: "PERCENTAGE",
      value: 10,
      minOrder: 30,
      firstOrderOnly: true,
      validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });

  console.log("✓ Cupom BEMVINDO10 criado");

  // ─── CLIENTES FICTÍCIOS ────────────────────────────────────────────────────

  const customersData = [
    { name: "Ana Lima", phone: "11991234001", email: "ana.lima@email.com", daysAgoCreated: 90, childName: "Sofia", childAge: 6 },
    { name: "Beatriz Santos", phone: "11991234002", email: "beatriz.s@email.com", daysAgoCreated: 75, childName: "Bernardo", childAge: 9 },
    { name: "Carla Oliveira", phone: "11991234003", email: "carla.o@email.com", daysAgoCreated: 60, childName: "Valentina", childAge: 4 },
    { name: "Daniela Costa", phone: "11991234004", email: "daniela.c@email.com", daysAgoCreated: 55, childName: "Lucas", childAge: 12 },
    { name: "Eduarda Ferreira", phone: "11991234005", email: "edu.ferreira@email.com", daysAgoCreated: 45, childName: "Isabella", childAge: 8 },
    { name: "Fernanda Alves", phone: "11991234006", email: "fer.alves@email.com", daysAgoCreated: 40, childName: "Davi", childAge: 15 },
    { name: "Gabriela Rocha", phone: "11991234007", email: "gabi.rocha@email.com", daysAgoCreated: 35, childName: "Laura", childAge: 6 },
    { name: "Heloísa Mendes", phone: "11991234008", email: "helo.m@email.com", daysAgoCreated: 30, childName: "Pedro", childAge: 10 },
    { name: "Isabela Nunes", phone: "11991234009", email: "isa.nunes@email.com", daysAgoCreated: 25, childName: "Manuela", childAge: 7 },
    { name: "Juliana Pires", phone: "11991234010", email: "ju.pires@email.com", daysAgoCreated: 20, childName: "Arthur", childAge: 18 },
    { name: "Karina Sousa", phone: "11991234011", email: "karina.s@email.com", daysAgoCreated: 18, childName: "Helena", childAge: 5 },
    { name: "Letícia Cardoso", phone: "11991234012", email: "leti.c@email.com", daysAgoCreated: 15, childName: "Miguel", childAge: 11 },
  ];

  const createdCustomers: Record<string, string> = {};

  for (const c of customersData) {
    const existing = await prisma.customer.findFirst({ where: { unitId: unit.id, phone: c.phone } });
    if (!existing) {
      const customer = await prisma.customer.create({
        data: {
          brandId: brand.id,
          unitId: unit.id,
          name: c.name,
          phone: c.phone,
          email: c.email,
          createdAt: daysAgo(c.daysAgoCreated),
          updatedAt: daysAgo(c.daysAgoCreated),
          children: {
            create: [{
              name: c.childName,
              birthDate: new Date(Date.now() - c.childAge * 30 * 24 * 60 * 60 * 1000),
            }],
          },
          addresses: {
            create: [{
              label: "Casa",
              cep: "04101000",
              street: "Rua Domingos de Morais",
              number: String(Math.floor(Math.random() * 900) + 100),
              neighborhood: "Vila Mariana",
              city: "São Paulo",
              state: "SP",
              isDefault: true,
              deliveryZoneId: zone.id,
            }],
          },
        },
        include: { addresses: true },
      });
      await prisma.loyaltyCard.create({ data: { customerId: customer.id } });
      createdCustomers[c.phone] = customer.id;
      createdCustomers[`addr_${c.phone}`] = customer.addresses[0].id;
    } else {
      createdCustomers[c.phone] = existing.id;
      const addr = await prisma.customerAddress.findFirst({ where: { customerId: existing.id } });
      if (addr) createdCustomers[`addr_${c.phone}`] = addr.id;
      const loyalty = await prisma.loyaltyCard.findUnique({ where: { customerId: existing.id } });
      if (!loyalty) await prisma.loyaltyCard.create({ data: { customerId: existing.id } });
    }
  }

  console.log("✓ Clientes criados:", customersData.length);

  // ─── PEDIDOS FICTÍCIOS ─────────────────────────────────────────────────────

  const productList = Object.values(productIds);

  interface FakeOrder {
    customerPhone: string;
    status: string;
    items: { productName: string; qty: number }[];
    daysAgoPlaced: number;
    hoursAgoPlaced?: number;
    paymentMethod: string;
  }

  const fakeOrders: FakeOrder[] = [
    // Pedidos entregues (histórico)
    { customerPhone: "11991234001", status: "DELIVERED", items: [{ productName: "Papinha de Abóbora com Frango", qty: 3 }, { productName: "Kit Semana Completa 4-6m", qty: 1 }], daysAgoPlaced: 60, paymentMethod: "PIX" },
    { customerPhone: "11991234001", status: "DELIVERED", items: [{ productName: "Papinha de Espinafre com Batata Doce", qty: 4 }], daysAgoPlaced: 45, paymentMethod: "PIX" },
    { customerPhone: "11991234001", status: "DELIVERED", items: [{ productName: "Kit Semana Completa 4-6m", qty: 2 }], daysAgoPlaced: 15, paymentMethod: "CREDIT_CARD" },
    { customerPhone: "11991234002", status: "DELIVERED", items: [{ productName: "Papinha de Cenoura com Arroz e Carne", qty: 3 }, { productName: "Risoto de Frango com Ervilhas", qty: 2 }], daysAgoPlaced: 50, paymentMethod: "PIX" },
    { customerPhone: "11991234002", status: "DELIVERED", items: [{ productName: "Kit Semana Completa 6-9m", qty: 1 }], daysAgoPlaced: 20, paymentMethod: "PIX" },
    { customerPhone: "11991234003", status: "DELIVERED", items: [{ productName: "Papinha de Abóbora com Frango", qty: 5 }], daysAgoPlaced: 40, paymentMethod: "DEBIT_CARD" },
    { customerPhone: "11991234004", status: "DELIVERED", items: [{ productName: "Macarrão com Molho de Tomate e Carne", qty: 4 }, { productName: "Risoto de Frango com Ervilhas", qty: 2 }], daysAgoPlaced: 30, paymentMethod: "PIX" },
    { customerPhone: "11991234005", status: "DELIVERED", items: [{ productName: "Kit Semana Completa 6-9m", qty: 2 }], daysAgoPlaced: 25, paymentMethod: "CREDIT_CARD" },
    { customerPhone: "11991234006", status: "DELIVERED", items: [{ productName: "Papinha de Cenoura com Arroz e Carne", qty: 6 }], daysAgoPlaced: 22, paymentMethod: "PIX" },
    { customerPhone: "11991234007", status: "DELIVERED", items: [{ productName: "Papinha de Espinafre com Batata Doce", qty: 3 }, { productName: "Papinha de Abóbora com Frango", qty: 2 }], daysAgoPlaced: 18, paymentMethod: "PIX" },
    { customerPhone: "11991234008", status: "DELIVERED", items: [{ productName: "Kit Semana Completa 4-6m", qty: 1 }], daysAgoPlaced: 12, paymentMethod: "CASH" },
    { customerPhone: "11991234009", status: "DELIVERED", items: [{ productName: "Risoto de Frango com Ervilhas", qty: 4 }], daysAgoPlaced: 10, paymentMethod: "PIX" },
    { customerPhone: "11991234010", status: "DELIVERED", items: [{ productName: "Macarrão com Molho de Tomate e Carne", qty: 3 }], daysAgoPlaced: 8, paymentMethod: "CREDIT_CARD" },
    // Pedidos em andamento (produção/confirmados)
    { customerPhone: "11991234011", status: "IN_PRODUCTION", items: [{ productName: "Papinha de Abóbora com Frango", qty: 4 }, { productName: "Papinha de Espinafre com Batata Doce", qty: 2 }], daysAgoPlaced: 0, hoursAgoPlaced: 3, paymentMethod: "PIX" },
    { customerPhone: "11991234012", status: "IN_PRODUCTION", items: [{ productName: "Kit Semana Completa 6-9m", qty: 1 }, { productName: "Papinha de Cenoura com Arroz e Carne", qty: 3 }], daysAgoPlaced: 0, hoursAgoPlaced: 2, paymentMethod: "PIX" },
    { customerPhone: "11991234001", status: "CONFIRMED", items: [{ productName: "Kit Semana Completa 4-6m", qty: 2 }, { productName: "Papinha de Espinafre com Batata Doce", qty: 3 }], daysAgoPlaced: 0, hoursAgoPlaced: 1, paymentMethod: "PIX" },
    { customerPhone: "11991234003", status: "READY", items: [{ productName: "Risoto de Frango com Ervilhas", qty: 5 }], daysAgoPlaced: 0, hoursAgoPlaced: 4, paymentMethod: "CREDIT_CARD" },
    { customerPhone: "11991234005", status: "DISPATCHED", items: [{ productName: "Macarrão com Molho de Tomate e Carne", qty: 4 }], daysAgoPlaced: 0, hoursAgoPlaced: 5, paymentMethod: "PIX" },
    // Pedidos pendentes (recentes)
    { customerPhone: "11991234007", status: "PENDING", items: [{ productName: "Papinha de Abóbora com Frango", qty: 3 }, { productName: "Kit Semana Completa 4-6m", qty: 1 }], daysAgoPlaced: 0, hoursAgoPlaced: 0.5, paymentMethod: "PIX" },
    { customerPhone: "11991234009", status: "PENDING", items: [{ productName: "Papinha de Cenoura com Arroz e Carne", qty: 4 }], daysAgoPlaced: 0, hoursAgoPlaced: 0.25, paymentMethod: "CASH" },
  ];

  // Pegar contador atual de pedidos
  const lastOrder = await prisma.order.findFirst({ where: { brandId: brand.id }, orderBy: { number: "desc" } });
  let orderNumber = (lastOrder?.number ?? 0) + 1;

  for (const fo of fakeOrders) {
    const customerId = createdCustomers[fo.customerPhone];
    const addressId = createdCustomers[`addr_${fo.customerPhone}`];
    if (!customerId) continue;

    // Calcular items e total
    let subtotal = 0;
    const orderItems: { productId: string; name: string; price: number; quantity: number; total: number }[] = [];
    for (const item of fo.items) {
      const productId = productIds[item.productName];
      if (!productId) continue;
      const prod = await prisma.product.findUnique({ where: { id: productId } });
      if (!prod) continue;
      const itemTotal = prod.price * item.qty;
      subtotal += itemTotal;
      orderItems.push({ productId, name: prod.name, price: prod.price, quantity: item.qty, total: itemTotal });
    }
    if (orderItems.length === 0) continue;

    const deliveryFee = subtotal >= 80 ? 0 : 8;
    const total = subtotal + deliveryFee;

    const createdAt = fo.hoursAgoPlaced !== undefined
      ? hoursAgo(fo.hoursAgoPlaced)
      : daysAgo(fo.daysAgoPlaced);

    // Verificar se o pedido já existe (evitar duplicatas em re-seed)
    const existingOrder = await prisma.order.findUnique({ where: { unitId_number: { unitId: unit.id, number: orderNumber } } });
    if (existingOrder) { orderNumber++; continue; }

    const statusDates: Record<string, object> = {};
    if (["CONFIRMED", "IN_PRODUCTION", "READY", "DISPATCHED", "DELIVERED"].includes(fo.status)) {
      statusDates["confirmedAt"] = new Date(createdAt.getTime() + 10 * 60 * 1000);
    }
    if (["IN_PRODUCTION", "READY", "DISPATCHED", "DELIVERED"].includes(fo.status)) {
      statusDates["confirmedAt"] = new Date(createdAt.getTime() + 10 * 60 * 1000);
    }
    if (["READY", "DISPATCHED", "DELIVERED"].includes(fo.status)) {
      statusDates["readyAt"] = new Date(createdAt.getTime() + 40 * 60 * 1000);
    }
    if (["DISPATCHED", "DELIVERED"].includes(fo.status)) {
      statusDates["dispatchedAt"] = new Date(createdAt.getTime() + 50 * 60 * 1000);
    }
    if (fo.status === "DELIVERED") {
      statusDates["deliveredAt"] = new Date(createdAt.getTime() + 70 * 60 * 1000);
    }

    const order = await prisma.order.create({
      data: {
        number: orderNumber,
        brandId: brand.id,
        unitId: unit.id,
        customerId,
        addressId,
        deliveryZoneId: zone.id,
        status: fo.status,
        subtotal,
        deliveryFee,
        discount: 0,
        total,
        createdAt,
        updatedAt: createdAt,
        ...statusDates,
        items: { create: orderItems },
      },
    });

    // Pagamento
    await prisma.payment.create({
      data: {
        orderId: order.id,
        method: fo.paymentMethod,
        status: fo.status === "DELIVERED" ? "PAID" : fo.status === "PENDING" ? "PENDING" : "PAID",
        amount: total,
        paidAt: fo.status !== "PENDING" ? createdAt : null,
        createdAt,
        updatedAt: createdAt,
      },
    });

    // Pontos de fidelidade para pedidos entregues
    if (fo.status === "DELIVERED") {
      const loyaltyCard = await prisma.loyaltyCard.findUnique({ where: { customerId } });
      if (loyaltyCard) {
        const points = Math.floor(total);
        await prisma.loyaltyTransaction.upsert({
          where: { orderId: order.id },
          update: {},
          create: {
            loyaltyCardId: loyaltyCard.id,
            orderId: order.id,
            type: "EARN",
            points,
            description: `Pedido #${order.number}`,
            createdAt,
          },
        });
        const newPoints = loyaltyCard.points + points;
        const newTier =
          newPoints >= 3000 ? "PLATINUM" :
          newPoints >= 1500 ? "GOLD" :
          newPoints >= 500 ? "SILVER" : "BRONZE";
        await prisma.loyaltyCard.update({
          where: { id: loyaltyCard.id },
          data: { points: newPoints, tier: newTier, updatedAt: createdAt },
        });
      }
      // Atualizar lastOrderAt do cliente
      await prisma.customer.update({
        where: { id: customerId },
        data: { lastOrderAt: (statusDates["deliveredAt"] as Date) ?? createdAt },
      });
    }

    orderNumber++;
  }

  console.log("✓ Pedidos fictícios criados:", fakeOrders.length);

  // LoyaltyConfig padrão
  const existingConfig = await prisma.loyaltyConfig.findUnique({ where: { brandId: brand.id } });
  if (!existingConfig) {
    await prisma.loyaltyConfig.create({ data: { brandId: brand.id } });
    console.log("✓ Configuração de fidelidade criada");
  }

  // Usar productList para suprimir warning de variável não usada
  void productList;

  console.log("\n🎉 Seed completo!");
  console.log("\n📋 Credenciais admin:");
  console.log("   Email: admin@banguelas.com.br");
  console.log("   Senha: admin123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
