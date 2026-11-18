"""Generates the n8n workflow JSON in n8n/workflows/ from one readable source.

Run: python n8n/build-workflows.py
The exported JSON never contains secrets: every secret and URL is read from
the n8n container environment ($env.*) at run time.
"""
import json
import pathlib
import uuid

OUT = pathlib.Path(__file__).parent / "workflows"
ERROR_WF_ID = "lendloopErrorsWf"
RETRY = {"retryOnFail": True, "maxTries": 3, "waitBetweenTries": 2000}


def node(name, type_, version, params, pos, **extra):
    d = {
        "parameters": params,
        "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, "lendloop." + name)),
        "name": name,
        "type": type_,
        "typeVersion": version,
        "position": pos,
    }
    d.update(extra)
    return d


def code(name, js, pos, **extra):
    return node(name, "n8n-nodes-base.code", 2, {"jsCode": js.strip() + "\n"}, pos, **extra)


def if_true(name, expr, pos):
    return node(name, "n8n-nodes-base.if", 2.2, {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
            "conditions": [{
                "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, "cond." + name)),
                "leftValue": expr,
                "rightValue": "",
                "operator": {"type": "boolean", "operation": "true", "singleValue": True},
            }],
            "combinator": "and",
        },
        "options": {},
    }, pos)


def http_signed(name, method, path, pos, body_expr=None):
    params = {
        "method": method,
        "url": "={{ $env.LENDLOOP_CONVEX_SITE_URL }}" + path,
        "sendHeaders": True,
        "headerParameters": {"parameters": [
            {"name": "x-lendloop-timestamp", "value": "={{ $json.timestamp }}"},
            {"name": "x-lendloop-signature", "value": "={{ $json.signature }}"},
        ]},
        "options": {"timeout": 10000},
    }
    if body_expr:
        params.update({"sendBody": True, "contentType": "raw", "rawContentType": "application/json", "body": body_expr})
    return node(name, "n8n-nodes-base.httpRequest", 4.2, params, pos, **RETRY)


def discord(name, pos):
    return node(name, "n8n-nodes-base.httpRequest", 4.2, {
        "method": "POST",
        "url": "={{ $env.DISCORD_WEBHOOK_URL }}",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ content: $json.text }) }}",
        "options": {"timeout": 10000},
    }, pos, **RETRY)


def connections(*pairs):
    out = {}
    for src, branches in pairs:
        out[src] = {"main": [[{"node": n, "type": "main", "index": 0} for n in branch] for branch in branches]}
    return out


def workflow(wf_id, name, nodes, conns, error_workflow=True):
    settings = {"executionOrder": "v1"}
    if error_workflow:
        settings["errorWorkflow"] = ERROR_WF_ID
    return {"id": wf_id, "name": name, "active": False, "nodes": nodes, "connections": conns,
            "settings": settings, "pinData": {}, "tags": []}


SIGN_HELPER = """
// Same scheme as convex/lib/hmac.ts: hex(HMAC_SHA256(secret, `${timestamp}.${body}`)).
const crypto = require('crypto');
const sign = (body) => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto
    .createHmac('sha256', $env.LENDLOOP_CONVEX_SECRET)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return { timestamp, signature };
};
"""

FMT_DAY = """
const day = (d) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
"""

# ---------------- 1. request notification ----------------

VERIFY_JS = """
// Reject anything not signed by Convex with LENDLOOP_N8N_SECRET, or older than 5 minutes.
const crypto = require('crypto');
const item = $input.first().json;
const headers = item.headers || {};
const timestamp = headers['x-lendloop-timestamp'];
const signature = String(headers['x-lendloop-signature'] || '').toLowerCase();
const payload = item.body && item.body.payload;
const secret = $env.LENDLOOP_N8N_SECRET;

let reason = 'missing';
if (secret && timestamp && signature && typeof payload === 'string') {
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) {
    reason = 'stale';
  } else {
    const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
    const ok =
      expected.length === signature.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    reason = ok ? 'ok' : 'mismatch';
  }
}
if (reason !== 'ok') console.warn(`[lendloop] rejected webhook: ${reason}`);
return [{ json: { valid: reason === 'ok', reason, event: reason === 'ok' ? JSON.parse(payload) : null } }];
"""

COMPOSE_JS = FMT_DAY + """
// Only what the message needs: first names, the tool and the dates. No emails in logs.
const e = $input.first().json.event;
const when = `${day(e.startDate)} to ${day(e.endDate)}`;
const to = e.recipient.firstName;
const lines = {
  requested: `Hi ${to}, ${e.otherPartyFirstName} would like to borrow your ${e.toolName} (${when}).`,
  approved: `Hi ${to}, good news: ${e.otherPartyFirstName} approved your request for the ${e.toolName} (${when}).`,
  declined: `Hi ${to}, ${e.otherPartyFirstName} can't lend the ${e.toolName} for ${when} this time.`,
  cancelled: `Hi ${to}, the request for the ${e.toolName} (${when}) was cancelled.`,
  returned: `Hi ${to}, the ${e.toolName} is marked as returned. Thanks for being part of the loop!`,
};
const text = lines[e.status] || `Hi ${to}, there is an update on the ${e.toolName}.`;
// The logged mock notification: always written to the n8n log, and to Discord when configured.
console.log(`[lendloop] notify ${to} (${e.status}): ${text}`);
return [{ json: { text, eventId: e.eventId, loanId: e.loanId, status: e.status } }];
"""

WRITEBACK_REQUEST_JS = SIGN_HELPER + """
const msg = $('Compose message').first().json;
const body = JSON.stringify({
  loanId: msg.loanId,
  kind: 'request_notification',
  status: 'sent',
  channel: $env.DISCORD_WEBHOOK_URL ? 'discord' : 'log',
  idempotencyKey: msg.eventId, // req:<loanId>:<status>, the same on every retry
  detail: `Told the ${msg.status === 'requested' ? 'lender' : 'borrower'} (${msg.status})`,
});
return [{ json: { body, ...sign(body) } }];
"""

request_wf = workflow(
    "lendloopRequests",
    "LendLoop: request notification",
    [
        node("Convex webhook", "n8n-nodes-base.webhook", 2,
             {"httpMethod": "POST", "path": "lendloop-request", "responseMode": "responseNode", "options": {}},
             [0, 300], webhookId="6f2b4a0e-1c3d-4e5f-9a7b-8c9d0e1f2a3b"),
        code("Verify signature", VERIFY_JS, [220, 300]),
        if_true("Signature valid?", "={{ $json.valid }}", [440, 300]),
        node("Reject 401", "n8n-nodes-base.respondToWebhook", 1.1,
             {"respondWith": "json", "responseBody": "={{ { error: 'invalid signature' } }}",
              "options": {"responseCode": 401}}, [660, 460]),
        code("Compose message", COMPOSE_JS, [660, 200]),
        if_true("Discord configured?", "={{ !!$env.DISCORD_WEBHOOK_URL }}", [880, 200]),
        discord("Post to Discord", [1100, 100]),
        code("Sign write-back", WRITEBACK_REQUEST_JS, [1320, 200]),
        http_signed("Write back to Convex", "POST", "/automation-events", [1540, 200], body_expr="={{ $json.body }}"),
        node("Respond 200", "n8n-nodes-base.respondToWebhook", 1.1,
             {"respondWith": "json", "responseBody": "={{ { ok: true } }}", "options": {"responseCode": 200}},
             [1760, 200]),
    ],
    connections(
        ("Convex webhook", [["Verify signature"]]),
        ("Verify signature", [["Signature valid?"]]),
        ("Signature valid?", [["Compose message"], ["Reject 401"]]),
        ("Compose message", [["Discord configured?"]]),
        ("Discord configured?", [["Post to Discord"], ["Sign write-back"]]),
        ("Post to Discord", [["Sign write-back"]]),
        ("Sign write-back", [["Write back to Convex"]]),
        ("Write back to Convex", [["Respond 200"]]),
    ),
)

# ---------------- 2. overdue reminders ----------------

SIGN_GET_JS = SIGN_HELPER + """
return [{ json: sign('GET /overdue-loans') }];
"""

BUILD_JS = FMT_DAY + """
// One item per overdue loan. The key includes the day, so a re-run today never records a
// second reminder, while tomorrow's run sends a new one.
const { today, loans } = $input.first().json;
return loans.map((l) => ({
  json: {
    loanId: l.loanId,
    idempotencyKey: `overdue:${l.loanId}:${today}`,
    text: `Hi ${l.borrower.firstName}, a friendly reminder: the ${l.toolName} was due back on ${day(l.endDate)}. Could you return it when you can?`,
  },
}));
"""

LOG_JS = """
for (const item of $input.all()) console.log(`[lendloop] overdue reminder: ${item.json.text}`);
return $input.all();
"""

WRITEBACK_OVERDUE_JS = SIGN_HELPER + """
// Runs once and signs one write-back per reminder.
return $('Build reminders').all().map((r) => {
  const body = JSON.stringify({
    loanId: r.json.loanId,
    kind: 'overdue_reminder',
    status: 'sent',
    channel: $env.DISCORD_WEBHOOK_URL ? 'discord' : 'log',
    idempotencyKey: r.json.idempotencyKey,
    detail: 'Overdue reminder sent to the borrower',
  });
  return { json: { body, ...sign(body) } };
});
"""

overdue_wf = workflow(
    "lendloopOverdues",
    "LendLoop: overdue reminders",
    [
        node("Every day at 09:00", "n8n-nodes-base.scheduleTrigger", 1.2,
             {"rule": {"interval": [{"field": "days", "triggerAtHour": 9}]}}, [0, 200]),
        node("Run now (manual)", "n8n-nodes-base.manualTrigger", 1, {}, [0, 400]),
        code("Sign request", SIGN_GET_JS, [220, 300]),
        http_signed("Fetch overdue loans", "GET", "/overdue-loans", [440, 300]),
        code("Build reminders", BUILD_JS, [660, 300]),
        code("Log reminders", LOG_JS, [880, 300]),
        if_true("Discord configured?", "={{ !!$env.DISCORD_WEBHOOK_URL }}", [1100, 300]),
        discord("Post to Discord", [1320, 200]),
        code("Sign write-backs", WRITEBACK_OVERDUE_JS, [1540, 300], executeOnce=True),
        http_signed("Write back to Convex", "POST", "/automation-events", [1760, 300], body_expr="={{ $json.body }}"),
    ],
    connections(
        ("Every day at 09:00", [["Sign request"]]),
        ("Run now (manual)", [["Sign request"]]),
        ("Sign request", [["Fetch overdue loans"]]),
        ("Fetch overdue loans", [["Build reminders"]]),
        ("Build reminders", [["Log reminders"]]),
        ("Log reminders", [["Discord configured?"]]),
        ("Discord configured?", [["Post to Discord"], ["Sign write-backs"]]),
        ("Post to Discord", [["Sign write-backs"]]),
        ("Sign write-backs", [["Write back to Convex"]]),
    ),
)

# ---------------- 3. error handler ----------------

ERROR_JS = SIGN_HELPER + """
// Tell Convex about the failed run so admins see it. Only where and why it failed,
// never the payload of the failed run.
const { execution = {}, workflow = {} } = $input.first().json;
const message = `${execution.lastNodeExecuted || 'unknown node'}: ${(execution.error && execution.error.message) || 'unknown error'}`;
console.error(`[lendloop] workflow "${workflow.name}" failed: ${message}`);
const body = JSON.stringify({
  workflow: workflow.name || 'unknown',
  message,
  executionId: execution.id ? String(execution.id) : undefined,
  idempotencyKey: `n8n:${execution.id || Date.now()}`,
});
return [{ json: { body, ...sign(body) } }];
"""

error_wf = workflow(
    ERROR_WF_ID,
    "LendLoop: error handler",
    [
        node("On workflow error", "n8n-nodes-base.errorTrigger", 1, {}, [0, 300]),
        code("Describe failure", ERROR_JS, [220, 300]),
        http_signed("Report to Convex", "POST", "/automation-failures", [440, 300], body_expr="={{ $json.body }}"),
    ],
    connections(("On workflow error", [["Describe failure"]]), ("Describe failure", [["Report to Convex"]])),
    error_workflow=False,
)

OUT.mkdir(exist_ok=True)
for filename, wf in [
    ("1-request-notification.json", request_wf),
    ("2-overdue-reminders.json", overdue_wf),
    ("3-error-handler.json", error_wf),
]:
    (OUT / filename).write_text(json.dumps(wf, indent=2) + "\n", encoding="utf-8", newline="\n")
    print("wrote", filename)
