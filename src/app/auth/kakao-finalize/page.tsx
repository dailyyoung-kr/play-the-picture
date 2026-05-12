"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

function KakaoFinalizeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tokenHash = searchParams.get("token_hash");
    const next = searchParams.get("next") ?? "/?signup=success";
    if (!tokenHash) {
      router.replace("/?auth_error=missing_token");
      return;
    }
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
      if (error) {
        console.error("[kakao-finalize] verifyOtp failed:", error.message);
        router.replace(`/?auth_error=${encodeURIComponent(error.message)}`);
        return;
      }
      // full reload — useEffect 재실행으로 isLoggedIn=true, welcome toast 트리거
      window.location.href = next;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0d1218",
        color: "rgba(255,255,255,0.65)",
        fontSize: 14,
      }}
    >
      잠시만 기다려주세요…
    </div>
  );
}

export default function KakaoFinalizePage() {
  return (
    <Suspense fallback={null}>
      <KakaoFinalizeInner />
    </Suspense>
  );
}
