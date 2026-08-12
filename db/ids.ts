const ID_RE = /^[a-z][a-z0-9_]{1,31}_[0-9A-HJKMNP-TV-Z]{26}$/;

export function newId(prefix: string): string {
  if (!/^[a-z][a-z0-9_]{1,31}$/.test(prefix)) {
    throw new Error("Invalid ID prefix");
  }

  return `${prefix}_${encodeUuid(crypto.randomUUID())}`;
}

export function isResourceId(value: string): boolean {
  return ID_RE.test(value);
}

function encodeUuid(uuid: string): string {
  const bytes = Uint8Array.from(uuid.replaceAll("-", "").match(/.{2}/g)!, (value) =>
    Number.parseInt(value, 16),
  );
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let bits = 0;
  let buffer = 0;
  let output = "";

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += alphabet[(buffer >>> bits) & 31];
    }
  }

  if (bits > 0) output += alphabet[(buffer << (5 - bits)) & 31];
  return output.padStart(26, "0").slice(0, 26);
}
