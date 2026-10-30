import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { username, password } = await req.json();
    if (typeof username !== "string" || typeof password !== "string" || !/^[A-Za-z0-9_]{3,24}$/.test(username.trim()) || password.length < 1) {
      return new Response(JSON.stringify({ error: "The username or password is incorrect." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id")
      .eq("username_normalized", username.trim().toLowerCase())
      .maybeSingle();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "The username or password is incorrect." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: userResult, error: userError } = await admin.auth.admin.getUserById(profile.id);
    const email = userResult?.user?.email;
    if (userError || !email) {
      return new Response(JSON.stringify({ error: "The username or password is incorrect." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: suspension, error: suspensionError } = await admin
      .from("account_suspensions").select("user_id").eq("user_id", profile.id).maybeSingle();
    if (suspensionError) {
      return new Response(JSON.stringify({ error: "Account status could not be verified. Please try again later." }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (suspension) {
      return new Response(JSON.stringify({ error: "Account is suspended." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) {
      return new Response(JSON.stringify({ error: "The username or password is incorrect." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      user: data.user,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch {
    return new Response(JSON.stringify({ error: "The username or password is incorrect." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
