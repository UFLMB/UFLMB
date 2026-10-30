import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const usernamePattern = /^[A-Za-z0-9_]{3,24}$/;
const longBan = "876000h";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return json({ error: "A valid signed-in session is required." }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "Account moderation is not configured." }, 500);

  const userClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    const actor = authData.user;
    if (authError || !actor) return json({ error: "The session is invalid or expired." }, 401);

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.action !== "string") return json({ error: "Invalid request." }, 400);

    if (body.action === "status") {
      const { data: suspension, error } = await adminClient
        .from("account_suspensions").select("user_id").eq("user_id", actor.id).maybeSingle();
      if (error) return json({ error: "Account status could not be verified." }, 503);
      return json({ suspended: Boolean(suspension) });
    }

    if (body.action === "record_login" || body.action === "record_logout" || body.action === "record_password_change") {
      const { data: profile } = await adminClient.from("profiles").select("username").eq("id", actor.id).maybeSingle();
      const eventKey = body.action === "record_login" ? (body.method === "session_restore" ? "SESSION_RESTORED" : "LOGIN_SUCCESS") : body.action === "record_logout" ? "LOGOUT" : "PASSWORD_CHANGED";
      const { error: logError } = await adminClient.from("action_logs").insert({
        event_key: eventKey,
        category: "auth",
        actor_user_id: actor.id,
        actor_username: profile?.username ?? actor.email?.split("@")[0] ?? null,
        details: { method: body.action === "record_password_change" ? "password_change" : body.action === "record_logout" ? "session_end" : typeof body.method === "string" && ["email_password","username_password","session_restore"].includes(body.method) ? body.method : "password" },
        outcome: "success",
      });
      if (logError) return json({ error: "The authentication event could not be recorded." }, 500);
      return json({ recorded: true });
    }

    if (body.action === "delete_self") {
      const { data: profile, error: profileError } = await adminClient.from("profiles").select("id,username").eq("id", actor.id).maybeSingle();
      if (profileError || !profile) return json({ error: "The account profile could not be verified." }, 404);
      const { data: adminAccount, error: adminLookupError } = await adminClient.from("admin_users").select("user_id").eq("user_id", actor.id).maybeSingle();
      if (adminLookupError) return json({ error: "Account privileges could not be verified." }, 500);
      if (adminAccount) return json({ error: "Trusted administrator accounts cannot be self-deleted." }, 403);
      if (body.confirmation !== "DELETE " + profile.username) return json({ error: "Type DELETE followed by your exact username to confirm." }, 400);

      const { data: log, error: logError } = await adminClient.from("action_logs").insert({
        event_key: "ACCOUNT_DELETED", category: "profile",
        actor_user_id: actor.id, actor_username: profile.username,
        target_user_id: actor.id, target_username: profile.username,
        details: { deletion_source: "self_service" }, outcome: "pending",
      }).select("id").single();
      if (logError || !log) return json({ error: "The deletion could not be securely logged, so no account change was made." }, 500);

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(actor.id);
      const outcome = deleteError ? "failed" : "success";
      const { error: updateError } = await adminClient.from("action_logs").update({
        outcome, details: { deletion_source: "self_service", ...(deleteError ? { failure: "Auth account deletion was rejected." } : {}) },
      }).eq("id", log.id);
      if (deleteError) return json({ error: "Account deletion failed. Your account remains active; please contact support if this continues." }, 500);
      if (updateError) return json({ error: "The account was deleted, but the audit status could not be finalized. The pending audit entry has been retained." }, 500);
      return json({ message: "Your UFLMB account has been permanently deleted." });
    }

    const { data: adminRow, error: adminError } = await adminClient
      .from("admin_users").select("user_id").eq("user_id", actor.id).maybeSingle();
    if (adminError || !adminRow) return json({ error: "Administrator authorization is required." }, 403);

    if (body.action === "list_action_logs") {
      const requestedLimit = Number(body.limit);
      const requestedOffset = Number(body.offset);
      const limit = Number.isInteger(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 50;
      const offset = Number.isInteger(requestedOffset) ? Math.min(100000, Math.max(0, requestedOffset)) : 0;
      let query = adminClient.from("action_logs").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      if (typeof body.category === "string" && ["auth","profile","moderation","community","support","content","system"].includes(body.category)) query = query.eq("category", body.category);
      if (typeof body.outcome === "string" && ["success","failed","pending"].includes(body.outcome)) query = query.eq("outcome", body.outcome);
      const { data: logs, count, error } = await query;
      if (error) return json({ error: "The action log could not be loaded." }, 500);
      return json({ logs: logs ?? [], count: count ?? 0, limit, offset });
    }

    if (body.action === "profile_statuses") {
      if (!Array.isArray(body.userIds) || body.userIds.length > 500 ||
          body.userIds.some((id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))) {
        return json({ error: "A valid list of up to 500 profile IDs is required." }, 400);
      }
      const userIds = [...new Set(body.userIds as string[])];
      if (userIds.length === 0) return json({ statuses: {} });
      const [{ data: suspensions, error: suspensionError }, { data: warnings, error: warningsError }] = await Promise.all([
        adminClient.from("account_suspensions").select("user_id").in("user_id", userIds),
        adminClient.from("user_warnings").select("user_id").in("user_id", userIds),
      ]);
      if (suspensionError || warningsError) {
        return json({ error: "Could not load profile moderation statuses." }, 500);
      }
      const statuses: Record<string, "member" | "warn" | "suspended"> = {};
      for (const id of userIds) statuses[id] = "member";
      for (const warning of warnings ?? []) statuses[warning.user_id] = "warn";
      for (const suspension of suspensions ?? []) statuses[suspension.user_id] = "suspended";
      return json({ statuses });
    }

    if (body.action === "profile_details") {
      if (typeof body.userId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.userId)) {
        return json({ error: "A valid profile ID is required." }, 400);
      }
      const [{ data: targetUser, error: targetUserError }, { count: reviewCount, error: reviewCountError }] = await Promise.all([
        adminClient.auth.admin.getUserById(body.userId),
        adminClient.from("card_reviews").select("id", { count: "exact", head: true }).eq("user_id", body.userId),
      ]);
      if (targetUserError || !targetUser.user) return json({ error: "Could not verify the selected account." }, 404);
      if (reviewCountError) return json({ error: "Could not load the selected account's review count." }, 500);
      return json({
        emailVerified: Boolean(targetUser.user.email_confirmed_at),
        totalReviews: reviewCount ?? 0,
      });
    }

    if (body.action === "lookup") {
      if (typeof body.username !== "string" || !usernamePattern.test(body.username.trim())) {
        return json({ error: "Enter one exact registered username." }, 400);
      }
      const { data: profile, error: profileError } = await adminClient
        .from("profiles").select("id, username, created_at")
        .eq("username_normalized", body.username.trim().toLowerCase()).maybeSingle();
      if (profileError || !profile) return json({ error: "No unique registered account matched that username." }, 404);
      const { data: targetAdmin, error: targetAdminError } = await adminClient
        .from("admin_users").select("user_id").eq("user_id", profile.id).maybeSingle();
      if (targetAdminError) return json({ error: "Could not verify target account privileges." }, 500);
      if (targetAdmin) return json({ error: "Administrator accounts are protected from suspension and deletion." }, 403);
      const { data: suspension, error: suspensionError } = await adminClient
        .from("account_suspensions").select("reason, suspended_at").eq("user_id", profile.id).maybeSingle();
      if (suspensionError) return json({ error: "Could not verify account status." }, 500);
      return json({ account: {
        id: profile.id, username: profile.username, createdAt: profile.created_at ?? null,
        suspended: Boolean(suspension), suspensionReason: suspension?.reason ?? null,
      } });
    }

    const action = body.action;
    if (action !== "suspend" && action !== "restore" && action !== "delete") {
      return json({ error: "Unsupported account action." }, 400);
    }
    if (typeof body.username !== "string" || !usernamePattern.test(body.username.trim())) {
      return json({ error: "Invalid target username." }, 400);
    }
    if (typeof body.reason !== "string" || !body.reason.trim() || body.reason.trim().length > 500) {
      return json({ error: "A non-empty reason of up to 500 characters is required." }, 400);
    }
    if (action === "delete" && body.confirmation !== "DELETE " + body.username.trim()) {
      return json({ error: "The explicit deletion confirmation does not match." }, 400);
    }

    const { data: target, error: targetError } = await adminClient
      .from("profiles").select("id, username, created_at")
      .eq("username_normalized", body.username.trim().toLowerCase()).maybeSingle();
    if (targetError || !target) return json({ error: "The target account could not be verified." }, 404);
    if (typeof body.targetUserId !== "string" || body.targetUserId !== target.id) {
      return json({ error: "The target account changed. Search for it again before continuing." }, 409);
    }
    if (target.id === actor.id) return json({ error: "You cannot suspend or delete your own account through this tool." }, 403);
    const { data: targetAdmin, error: targetAdminError } = await adminClient
      .from("admin_users").select("user_id").eq("user_id", target.id).maybeSingle();
    if (targetAdminError) return json({ error: "Could not verify target account privileges." }, 500);
    if (targetAdmin) return json({ error: "Administrator accounts are protected from suspension and deletion." }, 403);

    const reason = body.reason.trim();
    const { data: audit, error: auditError } = await adminClient
      .from("account_moderation_audit")
      .insert({
        action, target_user_id: target.id, target_username: target.username,
        performed_by: actor.id, reason, outcome: "pending",
      })
      .select("id").single();
    if (auditError || !audit) return json({ error: "The action could not be logged, so no change was made." }, 500);

    const eventKey = action === "delete" ? "ACCOUNT_BANNED" : action === "suspend" ? "ACCOUNT_SUSPENDED" : "ACCOUNT_RESTORED";
    const { data: actorProfile } = await adminClient.from("profiles").select("username").eq("id", actor.id).maybeSingle();
    const { data: actionLog, error: actionLogError } = await adminClient.from("action_logs").insert({
      event_key: eventKey, category: "moderation",
      actor_user_id: actor.id, actor_username: actorProfile?.username ?? null,
      target_user_id: target.id, target_username: target.username,
      details: { reason, action_source: "admin_profile_management", deletion_behavior: action === "delete" ? "permanent_auth_deletion" : null },
      outcome: "pending",
    }).select("id").single();
    if (actionLogError || !actionLog) return json({ error: "The action could not be recorded in the central audit log, so no change was made." }, 500);

    let actionError: string | null = null;
    if (action === "suspend") {
      const { error: suspensionError } = await adminClient.from("account_suspensions").upsert({
        user_id: target.id, reason, suspended_by: actor.id, suspended_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (suspensionError) actionError = "Could not save the suspension state.";
      if (!actionError) {
        const { error } = await adminClient.auth.admin.updateUserById(target.id, { ban_duration: longBan });
        if (error) {
          actionError = "Could not block new sign-ins; the suspension was rolled back.";
          await adminClient.from("account_suspensions").delete().eq("user_id", target.id);
        }
      }
    } else if (action === "restore") {
      const { error: unbanError } = await adminClient.auth.admin.updateUserById(target.id, { ban_duration: "none" });
      if (unbanError) actionError = "Could not restore sign-in; no suspension change was made.";
      if (!actionError) {
        const { error } = await adminClient.from("account_suspensions").delete().eq("user_id", target.id);
        if (error) {
          actionError = "Sign-in was restored, but the access restriction could not be removed. Retry restore.";
          await adminClient.auth.admin.updateUserById(target.id, { ban_duration: longBan });
        }
      }
    } else {
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(target.id);
      if (deleteError) {
        actionError = "Deletion was rejected. The account may own Storage objects that must be reassigned or removed first.";
      } else {
        await adminClient.from("account_suspensions").delete().eq("user_id", target.id);
      }
    }

    const outcome = actionError ? "failed" : "completed";
    const { error: auditUpdateError } = await adminClient.from("account_moderation_audit")
      .update({ outcome, completed_at: new Date().toISOString() }).eq("id", audit.id);
    const { error: centralLogUpdateError } = await adminClient.from("action_logs").update({
      outcome: actionError ? "failed" : "success",
      details: { reason, action_source: "admin_profile_management", deletion_behavior: action === "delete" ? "permanent_auth_deletion" : null, ...(actionError ? { failure: actionError } : {}) },
    }).eq("id", actionLog.id);
    if (actionError) return json({ error: actionError + (auditUpdateError || centralLogUpdateError ? " The audit entry remains pending." : "") }, 500);
    if (auditUpdateError || centralLogUpdateError) return json({ error: "The action succeeded, but an audit status update failed. The pending audit entry has been retained; verify the account before retrying." }, 500);

    return json({ message: action === "suspend" ? "Account suspended and new sign-ins blocked." : action === "restore" ? "Account restored." : "Account permanently banned and deleted." });
  } catch {
    return json({ error: "The request could not be completed. Verify the account and try again." }, 500);
  }
});
