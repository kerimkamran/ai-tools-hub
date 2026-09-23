import type { Tool } from "@/lib/types";

/**
 * Static snapshot of the catalog.
 *
 * Moving the registry into a database bought an admin UI, but it also made a
 * previously-static page depend on a network service. This snapshot is the
 * price of buying that back: if Supabase is unreachable or unconfigured, the
 * catalog still renders and every link still works, read-only.
 *
 * Keep it roughly in sync with production when tools are added. It is a
 * safety net, not a source of truth.
 */
const now = "2026-09-23T00:00:00.000Z";

export const fallbackTools: Tool[] = [
  {
    id: "vantage",
    slug: "vantage",
    name: "Vantage",
    tagline: "Competency-based assessments, scored with AI and confirmed by a human.",
    description:
      "Vantage runs structured, competency-mapped assessments. Every answer is scored with a written rationale, and a reviewer confirms each score before it counts.",
    category: "HR",
    tags: ["assessment", "competency", "hiring", "scoring", "recruitment"],
    icon: "◈",
    url: "https://vantage-ag.vercel.app",
    healthUrl: null,
    access: "invite-only",
    accessNote: "Access by invitation",
    status: "published",
    sortOrder: 10,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "sparklab",
    slug: "sparklab",
    name: "SparkLab",
    tagline: "Capture ideas, score them, and move the good ones forward.",
    description:
      "SparkLab is an innovation pipeline: submit an idea, get AI-assisted feedback and scoring, and track it through assessment and mentoring.",
    category: "Productivity",
    tags: ["innovation", "ideas", "pipeline", "mentoring"],
    icon: "✦",
    url: "https://sparklab-azerconnect.onrender.com",
    healthUrl: "https://sparklab-azerconnect.onrender.com/api/health",
    access: "sign-in",
    accessNote: "@azerconnect.az accounts only",
    status: "published",
    sortOrder: 20,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "cv-screener",
    slug: "cv-screener",
    name: "CV Screener",
    tagline: "Match applications against role requirements, with the evidence shown.",
    description:
      "Reads an application against a vacancy's requirements and shows which are met, partially met or not found — with the supporting text quoted for every judgement.",
    category: "HR",
    tags: ["screening", "cv", "recruitment", "requirements"],
    icon: "◰",
    url: "",
    healthUrl: null,
    access: "sign-in",
    accessNote: null,
    status: "planned",
    sortOrder: 30,
    createdAt: now,
    updatedAt: now,
  },
];
