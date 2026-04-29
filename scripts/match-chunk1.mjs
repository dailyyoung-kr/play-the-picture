// 청크 1 (1~25) manual 매칭 + 패턴 분석
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

function loadEnv() {
  const content = readFileSync(".env.local", "utf-8");
  for (const line of content.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
}
loadEnv();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function normalize(s) {
  return s.toLowerCase().replace(/\(.*?\)/g, "").replace(/\[.*?\]/g, "").replace(/[^\p{L}\p{N}]/gu, "").trim();
}
const trackKey = (t, a) => `${normalize(t)}|${normalize(a)}`;
const hasKr = (s) => /[가-힯ᄀ-ᇿ]/.test(s);
const hasEn = (s) => /[a-zA-Z]/.test(s);

const TARGETS = [
  { n: 1,  song: '"You hate Jazz?"',                     artist: "Harrison",            id: "1814473697" },
  { n: 2,  song: "2 soon",                                artist: "keshi",               id: "1586318446" },
  { n: 3,  song: "2AM (Feat. CAMO)",                      artist: "Leellamarz",          id: "1625222150" },
  { n: 4,  song: "Ain't Shit",                            artist: "Doja Cat",            id: "1571169431" },
  { n: 5,  song: "ARE WE STILL FRIENDS?",                 artist: "Tyler, The Creator",  id: "1463409716" },
  { n: 6,  song: "BABY I'M BACK",                         artist: "The Kid LAROI",       id: "6763128190" },
  { n: 7,  song: "Blink (feat. TZUYU)",                   artist: "Corbyn Besson",       id: "1838563679" },
  { n: 8,  song: "Blow My High (Members Only)",           artist: "Kendrick Lamar",      id: "1475039186" },
  { n: 9,  song: "Boom",                                  artist: "DPR LIVE",            id: "1576224275" },
  { n: 10, song: "Broken Love",                           artist: "Gemini",              id: "1606287461" },
  { n: 11, song: "Burning slow",                          artist: "Molly Yam",           id: "1793945877" },
  { n: 12, song: "Can't Quit THIS Shit",                  artist: "저스디스",             id: "1854072240" },
  { n: 13, song: "City",                                  artist: "오왼",                 id: "1566413917" },
  { n: 14, song: "Countdown!",                            artist: "투어스",               id: "1805792444", titleDiff: true },
  { n: 15, song: "Dawn of us",                            artist: "잭슨",                 id: null },
  { n: 16, song: "dear me,",                              artist: "Gentle Bones",        id: "1530803374" },
  { n: 17, song: "Do It Again",                           artist: "Pia Mia",             id: "1445061914" },
  { n: 18, song: "do re mi",                              artist: "blackbear",           id: "1576021521" },
  { n: 19, song: "DON JULIO LEMONADE",                    artist: "DaBaby",              id: "1862402768" },
  { n: 20, song: "DtMF",                                  artist: "Bad Bunny",           id: "1787023936" },
  { n: 21, song: "Ease",                                  artist: "이강승",               id: "1810183827", titleDiff: true },
  { n: 22, song: "either on or off the drugs",            artist: "JPEGMAFIA",           id: "1760037157" },
  { n: 23, song: "Fashion Killa",                         artist: "A$AP Rocky",          id: "1450690215" },
  { n: 24, song: "FATHER (feat. Travis Scott)",           artist: "Kanye West",          id: "1888707289" },
  { n: 25, song: "Hate you",                              artist: "백예린",               id: "1543103562" },
];

async function lookup(id) {
  const r = await fetch(`https://itunes.apple.com/lookup?id=${id}&country=kr`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.results?.[0] ?? null;
}

function classify(input, apple, titleDiff) {
  const reasons = [];
  if (titleDiff) reasons.push("K:곡명자체상이");

  // 곡명 정규화 비교
  const nIs = normalize(input.song);
  const nAs = normalize(apple.trackName ?? "");
  const titleMatch = nIs === nAs || nIs.includes(nAs) || nAs.includes(nIs);

  // 곡명 노이즈 (Prod./Inst./Remix/feat.)
  const inputHasFeat = /\bfeat\.?\b/i.test(input.song);
  const appleHasFeat = /\bfeat\.?\b/i.test(apple.trackName ?? "");

  // 아티스트 한영
  const inA = input.artist;
  const apA = apple.artistName ?? "";
  const nIA = normalize(inA);
  const nAA = normalize(apA);
  const inKr = hasKr(inA), apKr = hasKr(apA);
  const inEn = hasEn(inA), apEn = hasEn(apA);
  if (nIA !== nAA && !nIA.includes(nAA) && !nAA.includes(nIA)) {
    if ((inKr && !apKr && apEn) || (apKr && !inKr && inEn)) {
      reasons.push("B:아티스트한영표기");
    } else {
      reasons.push("D:아티스트표기변형");
    }
  }

  // 특수문자
  if (/[{}<>"]/.test(input.song)) reasons.push("G:특수문자포함");

  // feat 안 한영 (대략적)
  const inFeat = (input.song.match(/feat\.?\s*([^)]*)/i) || [])[1] || "";
  const apFeat = (apple.trackName?.match(/feat\.?\s*([^)]*)/i) || [])[1] || "";
  if (inFeat && apFeat) {
    const ni = normalize(inFeat), na = normalize(apFeat);
    if (ni !== na && !ni.includes(na) && !na.includes(ni)) {
      const ik = hasKr(inFeat), ak = hasKr(apFeat);
      if (ik !== ak) reasons.push("H:feat한영표기");
    }
  }

  // 곡명 표기 변형 (위 카테고리에 안 잡힘)
  if (!titleMatch && !titleDiff) reasons.push("D:곡명표기변형");

  // 19금
  if (apple.trackExplicitness === "explicit") reasons.push("X:19금");

  if (reasons.length === 0 || (reasons.length === 1 && reasons[0] === "X:19금")) {
    reasons.push("Z:원인불명");
  }
  return reasons;
}

async function main() {
  const patterns = {};
  const detail = [];
  let saved = 0, notFound = 0, errors = 0, explicit = 0;

  for (const t of TARGETS) {
    if (t.id === null) {
      detail.push({ ...t, status: "(없음)", reasons: ["E:Apple Music 부재"] });
      notFound++;
      patterns["E:Apple Music 부재"] = (patterns["E:Apple Music 부재"] ?? 0) + 1;
      continue;
    }

    const apple = await lookup(t.id);
    if (!apple) { errors++; continue; }

    const isExplicit = apple.trackExplicitness === "explicit";
    if (isExplicit) explicit++;

    const reasons = classify(t, apple, t.titleDiff);
    for (const r of reasons) patterns[r] = (patterns[r] ?? 0) + 1;

    detail.push({
      ...t,
      appleSong: apple.trackName,
      appleArtist: apple.artistName,
      duration: Math.round((apple.trackTimeMillis ?? 0) / 1000),
      explicit: isExplicit,
      reasons,
    });

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("itunes_preview_cache")
      .update({
        preview_url: apple.previewUrl ?? null,
        matched_track_name: apple.trackName,
        matched_artist_name: apple.artistName,
        match_score: 100,
        candidates_count: 1,
        status: "manual",
        last_attempted_at: now,
        matched_at: now,
      })
      .eq("track_key", trackKey(t.song, t.artist));
    if (error) errors++;
    else saved++;
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`처리: ${TARGETS.length}곡 / 매칭: ${saved} / 부재: ${notFound} / 19금: ${explicit} / 에러: ${errors}\n`);
  console.log("=== 상세 ===");
  for (const d of detail) {
    if (d.id === null) {
      console.log(`[${d.n}] ${d.song} / ${d.artist} → (없음)`);
      continue;
    }
    const x = d.explicit ? " 🔞" : "";
    console.log(`\n[${d.n}]${x} ${d.song} / ${d.artist}`);
    console.log(`    Apple: ${d.appleSong} / ${d.appleArtist} (${d.duration}초)`);
    console.log(`    원인: ${d.reasons.join(", ")}`);
  }

  console.log("\n=== 패턴 통계 ===");
  for (const [p, c] of Object.entries(patterns).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${p}: ${c}건`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
