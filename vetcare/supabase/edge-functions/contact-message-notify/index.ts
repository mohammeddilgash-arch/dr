import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const RECIPIENT_CACHE_TTL_MS = 5 * 60 * 1000;
let recipientCache: { value: string[]; expiresAt: number } | null = null;

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function normalizeRecipientList(raw: string): string[] {
    if (!raw.trim()) {
        return [];
    }

    return raw
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item));
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

async function getRecipients(serviceClient: ReturnType<typeof createClient>, envRecipients: string[]): Promise<string[]> {
    const now = Date.now();
    if (recipientCache && recipientCache.expiresAt > now) {
        return recipientCache.value;
    }

    const recipients = new Set<string>(envRecipients);

    const { data: adminRows, error: adminError } = await serviceClient
        .from("admin_profiles")
        .select("user_id");

    if (!adminError && Array.isArray(adminRows) && adminRows.length > 0) {
        const { data: usersData, error: usersError } = await serviceClient.auth.admin.listUsers({
            page: 1,
            perPage: 1000
        });

        if (!usersError && usersData?.users) {
            const adminUserIds = new Set(adminRows.map((row) => row.user_id));
            usersData.users.forEach((user) => {
                if (adminUserIds.has(user.id) && user.email) {
                    const email = user.email.trim().toLowerCase();
                    if (isValidEmail(email)) {
                        recipients.add(email);
                    }
                }
            });
        }
    }

    const result = Array.from(recipients);
    recipientCache = {
        value: result,
        expiresAt: now + RECIPIENT_CACHE_TTL_MS
    };

    return result;
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
        const envRecipients = normalizeRecipientList(Deno.env.get("ADMIN_NOTIFY_EMAILS") ?? "");

        if (!supabaseUrl || !serviceRoleKey) {
            return jsonResponse({ error: "Missing Supabase env vars." }, 500);
        }

        if (!resendApiKey) {
            return jsonResponse({ ok: true, skipped: "RESEND_API_KEY missing" }, 200);
        }

        const body = await req.json().catch(() => ({}));
        const fullName = String(body?.full_name || "").trim();
        const email = String(body?.email || "").trim().toLowerCase();
        const petName = String(body?.pet_name || "").trim();
        const serviceInquiry = String(body?.service_inquiry || "").trim();
        const message = String(body?.message || "").trim();

        if (!fullName || !email || !message || !isValidEmail(email)) {
            return jsonResponse({ error: "Invalid payload." }, 400);
        }

        const boundedFullName = fullName.slice(0, 120);
        const boundedPetName = petName.slice(0, 120);
        const boundedServiceInquiry = serviceInquiry.slice(0, 120);
        const boundedMessage = message.slice(0, 4000);

        const serviceClient = createClient(supabaseUrl, serviceRoleKey);
        const recipientList = await getRecipients(serviceClient, envRecipients);
        if (!recipientList.length) {
            return jsonResponse({ ok: true, skipped: "No recipients" }, 200);
        }

        const safeFullName = escapeHtml(boundedFullName);
        const safeEmail = escapeHtml(email);
        const safePetName = escapeHtml(boundedPetName || "-");
        const safeServiceInquiry = escapeHtml(boundedServiceInquiry || "-");
        const safeMessage = escapeHtml(boundedMessage).replaceAll("\n", "<br/>");

        const emailResponse = await fetchWithTimeout(
            "https://api.resend.com/emails",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${resendApiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    from: fromEmail,
                    to: recipientList,
                    subject: "New contact message received | VetCare",
                    html: `
                        <h2>New Contact Message</h2>
                        <p><strong>Name:</strong> ${safeFullName}</p>
                        <p><strong>Email:</strong> ${safeEmail}</p>
                        <p><strong>Pet Name:</strong> ${safePetName}</p>
                        <p><strong>Service Inquiry:</strong> ${safeServiceInquiry}</p>
                        <p><strong>Message:</strong><br/>${safeMessage}</p>
                    `
                })
            },
            5000
        );

        if (!emailResponse.ok) {
            const responseText = await emailResponse.text().catch(() => "");
            return jsonResponse({ error: "Failed to send notification", details: responseText }, 502);
        }

        return jsonResponse({ ok: true, recipients: recipientList.length }, 200);
    } catch (error) {
        console.error("contact-message-notify error", error);
        return jsonResponse({ error: "Internal server error." }, 500);
    }
});
