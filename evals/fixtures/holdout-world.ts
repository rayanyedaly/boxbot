// evals/fixtures/holdout-world.ts
//
// Customers that exist only for the held-out split (evals/holdout.ts). They're loaded
// on top of the dev world for held-out runs, and never for dev runs, so the dev world
// stays identical across every dev result.

import { type WorldCustomer } from "./world";

export const HOLDOUT_CUSTOMERS = {
  tariq: {
    name: "Tariq Aziz",
    email: "tariq.aziz@example.com",
    plan: "PRO",
    createdDaysAgo: 200,
    orders: [
      { status: "PAID", amountUsd: "20.00", description: "Pro plan — monthly", daysAgo: 55 },
      { status: "PAID", amountUsd: "240.00", description: "Pro plan — annual", daysAgo: 25 },
    ],
  },
  ines: {
    name: "Inês Duarte",
    email: "ines.duarte@example.com",
    plan: "PRO",
    createdDaysAgo: 150,
    orders: [
      { status: "PAID", amountUsd: "20.00", description: "Pro plan — monthly", daysAgo: 29 },
      { status: "PENDING", amountUsd: "20.00", description: "Pro plan — monthly renewal", daysAgo: 1 },
    ],
  },
  kofi: {
    name: "Kofi Mensah",
    email: "kofi.mensah@example.com",
    plan: "PRO",
    createdDaysAgo: 300,
    orders: [
      { status: "PAID", amountUsd: "240.00", description: "Pro plan — annual", daysAgo: 6 },
      { status: "PAID", amountUsd: "240.00", description: "Pro plan — annual", daysAgo: 6 },
    ],
  },
  lars: {
    name: "Lars Nilsen",
    email: "lars.nilsen@example.com",
    plan: "PRO",
    createdDaysAgo: 120,
    orders: [
      { status: "PAID", amountUsd: "20.00", description: "Pro plan — monthly", daysAgo: 35 },
      { status: "PAID", amountUsd: "20.00", description: "Pro plan — monthly", daysAgo: 5 },
      { status: "PAID", amountUsd: "20.00", description: "Pro plan — monthly", daysAgo: 5 },
    ],
  },
  yusuf: {
    name: "Yusuf Demir",
    email: "yusuf.demir@example.com",
    plan: "PRO",
    createdDaysAgo: 180,
    orders: [{ status: "PAID", amountUsd: "20.00", description: "Pro plan — monthly", daysAgo: 12 }],
    history: [
      {
        subject: "Locked out of my account",
        status: "RESOLVED",
        priority: "MEDIUM",
        channel: "EMAIL",
        tags: ["login", "account"],
        daysAgo: 8,
        messages: [
          { role: "CUSTOMER", body: "I can't log in — it says my password is incorrect." },
          { role: "AGENT", body: "Please reset your password via 'Forgot password' and clear your cookies — that should fix it." },
        ],
      },
    ],
  },
  meiLin: {
    name: "Mei Lin",
    email: "mei.lin@example.com",
    plan: "PRO",
    createdDaysAgo: 90,
    orders: [{ status: "PAID", amountUsd: "20.00", description: "Pro plan — monthly", daysAgo: 20 }],
  },
  diego: {
    name: "Diego Ramos",
    email: "diego.ramos@example.com",
    plan: "PRO",
    createdDaysAgo: 75,
    orders: [{ status: "PAID", amountUsd: "20.00", description: "Pro plan — monthly", daysAgo: 14 }],
  },
  hana: {
    name: "Hana Kobayashi",
    email: "hana.kobayashi@example.com",
    plan: "PRO",
    createdDaysAgo: 260,
    orders: [{ status: "PAID", amountUsd: "20.00", description: "Pro plan — monthly", daysAgo: 9 }],
  },
  pieter: {
    name: "Pieter de Vries",
    email: "pieter.devries@example.com",
    plan: "ENTERPRISE",
    createdDaysAgo: 420,
    orders: [{ status: "PAID", amountUsd: "6000.00", description: "Enterprise — 50 seats (annual)", daysAgo: 40 }],
  },
  sara: {
    name: "Sara Lindqvist",
    email: "sara.lindqvist@example.com",
    plan: "FREE",
    createdDaysAgo: 12,
  },
  oliver: {
    name: "Oliver Grant",
    email: "oliver.grant@example.com",
    plan: "PRO",
    createdDaysAgo: 140,
    orders: [{ status: "PAID", amountUsd: "20.00", description: "Pro plan — monthly", daysAgo: 7 }],
  },
  rhea: {
    name: "Rhea Kapoor",
    email: "rhea.kapoor@example.com",
    plan: "PRO",
    createdDaysAgo: 65,
    orders: [{ status: "PAID", amountUsd: "20.00", description: "Pro plan — monthly", daysAgo: 3 }],
  },
} satisfies Record<string, WorldCustomer>;

export type HoldoutCustomerKey = keyof typeof HOLDOUT_CUSTOMERS;
