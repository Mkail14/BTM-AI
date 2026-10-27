import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAdminAlerts } from "@/lib/admin/alerts";
import type { AdminOverview } from "@/lib/admin/stats";
import { supabaseDashboardLink } from "@/lib/admin/supabase-links";

const baseOverview: AdminOverview = {
  usersTotal: 10,
  usersNewToday: 1,
  usersNew7d: 2,
  usersUnconfirmed: 0,
  usersActive7d: 4,
  conversationsTotal: 20,
  questionsToday: 5,
  questions7d: 40,
  questions30d: 100,
  answers7d: 40,
  errors7d: 0,
  interrupted7d: 1,
  anonDevicesToday: 12,
  anonMessagesToday: 50,
  anonDevicesBlockedToday: 0,
  usersBlockedToday: 0,
  daily: [],
  anonDailyLimit: 30,
  userDailyLimit: 300,
};

const healthy = {
  aiProblem: null,
  hasSecretKey: true,
  hasRateLimitSalt: true,
  overview: baseOverview,
  supabaseLink: (path: string) => `https://supabase.com/dashboard/project/ref/${path}`,
};

describe("buildAdminAlerts", () => {
  it("ne signale rien quand tout va bien", () => {
    assert.deepEqual(buildAdminAlerts(healthy), []);
  });

  it("place les problèmes bloquants en premier", () => {
    const alerts = buildAdminAlerts({ ...healthy, aiProblem: "AI_API_KEY n'est pas définie.", hasRateLimitSalt: false });
    assert.equal(alerts[0].level, "critical");
    assert.match(alerts[0].detail, /AI_API_KEY/);
    assert.equal(alerts[1].level, "warning");
  });

  it("alerte sur un taux d'erreur élevé, pas sur un faible volume", () => {
    const high = buildAdminAlerts({ ...healthy, overview: { ...baseOverview, answers7d: 40, errors7d: 4 } });
    assert.match(high[0].title, /10 %/);
    const lowVolume = buildAdminAlerts({ ...healthy, overview: { ...baseOverview, answers7d: 5, errors7d: 3 } });
    assert.equal(lowVolume.length, 0);
  });

  it("relie les comptes non confirmés à l'envoi des e-mails", () => {
    const alerts = buildAdminAlerts({ ...healthy, overview: { ...baseOverview, usersUnconfirmed: 5 } });
    assert.match(alerts[0].detail, /contact@btm\.yt/);
    assert.equal(alerts[0].action?.href, "https://supabase.com/dashboard/project/ref/logs/auth-logs");
  });

  it("signale les visiteurs bloqués par le quota", () => {
    const alerts = buildAdminAlerts({ ...healthy, overview: { ...baseOverview, anonDevicesBlockedToday: 3 } });
    assert.equal(alerts[0].level, "info");
    assert.match(alerts[0].detail, /30 messages/);
  });
});

describe("supabaseDashboardLink", () => {
  it("déduit le projet de l'URL Supabase", () => {
    assert.equal(
      supabaseDashboardLink("https://abcdefghijklmnopqrst.supabase.co", "auth/users"),
      "https://supabase.com/dashboard/project/abcdefghijklmnopqrst/auth/users",
    );
    assert.equal(supabaseDashboardLink("http://localhost:54321", "auth/users"), null);
  });
});
