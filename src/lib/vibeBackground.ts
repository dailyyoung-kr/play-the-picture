export type VibeSpectrum = {
  energy: number;
  warmth: number;
  social: number;
  special: number;
};

/**
 * vibeSpectrum 값 기반으로 배경 그라데이션 색상을 계산해요.
 * 우선순위: special > warmth > energy > cold > default(감성적)
 */
export function calcBackground(vibe?: VibeSpectrum | null): { from: string; to: string } {
  if (!vibe) return { from: "#0d1a10", to: "#1a0d18" };

  const { energy, warmth, special } = vibe;

  if (special > 70)              return { from: "#0d0d1a", to: "#1a0d18" }; // 보라/신비
  if (warmth > 60)               return { from: "#1a0d0d", to: "#0d0d1a" }; // 핑크/레드
  if (energy > 60)               return { from: "#1a1208", to: "#081a12" }; // 따뜻한
  if (energy < 40 && warmth < 40) return { from: "#0d1218", to: "#0d1a10" }; // 차가운

  return { from: "#0d1a10", to: "#1a0d18" }; // 감성적 (default)
}

export function calcBgGradient(vibe?: VibeSpectrum | null): string {
  const { from, to } = calcBackground(vibe);
  return `linear-gradient(158deg, ${from} 0%, ${to} 100%)`;
}
