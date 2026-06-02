"use client";

/**
 * /discovery — "오늘의 발견" 페이지
 *
 * UI:
 *  · 캐러셀: 드래그 + 1/2 인디케이터 + 점 인디케이터 + 자세히 보기
 *  · 캐러셀 좌상단 ⭐ 별: 아티스트 저장/취소
 *  · 우상단 📁 컬렉션 메뉴: /discovery/collection 이동
 *  · 상세 모드 (?detail=1|2): 곡 옆 🔖 북마크 = 곡 저장/취소
 */
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bookmark, Star, ChevronLeft, Archive, Music, Sparkles, FolderHeart, Clock, Search } from "lucide-react";
// Sparkles는 하단 네비 BottomNav에서 사용 — 헤더에선 제거
import { HamburgerMenu } from "@/components/header/HamburgerMenu";
import { LoginGate } from "@/components/auth/LoginGate";
import { getDeviceId } from "@/lib/supabase";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

type Track = {
  id: string;
  name: string;
  album: string;
  year: string;
  art: string | null;
  preview: string | null;
};
type Artist = {
  apple_id: string;
  name: string;
  artwork: string | null;
  genres: string[];
  bio_ko: string;
  caption: string;
  reason: string;
  tracks: Track[];
};
type DiscoveryResponse = {
  artist_1: Artist;
  artist_2: Artist;
  cache_key: string;
  generated: boolean;
  blocked?: boolean; // 시드 0개 → 백엔드가 차단 (안내 UI 표시)
};
type SavesResponse = {
  artists: { apple_id: string }[];
  tracks: { apple_id: string }[];
};

const PURPLE_MAIN = "#5D4F8C";
const PURPLE_BG = "linear-gradient(180deg, #c5beda 0%, #b3acd2 45%, #c8c0e0 100%)";

/** KST 기준 yyyy-mm-dd — today/route.ts와 동일 로직 */
function todayKstStr(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ─────────────────────────── Save helpers ───────────────────────────

type Identity = { deviceId: string; userId: string | null };

async function getIdentity(): Promise<Identity> {
  const deviceId = getDeviceId();
  let userId: string | null = null;
  try {
    const sb = createSupabaseBrowserClient();
    const { data: { user } } = await sb.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // ignore
  }
  return { deviceId, userId };
}

async function toggleSave(
  identity: Identity,
  itemType: "artist" | "track",
  appleId: string,
  snapshot: unknown,
): Promise<boolean> {
  const r = await fetch("/api/discovery/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      device_id: identity.deviceId,
      user_id: identity.userId,
      item_type: itemType,
      apple_id: appleId,
      snapshot,
    }),
  });
  const j = (await r.json()) as { saved?: boolean };
  return Boolean(j.saved);
}

// ─────────────────────────── Page (Suspense wrapper) ───────────────────────────

export default function DiscoveryPage() {
  return (
    <Suspense fallback={<PageShell><LoadingCard /></PageShell>}>
      <DiscoveryPageInner />
    </Suspense>
  );
}

function DiscoveryPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const detailIdx = sp.get("detail");

  const [identity, setIdentity] = useState<Identity | null>(null);
  const [data, setData] = useState<DiscoveryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedArtists, setSavedArtists] = useState<Set<string>>(new Set());
  const [savedTracks, setSavedTracks] = useState<Set<string>>(new Set());
  const [loginGateOpen, setLoginGateOpen] = useState(false);
  // isActive: null=아직 확인 안 함, true=entries 1건+, false=entries 0건 (안내 화면)
  const [isActive, setIsActive] = useState<boolean | null>(null);
  // 마지막 today fetch한 KST 날짜 — 탭 복귀 시 date 바뀌었으면 stale 카드 갱신
  const [fetchedDate, setFetchedDate] = useState<string | null>(null);

  /** 비로그인 사용자가 보호된 action 시도 → 로그인 게이트 띄움 */
  const requireAuth = useCallback(
    (action: () => void) => {
      if (!identity?.userId) {
        setLoginGateOpen(true);
        return;
      }
      action();
    },
    [identity],
  );

  /** identity 결정 후 카드+saves fetch. 로그인 완료 콜백에서도 재사용 */
  const loadData = useCallback(async (id: Identity) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ device_id: id.deviceId });
    if (id.userId) params.set("user_id", id.userId);
    const todayParams = new URLSearchParams(params);
    todayParams.set("supports_blocked", "1"); // 웹은 blocked 안내화면 처리 가능
    try {
      const [cardRes, savesRes] = await Promise.all([
        fetch(`/api/discovery/today?${todayParams}`),
        fetch(`/api/discovery/saves?${params}`),
      ]);
      const card = (await cardRes.json()) as DiscoveryResponse & { error?: string };
      // 시드 0개 → 백엔드가 blocked:true 반환 → 안내 UI (카드 없음)
      if (card.blocked) {
        setIsActive(false);
      } else if (card.error) {
        setError(card.error);
        setIsActive(true);
      } else {
        setData(card);
        setIsActive(true);
      }

      const saves = (await savesRes.json()) as SavesResponse & { error?: string };
      if (!saves.error) {
        setSavedArtists(new Set(saves.artists.map((a) => a.apple_id)));
        setSavedTracks(new Set(saves.tracks.map((t) => t.apple_id)));
      }
      // KST 기준 fetch 날짜 기록 → 다음 focus·visibility 변경 시 stale 비교
      setFetchedDate(todayKstStr());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // 탭/창 복귀 시 KST 날짜가 바뀌었으면 today 카드 refetch (자정 갱신 대응)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!identity?.userId) return;
      if (fetchedDate && fetchedDate !== todayKstStr()) {
        loadData(identity);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [identity, fetchedDate, loadData]);

  // 초기 진입 — 비로그인은 게이트, 로그인은 카드 fetch.
  // 시드 0개 판정(안내 UI)은 백엔드 today API가 blocked로 내려주고 loadData가 처리.
  useEffect(() => {
    (async () => {
      const id = await getIdentity();
      setIdentity(id);
      if (!id.userId) {
        setLoginGateOpen(true);
        setLoading(false);
        return;
      }
      await loadData(id);
    })();
  }, [loadData]);

  // 아티스트 저장 toggle
  const handleSaveArtist = useCallback(
    async (artist: Artist) => {
      if (!identity) return;
      // 비로그인 → 로그인 게이트
      if (!identity.userId) {
        setLoginGateOpen(true);
        return;
      }
      const wasSaved = savedArtists.has(artist.apple_id);
      // optimistic
      setSavedArtists((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.delete(artist.apple_id);
        else next.add(artist.apple_id);
        return next;
      });
      const saved = await toggleSave(identity, "artist", artist.apple_id, artist);
      // 서버 응답으로 정합화
      setSavedArtists((prev) => {
        const next = new Set(prev);
        if (saved) next.add(artist.apple_id);
        else next.delete(artist.apple_id);
        return next;
      });
    },
    [identity, savedArtists],
  );

  // 곡 저장 toggle
  const handleSaveTrack = useCallback(
    async (track: Track, artist: Artist) => {
      if (!identity) return;
      // 비로그인 → 로그인 게이트
      if (!identity.userId) {
        setLoginGateOpen(true);
        return;
      }
      const wasSaved = savedTracks.has(track.id);
      setSavedTracks((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.delete(track.id);
        else next.add(track.id);
        return next;
      });
      const snapshot = {
        ...track,
        artist_name: artist.name,
        artist_apple_id: artist.apple_id,
        artist_artwork: artist.artwork,
      };
      const saved = await toggleSave(identity, "track", track.id, snapshot);
      setSavedTracks((prev) => {
        const next = new Set(prev);
        if (saved) next.add(track.id);
        else next.delete(track.id);
        return next;
      });
    },
    [identity, savedTracks],
  );

  const handleNavigateCollection = useCallback(
    () => requireAuth(() => router.push("/discovery/collection")),
    [requireAuth, router],
  );

  const loginGateNode = (
    <LoginGate
      isOpen={loginGateOpen}
      onClose={() => {
        setLoginGateOpen(false);
        // 비로그인 사용자가 카드 fetch 차단된 상태에서 모달 닫으면 메인으로
        if (!identity?.userId) router.push("/");
      }}
      onGuestContinue={() => {
        setLoginGateOpen(false);
        if (!identity?.userId) router.push("/");
      }}
      source="discovery"
    />
  );

  // 상세 모드
  if (data && (detailIdx === "1" || detailIdx === "2")) {
    const artist = detailIdx === "1" ? data.artist_1 : data.artist_2;
    return (
      <PageShell hideHeader onCollectionClick={handleNavigateCollection}>
        <DetailView
          artist={artist}
          savedTracks={savedTracks}
          isArtistSaved={savedArtists.has(artist.apple_id)}
          onSaveArtist={() => handleSaveArtist(artist)}
          onSaveTrack={(t) => handleSaveTrack(t, artist)}
          onBack={() => router.push("/discovery")}
        />
        {loginGateNode}
      </PageShell>
    );
  }

  // 캐러셀 모드
  return (
    <PageShell
      onCollectionClick={handleNavigateCollection}
      showSubtitle={isActive !== false}
      showCollectionButton={isActive !== false}
    >
      {/* entries 0건 사용자 안내 UI — 카드 fetch X */}
      {isActive === false && <EmptyOnboard />}

      {loading && isActive !== false && <LoadingCard />}
      {error && <ErrorCard message={error} />}
      {data && (
        <>
          <Carousel
            artists={[data.artist_1, data.artist_2]}
            savedArtists={savedArtists}
            onSaveArtist={handleSaveArtist}
            onDetail={(idx) => requireAuth(() => router.push(`/discovery?detail=${idx + 1}`))}
          />
          <footer style={{ marginTop: 40, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, color: "rgba(46,37,71,0.4)", lineHeight: 1.6 }}>
            <Clock size={12} strokeWidth={2} />
            매일 오후 12시에 새로운 아티스트로 갱신돼요
          </footer>
          {/* Apple Music 어트리뷰션 — API 가이드라인 준수 */}
          <p
            style={{
              fontSize: 10,
              color: "rgba(46,37,71,0.35)",
              textAlign: "center",
              marginTop: 12,
              marginBottom: 0,
              letterSpacing: "0.2px",
            }}
          >
            Powered by Apple Music
          </p>
        </>
      )}
      {loginGateNode}
    </PageShell>
  );
}

// ─────────────────────────── Empty Onboard (entries 0건 사용자용) ───────────────────────────

function EmptyOnboard() {
  return (
    <div>
      {/* 빈 카드 placeholder — 모든 안내 통합 (라벨 + 설명) */}
      <div style={{ paddingTop: 8 }}>
        <EmptyCardPreview />
      </div>

      {/* 점 인디케이터 (흐릿) */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 8,
          marginTop: 16,
        }}
      >
        <div
          style={{
            width: 22,
            height: 8,
            borderRadius: 999,
            background: "rgba(93,79,140,0.18)",
          }}
        />
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: "rgba(93,79,140,0.12)",
          }}
        />
      </div>
    </div>
  );
}

function EmptyCardPreview() {
  return (
    <div
      style={{
        borderRadius: 20,
        overflow: "hidden",
        boxShadow: "0 8px 24px rgba(46,37,71,0.06)",
      }}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: "4 / 5",
          background: "rgba(255,255,255,0.45)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 24px",
        }}
      >
        <Search size={44} strokeWidth={1.5} color="rgba(93,79,140,0.35)" />
        {/* 라벨 — 보라 700, 현재 상태 강조 (시선 잡는 첫 정보) */}
        <p
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: PURPLE_MAIN,
            letterSpacing: "0.3px",
            margin: "18px 0 0",
          }}
        >
          아직 추천 기록이 없어요
        </p>
        {/* 설명 — 흐림, 시작 방법 + 가치 */}
        <p
          style={{
            fontSize: 13,
            color: "rgba(46,37,71,0.55)",
            letterSpacing: "-0.2px",
            lineHeight: 1.55,
            margin: "8px 0 0",
            textAlign: "center",
          }}
        >
          사진으로 곡을 추천 받아 저장하면<br />매일 내 취향에 맞는 아티스트 2명을 소개해드려요
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────── Page Shell ───────────────────────────

function PageShell({
  children,
  hideHeader = false,
  onCollectionClick,
  showSubtitle = true,
  showCollectionButton = true,
}: {
  children: React.ReactNode;
  hideHeader?: boolean;
  onCollectionClick?: () => void;
  showSubtitle?: boolean;
  showCollectionButton?: boolean;
}) {
  const router = useRouter();
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: PURPLE_BG, color: "#2e2547", fontFamily: '-apple-system, BlinkMacSystemFont, "Pretendard", "Apple SD Gothic Neo", sans-serif', position: "relative" }}
    >
      <HamburgerMenu />

      {/* 상단 앱 로고 — 다른 페이지와 동일 */}
      <div className="flex justify-center" style={{ paddingTop: 12, flexShrink: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/branding/play-the-picture-logo-one-line.png"
          alt="Play the Picture"
          onClick={() => router.push("/")}
          style={{ height: 48, width: "auto", cursor: "pointer" }}
        />
      </div>

      {/* 본문 */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 20px 40px" }}>
          {!hideHeader && (
            <header style={{ textAlign: "center", marginBottom: 24 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px", margin: 0 }}>오늘의 발견</h1>
              {showSubtitle && (
                <p style={{ fontSize: 12, color: "rgba(46,37,71,0.6)", marginTop: 6, marginBottom: 12, lineHeight: 1.5 }}>
                  저장·공유한 기록을 기반으로<br />매일 2명의 아티스트를 소개해드려요
                </p>
              )}
              {showCollectionButton && (
                <button
                  onClick={onCollectionClick ?? (() => router.push("/discovery/collection"))}
                  style={{
                    background: "rgba(255,255,255,0.55)",
                    border: "1px solid rgba(93,79,140,0.25)",
                    borderRadius: 999,
                    padding: "7px 16px",
                    fontSize: 12,
                    fontWeight: 500,
                    color: PURPLE_MAIN,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <FolderHeart size={14} strokeWidth={2} />
                  내 컬렉션
                </button>
              )}
            </header>
          )}
          {children}
        </div>
      </div>

      {/* 하단 네비게이션 — 다른 페이지와 동일 */}
      <div style={{ background: "rgba(255,255,255,0.7)", borderTop: "0.5px solid rgba(46,37,71,0.12)", display: "flex", justifyContent: "space-around", padding: "12px 0 28px", flexShrink: 0 }}>
        <div
          className="flex flex-col items-center gap-1"
          style={{ fontSize: 10, color: "rgba(46,37,71,0.55)", cursor: "pointer" }}
          onClick={() => router.push("/journal")}
        >
          <Archive size={22} strokeWidth={1.5} />
          아카이브
        </div>
        <div
          className="flex flex-col items-center gap-1"
          style={{ fontSize: 10, color: "rgba(46,37,71,0.55)", cursor: "pointer" }}
          onClick={() => router.push("/")}
        >
          <Music size={22} strokeWidth={1.5} />
          노래 추천받기
        </div>
        <div
          className="flex flex-col items-center gap-1"
          style={{ fontSize: 10, color: "#2e2547", cursor: "pointer" }}
          onClick={() => router.push("/discovery")}
        >
          <Sparkles size={22} strokeWidth={1.5} />
          오늘의 발견
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Loading / Error ───────────────────────────

function LoadingCard() {
  return (
    <div style={{ background: "rgba(255,255,255,0.7)", backdropFilter: "blur(20px)", borderRadius: 20, padding: "60px 24px", textAlign: "center", boxShadow: "0 8px 32px rgba(46, 37, 71, 0.08)" }}>
      <div style={{ width: 32, height: 32, border: "3px solid rgba(93,79,140,0.2)", borderTopColor: PURPLE_MAIN, borderRadius: "50%", animation: "ptp-spin 0.8s linear infinite", margin: "0 auto" }} />
      <p style={{ fontSize: 14, color: PURPLE_MAIN, margin: "16px 0 6px" }}>내 취향에 맞는 아티스트 찾는 중...</p>
      <small style={{ fontSize: 11, color: "rgba(46,37,71,0.5)" }}>약 20초 후에 결과를 확인할 수 있어요</small>
      <style>{`@keyframes ptp-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.7)", backdropFilter: "blur(20px)", borderRadius: 20, padding: "60px 24px", textAlign: "center", boxShadow: "0 8px 32px rgba(46, 37, 71, 0.08)" }}>
      <p style={{ fontSize: 14, color: "#2e2547", margin: 0 }}>오늘의 발견을 불러올 수 없어요.</p>
      <small style={{ fontSize: 11, color: "rgba(46,37,71,0.5)" }}>{message}</small>
    </div>
  );
}

// ─────────────────────────── Carousel ───────────────────────────

function Carousel({
  artists,
  savedArtists,
  onSaveArtist,
  onDetail,
}: {
  artists: Artist[];
  savedArtists: Set<string>;
  onSaveArtist: (a: Artist) => void;
  onDetail: (idx: number) => void;
}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [dragOffsetPx, setDragOffsetPx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = () => containerRef.current?.offsetWidth ?? 1;

  const handleStart = (e: React.TouchEvent) => {
    // 별·자세히보기 버튼 위에서는 swipe 시작 안 함
    const target = e.target as HTMLElement;
    if (target.closest("[data-no-swipe]")) return;
    setTouchStartX(e.touches[0].clientX);
    setIsDragging(true);
  };
  const handleMove = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    let dx = e.touches[0].clientX - touchStartX;
    if ((currentIdx === 0 && dx > 0) || (currentIdx === artists.length - 1 && dx < 0)) {
      dx = dx / 3;
    }
    setDragOffsetPx(dx);
  };
  const handleEnd = () => {
    const threshold = containerWidth() * 0.2;
    if (dragOffsetPx < -threshold && currentIdx < artists.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else if (dragOffsetPx > threshold && currentIdx > 0) {
      setCurrentIdx(currentIdx - 1);
    }
    setDragOffsetPx(0);
    setIsDragging(false);
    setTouchStartX(null);
  };

  return (
    <div>
      <div
        ref={containerRef}
        style={{ marginLeft: -20, marginRight: -20, overflow: "hidden" }}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            transform: `translateX(calc(${-currentIdx * 100}% + ${dragOffsetPx}px))`,
            transition: isDragging ? "none" : "transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
          }}
        >
          {artists.map((a, i) => (
            <div key={a.apple_id} style={{ width: "100%", flexShrink: 0, padding: "0 20px", boxSizing: "border-box" }}>
              <div style={{
                borderRadius: 20,
                overflow: "hidden",
                boxShadow: "0 8px 32px rgba(46, 37, 71, 0.08)",
              }}>
                <CarouselSlide
                  artist={a}
                  index={i}
                  total={artists.length}
                  isSaved={savedArtists.has(a.apple_id)}
                  onSave={() => onSaveArtist(a)}
                  onDetail={() => onDetail(i)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
        {artists.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentIdx(i)}
            aria-label={`아티스트 ${i + 1}`}
            style={{
              width: currentIdx === i ? 22 : 8,
              height: 8,
              borderRadius: 999,
              background: currentIdx === i ? PURPLE_MAIN : "rgba(93,79,140,0.25)",
              border: "none",
              padding: 0,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function CarouselSlide({
  artist,
  index,
  total,
  isSaved,
  onSave,
  onDetail,
}: {
  artist: Artist;
  index: number;
  total: number;
  isSaved: boolean;
  onSave: () => void;
  onDetail: () => void;
}) {
  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 5", overflow: "hidden", background: "rgba(255,255,255,0.6)" }}>
      {artist.artwork ? (
        <img
          src={artist.artwork}
          alt={artist.name}
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 30%", display: "block", pointerEvents: "none", userSelect: "none" }}
        />
      ) : (
        <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #c5beda 0%, #a594c5 50%, #d6c8e8 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        </div>
      )}

      {/* 좌상단 ⭐ 별 버튼 — 테두리 없이 아이콘만, drop-shadow로 가시성 확보 */}
      <button
        data-no-swipe="true"
        onClick={(e) => { e.stopPropagation(); onSave(); }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={isSaved ? "저장 취소" : "아티스트 저장"}
        style={{
          position: "absolute", top: 14, left: 14,
          width: 40, height: 40,
          background: "transparent", border: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: isSaved ? "#FFD23F" : "#fff",
          cursor: "pointer",
          padding: 0,
          filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.55))",
          transition: "transform 0.15s ease",
          touchAction: "manipulation",
        }}
      >
        <Star
          size={28}
          strokeWidth={2.2}
          fill={isSaved ? "#FFD23F" : "transparent"}
        />
      </button>

      {/* 우상단 인디케이터 */}
      <div style={{ position: "absolute", top: 16, right: 16, background: "rgba(0,0,0,0.45)", color: "#fff", padding: "5px 11px", borderRadius: 16, fontSize: 12, fontWeight: 600, letterSpacing: "0.5px" }}>
        {index + 1} | {total}
      </div>

      {/* 하단 그라데이션 + 이름 + caption + 자세히 보기 */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.75) 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", paddingBottom: 28, paddingLeft: 24, paddingRight: 24, pointerEvents: "none" }}>
        <h2 style={{ color: "#fff", fontSize: 30, fontWeight: 700, letterSpacing: "-0.5px", margin: 0, textShadow: "0 2px 12px rgba(0,0,0,0.5)", textAlign: "center" }}>
          {artist.name}
        </h2>
        {artist.caption && (
          <p style={{
            color: "rgba(255,255,255,0.85)",
            fontSize: 13,
            fontStyle: "italic",
            margin: "10px 0 0",
            textShadow: "0 2px 8px rgba(0,0,0,0.5)",
            textAlign: "center",
            lineHeight: 1.4,
            maxWidth: 320,
          }}>
            &ldquo;{artist.caption}&rdquo;
          </p>
        )}
        <button
          data-no-swipe="true"
          onClick={onDetail}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          style={{
            marginTop: 16,
            background: "rgba(255,255,255,0.95)",
            color: "#2e2547",
            border: "none",
            borderRadius: 999,
            padding: "10px 24px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            pointerEvents: "auto",
          }}
        >
          자세히 보기
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────── Detail View ───────────────────────────

function DetailView({
  artist,
  savedTracks,
  isArtistSaved,
  onSaveArtist,
  onSaveTrack,
  onBack,
}: {
  artist: Artist;
  savedTracks: Set<string>;
  isArtistSaved: boolean;
  onSaveArtist: () => void;
  onSaveTrack: (t: Track) => void;
  onBack: () => void;
}) {
  return (
    <article style={{ background: "rgba(255,255,255,0.7)", backdropFilter: "blur(20px)", borderRadius: 20, overflow: "hidden", boxShadow: "0 8px 32px rgba(46, 37, 71, 0.08)" }}>
      <button
        onClick={onBack}
        aria-label="뒤로가기"
        style={{
          background: "rgba(255,255,255,0.6)",
          border: "none",
          margin: "16px 0 0 16px",
          width: 40, height: 40,
          borderRadius: "50%",
          color: PURPLE_MAIN, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 2px 8px rgba(46,37,71,0.1)",
          padding: 0,
        }}
      >
        <ChevronLeft size={20} strokeWidth={2.5} />
      </button>
      <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 5", overflow: "hidden", marginTop: 8 }}>
        {artist.artwork ? (
          <img src={artist.artwork} alt={artist.name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 30%", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #c5beda 0%, #a594c5 50%, #d6c8e8 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          </div>
        )}
        {/* 좌상단 별 — 캐러셀과 동일 디자인 */}
        <button
          onClick={(e) => { e.stopPropagation(); onSaveArtist(); }}
          aria-label={isArtistSaved ? "저장 취소" : "아티스트 저장"}
          style={{
            position: "absolute", top: 14, left: 14,
            width: 40, height: 40,
            background: "transparent", border: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: isArtistSaved ? "#FFD23F" : "#fff",
            cursor: "pointer",
            padding: 0,
            filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.55))",
          }}
        >
          <Star size={28} strokeWidth={2.2} fill={isArtistSaved ? "#FFD23F" : "transparent"} />
        </button>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.55) 100%)", display: "flex", alignItems: "flex-end", padding: "16px 20px", pointerEvents: "none" }}>
          <div style={{ color: "#fff", fontSize: 12, fontWeight: 600, letterSpacing: "0.5px", textShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
            📍 오늘의 발견 아티스트
          </div>
        </div>
      </div>
      <div style={{ padding: 24 }}>
        <h2 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-1px", margin: "0 0 16px", color: "#2e2547" }}>{artist.name}</h2>
        <p style={{ fontSize: 14, lineHeight: 1.75, color: "rgba(46,37,71,0.85)", margin: 0 }}>{artist.bio_ko}</p>
        <div style={{ height: 1, background: "rgba(93,79,140,0.18)", margin: "20px 0" }} />
        <section style={{ background: "rgba(255,255,255,0.4)", borderRadius: 12, padding: "14px 16px", fontSize: 14, lineHeight: 1.75, color: "rgba(46,37,71,0.85)" }}>
          <div style={{ display: "inline-block", fontSize: 11, fontWeight: 600, color: PURPLE_MAIN, letterSpacing: "0.5px", marginBottom: 8 }}>추천 이유</div>
          <p style={{ margin: 0 }}>{artist.reason}</p>
        </section>

        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: PURPLE_MAIN, marginBottom: 4, letterSpacing: "0.3px" }}>
            🎵 {artist.name} 추천곡 들어보기
          </div>
          {/* Apple Music 어트리뷰션 — 추천곡·미리듣기 데이터 출처 */}
          <div style={{ fontSize: 10, color: "rgba(46,37,71,0.4)", marginBottom: 12, letterSpacing: "0.2px" }}>
            Powered by Apple Music
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {artist.tracks.map((t) => (
              <TrackRow
                key={t.id}
                track={t}
                artistName={artist.name}
                isSaved={savedTracks.has(t.id)}
                onSave={() => onSaveTrack(t)}
              />
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

// ─────────────────────────── Track row ───────────────────────────

function TrackRow({
  track,
  artistName,
  isSaved,
  onSave,
}: {
  track: Track;
  artistName: string;
  isSaved: boolean;
  onSave: () => void;
}) {
  return (
    <div style={{ background: "rgba(255,255,255,0.5)", borderRadius: 14, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {track.art ? (
          <img src={track.art} alt="" style={{ width: 52, height: 52, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
        ) : (
          <div style={{ width: 52, height: 52, borderRadius: 8, flexShrink: 0, background: "linear-gradient(135deg, #c5beda, #a594c5)" }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#2e2547", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {track.name}
          </div>
          <div style={{ fontSize: 11, color: "rgba(46,37,71,0.6)", marginTop: 3 }}>
            {artistName}{track.year ? ` · ${track.year}` : ""}
          </div>
        </div>
        <button
          onClick={onSave}
          aria-label={isSaved ? "저장 취소" : "곡 저장"}
          style={{
            flexShrink: 0,
            width: 32, height: 32,
            background: isSaved ? "rgba(93,79,140,0.18)" : "rgba(93,79,140,0.08)",
            border: "none", borderRadius: "50%",
            color: isSaved ? PURPLE_MAIN : "rgba(46,37,71,0.6)",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 0,
          }}
        >
          <Bookmark size={16} strokeWidth={2} fill={isSaved ? PURPLE_MAIN : "transparent"} />
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        {track.preview ? (
          <MiniPlayer src={track.preview} />
        ) : (
          <div style={{ fontSize: 11, color: "rgba(46,37,71,0.4)", textAlign: "center", padding: "8px 0" }}>
            미리듣기 없음
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── Mini player ───────────────────────────

let currentlyPlayingAudio: HTMLAudioElement | null = null;

function MiniPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(30);
  const [dragging, setDragging] = useState(false);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
    } else {
      if (currentlyPlayingAudio && currentlyPlayingAudio !== a) {
        currentlyPlayingAudio.pause();
      }
      currentlyPlayingAudio = a;
      a.play().catch(() => undefined);
    }
  };

  const seekFromClientX = (clientX: number, rect: DOMRect) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    a.currentTime = ratio * duration;
    setCurrentTime(a.currentTime);
  };

  const onBarMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seekFromClientX(e.clientX, rect);
    setDragging(true);
    const move = (ev: MouseEvent) => seekFromClientX(ev.clientX, rect);
    const up = () => {
      setDragging(false);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const onBarTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seekFromClientX(e.touches[0].clientX, rect);
    setDragging(true);
  };
  const onBarTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seekFromClientX(e.touches[0].clientX, rect);
  };
  const onBarTouchEnd = () => setDragging(false);

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <div>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          if (currentlyPlayingAudio === audioRef.current) {
            currentlyPlayingAudio = null;
          }
        }}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
          if (currentlyPlayingAudio === audioRef.current) {
            currentlyPlayingAudio = null;
          }
        }}
        onTimeUpdate={(e) => {
          if (!dragging) setCurrentTime(e.currentTarget.currentTime);
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        style={{ display: "none" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={togglePlay}
          aria-label={playing ? "일시정지" : "재생"}
          style={{
            width: 32, height: 32, flexShrink: 0,
            background: PURPLE_MAIN, color: "#fff",
            border: "none", borderRadius: "50%",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 0,
          }}
        >
          {playing ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="1.5" width="3" height="9" rx="1" /><rect x="7" y="1.5" width="3" height="9" rx="1" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M3 1.5L10 6L3 10.5V1.5Z" /></svg>
          )}
        </button>

        <div
          onMouseDown={onBarMouseDown}
          onTouchStart={onBarTouchStart}
          onTouchMove={onBarTouchMove}
          onTouchEnd={onBarTouchEnd}
          style={{
            flex: 1, height: 18, position: "relative", cursor: "pointer",
            display: "flex", alignItems: "center", touchAction: "none",
          }}
        >
          <div style={{ position: "absolute", left: 0, right: 0, top: "50%", transform: "translateY(-50%)", height: 3, background: "rgba(93,79,140,0.2)", borderRadius: 999 }} />
          <div style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", height: 3, width: `${progress * 100}%`, background: PURPLE_MAIN, borderRadius: 999 }} />
          <div
            style={{
              position: "absolute",
              left: `${progress * 100}%`, top: "50%",
              transform: "translate(-50%, -50%)",
              width: 12, height: 12, borderRadius: "50%",
              background: "#fff", border: `2px solid ${PURPLE_MAIN}`,
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }}
          />
        </div>

        <div style={{ fontSize: 11, color: "rgba(46,37,71,0.55)", flexShrink: 0, minWidth: 64, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
          {fmt(currentTime)} / {fmt(duration)}
        </div>
      </div>
    </div>
  );
}

function fmt(s: number): string {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}
