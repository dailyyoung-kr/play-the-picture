// 오늘의 발견 프롬프트 시뮬레이션 (1회) — 새 bio/reason/caption 프롬프트 검증.
// 실유저 vibe + 실아티스트로 Claude 1회 호출. 실행: node scripts/sim-discovery-prompt.mjs
import { readFileSync } from "node:fs";

const apiKey = readFileSync(".env.local", "utf8").match(/^ANTHROPIC_API_KEY=(.+)$/m)?.[1]?.trim();
if (!apiKey) throw new Error("ANTHROPIC_API_KEY 못 찾음 (.env.local)");

// ── 실유저 vibe (활성 유저 c4100a56 — urban/lo-fi 미학) ──
const vibeDescriptions = [
  "전선 엉킨 하늘도 내 앵글엔 작품",
  "PC방 간판도 내 사진엔 작품",
  "초점 나간 컷이 진짜 본판이에요",
];

// ── 실아티스트 (today_discovery 캐시 — 한국 인디록 페어) ──
const fmt = (a) => `이름: ${a.name}
Apple Music 장르: ${a.genres.join(", ") || "(없음)"}
대표곡 5곡: ${a.tracks.join(", ")}`;
const artist1 = { name: "실리카겔", genres: ["록"], tracks: ["BIG VOID", "Tik Tak Tok (feat. So!YoON!)", "Desert Eagle", "NO PAIN"] };
const artist2 = { name: "보수동쿨러", genres: ["록"], tracks: ["0308", "모래", "죽여줘", "목화", "구름이"] };

// ── 프롬프트 ──
const systemPrompt = `너는 '플더픽'이라는 사진 기반 음악 추천 서비스의 AI야.
오늘의 발견 카드는 유저들이 사진으로 추천받아서 저장/공유한 기록을 기반으로
매일 2명의 취향에 맞는 새로운 아티스트를 추천하는 카드.
존댓말(~요체). 지정된 도구로만 응답.`;

const vibeBlock = `최근 분석한 사진의 vibe_description (사진 한 컷의 디테일을 한 줄로 묘사):
${vibeDescriptions.map((v, i) => `  ${i + 1}. ${v}`).join("\n")}

→ reason과 caption에서 위 디테일들로부터 사용자의 평소 사진·일상 패턴을 자연스럽게 추론해서 풀어낼 것.
→ ⚠️ vibe_description 원문 그대로 인용하지 말 것. 패턴만 추론해서 새 표현으로.`;

// caption — 장르명 들어간 예시 제거 (결·톤·무드 중심)
const captionGuide = `[caption — 25자 내, 활성 사용자용 (매칭 한 줄)]
사용자의 vibe_description 패턴(평소 사진 분위기)과 아티스트 음악 결을 매칭한 한 줄.
"왜 이 사용자에게 이 아티스트인가"를 한 줄로 응축. 위트·시적 OK.
따옴표 없이.

✅ 좋은 예:
- vibe 꽃집·강아지·카네이션 → "꽃집 단골견과 잘 어울리는 결"
- vibe 하늘·구름 → "흐린 하늘 사진에 어울리는 톤"

❌ 나쁜 예:
- 너무 일반: "감성 추천" (매칭 X)
- vibe만: "취향 저격" (아티스트 결 X)`;

const prompt = `오늘의 발견 카드 텍스트를 작성해 주세요.

[아티스트 1]
${fmt(artist1)}

[아티스트 2]
${fmt(artist2)}

[사용자 시그널]
${vibeBlock}

──────────────────────────────────────────────
[bio_ko — 음악 매거진 아티스트 소개 톤, 80~150자]
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

const tools = [{
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
    required: ["primary_bio_ko", "primary_caption", "primary_reason", "partner_bio_ko", "partner_caption", "partner_reason"],
  },
}];

const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
  body: JSON.stringify({
    model: "claude-opus-4-8", max_tokens: 1500, system: systemPrompt,
    tools, tool_choice: { type: "tool", name: "write_discovery_cards" },
    messages: [{ role: "user", content: prompt }],
  }),
});
const json = await res.json();
if (json.error) { console.error("API error:", JSON.stringify(json.error)); process.exit(1); }
const out = json.content?.find((c) => c.type === "tool_use")?.input;
const u = json.usage;

// 깨짐 감지 (Opus tool XML 누수) — compact verdict
const fields = ["primary_bio_ko", "primary_caption", "primary_reason", "partner_bio_ko", "partner_caption", "partner_reason"];
const garbled = fields.some((f) => typeof out?.[f] !== "string" || out[f].includes("<parameter") || out[f].includes("</"));
if (garbled) {
  console.log(`⚠️ GARBLED  capt1=${JSON.stringify(out?.primary_caption)} capt2=${JSON.stringify(out?.partner_caption)} bioLen=${out?.primary_bio_ko?.length}/${out?.partner_bio_ko?.length} out=${u?.output_tokens}tok`);
} else {
  console.log(`✅ CLEAN    capt1="${out.primary_caption}" | capt2="${out.partner_caption}" | bioLen ${out.primary_bio_ko.length}/${out.partner_bio_ko.length} | out ${u?.output_tokens}tok`);
}
