export function isAuthGateEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_GATE_ENABLED === "true";
}
