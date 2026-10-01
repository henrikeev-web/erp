/** Regras de senha do painel (staff). Módulo puro: usado pela API e testável sem banco. */

export const PASSWORD_MIN = 10;
const BCRYPT_MAX_BYTES = 72; // bcrypt ignora o que passa disso: melhor recusar do que truncar em silêncio

/** Devolve a mensagem do 1º problema, ou null se a senha é aceitável. */
export function checkNewPassword(pwd: string, ctx: { email?: string | null; current?: string } = {}): string | null {
  if (pwd.length < PASSWORD_MIN) return `A nova senha precisa ter pelo menos ${PASSWORD_MIN} caracteres`;
  if (new TextEncoder().encode(pwd).length > BCRYPT_MAX_BYTES) return `A nova senha pode ter no máximo ${BCRYPT_MAX_BYTES} bytes (cerca de 70 caracteres)`;
  if (!/[A-Za-zÀ-ÿ]/.test(pwd) || !/\d/.test(pwd)) return "A nova senha precisa ter letras e números";
  if (/^(.)\1+$/.test(pwd)) return "A nova senha é muito previsível";
  const local = ctx.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && pwd.toLowerCase().includes(local)) return "A nova senha não pode conter o seu e-mail";
  if (ctx.current !== undefined && pwd === ctx.current) return "A nova senha precisa ser diferente da atual";
  return null;
}

/**
 * Limite de tentativas ERRADAS da senha atual por usuário (em memória, processo único como o resto do app):
 * 5 erros → bloqueio de 15 min. Evita que uma sessão roubada descubra a senha atual por tentativa e erro.
 */
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;
const fails = new Map<string, { n: number; until: number }>();

export function passwordAttemptsLockedMs(userId: string, now = Date.now()): number {
  const f = fails.get(userId);
  return f && f.n >= MAX_FAILS && f.until > now ? f.until - now : 0;
}
export function registerPasswordFailure(userId: string, now = Date.now()) {
  const f = fails.get(userId);
  const n = f && f.until > now ? f.n + 1 : 1;
  fails.set(userId, { n, until: now + LOCK_MS });
}
export function clearPasswordFailures(userId: string) { fails.delete(userId); }
