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

    const { data: adminRow, error: adminError } = await adminClient
      .from("admin_users").select("user_id").eq("user_id", actor.id).maybeSingle();
    if (adminError || !adminRow) return json({ error: "Administrator authorization is required." }, 403);

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
    if (typeof body.reason !== "string" || body.reason.trim().length < 10 || body.reason.trim().length > 500) {
      return json({ error: "A reason of 10–500 characters is required." }, 400);
    }
    const expectedConfirmation = action === "delete" ? "DELETE " + body.username.trim() : body.username.trim();
    if (body.confirmation !== expectedConfirmation) return json({ error: "The explicit confirmation does not match." }, 400);

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
      // Read every affected row in bounded pages before changing any data.
      // PostgREST's default row cap must never silently truncate rollback snapshots.
      const pageSize = 500;
      const readAllForUser = async (table: string, columns: string) => {
        const rows: Record<string, unknown>[] = [];
        for (let offset = 0; ; offset += pageSize) {
          const { data, error } = await adminClient
            .from(table)
            .select(columns)
            .eq("user_id", target.id)
            .order("id", { ascending: true })
            .range(offset, offset + pageSize - 1);
          if (error || !data) return { rows: null, error };
          rows.push(...data);
          if (data.length < pageSize) return { rows, error: null };
        }
      };
      const reviewSnapshot = await readAllForUser("card_reviews", "id, reviewer_name, user_id");
      const queueSnapshot = await readAllForUser(
        "moderation_queue",
        "id, user_id, display_name, content_excerpt, admin_note",
      );

      const chunks = <T,>(items: T[], size = 200) =>
        Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
      const updateRows = async (
        table: string,
        rows: Record<string, unknown>[],
        values: (row: Record<string, unknown>) => Record<string, unknown>,
      ) => {
        for (const batch of chunks(rows)) {
          const results = await Promise.all(batch.map(row =>
            adminClient.from(table).update(values(row)).eq("id", row.id)
          ));
          if (results.some(result => result.error)) return false;
        }
        return true;
      };
      const reviewRows = reviewSnapshot.rows;
      const queueRows = queueSnapshot.rows;

      if (reviewSnapshot.error || queueSnapshot.error || !reviewRows || !queueRows) {
        actionError = "Could not safely read every review and moderation record for anonymisation. No account data was deleted.";
      } else {
        const reviewsAnonymised = await updateRows(
          "card_reviews",
          reviewRows,
          () => ({ reviewer_name: "Deleted member", user_id: null }),
        );
        if (!reviewsAnonymised) {
          actionError = "Could not anonymise every public review. No account data was deleted.";
        } else {
          const queueAnonymised = await updateRows(
            "moderation_queue",
            queueRows,
            () => ({
              user_id: null,
              display_name: "Deleted member",
              content_excerpt: "",
              admin_note: null,
            }),
          );

          if (!queueAnonymised) {
            const restored = await updateRows(
              "card_reviews",
              reviewRows,
              row => ({ reviewer_name: row.reviewer_name, user_id: row.user_id }),
            );
            actionError = restored
              ? "Could not anonymise moderation records. Review changes were rolled back; no account data was deleted."
              : "Could not anonymise moderation records, and review rollback was incomplete. WARNING: inspect affected records before retrying.";
          } else {
            const { error: deleteError } = await adminClient.auth.admin.deleteUser(target.id);
            if (deleteError) {
              const rollbackResults = await Promise.all([
                updateRows(
                  "card_reviews",
                  reviewRows,
                  row => ({ reviewer_name: row.reviewer_name, user_id: row.user_id }),
                ),
                updateRows(
                  "moderation_queue",
                  queueRows,
                  row => ({
                    user_id: row.user_id,
                    display_name: row.display_name,
                    content_excerpt: row.content_excerpt,
                    admin_note: row.admin_note,
                  }),
                ),
              ]);
              const rollbackFailed = rollbackResults.some(result => !result);
              actionError = "Deletion was rejected. The account may own Storage objects that must be reassigned or removed first."
                + (rollbackFailed
                  ? " WARNING: some review/moderation data could not be restored; inspect the records before retrying."
                  : " Review and moderation changes were rolled back.");
            } else {
              await adminClient.from("account_suspensions").delete().eq("user_id", target.id);
            }
          }
        }
      }
    }

    const outcome = actionError ? "failed" : "completed";
    const { error: auditUpdateError } = await adminClient.from("account_moderation_audit")
      .update({ outcome, completed_at: new Date().toISOString() }).eq("id", audit.id);
    if (actionError) return json({ error: actionError + (auditUpdateError ? " The audit entry remains pending." : "") }, 500);
    if (auditUpdateError) return json({ error: "The action succeeded, but the audit status update failed. The audit entry remains pending; verify the account before retrying." }, 500);

    return json({ message: action === "suspend" ? "Account suspended and new sign-ins blocked." : action === "restore" ? "Account restored." : "Account permanently deleted." });
  } catch {
    return json({ error: "The request could not be completed. Verify the account and try again." }, 500);
  }
});
