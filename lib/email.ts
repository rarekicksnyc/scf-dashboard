// Assemble an RFC822 .eml message (with attachments) as a downloadable draft.
// X-Unsent: 1 makes Outlook open it as an editable, unsent draft — the user
// reviews and sends it themselves. No mail server or credentials involved.

export interface EmlAttachment {
  filename: string;
  mime: string;
  base64: string; // already base64-encoded content
}

const BOUNDARY = "----=_scf_boundary_9f2c1a7b3e";

function wrap76(s: string): string {
  return s.replace(/.{1,76}/g, "$&\r\n");
}

export function emlResponse(
  filename: string,
  msg: { subject: string; body: string; to?: string; attachments?: EmlAttachment[] },
): Response {
  const lines: string[] = [];
  lines.push("X-Unsent: 1");
  if (msg.to) lines.push(`To: ${msg.to}`);
  lines.push(`Subject: ${msg.subject}`);
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
    lines.push(`Content-Type: ${a.mime}; name="${a.filename}"`);
    lines.push("Content-Transfer-Encoding: base64");
    lines.push(`Content-Disposition: attachment; filename="${a.filename}"`);
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
