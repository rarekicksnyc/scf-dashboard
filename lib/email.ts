// Assemble an RFC822 .eml message (with attachments) as a downloadable draft.
// X-Unsent: 1 makes Outlook open it as an editable, unsent draft — the user
// reviews and sends it themselves. No mail server or credentials involved.

export interface EmlAttachment {
  filename: string;
  mime: string;
  base64: string; // already base64-encoded content
}

// Normalise one or more recipients — a delimited string ("a@x.com, b@y.com")
// or a list — into a single RFC822 To/Cc header value. Splits on comma,
// semicolon, or whitespace; trims; de-dupes (case-insensitive); drops blanks.
export function toRecipients(input?: string | string[]): string | undefined {
  if (!input) return undefined;
  const raw = Array.isArray(input) ? input : input.split(/[,;\s]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of raw) {
    const v = e.trim();
    if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v); }
  }
  return out.length ? out.join(", ") : undefined;
}

const BOUNDARY = "----=_scf_boundary_9f2c1a7b3e";

// Strip CR/LF (and other control chars) from any value written into a mail header,
// so a counterparty name / reference containing "\r\nBcc: leak@x.com" cannot inject
// additional headers (a silent Bcc that would exfiltrate the deal's data).
function headerSafe(s: string): string {
  return String(s ?? "").replace(/[\r\n\u0000-\u001f\u007f]+/g, " ").trim();
}

// A filename embedded in a quoted header param must not carry a quote or CR/LF.
function filenameSafe(s: string): string {
  return headerSafe(s).replace(/["\\]/g, "_");
}

function wrap76(s: string): string {
  return s.replace(/.{1,76}/g, "$&\r\n");
}

export function emlResponse(
  filename: string,
  msg: { subject: string; body: string; to?: string; attachments?: EmlAttachment[] },
): Response {
  const lines: string[] = [];
  lines.push("X-Unsent: 1");
  if (msg.to) lines.push(`To: ${headerSafe(msg.to)}`);
  lines.push(`Subject: ${headerSafe(msg.subject)}`);
  lines.push("MIME-Version: 1.0");
  lines.push(`Content-Type: multipart/mixed; boundary="${BOUNDARY}"`);
  lines.push("");
  // Body part.
  lines.push(`--${BOUNDARY}`);
  lines.push('Content-Type: text/plain; charset="utf-8"');
  lines.push("Content-Transfer-Encoding: base64");
  lines.push("");
  lines.push(wrap76(Buffer.from(msg.body, "utf-8").toString("base64")).trimEnd());
  // Attachments.
  for (const a of msg.attachments ?? []) {
    lines.push(`--${BOUNDARY}`);
    lines.push(`Content-Type: ${a.mime}; name="${filenameSafe(a.filename)}"`);
    lines.push("Content-Transfer-Encoding: base64");
    lines.push(`Content-Disposition: attachment; filename="${filenameSafe(a.filename)}"`);
    lines.push("");
    lines.push(wrap76(a.base64).trimEnd());
  }
  lines.push(`--${BOUNDARY}--`);
  const eml = lines.join("\r\n");
  return new Response(eml, {
    headers: {
      "content-type": "message/rfc822",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
