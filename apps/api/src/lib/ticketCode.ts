import { randomBytes } from "node:crypto";
import { TICKET_CODE_PREFIX } from "@protickt/shared";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * PTK- followed by 26 base32 chars (130 bits of entropy). Possession of the
 * code is the ticket, so unguessability is the entire security model.
 */
export function generateTicketCode(): string {
  const bytes = randomBytes(17);
  let bits = 0;
  let acc = 0;
  let out = "";
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < 26) {
      bits -= 5;
      out += BASE32_ALPHABET[(acc >> bits) & 31];
    }
  }
  return TICKET_CODE_PREFIX + out;
}
