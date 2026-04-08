export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  const existing = localStorage.getItem("ptp_device_id");
  if (existing) return existing;
  const newId = crypto.randomUUID();
  localStorage.setItem("ptp_device_id", newId);
  return newId;
}
