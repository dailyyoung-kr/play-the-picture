import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCurrentUserId } from "@/lib/auth/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type SongRow = {
  id: string;
  spotify_track_id: string;
  song: string;
  artist: string;
  genre: string;
  energy: number;
  album_art_url: string | null;
  album: string | null;
  duration: string | null;
};

const ENERGY_LABELS: Record<number, string> = {
  1: "잔잔함",
  2: "여유",
  3: "설렘",
  4: "신남",
  5: "파워풀",
};

function getMediaType(dataUrl: string): "image/jpeg" | "image/png" | "image/webp" | "image/gif" {
  if (dataUrl.startsWith("data:image/png")) return "image/png";
  if (dataUrl.startsWith("data:image/webp")) return "image/webp";
  if (dataUrl.startsWith("data:image/gif")) return "image/gif";
  return "image/jpeg";
}

function shuffleAndSlice(arr: SongRow[], n: number): SongRow[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// ── 글로벌 7일 카운트 캐시 (편향 방지 가중치용) ──
// Module-level memory cache. 5분 TTL.
// - cache hit (99% 호출): 1ms — 사용자 체감 0
// - cache miss (5분에 1번): ~15ms (700 rows GROUP BY)
// - 5분 stale OK: 7일 평균에 영향 0.05% 미만
const GLOBAL_COUNTS_TTL_MS = 5 * 60 * 1000;
let globalCountsCache: { counts: Map<string, number>; fetchedAt: number } | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getGlobal7dCounts(supabase: any): Promise<Map<string, number>> {
  if (globalCountsCache && Date.now() - globalCountsCache.fetchedAt < GLOBAL_COUNTS_TTL_MS) {
    return globalCountsCache.counts;
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("recommendation_logs")
    .select("song_id")
    .gte("created_at", since);

  if (error) {
    console.error("[new] global 7d counts fetch 실패:", error.message);
    // 실패 시 빈 Map 반환 — weight = 1.0 (페널티 없음, fail-safe)
    return new Map();
  }

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { song_id: string }[]) {
    if (row.song_id) {
      counts.set(row.song_id, (counts.get(row.song_id) ?? 0) + 1);
    }
  }

  globalCountsCache = { counts, fetchedAt: Date.now() };
  console.log(`[new] global 7d counts cached: ${counts.size}곡, ${data?.length ?? 0}건`);
  return counts;
}

// ── 가중치 공식: weight = 1 / (1 + count × k) ──
// k=0.10 기준:
//   0회: 1.00 (사장곡·신곡 그대로)
//   3회 (median): 0.77
//   7회 (p95): 0.59
//   14회 (top, Blue Hour 등): 0.42  ← 58% 페널티
const ROTATION_K = 0.10;

function computeWeight(songId: string, counts: Map<string, number>): number {
  const c = counts.get(songId) ?? 0;
  return 1 / (1 + c * ROTATION_K);
}

// ── 가중 무작위 샘플링 (n개 비복원 추출) ──
// weight 비례 확률로 선택. 같은 곡 중복 추출 방지.
function weightedShuffleAndSlice(
  arr: SongRow[],
  n: number,
  counts: Map<string, number>
): SongRow[] {
  const items = arr.map(song => ({ song, weight: computeWeight(song.id, counts) }));
  const result: SongRow[] = [];

  while (result.length < n && items.length > 0) {
    const total = items.reduce((sum, x) => sum + x.weight, 0);
    if (total <= 0) break;
    let r = Math.random() * total;
    for (let j = 0; j < items.length; j++) {
      r -= items[j].weight;
      if (r <= 0) {
        result.push(items[j].song);
        items.splice(j, 1);
        break;
      }
    }
  }
  return result;
}

// discover 모드: 장르별 균등 샘플링 (각 장르에서 최대 maxPerGenre곡, 가중치 적용)
function balancedSample(
  arr: SongRow[],
  maxPerGenre: number,
  counts: Map<string, number>
): SongRow[] {
  const byGenre: Record<string, SongRow[]> = {};
  for (const song of arr) {
    if (!byGenre[song.genre]) byGenre[song.genre] = [];
    byGenre[song.genre].push(song);
  }
  const result: SongRow[] = [];
  for (const genre of Object.keys(byGenre)) {
    // 장르별 가중 샘플링 — over-recommended 곡은 같은 장르 안에서도 덜 뽑힘
    result.push(...weightedShuffleAndSlice(byGenre[genre], maxPerGenre, counts));
  }
  return shuffleAndSlice(result, result.length);
}

// 아티스트 다양성: 같은 아티스트 최대 maxPerArtist곡으로 제한
function limitPerArtist(arr: SongRow[], maxPerArtist: number): SongRow[] {
  const count: Record<string, number> = {};
  return arr.filter(song => {
    const key = song.artist.toLowerCase();
    count[key] = (count[key] ?? 0) + 1;
    return count[key] <= maxPerArtist;
  });
}

// 매 호출마다 1톤 랜덤 선택 → reason·vibeDescription 톤 + vibeType 어미 풀 결정
// 데이터(LIKED share/story_save) 기반으로 검증된 톤 4종. 톤별 어미 풀로 결 통일.
const VIBE_TONE_POOL = [
  {
    name: "농담관찰",
    reason_tone: "삐딱한 친구가 옆에서 놀리듯 농담. MBTI 밈 톤. 자조적 위트.",
    desc_angle: "사진 속 디테일 1개를 자기 과시 + 위트로 비틀기",
    desc_examples: [
      "잔디밭이 무대인 줄 아는 사람",
      "필기 3줄 쓰고 폰 30분 보는 중",
      "산 전세 내고 라떼 한 잔",
    ],
    format_examples: [
      "🍵 카페 중독자",
      "✍️ 끄적임 사색가",
      "🛋️ 벨벳 의자 점령자",
      "🐱 길냥이 단골",
      "📚 책상 위 찐친",
      "🌧️ 우중 낭만 유목민",
      "🛏️ 늦잠 전문가",
    ],
  },
  {
    name: "자기자랑",
    reason_tone: "단톡방에 은근히 자랑하는 사진 올리는 친구를 옆에서 알아봐주는 친구 톤. 사진 속 디테일을 '자기 자랑각', '인증샷각'으로 짚어주기. 친구로서 사용자가 자랑하고 싶은 결을 살려주는 카피. 허세·자뻑 OK, 농담 섞기.",
    desc_angle: "사진 속 본인의 디테일 1개를 자기자랑 카피로 풀기. '나 이런 사람이야', '이 정도는 기본이지' 자기 인증·허세 결. 단톡방에 친구한테 자랑 던지는 느낌. 허세·가벼운 호들갑 OK.",
    desc_examples: [
      "사진 찍는 자세 하나로 웃음 바다 만드는 폼 미쳤음",
      "이 구역의 분위기 메이커는 바로 나",
      "힙스터라는게 별게 있나?",
    ],
    format_examples: [
      "🏙️ 도심 화보 모델",
      "🎀 길거리 핑크공주",
      "🚗 트렁크 펜션 사장",
      "📸 셀카 감독",
      "🎤 단톡방 주연",
      "🌇 노을 디자이너",
      "🏖️ 휴양지 주인공",
    ],
  },
  {
    name: "직설인정",
    reason_tone: "짧고 단호하지만 친구 말투. 군더더기 제거. '인정' 한 마디 결.",
    desc_angle: "사진의 핵심 1개를 단정적으로 인정",
    desc_examples: [
      "조명 끄고 감성 켜는 시간대",
      "선인장한테 비니 씌우는 감각",
      "어금니가 스크린 데뷔하는 날",
    ],
    format_examples: [
      "🍵 말차 전문가",
      "🌃 야경 디자이너",
      "📷 필름 감독",
      "🦷 치과 단골",
      "🍱 도시락 사장",
      "🍷 디너 감독",
      "🌿 그림자 관찰자",
      "📚 끄적임 기록자",
    ],
  },
  {
    name: "유쾌발견",
    reason_tone: "친구가 사진에서 재미있는 디테일 발견. '이거 봐봐' 결. 발견 + 위트.",
    desc_angle: "사진 속 의외의 디테일 1개를 짚어내며 위트",
    desc_examples: [
      "히라가나보다 아이스크림이 먼저 녹는 중",
      "발밑 풍경도 작품이 되는 사람",
      "언니 손목시계가 오늘의 주인공",
    ],
    format_examples: [
      "🐱 길냥이 찐친",
      "🌿 그림자 탐험가",
      "🌸 봄꽃 유목민",
      "🍔 앞치마 헌터",
      "🌅 새벽 기록자",
      "🐯 브이요정 커플",
    ],
  },
];

function pickRandom<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

const SYSTEM_PROMPT = `'플더픽(Play the Picture)'은 사진을 올리면(최대 5장) 분위기를 읽어서 어울리는 음악 1곡을 추천해주는 서비스야.
추천곡과 결과 카드를 인스타 DM·스토리에 공유하고 친구들끼리 돌려보며 한 마디씩 던지는 게 가장 즐기는 방식이야.
너는 그 서비스의 마스코트 '픽터' — 친구처럼 친근한 캐릭터.
사진을 분석해서 후보곡 중 어울리는 음악 1곡을 골라.
톤은 친구처럼 친근하게 — 위트·농담·호들갑 OK. 감성적·잔잔한 톤은 픽터와 안 맞음.
reason은 존댓말(~요체)이지만 친구가 카톡으로 말하는 듯한 자연스러운 호흡.
vibeDescription은 명사로 종결 — 트렌디한 매거진 카피처럼 짧고 임팩트 있게.
한국어, JSON만 응답.`;

function buildNewPrompt(
  genre: string,
  energy: number,
  candidates: SongRow[],
  tone: typeof VIBE_TONE_POOL[number],
  recentVibes: string[],
  formatExamples: string[]
): string {
  const energyLabel = ENERGY_LABELS[energy] ?? String(energy);
  const isDiscover = genre === "discover";

  const songList = candidates
    .map((s, i) => `${i + 1}. ${s.song} - ${s.artist}`)
    .join("\n");

  // 이모지 다음 첫 단어(=prefix) 추출. 예: "🍝 면치기 헤드뱅어" → "면치기"
  const recentPrefixes = recentVibes
    .map((v) => v.replace(/^\p{Extended_Pictographic}+\s*/u, "").split(/\s+/)[0])
    .filter((p) => p && p.length > 0);
  const recentBlock = recentPrefixes.length > 0
    ? `\n[24h 내 같은 사용자에게 사용된 prefix — 재사용 금지]
${recentPrefixes.join(", ")}
→ 새 카드 vibeType의 첫 단어(이모지 다음)는 위 단어와 반드시 다르게.
  어미·역할명은 자유.
`
    : "";

  return `후보곡 중 사진에 가장 어울리는 1곡. JSON만.

장르: ${isDiscover ? "자유 (장르 발견하기 모드)" : genre}
곡 분위기: ${energyLabel}

[후보곡]
${songList}

[이번 카드의 톤]
${tone.name} — ${tone.reason_tone}
(reason 3문장 + vibeDescription을 모두 이 톤으로 작성)
${recentBlock}

[분석 지시]
- 사진에서 디테일 1~2개 관찰 (피사체 동작·포즈 / 장소 / 색감·빛 / 사물 상태 중)
- 가능하면 곡과 연결될 디테일 우선 선택
- reason에 자연스럽게 녹일 것
- 여러 장이면 흐름·감정 변화·전체 무드 짚을 것
- 구체적 주소·지번 노출 금지
- reason 1번째 문장은 40자 이내로 간결하게

금지:
- '딱 맞아 떨어지다'
- '이건 그냥 A가 아니라 B'
- '그 자체로'
- 의문형 연속
- 'ㅋ' 자음 단독
- 태그 띄어쓰기
- 평범한 종결 반복: '~어울려요' / '~딱이에요' / '~이만한 게 없어요' / '~결이 맞아요'
- 'BGM' 2회 이상 (1회는 OK)

⚠️ 분위기 라벨 수치 노출 금지: "설렘 3", "에너지 N/5" 같이 [분위기 라벨]+[숫자] 조합 표현 절대 금지. 분위기는 카피 결로만 자연스럽게 묻어나야 함.

{
  "selectedIndex": 번호,
  "reason": "3문장. 위 [이번 카드의 톤] 가이드를 따라 작성.
① 사진의 구체적 디테일 1개를 위 톤 가이드대로 관찰 (톤 이름 직접 언급 X)
② 사진과 곡이 어울리는 이유 1~2가지로 연결. 다음 중 선택:
  - 제목·아티스트의 특징
  - 장르·곡 분위기
  - 사진의 장소·시간대·계절감
금지: '기타 톤', '통통 튀는 리듬', '목소리가 흩날려요' 같은
사운드 직접 묘사 — AI가 실제 사운드 정확히 모를 수 있어 거짓말 위험.
③ 종결 결 선택: 질문 / 권유 / 과장·비교 / 반전 / 추측 중.
마지막 문장 반드시 존댓말(~요/~죠/~네요/~예요).
명사·간결체 종결 금지(~정상/~인증/~수준/~함/~수도).",
  "tags": ["장르/서브장르 2~5자 (예: KPOP·시티팝·R&B·어쿠스틱)", "무드/감정 2~5자 (예: 몽글한·들뜬·설레는·나른한)", "상황/시간대 2~5자 (예: 퇴근길·카페·주말오후)"],
  "vibeType": "이모지 + 한글 캐릭터명. 3~7자.
'카톡 단톡방에 떴을 때 친구들이 한 번씩 다 만들어보고 싶게 만드는 별명'.
사진 1장이면 단일 디테일, 여러 장이면 단일 컷 임팩트가 아닌 흐름·변화·전체 무드 짚기.
어미는 사진 소재와 자연스럽게 매칭되는 직업·역할·정체성 자유 선택 — 예: 요정/모델/주인공/탐험가/팬/스타일리스트/감독/사장님/단골/사색가/관찰자/디자이너/전문가/커플/찐친/중독자/유목민/트렌드세터 등.
'~러', '~러너' 어미 사용 금지. 영문 변형('runner', '러너')도 포함.
(예: ${formatExamples.join(" / ")})",
  "vibeDescription": "25자 이내. 위 [이번 카드의 톤] 가이드를 따라 1문장.
angle: ${tone.desc_angle}
반드시 명사로 종결 — ~중/~사람/~컷/~한 장/~인증/~핵심/~정답/~그림/~보람/~수준 등.
'~요체' (~예요/~죠/~다/~겠어요) 절대 금지.
예: ${tone.desc_examples.join(" / ")}"${isDiscover ? ',\n  "discoveredGenre": "장르명 한국어"' : ""}
}`;
}

export async function newRecommend(
  body: Record<string, unknown>,
  photos: string[],
  req?: Request,
): Promise<ReturnType<typeof NextResponse.json>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API 키가 설정되지 않았어요.", error_code: "api_key_missing" }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const genreMap: Record<string, string> = {
    "K-POP": "kpop",
    "팝": "pop",
    "힙합": "hiphop",
    "힙합/R&B": "hiphop",
    "인디": "indie",
    "R&B/소울": "rnb",
    "락": "indie",
    "어쿠스틱/재즈": "acoustic_jazz",
    "재즈/어쿠스틱": "acoustic_jazz",
    "장르 발견하기": "discover",
    // legacy preference apiGenre 호환
    "힙합R&B": "hiphop",
  };

  const rawGenre = (body.genre as string) ?? "discover";
  const genre = genreMap[rawGenre] ?? rawGenre;
  const energy = Number(body.energy) || 3;
  const isDiscover = genre === "discover";
  const deviceId = (body.deviceId as string) ?? null;
  // 로그인 user (anon 포함) — 후속 insert에서 user_id로 박힘. 미로그인이면 null.
  // Bearer 헤더 (RN/native) + 쿠키 (web) 둘 다 지원
  const userId = await getCurrentUserId(req);
  console.log(`[new] genre 변환: "${rawGenre}" → "${genre}"`);

  const perfStart = Date.now();
  const perf = (label: string, since: number) =>
    console.log(`[PERF] ${label}: ${Date.now() - since}ms`);

  const MODEL_PRICING: Record<string, { input: number; output: number }> = {
    "claude-sonnet-4-6": { input: 3, output: 15 },
    "claude-opus-4-6":   { input: 5, output: 25 },
    "claude-opus-4-7":   { input: 5, output: 25 },
  };

  console.log(`[PERF] 분석 시작 — 사진 ${photos.length}장`);

  // ── STEP 0: device 평생 추천 이력 조회 (절대 중복 방지) ──
  // 2026-05-09: 7일 → 평생 차단으로 변경 ("새 곡 발견" 컨셉 강화)
  // 검증: max 헤비유저 46곡 = 풀의 3.3%만 차단, 풀 고갈 위험 0%
  // + 4차 fallback 안전망 (5곡 미만 시 모든 필터 무시)
  // 아티스트 cap 제거: 글로벌 가중치 + per-call limitPerArtist(2)로 충분

  let excludedIds: string[] = [];
  if (deviceId) {
    const { data: recData } = await supabase
      .from("recommendation_logs")
      .select("song_id")
      .eq("device_id", deviceId);
    excludedIds = (recData ?? []).map((r: { song_id: string }) => r.song_id).filter(Boolean);
    console.log(`[new] device 평생 추천 제외: ${excludedIds.length}곡`);
  }

  // ── STEP 0-B: 같은 device 24h 내 vibe_type 이력 (헤비유저 패턴 변주용) ──
  // ⚠️ analysis_results는 RLS 활성화 + 정책 0개 → anon client는 SELECT 차단됨
  //    → supabaseAdmin (service role) 사용 필수
  // idx_analysis_device_created 인덱스 적중 — EXPLAIN ANALYZE 3ms 이하 검증됨
  let recentVibes: string[] = [];
  if (deviceId) {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: recent, error: recentErr } = await supabaseAdmin
      .from("analysis_results")
      .select("vibe_type")
      .eq("device_id", deviceId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5);
    if (recentErr) {
      console.error(`[new] 24h 이력 조회 ERROR: ${recentErr.message}`);
    }
    recentVibes = (recent ?? []).map((r: { vibe_type: string | null }) => r.vibe_type).filter((v): v is string => Boolean(v));
    console.log(`[new] 24h 이력 조회 결과: deviceId=${deviceId.substring(0,8)}, raw_count=${recent?.length ?? 0}, filtered_count=${recentVibes.length}`);
    if (recentVibes.length > 0) {
      console.log(`[new] device 24h vibe 이력: [${recentVibes.join(", ")}]`);
    }
  } else {
    console.log(`[new] 24h 이력 조회 SKIP: deviceId 없음`);
  }

  // ── STEP 1: Supabase에서 후보곡 필터링 ──

  const energyMin = Math.max(1, energy - 1);
  const energyMax = Math.min(5, energy + 1);

  const excludedSet = new Set(excludedIds);

  let candidates: SongRow[] = [];

  console.log("[PERF] 후보곡 필터링 시작");
  const t1 = Date.now();

  if (isDiscover) {
    // discover: energy ±1 범위로 바로 조회
    const { data, error } = await supabase.from("songs").select("*").gte("energy", energyMin).lte("energy", energyMax);
    if (error) {
      console.error("[new] DB 조회 오류:", error.message);
      return NextResponse.json({ error: "곡 데이터를 불러오지 못했어요.", error_code: "db_error" }, { status: 500 });
    }
    candidates = (data ?? []) as SongRow[];
    if (candidates.length < 10) {
      const { data: fallback } = await supabase.from("songs").select("*");
      candidates = (fallback ?? []) as SongRow[];
    }
    console.log(`[new] discover 후보: ${candidates.length}곡`);
  } else {
    // 1차: genre + energy 정확 매칭
    const { data: exact, error } = await supabase.from("songs").select("*").eq("genre", genre).eq("energy", energy);
    if (error) {
      console.error("[new] DB 조회 오류:", error.message);
      return NextResponse.json({ error: "곡 데이터를 불러오지 못했어요.", error_code: "db_error" }, { status: 500 });
    }
    candidates = (exact ?? []) as SongRow[];
    console.log(`[new] 1차 정확매칭: ${candidates.length}곡 (genre=${genre}, energy=${energy})`);

    // 2차: genre + energy ±1
    if (candidates.length < 30) {
      const { data: expanded } = await supabase.from("songs").select("*").eq("genre", genre).gte("energy", energyMin).lte("energy", energyMax);
      candidates = (expanded ?? []) as SongRow[];
      console.log(`[new] 2차 확장: ${candidates.length}곡 (energy=${energyMin}~${energyMax})`);
    }

    // 3차: genre 전체 (energy 제한 없음)
    if (candidates.length < 10) {
      const { data: fallback } = await supabase.from("songs").select("*").eq("genre", genre);
      candidates = (fallback ?? []) as SongRow[];
      console.log(`[new] 3차 fallback: ${candidates.length}곡 (energy 제한 없음)`);
    }
  }

  const perfDbMs = Date.now() - t1;
  perf("후보곡 필터링 완료", t1);

  if (candidates.length === 0) {
    return NextResponse.json({ error: "해당 조건의 곡이 없어요. 다른 장르나 분위기를 선택해주세요.", error_code: "no_candidates" }, { status: 404 });
  }

  // 반복 추천 방지: device 평생 받은 곡 제외 (메모리 필터)
  let filteredCandidates = candidates.filter(s => !excludedSet.has(s.id));

  // 4차 폴백: 제외 후 5곡 미만이면 이력 무시하고 후보 복원 (헤비유저 풀 고갈 안전망)
  if (filteredCandidates.length < 5 && excludedSet.size > 0) {
    console.log(`[FALLBACK] 이력 무시 발동: ${filteredCandidates.length}곡 가용 (genre=${genre}, energy=${energy}, excluded=${excludedSet.size})`);
    filteredCandidates = candidates;
  }

  // ── 샘플링 (동적 한도) ──
  // 2026-05-01 로컬 실험: K = max(30, min(50, ceil(P × 0.5)))
  //   - 풀 30곡 미만: 풀 그대로
  //   - 풀 30~60곡: 30곡 (하한)
  //   - 풀 60~100곡: 풀의 50% (곡당 노출 확률 50% 보장)
  //   - 풀 100곡 이상: 50곡 cap (Claude reasoning 부담 방지)
  const dynamicLimit = Math.max(
    30,
    Math.min(50, Math.ceil(filteredCandidates.length * 0.5))
  );

  // 2026-05-09 추가: 7일 글로벌 카운트 기반 가중 샘플링 (편향 방지)
  // 캐시(5분 TTL) — cache hit 시 ~1ms, miss 시 ~15ms
  const global7dCounts = await getGlobal7dCounts(supabase);

  let finalCandidates: SongRow[];
  if (isDiscover) {
    // discover: 장르당 균등 샘플링 (perGenre = limit ÷ 6 올림) + 가중치
    const perGenre = Math.ceil(dynamicLimit / 6);
    finalCandidates = balancedSample(filteredCandidates, perGenre, global7dCounts).slice(0, dynamicLimit);
  } else if (filteredCandidates.length > dynamicLimit) {
    finalCandidates = weightedShuffleAndSlice(filteredCandidates, dynamicLimit, global7dCounts);
  } else {
    finalCandidates = shuffleAndSlice(filteredCandidates, filteredCandidates.length);
  }

  // 아티스트 다양성: 같은 아티스트 최대 2곡
  finalCandidates = limitPerArtist(finalCandidates, 2);
  console.log(`[new] 동적 한도 ${dynamicLimit} (풀 ${filteredCandidates.length}곡), 아티스트 필터 후: ${finalCandidates.length}곡`);

  // ── STEP 2: Claude에게 사진 + 후보곡 전달 ──

  const imageBlocks = photos.map((dataUrl: string) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: getMediaType(dataUrl),
      data: dataUrl.split(",")[1],
    },
  }));

  const model = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6";
  console.log(`[PERF] Claude API 호출 시작 — 사진 ${photos.length}장, 모델: ${model}`);
  const t2 = Date.now();

  // 매 호출: 톤 1개 랜덤 + 톤별 format_examples에서 3개 랜덤 (편향 방지 — 단일 톤·예시 회귀 차단)
  const tone = pickRandom(VIBE_TONE_POOL, 1)[0];
  const formatExamples = pickRandom(tone.format_examples, 3);
  console.log(`[new] 톤: ${tone.name} / 형식 예시: [${formatExamples.join(", ")}]`);

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 700,
    system: SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: [
        ...imageBlocks,
        { type: "text", text: buildNewPrompt(genre, energy, finalCandidates, tone, recentVibes, formatExamples) },
      ],
    }],
  });

  const perfClaudeMs = Date.now() - t2;
  perf("Claude API 호출 완료", t2);
  const { input_tokens, output_tokens } = response.usage;
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING["claude-sonnet-4-6"];
  const cost = ((input_tokens * pricing.input + output_tokens * pricing.output) / 1_000_000).toFixed(4);
  console.log(`[PERF] 토큰 사용량 — input: ${input_tokens}, output: ${output_tokens} (비용: $${cost})`);

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();

  let result: Record<string, unknown>;
  try {
    result = JSON.parse(cleaned);
  } catch {
    console.error("[new] JSON 파싱 실패:", cleaned.slice(0, 200));
    return NextResponse.json({ error: "분석 중 오류가 발생했어요. 다시 시도해주세요.", error_code: "json_parse_error" }, { status: 500 });
  }

  // ── STEP 3: 결과 조합 ──

  console.log("[PERF] 결과 조합 시작");
  const t3 = Date.now();

  const selectedIndex = (result.selectedIndex as number) ?? 1;
  const selectedSong = finalCandidates[selectedIndex - 1] ?? finalCandidates[0];

  if (!selectedSong) {
    return NextResponse.json({ error: "곡 선택 중 오류가 발생했어요.", error_code: "selection_error" }, { status: 500 });
  }

  console.log(`[new] 선택된 곡: ${selectedSong.song} - ${selectedSong.artist} | index=${selectedIndex}`);
  perf("결과 조합 완료", t3);
  console.log(`[PERF] 전체 소요: ${Date.now() - perfStart}ms (사진 ${photos.length}장)`);

  // ── STEP 4: 추천 이력 비동기 기록 (응답 대기 시간에 영향 없음) ──
  if (deviceId && selectedSong?.id) {
    after(async () => {
      // (1) recommendation_logs — 최종 선택 1건. id 받아서 analysis_results와 link
      const { data: recLog, error: logErr } = await supabaseAdmin
        .from("recommendation_logs")
        .insert({
          device_id: deviceId,
          user_id: userId,
          song_id: selectedSong.id,
          vibe_type: result.vibeType ?? null,
        })
        .select("id")
        .single();
      if (logErr) console.error("[new] recommendation_logs insert 실패:", logErr.message);
      else console.log(`[new] 추천 이력 기록: device=${deviceId}, song=${selectedSong.id}`);

      // (2) analysis_results — Claude 응답 콘텐츠 박제 (모든 분석)
      // 액션 안 한 user의 vibe·reason 데이터 보존 — 패턴 분석 8x 표본 + prompt versioning 인프라
      const { error: analysisErr } = await supabaseAdmin.from("analysis_results").insert({
        recommendation_log_id: recLog?.id ?? null,
        device_id: deviceId,
        user_id: userId,
        song_id: selectedSong.id,
        vibe_type: result.vibeType ?? null,
        vibe_description: result.vibeDescription ?? null,
        reason: result.reason ?? null,
        tags: Array.isArray(result.tags) ? result.tags : null,
        emotions: result.emotions ?? null,
        selected_index: selectedIndex,
        model_id: model,
      });
      if (analysisErr) console.error("[new] analysis_results insert 실패:", analysisErr.message);
      else console.log(`[new] analysis_results 기록: vibe=${result.vibeType ?? "?"}`);

      // (3) candidate_logs — Claude에게 보낸 후보 50곡 batch insert
      // 미래 quality scoring 인프라: 곡별 "후보 진입 → 선택 전환률" 측정용
      const candidateRows = finalCandidates.map((s, i) => ({
        device_id: deviceId,
        user_id: userId,
        song_id: s.id,
        position: i + 1,
        was_selected: s.id === selectedSong.id,
      }));
      const { error: candErr } = await supabaseAdmin.from("candidate_logs").insert(candidateRows);
      if (candErr) console.error("[new] candidate_logs insert 실패:", candErr.message);
      else console.log(`[new] candidate_logs 기록: ${candidateRows.length}건 (selected position=${candidateRows.findIndex(r => r.was_selected) + 1})`);
    });
  }

  return NextResponse.json({
    song: `${selectedSong.song} - ${selectedSong.artist}`,
    spotifyTrackId: selectedSong.spotify_track_id,
    albumArt: selectedSong.album_art_url,
    reason: result.reason,
    tags: result.tags,
    vibeType: result.vibeType,
    vibeDescription: result.vibeDescription,
    isGenreDiscovery: isDiscover,
    perfDbMs,
    perfClaudeMs,
    photoCount: photos.length,
    ...(isDiscover && result.discoveredGenre ? { discoveredGenre: result.discoveredGenre } : {}),
  });
}
