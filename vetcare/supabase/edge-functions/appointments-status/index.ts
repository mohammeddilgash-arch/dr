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

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("Request timeout"), timeoutMs);

    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
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
        const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
        const fromEmail = Deno.env.get("FROM_EMAIL") ?? "no-reply@vetcare.local";

        if (!supabaseUrl || !serviceRoleKey) {
            return jsonResponse({ error: "Missing Supabase env vars." }, 500);
        }

        const authHeader = req.headers.get("Authorization") ?? "";
        const jwt = authHeader.replace("Bearer ", "");
        if (!jwt) {
            return jsonResponse({ error: "Missing auth token." }, 401);
        }

        const adminClient = createClient(supabaseUrl, serviceRoleKey, {
            global: { headers: { Authorization: `Bearer ${jwt}` } }
        });

        const serviceClient = createClient(supabaseUrl, serviceRoleKey);

        const { data: userData, error: userError } = await adminClient.auth.getUser(jwt);
        if (userError || !userData?.user) {
            return jsonResponse({ error: "Invalid auth token." }, 401);
        }

        const { data: adminRow } = await serviceClient
            .from("admin_profiles")
            .select("role")
            .eq("user_id", userData.user.id)
            .maybeSingle();

        if (!adminRow) {
            return jsonResponse({ error: "Not authorized." }, 403);
        }

        const body = await req.json().catch(() => ({}));
        const appointmentId = body?.appointmentId as string;
        const action = body?.action as "accept" | "deny";
        const reasonInput = typeof body?.reason === "string" ? body.reason.trim() : "";
        const reason = reasonInput ? reasonInput.slice(0, 1000) : null;

        if (!appointmentId || !isUuid(appointmentId) || !action || !["accept", "deny"].includes(action)) {
            return jsonResponse({ error: "Invalid payload." }, 400);
        }

        const status = action === "accept" ? "accepted" : "denied";

        const { data: appointment, error: apptError } = await serviceClient
            .from("appointments")
            .update({
                status,
                rejection_reason: status === "denied" ? reason : null,
                reviewed_at: new Date().toISOString(),
                reviewed_by: userData.user.id,
                updated_at: new Date().toISOString()
            })
            .eq("id", appointmentId)
            .select("*")
            .single();

        if (apptError || !appointment) {
            return jsonResponse({ error: "Failed to update appointment." }, 400);
        }

        if (status === "accepted" && resendApiKey && appointment.email) {
            try {
                const notifyRes = await fetchWithTimeout(
                    "https://api.resend.com/emails",
                    {
                        method: "POST",
                        headers: {
                            Authorization: `Bearer ${resendApiKey}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            from: fromEmail,
                            to: [appointment.email],
                            subject: "Your VetCare appointment has been accepted",
                            html: `
                                <h2>Appointment Accepted</h2>
                                <p>Hello ${appointment.full_name},</p>
                                <p>Your appointment request has been accepted.</p>
                                <p><strong>Date:</strong> ${appointment.preferred_date ?? "TBD"}<br/>
                                <strong>Time:</strong> ${appointment.preferred_time ?? "TBD"}</p>
                                <p>Thank you,<br/>VetCare Clinic</p>
                            `
                        })
                    },
                    5000
                );

                if (!notifyRes.ok) {
                    const details = await notifyRes.text().catch(() => "");
                    console.error("appointments-status resend failed", {
                        status: notifyRes.status,
                        details
                    });
                }
            } catch (notifyError) {
                // Do not fail the status transition if notification provider is down.
                console.error("appointments-status notify timeout/failure", notifyError);
            }
        }

        return jsonResponse({ ok: true, appointment }, 200);
    } catch (error) {
        console.error("appointments-status error", error);
        return jsonResponse({ error: "Internal server error." }, 500);
    }
});
