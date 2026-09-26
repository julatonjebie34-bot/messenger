// Supabase Edge Function: assistant
// Deploy this with the Supabase CLI, then point AI_ENDPOINT in index.html at its URL.
// It keeps your Anthropic API key on the server, never in the browser.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-sonnet-4-6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY secret is not set on this function." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { message, history } = await req.json();

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Missing 'message' string." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Keep only the last 20 turns so requests stay small and fast.
    const priorTurns = Array.isArray(history) ? history.slice(-20) : [];
    const messages = [...priorTurns, { role: "user", content: message }];

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system:
          "You are a friendly, concise in-app assistant for a chat messenger app. Help users with questions about using the app and general questions they ask.",
        messages,
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return new Response(JSON.stringify({ error: "Anthropic API error: " + errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await anthropicRes.json();
    const reply = (data.content || [])
      .filter((block: { type: string }) => block.type === "text")
      .map((block: { text: string }) => block.text)
      .join("\n");

    return new Response(JSON.stringify({ reply: reply || "Sorry, I could not come up with a reply." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
