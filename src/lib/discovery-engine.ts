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

/** 활성 사용자 시드 + vibe_description 추출 (없으면 콜드 스타트로) */
export async function getUserContext(
  userId: string | null,
  deviceId: string,
): Promise<{
  ctx: UserContext;
  seedArtists: string[]; // 활성만, top 10 shuffle. 신규는 빈 배열
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
    return { ctx: { isActive: false, vibeDescriptions: [] }, seedArtists: [] };
  }

  const ids = entries.map((e) => e.id);
  const [savesRes, sharesRes] = await Promise.all([
    supabaseAdmin.from("save_logs").select("entry_id").in("entry_id", ids),
    supabaseAdmin.from("share_logs").select("entry_id").in("entry_id", ids),
  ]);
  const saveSet = new Set((savesRes.data || []).map((r) => r.entry_id));
  const shareSet = new Set((sharesRes.data || []).map((r) => r.entry_id));

  // 시드 후보: save·share 받은 아티스트 (점수 기반 정렬)
  const scoreMap = new Map<string, number>();
  for (const e of entries) {
    if (!e.artist) continue;
    const s = (saveSet.has(e.id) ? 1 : 0) + (shareSet.has(e.id) ? 1 : 0);
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
    // entries는 있지만 save·share 0건 → 콜드 스타트로 폴백 (단 vibe_description은 있을 수 있음)
    return {
      ctx: { isActive: vibeDescriptions.length > 0, vibeDescriptions },
      seedArtists: [],
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
  };
}

/** 콜드 스타트 시드: Apple Music 큐레이션 playlist 5개에서 아티스트 풀 추출 후 shuffle */
async function getColdStartSeedArtists(): Promise<string[]> {
  const seen = new Set<string>();
  const artists: string[] = [];
  for (const pl of CURATED_PLAYLISTS) {
    const tracks = await applePlaylistTracks(pl.id);
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

/**
 * 시드 아티스트 1명 → Apple similar (shuffle) → Artist 1·2 확정 (둘 다 새 발견).
 * excludeIds에 있는 아티스트는 제외 (이미 저장한 항목 재추천 방지).
 * 단, excludeIds 적용으로 페어 못 만들면 자동 폴백 (excludeIds 무시).
 */
async function resolveArtistPair(
  seedNames: string[],
  excludeIds: Set<string> = new Set(),
): Promise<{ artist1: AppleArtistFull; artist2: AppleArtistFull } | null> {
  // 1차: excludeIds 적용
  const result = await tryResolvePair(seedNames, excludeIds);
  if (result) return result;
  // 2차 폴백: excludeIds 무시 — 시드 풀이 작아서 다 제외되면 어쩔 수 없이 중복 허용
  if (excludeIds.size > 0) {
    console.log("[discovery] excludeIds 적용 실패 → 폴백 (중복 허용)");
    return tryResolvePair(seedNames, new Set());
  }
  return null;
}

async function tryResolvePair(
  seedNames: string[],
  excludeIds: Set<string>,
): Promise<{ artist1: AppleArtistFull; artist2: AppleArtistFull } | null> {
  for (const seedName of seedNames) {
    const seedSearch = await appleSearchArtist(seedName);
    if (!seedSearch) continue;
    const seedFull = await appleGetArtistFull(seedSearch.id);
    if (!seedFull || seedFull.similar.length < 2) continue;

    // similar list shuffle — 매 진입마다 다른 결과 확보
    const shuffledSimilar = shuffle(seedFull.similar);

    let a1: AppleArtistFull | null = null;
    let a2: AppleArtistFull | null = null;
    for (const sim of shuffledSimilar) {
      if (excludeIds.has(sim.id)) continue; // 이미 저장한 아티스트 제외
      const full = await appleGetArtistFull(sim.id);
      if (!full || full.tracks.length === 0) continue;
      if (!a1) {
        a1 = full;
        continue;
      }
      if (full.appleId === a1.appleId) continue;
      a2 = full;
      break;
    }
    if (a1 && a2) return { artist1: a1, artist2: a2 };
  }
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
- vibe 노을·그늘·그림자 + 어쿠스틱 R&B → "그늘 산책길에 어울리는 햇살 소울"
- vibe 꽃집·강아지·카네이션 + 인디팝 → "꽃집 단골견과 잘 어울리는 결"
- vibe 새벽·야간배회 + 몽환적 R&B → "야간 산책러를 위한 새벽 R&B"
- vibe 하늘·구름 + 인디록 → "흐린 하늘 사진에 어울리는 톤"
- vibe 카페·창문 + 재즈 → "카페 자리 잡고 듣고 싶은 재즈"

❌ 나쁜 예:
- 너무 일반: "감성 추천" (매칭 X)
- vibe만: "그늘 산책러 취향 저격" (아티스트 결 X)
- 아티스트만: "햇살 머금은 소울" (개인화 X)
- vibe_description 원문 그대로 인용`
    : `[caption — 20자 내, 콜드 스타트용 (시적 한 줄)]
음악의 결·정서를 응축한 시적 한 줄. 따옴표 없이.
예: "장면을 노래하는 사람", "안개 끼는 새벽 같은 R&B", "런던발 소울의 오후"`;

  const systemPrompt = `너는 '플더픽'이라는 사진 기반 음악 추천 서비스의 AI야.
오늘의 발견 카드는 단톡방에서 친구들이 돌려보고 키득거리는 카드 —
존댓말(~요체). 농담 섞은 톤. JSON만 응답.`;

  const prompt = `오늘의 발견 카드 텍스트를 작성해 주세요.

[아티스트 1]
${fmt(artist1)}

[아티스트 2]
${fmt(artist2)}

[사용자 시그널]
${vibeBlock}

──────────────────────────────────────────────
[bio_ko — 매거진 + 단톡방 hybrid, 80~150자]
──────────────────────────────────────────────
3단 구조:
① Hook 한 문장 — 정보 나열 절대 금지. 예: "처음 들으면 '이게 진짜야?' 싶은 ○○예요" / "지금 ○○ 씬을 다시 쓰고 있다는 말이 과장 아니에요"
② 형용사 + 장르 + 사실 압축 (예: "햇살 머금은 소울", "나른한 베드룸팝")
③ 현재형 종결 + 아티스트 매력의 결을 한 줄로 짚기
   ⚠️ 곡 제목 인용 금지 — 곡 인용은 reason의 역할이라 bio에서 중복하지 말 것
   ✅ 좋은 예: "지금 활발하게 음악을 다듬어가는 중이에요" / "들으면 들을수록 매력이 깊어지는 부류" / "정제된 보컬에 힘 빼는 방식이 특히 매력적이에요" / "한 번 듣기 시작하면 멈추기 어려운 톤이에요"
   ❌ 나쁜 예: "Snooze부터 들어보세요" (reason과 중복) / "Kill Bill로 시작하면..." (reason과 중복)

⚠️ 절대 금지:
- "○○은 ○○ 출신의 ○○예요" 위키 첫 문장 톤
- 사운드 직접 묘사 ('기타 톤', '통통 튀는 리듬')
- 과장 형용사 ('최고의', '독보적인', '전설적')
- **곡 제목·앨범명 인용 (bio는 아티스트 자체 묘사. 곡 인용은 reason에서만)**

${captionGuide}

[reason — 80~120자, 2~3문장 ⭐ 가장 중요]
⭐ 핵심: 이 아티스트의 음악 매력·특징 + 그게 왜 이 사용자에게 맞는지 매칭.
   아티스트 설명 없는 reason은 무효예요.

✅ 좋은 흐름 (활성 사용자):
① 이 아티스트의 음악 매력·결 한 줄 (장르 결, 곡의 인상, 사운드 특징 — 직접 사운드 묘사가 아닌 분위기 수준)
② 사용자 vibe 패턴과 어떻게 연결되는지 ("○○ 자주 담는 분이라면", "○○한 시선에는")
③ 본인 곡 1~2개 자연스럽게 인용 (Apple Music 5곡 한정)
④ 종결 매번 다르게 — 질문/권유/과장·비교/반전/추측 중

✅ 좋은 흐름 (신규 사용자):
① 아티스트 음악 매력·결 한 줄
② 어떤 상황·취향의 사람에게 어울리는지 일반 톤 ("○○한 무드 좋아하면")
③ 본인 곡 1~2개 + 다양한 종결

✅ 좋은 예:
- (활성) "절제된 어쿠스틱과 잔잔한 보컬이 강점인 아티스트예요. 새벽 산책 무드 자주 담는 분이라면 Dive 한 곡으로 그 시간이 더 길어질 거예요."
- (활성) "장르 경계 흐리는 사운드가 매력이에요. 일상 디테일 잡는 시선이 좋은 분에게 Kill Bill의 묘한 결이 잘 와닿을 듯해요."
- (신규) "감정 결을 섬세하게 쌓는 보컬이 매력이에요. 차분한 무드 좋아하는 분이라면 INVU 한 번 틀어보세요, 다음 트랙으로 손이 알아서 가요."

⚠️ ❌ 절대 금지:
- ⛔ 사용자 사진/상황 직접 묘사 ("무대 위 마이크", "카메라 앵글", "필터 톤", "마이크 잡으면") — 이건 곡 추천 페이지 톤이라 여기선 금지
- ⛔ 아티스트 음악 설명 없이 사용자 분석만
- "저장한 곡", "saved 아티스트 ○○" 직접 언급
- vibe_description 원문 그대로 인용
- '~딱이에요', '~어울려요', '~결이 맞아요'
- 의문형 연속

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
          primary_bio_ko: { type: "string", description: "artist 1 매거진+단톡방 hybrid bio (80~150자, ~요체). 곡 제목 인용 금지 — bio는 아티스트 자체 묘사, 곡 인용은 reason 역할." },
          primary_caption: { type: "string", description: "artist 1 caption — 활성 사용자: vibe×아티스트 매칭 한 줄 25자 내 / 신규: 시적 한 줄 20자 내" },
          primary_reason: { type: "string", description: "artist 1 추천 이유 (80~120자, ~요체) — 아티스트 음악 매력 + 사용자 취향 매칭. 사용자 사진·상황 직접 묘사 금지." },
          partner_bio_ko: { type: "string", description: "artist 2 매거진+단톡방 hybrid bio (80~150자, ~요체). 곡 제목 인용 금지 — bio는 아티스트 자체 묘사, 곡 인용은 reason 역할." },
          partner_caption: { type: "string", description: "artist 2 caption — 활성 사용자: vibe×아티스트 매칭 한 줄 25자 내 / 신규: 시적 한 줄 20자 내" },
          partner_reason: { type: "string", description: "artist 2 추천 이유 (80~120자, ~요체) — 아티스트 음악 매력 + 사용자 취향 매칭. 사용자 사진·상황 직접 묘사 금지." },
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

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-4-8",
      max_tokens: 800,
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
  const block = json.content?.find((c) => c.type === "tool_use");
  if (!block || !block.input) throw new Error("Claude tool_use 응답 없음");
  return block.input;
}

// ─────────────────────────── Main API ───────────────────────────

/**
 * 오늘의 발견 카드 생성 (lazy generation, DB 저장은 호출자가)
 *
 * @param options.forceColdStart - true면 user/device entries 무시하고 무조건 콜드 풀로 생성.
 *   공용 풀(`common_${bucket}`) 캐시에 저장될 카드에 개인 신호(vibe_description)가 묻지
 *   않도록 차단하는 용도. cache_key 판정과 카드 생성 로직의 일관성을 보장한다.
 */
export async function generateDiscoveryCard(
  userId: string | null,
  deviceId: string,
  options: { forceColdStart?: boolean } = {},
): Promise<DiscoveryCardResult> {
  // 1. User context (활성/신규 구분)
  //    forceColdStart=true면 사용자 신호 무시하고 콜드로 강제
  const { ctx, seedArtists } = options.forceColdStart
    ? { ctx: { isActive: false, vibeDescriptions: [] }, seedArtists: [] as string[] }
    : await getUserContext(userId, deviceId);

  if (options.forceColdStart) {
    console.log("[discovery] forceColdStart=true — 사용자 신호 무시, 콜드 풀로 강제");
  }

  // 2. 시드 결정
  let seedPool = seedArtists;
  if (seedPool.length === 0) {
    console.log("[discovery] 콜드 스타트 시드 추출 (Apple 큐레이션 playlist)");
    seedPool = await getColdStartSeedArtists();
  } else {
    console.log(`[discovery] 활성 사용자 시드 ${seedPool.length}명`);
  }

  // 2.5. 이미 저장한 아티스트 ID — 추천에서 제외 (콜드 풀은 X)
  const excludeIds = options.forceColdStart
    ? new Set<string>()
    : await getSavedArtistIds(userId, deviceId);
  if (excludeIds.size > 0) {
    console.log(`[discovery] 저장된 아티스트 ${excludeIds.size}명 추천 제외`);
  }

  // 3. 아티스트 페어 확정 (시드 → similar 2명, 이미 저장한 항목 제외)
  const pair = await resolveArtistPair(seedPool, excludeIds);
  if (!pair) throw new Error("Apple Music similar artists로 페어 확정 실패");

  console.log(`[discovery] artist_1: ${pair.artist1.name}, artist_2: ${pair.artist2.name}`);

  // 4. Claude → bio + caption + reason × 2
  const cards = await claudeWriteCards(pair.artist1, pair.artist2, ctx);

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
