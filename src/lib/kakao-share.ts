// Kakao JavaScript SDK Share — Rich Card 발송 (Feed Default Template)
// 사용처: result/page.tsx, share/[id]/ShareClient.tsx의 "카톡으로 보내기" 버튼

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Kakao: any;
  }
}

let initialized = false;

function getJsKey(): string | null {
  return process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? null;
}

// SDK lazy init — 첫 호출 시 1회만
export function initKakaoShare(): boolean {
  if (typeof window === "undefined") return false;
  if (!window.Kakao) {
    console.warn("[kakao-share] SDK not loaded yet");
    return false;
  }
  if (initialized && window.Kakao.isInitialized()) return true;
  const key = getJsKey();
  if (!key) {
    console.warn("[kakao-share] NEXT_PUBLIC_KAKAO_JS_KEY 미설정");
    return false;
  }
  try {
    if (!window.Kakao.isInitialized()) {
      window.Kakao.init(key);
    }
    initialized = true;
    return true;
  } catch (e) {
    console.error("[kakao-share] init 실패:", e);
    return false;
  }
}

export interface KakaoShareParams {
  entryId: string;
  vibeType: string;
  vibeDescription: string;
  song: string; // "노래제목 - 아티스트" 통합 문자열
  imageUrl?: string; // 미지정 시 /api/og 동적 이미지 사용
}

// Feed Default Template — title + description + image + "나도 분석받기" CTA
// Kakao 가이드: imageUrl 권장 800x400 (2:1). 우리 OG는 1200x630이지만 Kakao 가 자동 비율 조정.
export function shareToKakao(params: KakaoShareParams): boolean {
  if (!initKakaoShare()) return false;
  const baseUrl = "https://playthepicture.com";
  const sharedLink = `${baseUrl}/share/${params.entryId}?utm_source=kakao&utm_medium=share`;
  const inviteLink = `${baseUrl}/?utm_source=kakao&utm_medium=share_button`;
  const imageUrl = params.imageUrl ?? `${baseUrl}/api/og?id=${params.entryId}`;

  try {
    window.Kakao.Share.sendDefault({
      objectType: "feed",
      content: {
        title: params.vibeType,
        description: `${params.vibeDescription}\n🎵 ${params.song}`,
        imageUrl,
        link: {
          mobileWebUrl: sharedLink,
          webUrl: sharedLink,
        },
      },
      buttons: [
        {
          title: "나도 분석받기",
          link: {
            mobileWebUrl: inviteLink,
            webUrl: inviteLink,
          },
        },
      ],
    });
    return true;
  } catch (e) {
    console.error("[kakao-share] sendDefault 실패:", e);
    return false;
  }
}
