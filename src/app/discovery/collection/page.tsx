"use client";

/**
 * /discovery/collection — "오늘의 발견" 컬렉션 (저장한 아티스트 + 곡)
 *
 * UI:
 *  · 탭: 아티스트 / 곡
 *  · 빈 상태: "발견 카드의 ⭐를 누르면 여기 모여요"
 *  · 아티스트 리스트: 썸네일 + 이름 + 저장일
 *  · 곡 리스트: 썸네일 + 곡명 + 아티스트
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Star, Bookmark, Archive, Music, Sparkles } from "lucide-react";
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
type ArtistSnapshot = {
  apple_id: string;
  name: string;
  artwork: string | null;
  genres: string[];
  bio_ko: string;
  caption: string;
  reason: string;
  tracks: Track[];
};
type TrackSnapshot = Track & {
  artist_name: string;
  artist_apple_id: string;
  artist_artwork: string | null;
};

type SavedItem<T> = {
  apple_id: string;
  snapshot: T;
  saved_at: string;
};

const PURPLE_MAIN = "#5D4F8C";
const PURPLE_BG = "linear-gradient(180deg, #c5beda 0%, #b3acd2 45%, #c8c0e0 100%)";

export default function CollectionPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"artist" | "track">("artist");
  const [artists, setArtists] = useState<SavedItem<ArtistSnapshot>[]>([]);
  const [tracks, setTracks] = useState<SavedItem<TrackSnapshot>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loginGateOpen, setLoginGateOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const did = getDeviceId();
      let uid: string | null = null;
      try {
        const sb = createSupabaseBrowserClient();
        const { data: { user } } = await sb.auth.getUser();
        uid = user?.id ?? null;
      } catch {
        // ignore
      }

      // 비로그인 → 게이트 모달 표시, 데이터 fetch 차단
      if (!uid) {
        setLoginGateOpen(true);
        setLoading(false);
        return;
      }

      const params = new URLSearchParams({ device_id: did, user_id: uid });

      try {
        const r = await fetch(`/api/discovery/saves?${params}`);
        const j = (await r.json()) as {
          artists: SavedItem<ArtistSnapshot>[];
          tracks: SavedItem<TrackSnapshot>[];
          error?: string;
        };
        if (j.error) setError(j.error);
        else {
          setArtists(j.artists ?? []);
          setTracks(j.tracks ?? []);
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
          <header style={{ textAlign: "center", marginBottom: 24, position: "relative" }}>
            <button
              onClick={() => router.push("/discovery")}
              aria-label="뒤로가기"
              style={{
                position: "absolute", left: 0, top: 0,
                width: 36, height: 36, borderRadius: "50%",
                background: "rgba(255,255,255,0.6)",
                border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: PURPLE_MAIN,
                boxShadow: "0 2px 8px rgba(46,37,71,0.1)",
                padding: 0,
              }}
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px", margin: 0, paddingTop: 4 }}>내 컬렉션</h1>
            <p style={{ fontSize: 11, color: "rgba(46,37,71,0.55)", marginTop: 6, marginBottom: 0 }}>
              오늘의 발견에서 저장한 아티스트·곡
            </p>
          </header>

          {/* 탭 */}
          <div style={{ display: "flex", gap: 6, marginBottom: 20, padding: 4, background: "rgba(255,255,255,0.45)", borderRadius: 999 }}>
            <TabButton
              active={tab === "artist"}
              onClick={() => setTab("artist")}
              count={artists.length}
              icon={<Star size={14} strokeWidth={2} />}
              label="아티스트"
            />
            <TabButton
              active={tab === "track"}
              onClick={() => setTab("track")}
              count={tracks.length}
              icon={<Bookmark size={14} strokeWidth={2} />}
              label="곡"
            />
          </div>

          {loading && <Empty text="불러오는 중..." />}
          {error && <Empty text={`오류: ${error}`} />}
          {!loading && !error && tab === "artist" && (
            artists.length === 0
              ? <EmptyArtists />
              : <ArtistList items={artists} />
          )}
          {!loading && !error && tab === "track" && (
            tracks.length === 0
              ? <EmptyTracks />
              : <TrackList items={tracks} />
          )}
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

      <LoginGate
        isOpen={loginGateOpen}
        onClose={() => {
          setLoginGateOpen(false);
          router.push("/discovery");
        }}
        onGuestContinue={() => {
          setLoginGateOpen(false);
          router.push("/discovery");
        }}
        source="discovery"
      />
    </div>
  );
}

// ─────────────────────────── Tab ───────────────────────────

function TabButton({ active, onClick, count, icon, label }: { active: boolean; onClick: () => void; count: number; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        height: 40,
        background: active ? PURPLE_MAIN : "transparent",
        color: active ? "#fff" : "rgba(46,37,71,0.7)",
        border: "none",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 6,
        padding: 0,
        transition: "all 0.2s",
      }}
    >
      {icon}
      <span>{label}</span>
      <span style={{ opacity: 0.7 }}>{count}</span>
    </button>
  );
}

// ─────────────────────────── Empty states ───────────────────────────

function Empty({ text }: { text: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.6)", borderRadius: 16, padding: "60px 24px", textAlign: "center" }}>
      <p style={{ fontSize: 13, color: "rgba(46,37,71,0.55)", margin: 0 }}>{text}</p>
    </div>
  );
}

function EmptyArtists() {
  return (
    <div style={{ background: "rgba(255,255,255,0.6)", borderRadius: 16, padding: "48px 24px", textAlign: "center" }}>
      <Star size={32} strokeWidth={1.5} style={{ color: PURPLE_MAIN, marginBottom: 12 }} />
      <p style={{ fontSize: 14, color: "#2e2547", margin: "0 0 6px", fontWeight: 500 }}>아직 발견한 아티스트가 없어요</p>
      <small style={{ fontSize: 11, color: "rgba(46,37,71,0.55)" }}>오늘의 발견 카드의 별모양을 눌러보세요</small>
    </div>
  );
}

function EmptyTracks() {
  return (
    <div style={{ background: "rgba(255,255,255,0.6)", borderRadius: 16, padding: "48px 24px", textAlign: "center" }}>
      <Bookmark size={32} strokeWidth={1.5} style={{ color: PURPLE_MAIN, marginBottom: 12 }} />
      <p style={{ fontSize: 14, color: "#2e2547", margin: "0 0 6px", fontWeight: 500 }}>아직 발견한 곡이 없어요</p>
      <small style={{ fontSize: 11, color: "rgba(46,37,71,0.55)" }}>추천곡 들어보기에서 북마크를 눌러보세요</small>
    </div>
  );
}

// ─────────────────────────── Artist list ───────────────────────────

function ArtistList({ items }: { items: SavedItem<ArtistSnapshot>[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {items.map((item) => {
        const a = item.snapshot;
        return (
          <div
            key={item.apple_id}
            style={{
              background: "rgba(255,255,255,0.6)",
              borderRadius: 18,
              overflow: "hidden",
              boxShadow: "0 4px 16px rgba(46,37,71,0.08)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* 상단: 큰 artwork (4:5) */}
            <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 5", overflow: "hidden" }}>
              {a.artwork ? (
                <img
                  src={a.artwork}
                  alt={a.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 30%", display: "block" }}
                />
              ) : (
                <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #c5beda 0%, #a594c5 50%, #d6c8e8 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 64, fontWeight: 700, color: "rgba(255,255,255,0.85)", letterSpacing: "-1px" }}>
                    {(a.name || "?").slice(0, 1).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            {/* 하단: 아티스트명 + 저장일 */}
            <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{
                fontSize: 15,
                fontWeight: 700,
                color: "#2e2547",
                letterSpacing: "-0.3px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {a.name}
              </div>
              <div style={{ fontSize: 10, color: "rgba(46,37,71,0.45)" }}>
                {fmtSavedAt(item.saved_at)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────── Track list ───────────────────────────

function TrackList({ items }: { items: SavedItem<TrackSnapshot>[] }) {
  // 가로형 플레이리스트 — 좌측 album art + 곡 정보 + 저장일
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item) => {
        const t = item.snapshot;
        return (
          <div
            key={item.apple_id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "rgba(255,255,255,0.55)",
              borderRadius: 12,
              padding: 10,
            }}
          >
            {/* 좌측 album art */}
            <div style={{
              width: 52, height: 52, borderRadius: 8,
              overflow: "hidden", flexShrink: 0,
              background: "linear-gradient(135deg, #c5beda 0%, #a594c5 100%)",
            }}>
              {t.art && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={t.art}
                  alt={t.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              )}
            </div>
            {/* 중앙 곡 정보 */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#2e2547",
                letterSpacing: "-0.2px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {t.name}
              </div>
              <div style={{
                fontSize: 11,
                color: "rgba(46,37,71,0.55)",
                marginTop: 3,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {t.artist_name}{t.year ? ` · ${t.year}` : ""}
              </div>
            </div>
            {/* 우측 저장일 */}
            <div style={{
              fontSize: 10,
              color: "rgba(46,37,71,0.45)",
              flexShrink: 0,
              fontVariantNumeric: "tabular-nums",
            }}>
              {fmtSavedAt(item.saved_at)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────── helpers ───────────────────────────

function fmtSavedAt(iso: string): string {
  try {
    const d = new Date(iso);
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return `${kst.getUTCFullYear()}.${(kst.getUTCMonth() + 1).toString().padStart(2, "0")}.${kst.getUTCDate().toString().padStart(2, "0")}`;
  } catch {
    return "";
  }
}
