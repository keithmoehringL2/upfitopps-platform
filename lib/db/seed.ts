// In-memory seed data for the scaffold so the app runs with no database.
// When Postgres is wired in, this file goes away and the gateway queries the
// real tables. Shapes are a trimmed subset of the Company model in the handoff.

export interface Distributor {
  id: string;
  slug: string;
  name: string;
  primaryColor: string;
  logoUrl: string | null;
}

export interface Company {
  id: string;
  distributorId: string;
  name: string;
  city: string;
  zip: string;
  industry: string;
  score: number; // 0–5
  ownerId: string | null;
  state: "cold" | "customer" | "opp";
}

export const SEED: { distributors: Distributor[]; companies: Company[] } = {
  distributors: [
    {
      id: "dist_truckcolors",
      slug: "truckcolors",
      name: "Truck Colors",
      primaryColor: "#1d4ed8",
      logoUrl: null,
    },
    {
      id: "dist_demo",
      slug: "demo",
      name: "Demo Distributor",
      primaryColor: "#c8102e",
      logoUrl: null,
    },
  ],
  companies: [
    {
      id: "co_1",
      distributorId: "dist_truckcolors",
      name: "Northside Plumbing",
      city: "Austin",
      zip: "78701",
      industry: "Plumbing",
      score: 4.6,
      ownerId: "rep_1",
      state: "cold",
    },
    {
      id: "co_2",
      distributorId: "dist_truckcolors",
      name: "Lone Star HVAC",
      city: "Austin",
      zip: "78702",
      industry: "HVAC",
      score: 3.8,
      ownerId: null,
      state: "cold",
    },
    {
      id: "co_3",
      distributorId: "dist_demo",
      name: "Acme Electrical",
      city: "Dallas",
      zip: "75201",
      industry: "Electrical",
      score: 2.9,
      ownerId: "rep_2",
      state: "cold",
    },
  ],
};
