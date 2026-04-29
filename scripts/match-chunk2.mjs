// 청크 2 (26~50) manual 매칭 + 패턴 분석
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
  { n: 26, song: "Have I Asked You",                          artist: "THAMA",            id: "1856791014" },
  { n: 27, song: "History",                                   artist: "88rising",         id: "1724856690" },
  { n: 28, song: "Homesick",                                  artist: "Wuuslime",         id: "1791498649" },
  { n: 29, song: "Honesty",                                   artist: "Pink Sweat$",      id: "1674284471" },
  { n: 30, song: "Hope Springs Eternal",                      artist: "Witness",          id: null },
  { n: 31, song: "Hot and Cold",                              artist: "선우정아",          id: "1747798809", titleDiff: true },
  { n: 32, song: "HOW 2 GET",                                 artist: "루피",              id: "1821351991" },
  { n: 33, song: "INDUSTRY (Feat. GEMINI)",                   artist: "BLASÉ",            id: "1835808027" },
  { n: 34, song: "Ivy",                                       artist: "Frank Ocean",      id: "1146195713" },
  { n: 35, song: "Japanese Denim",                            artist: "Daniel Caesar",    id: "1799080619" },
  { n: 36, song: "Just A Little Bit",                         artist: "ENHYPEN",          id: "1587989650", titleDiff: true },
  { n: 37, song: "Killing Me",                                artist: "Omar Apollo",      id: "1615498876" },
  { n: 38, song: "Letters to Jun(E)",                         artist: "Witness",          id: null },
  { n: 39, song: "like i need u",                             artist: "keshi",            id: "1440538859" },
  { n: 40, song: "Love Is Only a Feeling",                    artist: "Joey Bada$$",      id: "1503614103" },
  { n: 41, song: "New Babe",                                  artist: "yawn",             id: "1870216515" },
  { n: 42, song: "No Look",                                   artist: "Shyboiitobii",     id: "1792123052" },
  { n: 43, song: "Oldie",                                     artist: "Odd Future",       id: "504137415"  },
  { n: 44, song: "Phone Numbers",                             artist: "Dominic Fike",     id: "1471407345" },
  { n: 45, song: "Pink Matter",                               artist: "Frank Ocean",      id: "1440766949" },
  { n: 46, song: "POP DAT THANG",                             artist: "DaBaby",           id: "1862402761" },
  { n: 47, song: "Potato Salad",                              artist: "Tyler, The Creator", id: "1437344841" },
  { n: 48, song: "PUBLIC ENEMY",                              artist: "식케이",            id: "1788816720" },
  { n: 49, song: "PUT SOME SWAG ON (feat. 김하온)",            artist: "NOWIMYOUNG",       id: "1843011979" },
  { n: 50, song: "Real Love Still Exists",                    artist: "헨리",              id: "1673191525" },
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

  // feat 안 한영
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

  console.log(`처리: ${TARGETS.length}곡 / 매칭: ${saved} / 부재: ${notFound} / 19금: ${explicit} / 에러: ${errors}\n`);
  console.log("=== 상세 ===");
  for (const d of detail) {
    if (d.id === null) { console.log(`[${d.n}] ${d.song} / ${d.artist} → (없음)`); continue; }
    const x = d.explicit ? " 🔞" : "";
    console.log(`\n[${d.n}]${x} ${d.song} / ${d.artist}`);
    console.log(`    Apple: ${d.appleSong} / ${d.appleArtist} (${d.duration}초)`);
    console.log(`    원인: ${d.reasons.join(", ")}`);
  }

  console.log("\n=== 패턴 통계 (청크 2) ===");
  for (const [p, c] of Object.entries(patterns).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${p}: ${c}건`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
