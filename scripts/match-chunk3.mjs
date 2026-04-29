// 청크 3 (51~72) manual 매칭 + 패턴 분석
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

function loadEnv() {
  const c = readFileSync(".env.local", "utf-8");
  for (const line of c.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("="); if (eq < 0) continue;
    process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
}
loadEnv();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const norm = (s) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/\[.*?\]/g, "").replace(/[^\p{L}\p{N}]/gu, "").trim();
const trackKey = (t, a) => `${norm(t)}|${norm(a)}`;
const hasKr = (s) => /[가-힯ᄀ-ᇿ]/.test(s);
const hasEn = (s) => /[a-zA-Z]/.test(s);

const TARGETS = [
  { n: 51, song: "Rigamortus",                                 artist: "Kendrick Lamar",            id: "1475039123" },
  { n: 52, song: "Rockstar Made",                              artist: "Playboi Carti",             id: "1546163604" },
  { n: 53, song: "S.A.D",                                      artist: "The Volunteers",            id: "1569294607" },
  { n: 54, song: "Secret",                                     artist: "CAMO",                      id: "1851141517" },
  { n: 55, song: "She (Hidden Track No.V 1월 선정곡)",         artist: "잔나비",                    id: "1281470015" },
  { n: 56, song: "Shut Up Remix",                              artist: "쿠기",                      id: "1837063079" },
  { n: 57, song: "skeletons",                                  artist: "keshi",                     id: "1471216560" },
  { n: 58, song: "Super Rich Kids",                            artist: "Frank Ocean",               id: "1440766411" },
  { n: 59, song: "Sweet Boy",                                  artist: "Malcolm Todd",              id: "1703836904" },
  { n: 60, song: "Take on Me",                                 artist: "Kaiak",                     id: "1286697222", titleDiff: false },
  { n: 61, song: "VIRAL",                                      artist: "호미들",                    id: "1880548753" },
  { n: 62, song: "What's Left of You",                         artist: "Chord Overstreet",          id: "1570549201" },
  { n: 63, song: "Wifey",                                      artist: "CAMO",                      id: "1550566278" },
  { n: 64, song: "Wings",                                      artist: "Mac Miller",                id: "1408996248" },
  { n: 65, song: "with the IE (way up)",                       artist: "제니",                      id: "1800387681" },
  { n: 66, song: "You're the Only Good Thing In My Life",      artist: "Cigarettes After Sex",      id: "1476598235" },
  { n: 67, song: "Zombie (feat. DRIP TARKO)",                  artist: "MilliMax",                  id: "1811930258" },
  { n: 68, song: "나쁜 X (Feat. CHANGMO)",                      artist: "Leellamarz",                id: "1713524362" },
  { n: 69, song: "랑데부",                                      artist: "식케이",                    id: "1608513163" },
  { n: 70, song: "밤새 (취향저격 그녀 X 카더가든)",              artist: "카더가든",                  id: "1530345131" },
  { n: 71, song: "사장님 도박은 재미로 하셔야 합니다",          artist: "비비",                      id: "1509892066" },
  { n: 72, song: "산 넘어 산",                                  artist: "ZENE THE ZILLA",            id: "1839877217" },
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

  const nIs = norm(input.song), nAs = norm(apple.trackName ?? "");
  const titleMatch = nIs === nAs || nIs.includes(nAs) || nAs.includes(nIs);

  const nIA = norm(input.artist), nAA = norm(apple.artistName ?? "");
  const inKr = hasKr(input.artist), apKr = hasKr(apple.artistName ?? "");
  const inEn = hasEn(input.artist), apEn = hasEn(apple.artistName ?? "");
  if (nIA !== nAA && !nIA.includes(nAA) && !nAA.includes(nIA)) {
    if ((inKr && !apKr && apEn) || (apKr && !inKr && inEn)) {
      reasons.push("B:아티스트한영표기");
    } else {
      reasons.push("D:아티스트표기변형");
    }
  }
  if (/[{}<>"]/.test(input.song)) reasons.push("G:특수문자포함");

  const inFeat = (input.song.match(/feat\.?\s*([^)]*)/i) || [])[1] || "";
  const apFeat = (apple.trackName?.match(/feat\.?\s*([^)]*)/i) || [])[1] || "";
  if (inFeat && apFeat) {
    const ni = norm(inFeat), na = norm(apFeat);
    if (ni !== na && !ni.includes(na) && !na.includes(ni)) {
      const ik = hasKr(inFeat), ak = hasKr(apFeat);
      if (ik !== ak) reasons.push("H:feat한영표기");
    }
  }

  if (!titleMatch && !titleDiff) reasons.push("D:곡명표기변형");
  if (apple.trackExplicitness === "explicit") reasons.push("X:19금");

  if (reasons.length === 0 || (reasons.length === 1 && reasons[0] === "X:19금")) {
    reasons.push("Z:원인불명(아마 19금 검색차단)");
  }
  return reasons;
}

async function main() {
  const patterns = {}; const detail = [];
  let saved = 0, errors = 0, explicit = 0;

  for (const t of TARGETS) {
    const apple = await lookup(t.id);
    if (!apple) { errors++; continue; }
    const isX = apple.trackExplicitness === "explicit";
    if (isX) explicit++;
    const reasons = classify(t, apple, t.titleDiff);
    for (const r of reasons) patterns[r] = (patterns[r] ?? 0) + 1;
    detail.push({
      ...t,
      appleSong: apple.trackName,
      appleArtist: apple.artistName,
      duration: Math.round((apple.trackTimeMillis ?? 0) / 1000),
      explicit: isX,
      reasons,
    });
    const now = new Date().toISOString();
    const { error } = await sb
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
    if (error) errors++; else saved++;
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`처리: ${TARGETS.length}곡 / 매칭: ${saved} / 19금: ${explicit} / 에러: ${errors}\n`);
  console.log("=== 상세 ===");
  for (const d of detail) {
    const x = d.explicit ? " 🔞" : "";
    console.log(`\n[${d.n}]${x} ${d.song} / ${d.artist}`);
    console.log(`    Apple: ${d.appleSong} / ${d.appleArtist} (${d.duration}초)`);
    console.log(`    원인: ${d.reasons.join(", ")}`);
  }
  console.log("\n=== 패턴 통계 (청크 3) ===");
  for (const [p, c] of Object.entries(patterns).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${p}: ${c}건`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
