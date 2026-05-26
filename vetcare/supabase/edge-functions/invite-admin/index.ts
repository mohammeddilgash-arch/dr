import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
}

function isStrongPassword(password: string): boolean {
    return password.length >= 10;
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

        if (!supabaseUrl || !serviceRoleKey) {
            return jsonResponse({ error: "Missing Supabase env vars." }, 500);
        }

        const authHeader = req.headers.get("Authorization") ?? "";
        const jwt = authHeader.replace("Bearer ", "");
        if (!jwt) {
            return jsonResponse({ error: "Missing auth token." }, 401);
        }

        const serviceClient = createClient(supabaseUrl, serviceRoleKey);
        const authClient = createClient(supabaseUrl, serviceRoleKey, {
            global: { headers: { Authorization: `Bearer ${jwt}` } }
        });

        const { data: userData, error: userError } = await authClient.auth.getUser(jwt);
        if (userError || !userData?.user) {
            return jsonResponse({ error: "Invalid auth token." }, 401);
        }

        const { data: callerAdmin } = await serviceClient
            .from("admin_profiles")
            .select("role")
            .eq("user_id", userData.user.id)
            .maybeSingle();

        if (!callerAdmin || callerAdmin.role !== "super_admin") {
            return jsonResponse({ error: "Only super admins can create admins." }, 403);
        }

        const body = await req.json().catch(() => ({}));
        const email = (body?.email as string | undefined)?.trim()?.toLowerCase();
        const password = body?.password as string | undefined;
        const role = (body?.role as string | undefined) === "super_admin" ? "super_admin" : "admin";

        if (!email || !password) {
            return jsonResponse({ error: "Email and password are required." }, 400);
        }

        if (!isValidEmail(email)) {
            return jsonResponse({ error: "Invalid email format." }, 400);
        }

        if (!isStrongPassword(password)) {
            return jsonResponse({ error: "Password must be at least 10 characters." }, 400);
        }

        const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true
        });

        if (createError || !created.user) {
            return jsonResponse({ error: createError?.message || "Failed to create user." }, 400);
        }

        const { error: profileError } = await serviceClient
            .from("admin_profiles")
            .upsert({ user_id: created.user.id, role }, { onConflict: "user_id" });

        if (profileError) {
            return jsonResponse({ error: profileError.message }, 400);
        }

        return jsonResponse({ ok: true, user_id: created.user.id, role }, 200);
    } catch (error) {
        console.error("invite-admin error", error);
        return jsonResponse({ error: "Internal server error." }, 500);
    }
});
