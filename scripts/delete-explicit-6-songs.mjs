// ========================================================================
// Explicit 6곡 일괄 삭제 (entries 영향 0 확인 완료)
//
// 삭제 대상 song_id (사용자 검증):
//   - 911 / Mr. Lonely / Tyler, The Creator
//   - Busy Woman / Sabrina Carpenter
//   - City / 오왼
//   - Ivy / Frank Ocean
//   - Pink Matter / Frank Ocean
//   - with the IE (way up) / 제니
//
// 삭제 순서: recommendation_logs (FK) → itunes_preview_cache → songs
// 실행: node scripts/delete-explicit-6-songs.mjs
// ========================================================================

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

function loadEnv() {
  const c = readFileSync(".env.local", "utf-8");
  for (const line of c.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("="); if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (k && !process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SONG_IDS = [
  "f62e0c41-599a-4cd5-86b0-5476bb943f5f", // 911 / Mr. Lonely / Tyler
  "4812dc59-dc14-48b9-acb6-83c7c1eb994a", // Busy Woman / Sabrina Carpenter
  "01bd1d30-aa4d-4c4c-a898-c279123efe23", // City / 오왼
  "8255ba9d-9c0e-4db7-b5c4-ea9a71ee1a9b", // Ivy / Frank Ocean
  "e0862d1e-9128-4847-805b-17e6e7bce5a8", // Pink Matter / Frank Ocean
  "4f6df8fe-0f09-47c2-93cd-64b50f8874be", // with the IE (way up) / 제니
];

async function main() {
  console.log("[delete] 6곡 explicit 삭제 시작\n");

  // 1. recommendation_logs delete (FK)
  console.log("[1/3] recommendation_logs 삭제...");
  const { count: recDeleted, error: recErr } = await supabase
    .from("recommendation_logs")
    .delete({ count: "exact" })
    .in("song_id", SONG_IDS);
  if (recErr) { console.error("  실패:", recErr.message); process.exit(1); }
  console.log(`  ✅ ${recDeleted}건 삭제`);

  // 2. itunes_preview_cache delete (song+artist 조합)
  console.log("[2/3] itunes_preview_cache 삭제...");
  let cacheDeleted = 0;
  const TARGETS = [
    ["911 / Mr. Lonely","Tyler, The Creator"],
    ["Busy Woman","Sabrina Carpenter"],
    ["City","오왼"],
    ["Ivy","Frank Ocean"],
    ["Pink Matter","Frank Ocean"],
    ["with the IE (way up)","제니"],
  ];
  for (const [song, artist] of TARGETS) {
    const { count, error } = await supabase
      .from("itunes_preview_cache")
      .delete({ count: "exact" })
      .eq("song", song)
      .eq("artist", artist);
    if (error) { console.error(`  ${song} 실패:`, error.message); continue; }
    cacheDeleted += (count ?? 0);
  }
  console.log(`  ✅ ${cacheDeleted}건 삭제`);

  // 3. songs delete
  console.log("[3/3] songs 삭제...");
  const { count: songsDeleted, error: songsErr } = await supabase
    .from("songs")
    .delete({ count: "exact" })
    .in("id", SONG_IDS);
  if (songsErr) { console.error("  실패:", songsErr.message); process.exit(1); }
  console.log(`  ✅ ${songsDeleted}건 삭제`);

  console.log("\n========================================");
  console.log(`완료: recommendation_logs ${recDeleted} / itunes_preview_cache ${cacheDeleted} / songs ${songsDeleted}`);
}

main().catch((e) => { console.error("[delete] 치명 오류:", e); process.exit(1); });
