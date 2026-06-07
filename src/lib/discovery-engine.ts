/**
 * Discovery Engine — "오늘의 발견" 카드 생성 로직
 *
 * 흐름:
 *  1. 시드 추출
 *     - 활성 사용자 (User saved 1건+): saved 아티스트 중 trigger 시드 1명 (카드에 노출 X)
 *     - 신규 사용자 (saved 0건): Apple Music 큐레이션 playlist 풀에서 시드 1명
 *  2. 시드의 Apple Music similar artists → 첫 2명 (검증 통과) = Artist 1, Artist 2
 *  3. 각 아티스트 Apple Music full data fetch (similar/tracks/artwork)
 *  4. Claude Sonnet 4.6 → bio_ko + caption + reason × 2 (한 호출)
 *  5. 결과 반환 (DB 저장은 호출자가)
 */
import { createClient } from "@supabase/supabase-js";
import {
  CURATED_PLAYLISTS,
  appleSearchArtist,
  appleGetArtistFull,
  applePlaylistTracks,
  type AppleArtistFull,
} from "@/lib/apple-music";

// ─────────────────────────── Types ───────────────────────────

export type DiscoveryArtist = {
  apple_id: string;
  name: string;
  artwork: string | null;
  genres: string[];
  bio_ko: string;
  caption: string;
  reason: string;
  tracks: AppleArtistFull["tracks"];
};

export type DiscoveryCardResult = {
  artist_1: DiscoveryArtist;
  artist_2: DiscoveryArtist;
};

type UserContext = {
  isActive: boolean;
  vibeDescriptions: string[]; // 활성만, 신규는 빈 배열
};

// ─────────────────────────── 시드 추출 ───────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const WINDOW_DAYS = 60;

// 스토리저장 중 "진짜 내보낸" 의도로 인정할 status
//  - shared      : 스토리 공유 완료 (주력 신호)
//  - downloaded  : 이미지 저장
//  - inapp_shown : 안드로이드 인스타 인앱(webview 차단으로 completed 도달 불가, 여기서 끝남)
// 제외: clicked·generated(만들기만)·cancelled·failed
const STORY_SEED_STATUSES = ["shared", "downloaded", "inapp_shown"] as const;

/**
 * 활성 사용자 시드 + vibe_description 추출 (없으면 콜드 스타트로).
 *
 * 시드 = 최근 WINDOW_DAYS 내 entries 중 "내가 행동한 곡"의 아티스트(가수 단위, distinct).
 *   행동 = save_logs OR share_logs OR story_save_logs(shared·downloaded·inapp_shown)
 *   점수 = 행동 종류마다 +1 (save +1, share +1, story +1) — 합산해서 정렬
 *
 * seedCount = distinct 시드 아티스트 수. 게이트(0개 차단)·분기(1=하이브리드/2+=각각)에 사용.
 */
export async function getUserContext(
  userId: string | null,
  deviceId: string,
): Promise<{
  ctx: UserContext;
  seedArtists: string[]; // 활성만, top 10 shuffle. 신규는 빈 배열
  seedCount: number; // distinct 시드 아티스트 수 (게이트·분기 판정용)
}> {
  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // user_id 있으면 user_id 기준, 없으면 device_id 기준
  const baseQuery = supabaseAdmin
    .from("entries")
    .select("id, artist, vibe_description, created_at")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false });
  const { data: entries } = userId
    ? await baseQuery.eq("user_id", userId)
    : await baseQuery.eq("device_id", deviceId);

  if (!entries || entries.length === 0) {
    return { ctx: { isActive: false, vibeDescriptions: [] }, seedArtists: [], seedCount: 0 };
  }

  const ids = entries.map((e) => e.id);
  const [savesRes, sharesRes, storiesRes] = await Promise.all([
    supabaseAdmin.from("save_logs").select("entry_id").in("entry_id", ids),
    supabaseAdmin.from("share_logs").select("entry_id").in("entry_id", ids),
    supabaseAdmin
      .from("story_save_logs")
      .select("entry_id")
      .in("entry_id", ids)
      .in("status", STORY_SEED_STATUSES as unknown as string[]),
  ]);
  const saveSet = new Set((savesRes.data || []).map((r) => r.entry_id));
  const shareSet = new Set((sharesRes.data || []).map((r) => r.entry_id));
  const storySet = new Set((storiesRes.data || []).map((r) => r.entry_id));

  // 시드 후보: save·share·story 받은 아티스트 (점수 기반 정렬, 행동마다 +1)
  const scoreMap = new Map<string, number>();
  for (const e of entries) {
    if (!e.artist) continue;
    const s =
      (saveSet.has(e.id) ? 1 : 0) +
      (shareSet.has(e.id) ? 1 : 0) +
      (storySet.has(e.id) ? 1 : 0);
    if (s === 0) continue;
    scoreMap.set(e.artist, (scoreMap.get(e.artist) || 0) + s);
  }
  const sortedSeed = [...scoreMap.entries()].sort((a, b) => b[1] - a[1]);

  // 최근 vibe_description (사진 분석 캡션 한 줄)
  const vibeDescriptions: string[] = entries
    .map((e) => e.vibe_description as string | null)
    .filter((v): v is string => Boolean(v))
    .slice(0, 10);

  if (sortedSeed.length === 0) {
    // entries는 있지만 행동(save·share·story) 0건 → 시드 0개 (게이트에서 차단)
    return {
      ctx: { isActive: false, vibeDescriptions },
      seedArtists: [],
      seedCount: 0,
    };
  }

  // top 10 shuffle
  const top = sortedSeed.slice(0, Math.min(10, sortedSeed.length)).map(([a]) => a);
  for (let i = top.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [top[i], top[j]] = [top[j], top[i]];
  }

  return {
    ctx: { isActive: true, vibeDescriptions },
    seedArtists: top,
    seedCount: sortedSeed.length, // 셔플 전 전체 distinct 시드 수
  };
}

/** 콜드 스타트 시드: Apple Music 큐레이션 playlist 5개에서 아티스트 풀 추출 후 shuffle */
async function getColdStartSeedArtists(): Promise<string[]> {
  // playlist 5개는 서로 독립 → 순차 await(5×지연) 대신 병렬로 한 번에 가져온다(1×지연).
  // Promise.all은 입력 순서를 유지하므로 아래 dedup 결과는 순차 버전과 동일.
  const trackLists = await Promise.all(
    CURATED_PLAYLISTS.map((pl) => applePlaylistTracks(pl.id)),
  );

  const seen = new Set<string>();
  const artists: string[] = [];
  for (const tracks of trackLists) {
    for (const t of tracks) {
      const main = t.artistName.split(/[,&]| feat\./i)[0].trim();
      if (!main || seen.has(main)) continue;
      seen.add(main);
      artists.push(main);
    }
  }
  // shuffle
  for (let i = artists.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [artists[i], artists[j]] = [artists[j], artists[i]];
  }
  return artists;
}

// ─────────────────────────── 카드 생성 ───────────────────────────

/** Fisher-Yates shuffle (in-place) */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 사용자가 이미 저장한 아티스트 apple_id Set — 추천 시 중복 제외용.
 * cache_key = userId (활성 사용자 기준). 비로그인·콜드 사용자는 보통 호출 X.
 */
async function getSavedArtistIds(
  userId: string | null,
  deviceId: string,
): Promise<Set<string>> {
  const cacheKey = userId || deviceId;
  if (!cacheKey) return new Set();
  const { data } = await supabaseAdmin
    .from("discovery_saves")
    .select("apple_id")
    .eq("cache_key", cacheKey)
    .eq("item_type", "artist");
  return new Set((data ?? []).map((r) => r.apple_id as string));
}

type ArtistPair = { artist1: AppleArtistFull; artist2: AppleArtistFull };

/**
 * 시드 리스트를 순회하며 "처음 성공하는 시드"에서 similar 1명을 뽑는다.
 * - usedSeeds에 든 시드는 건너뜀 (2시드 모드에서 같은 시드 재사용 방지)
 * - excludeIds(이미 저장)·avoidId(다른 슬롯이 이미 쓴 아티스트)·곡 0개는 제외
 * - 성공 시 사용한 시드명을 usedSeeds에 추가하고 아티스트 반환
 */
async function pickSimilarFromSeeds(
  seedNames: string[],
  excludeIds: Set<string>,
  avoidId: string | null,
  usedSeeds: Set<string>,
): Promise<AppleArtistFull | null> {
  for (const seedName of seedNames) {
    if (usedSeeds.has(seedName)) continue;
    const sr = await appleSearchArtist(seedName);
    if (!sr) continue;
    const seedFull = await appleGetArtistFull(sr.id);
    if (!seedFull || seedFull.similar.length === 0) continue;
    for (const sim of shuffle(seedFull.similar)) {
      if (excludeIds.has(sim.id)) continue;
      if (avoidId && sim.id === avoidId) continue;
      const full = await appleGetArtistFull(sim.id);
      if (!full || full.tracks.length === 0) continue;
      usedSeeds.add(seedName);
      return full;
    }
  }
  return null;
}

/** 콜드 큐레이션 풀에서 아티스트 1명을 직접 뽑는다 (발견용). */
async function pickFromColdPool(
  excludeIds: Set<string>,
  avoidId: string | null,
): Promise<AppleArtistFull | null> {
  const pool = shuffle(await getColdStartSeedArtists());
  for (const name of pool) {
    const sr = await appleSearchArtist(name);
    if (!sr) continue;
    if (excludeIds.has(sr.id)) continue;
    if (avoidId && sr.id === avoidId) continue;
    const full = await appleGetArtistFull(sr.id);
    if (!full || full.tracks.length === 0) continue;
    return full;
  }
  return null;
}

/** 순수 콜드 — 큐레이션 풀에서 2명 직접 (시드 전부 실패 시 최종 폴백). */
async function resolveColdPair(excludeIds: Set<string>): Promise<ArtistPair | null> {
  const a1 = await pickFromColdPool(excludeIds, null);
  if (!a1) return null;
  const a2 = await pickFromColdPool(excludeIds, a1.appleId);
  if (!a2) return null;
  return { artist1: a1, artist2: a2 };
}

/** 시드 1개 → 시드 similar 1명 + 콜드풀 1명 (하이브리드: 취향 1 + 발견 1). */
async function resolveHybrid(
  seedNames: string[],
  excludeIds: Set<string>,
): Promise<ArtistPair | null> {
  const a1 = await pickSimilarFromSeeds(seedNames, excludeIds, null, new Set());
  if (!a1) return resolveColdPair(excludeIds); // 시드 검색 전부 실패 → 순수 콜드
  const a2 = await pickFromColdPool(excludeIds, a1.appleId);
  if (a2) return { artist1: a1, artist2: a2 };
  // 콜드풀도 실패 → 같은 시드 similar에서 2번째 한 명 더
  const a2b = await pickSimilarFromSeeds(seedNames, excludeIds, a1.appleId, new Set());
  if (a2b) return { artist1: a1, artist2: a2b };
  return null;
}

/** 시드 2개+ → 서로 다른 두 시드에서 각각 1명씩. a2 실패 시 콜드풀로 강등(=하이브리드). */
async function resolveTwoSeeds(
  seedNames: string[],
  excludeIds: Set<string>,
): Promise<ArtistPair | null> {
  const usedSeeds = new Set<string>();
  const a1 = await pickSimilarFromSeeds(seedNames, excludeIds, null, usedSeeds);
  if (!a1) return resolveColdPair(excludeIds); // 시드 전부 실패 → 순수 콜드
  // 다른 시드에서 a2
  let a2 = await pickSimilarFromSeeds(seedNames, excludeIds, a1.appleId, usedSeeds);
  if (!a2) {
    // 두 번째 시드 못 찾음 → 콜드풀로 강등 (하이브리드)
    a2 = await pickFromColdPool(excludeIds, a1.appleId);
  }
  if (a2) return { artist1: a1, artist2: a2 };
  return null;
}

// ─────────────────────────── Claude ───────────────────────────

type ClaudeCards = {
  primary_bio_ko: string;
  primary_caption: string;
  primary_reason: string;
  partner_bio_ko: string;
  partner_caption: string;
  partner_reason: string;
};

async function claudeWriteCards(
  artist1: AppleArtistFull,
  artist2: AppleArtistFull,
  ctx: UserContext,
): Promise<ClaudeCards> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 환경변수 필요");

  const fmt = (a: AppleArtistFull) => `이름: ${a.name}
Apple Music 장르: ${a.genres.join(", ") || "(없음)"}
대표곡 5곡: ${a.tracks.map((t) => t.name).join(", ")}`;

  const vibeBlock = ctx.vibeDescriptions.length > 0
    ? `최근 분석한 사진의 vibe_description (사진 한 컷의 디테일을 한 줄로 묘사):
${ctx.vibeDescriptions.map((v, i) => `  ${i + 1}. ${v}`).join("\n")}

→ reason과 caption에서 위 디테일들로부터 사용자의 평소 사진·일상 패턴을 자연스럽게 추론해서 풀어낼 것.
→ ⚠️ vibe_description 원문 그대로 인용하지 말 것. 패턴만 추론해서 새 표현으로.`
    : `(신규 사용자 — 사진 분석 이력 없음. reason·caption은 음악 결 중심의 일반 추천 톤으로.)`;

  // caption 톤 — 활성 사용자는 "사용자 vibe × 아티스트 결" 매칭 한 줄, 신규는 시적 한 줄
  const captionGuide = ctx.vibeDescriptions.length > 0
    ? `[caption — 25자 내, 활성 사용자용 (매칭 한 줄)]
사용자의 vibe_description 패턴(평소 사진 분위기)과 아티스트 음악 결을 매칭한 한 줄.
"왜 이 사용자에게 이 아티스트인가"를 한 줄로 응축. 위트·시적 OK.
따옴표 없이.

✅ 좋은 예:
- vibe 꽃집·강아지·카네이션 → "꽃집 단골견과 잘 어울리는 결"
- vibe 하늘·구름 → "흐린 하늘 사진에 어울리는 톤"

❌ 나쁜 예:
- 너무 일반: "감성 추천" (매칭 X)
- vibe만: "취향 저격" (아티스트 결 X)
- vibe_description 원문 그대로 인용`
    : `[caption — 20자 내, 콜드 스타트용 (시적 한 줄)]
음악의 결·정서를 응축한 시적 한 줄. 따옴표 없이.
예: "장면을 노래하는 사람", "안개 끼는 새벽 같은 R&B", "런던발 소울의 오후"`;

  const systemPrompt = `너는 '플더픽'이라는 사진 기반 음악 추천 서비스의 AI야.
오늘의 발견 카드는 유저들이 사진으로 추천받아서 저장/공유한 기록을 기반으로
매일 2명의 취향에 맞는 새로운 아티스트를 추천하는 카드.
존댓말(~요체). 지정된 도구로만 응답.`;

  const prompt = `오늘의 발견 카드 텍스트를 작성해 주세요.

[아티스트 1]
${fmt(artist1)}

[아티스트 2]
${fmt(artist2)}

[사용자 시그널]
${vibeBlock}

──────────────────────────────────────────────
[bio_ko — 음악 매거진 아티스트 소개 톤, 80~150자]
──────────────────────────────────────────────
음악 매거진이 주목할 아티스트를 큐레이션하듯, 이 아티스트의 음악적 정체성을 감각적으로 소개해 주세요.
3단 구조:
① 이 아티스트를 규정하는 Hook 한 문장
② 형용사 + 장르 + 핵심 특징 압축
③ 현재형 종결 — 큐레이터의 시선으로 이 아티스트의 음악적 결을 한 줄
   ⚠️ 곡 제목·앨범명 인용 금지 (곡 인용은 reason의 역할)

${captionGuide}

[reason — 80~120자, 2~3문장 ⭐ 가장 중요]
⭐ 핵심: 이 아티스트가 "왜 이 사용자에게 맞는지"를 풀어주세요.
   (아티스트 음악 매력 자체는 bio_ko에서 다루니, reason에서 반복하지 말 것)

[전체 금지]
- 따옴표·이모지·해시태그
- Apple Music 5곡 외 곡 언급
- 'K-POP'을 '케이팝'으로 X → 'K팝' 또는 서브장르 (R&B·인디·댄스팝·발라드)`;

  const tools = [
    {
      name: "write_discovery_cards",
      description: "오늘의 발견 카드 텍스트 — bio + caption + reason × 2",
      input_schema: {
        type: "object",
        properties: {
          primary_bio_ko: { type: "string", description: "artist 1 음악 매거진 톤 아티스트 소개 (80~150자, ~요체). 곡 인용 금지." },
          primary_caption: { type: "string", description: "artist 1 caption — vibe×아티스트 매칭 한 줄 25자 내. 장르명으로 끝내지 말 것." },
          primary_reason: { type: "string", description: "artist 1 추천 이유 (80~120자, ~요체) — 왜 이 사용자에게 맞는지. 아티스트 매력 반복·사용자 사진 직접 묘사 금지." },
          partner_bio_ko: { type: "string", description: "artist 2 음악 매거진 톤 아티스트 소개 (80~150자, ~요체). 곡 인용 금지." },
          partner_caption: { type: "string", description: "artist 2 caption — vibe×아티스트 매칭 한 줄 25자 내. 장르명으로 끝내지 말 것." },
          partner_reason: { type: "string", description: "artist 2 추천 이유 (80~120자, ~요체) — 왜 이 사용자에게 맞는지. 아티스트 매력 반복·사용자 사진 직접 묘사 금지." },
        },
        required: [
          "primary_bio_ko",
          "primary_caption",
          "primary_reason",
          "partner_bio_ko",
          "partner_caption",
          "partner_reason",
        ],
      },
    },
  ];

  // 출력 검증 — Opus가 드물게 tool XML(<parameter>)을 필드에 흘려 caption 누락/bio 비대해짐.
  // max_tokens 1500 + 도구 지시 정렬로 빈도는 매우 낮으나, 깨지면 1회 재시도(얇은 그물).
  const CARD_FIELDS: (keyof ClaudeCards)[] = [
    "primary_bio_ko", "primary_caption", "primary_reason",
    "partner_bio_ko", "partner_caption", "partner_reason",
  ];
  const isValidCards = (c: ClaudeCards | undefined): c is ClaudeCards =>
    !!c && CARD_FIELDS.every((f) => {
      const v = c[f];
      return typeof v === "string" && v.length > 0 && !v.includes("<parameter") && !v.includes("</");
    });

  const callClaude = async (): Promise<ClaudeCards | undefined> => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 1500,
        system: systemPrompt,
        tools,
        tool_choice: { type: "tool", name: "write_discovery_cards" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const json = (await res.json()) as {
      error?: unknown;
      content?: { type: string; input?: ClaudeCards }[];
    };
    if (json.error) throw new Error(JSON.stringify(json.error));
    return json.content?.find((c) => c.type === "tool_use")?.input;
  };

  let cards = await callClaude();
  if (!isValidCards(cards)) {
    console.warn("[discovery] tool 출력 검증 실패 — 1회 재시도");
    cards = await callClaude();
  }
  if (!isValidCards(cards)) throw new Error("Claude tool_use 응답 불량 (재시도 후)");
  return cards;
}

// ─────────────────────────── Main API ───────────────────────────

/**
 * 오늘의 발견 카드 생성 (lazy generation, DB 저장은 호출자가).
 *
 * 시드 개수 기반 분기:
 *   - 시드 2개+ : resolveTwoSeeds (서로 다른 두 시드에서 각각 1명씩)
 *   - 시드 1개  : resolveHybrid (시드 similar 1 + 콜드풀 1)
 *   - 시드 0개  : resolveColdPair (순수 콜드 큐레이션 2명).
 *       시드 0개는 보통 호출자(today route)가 blocked로 차단하지만, 구버전 앱
 *       호환을 위해 forceCold=true로 콜드 카드를 생성해 정상 카드처럼 내려준다.
 *
 * @param precomputed - route가 이미 구한 getUserContext 결과 (중복 쿼리 방지). 없으면 직접 조회.
 * @param opts.forceCold - true면 시드 무시하고 콜드 큐레이션 2명으로 생성 (구버전 앱 호환).
 */
export async function generateDiscoveryCard(
  userId: string | null,
  deviceId: string,
  precomputed?: { ctx: UserContext; seedArtists: string[]; seedCount: number },
  opts?: { forceCold?: boolean },
): Promise<DiscoveryCardResult> {
  // 1. User context (route가 넘긴 값 재사용, 없으면 직접 조회)
  const { ctx, seedArtists, seedCount } =
    precomputed ?? (await getUserContext(userId, deviceId));

  // 2. 이미 저장한 아티스트 ID — 추천에서 제외 (재추천 방지)
  const excludeIds = await getSavedArtistIds(userId, deviceId);
  if (excludeIds.size > 0) {
    console.log(`[discovery] 저장된 아티스트 ${excludeIds.size}명 추천 제외`);
  }

  // 3. 모드 결정: forceCold(또는 시드0) = 순수 콜드 / 2개+ = 각각 / 1개 = 하이브리드
  const cold = opts?.forceCold || seedCount === 0;
  const resolve = (ex: Set<string>) =>
    cold ? resolveColdPair(ex) : seedCount >= 2 ? resolveTwoSeeds(seedArtists, ex) : resolveHybrid(seedArtists, ex);
  console.log(`[discovery] ${cold ? "콜드" : seedCount >= 2 ? "2시드" : "하이브리드"} 모드 (시드 ${seedCount}명)`);

  // 콜드 모드는 개인 신호(vibe) 없이 — ctx를 비활성으로 (caption 콜드 톤)
  const writeCtx = cold ? { isActive: false, vibeDescriptions: [] } : ctx;

  let pair = await resolve(excludeIds);
  // 폴백: excludeIds 때문에 실패하면 무시하고 재시도 (시드 풀 작을 때 중복 허용)
  if (!pair && excludeIds.size > 0) {
    console.log("[discovery] excludeIds 폴백 (중복 허용)");
    pair = await resolve(new Set());
  }
  if (!pair) throw new Error("Apple Music similar artists로 페어 확정 실패");

  console.log(`[discovery] artist_1: ${pair.artist1.name}, artist_2: ${pair.artist2.name}`);

  // 4. Claude → bio + caption + reason × 2
  const cards = await claudeWriteCards(pair.artist1, pair.artist2, writeCtx);

  // 5. 결과 조합
  return {
    artist_1: {
      apple_id: pair.artist1.appleId,
      name: pair.artist1.name,
      artwork: pair.artist1.artwork,
      genres: pair.artist1.genres,
      bio_ko: cards.primary_bio_ko,
      caption: cards.primary_caption,
      reason: cards.primary_reason,
      tracks: pair.artist1.tracks,
    },
    artist_2: {
      apple_id: pair.artist2.appleId,
      name: pair.artist2.name,
      artwork: pair.artist2.artwork,
      genres: pair.artist2.genres,
      bio_ko: cards.partner_bio_ko,
      caption: cards.partner_caption,
      reason: cards.partner_reason,
      tracks: pair.artist2.tracks,
    },
  };
}
