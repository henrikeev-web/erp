import { randomInt } from "crypto";

/** Senha provisória legível (sem caracteres ambíguos), mostrada UMA vez a quem a gerou. */
export function tempPassword(length = 10): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () => chars[randomInt(chars.length)]).join("");
}
