import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminRequest } from "@/lib/admin-auth";

// INTERNAL device 21개 — 운영자 본인 테스트 박제 (handoff 5/9 part1 §13)
// 5/11: 65ce15ca 추가 (Stop The Rain 추천 케이스 — 새 device 발견)
const INTERNAL_DEVICES = [
  'c9a5ac48-842b-450c-9f55-843f9aad09d7','ffbfb9b2-d60a-43a3-899d-51185fad652e',
  'd49b33dc-698b-4ebf-9c92-11fae75af78f','f39f816f-6e76-4e19-8369-81df4349ef67',
  '4d0071d7-8f52-4564-b307-be03636bf853','63f7de85-aa41-47fa-857e-a81f1447a658',
  'f33fc09e-01f0-4abf-8edd-208d37c4bd7a','98e71f2a-e4ce-4296-9fec-b0f9a7af3d2f',
  '25a4f774-d724-4769-9897-4ab140a106ee','d3d80439-c519-486a-840a-563d18c86696',
  '15cc7b32-6089-4f2c-ac2f-fb5837b59453','c1904437-bf02-4970-9431-7361a0031ba8',
  '93038bf5-225f-4e22-8657-eaaa9ff304eb','c59476c5-46e5-4bce-a8c0-21f2e3c4359f',
  '3093e413-489b-485c-8ca2-d4caa9385f96','fca75eda-9f0a-44dc-855a-81038a2ebc2b',
  '90ad0567-e04b-4a7b-99a4-9353c592dd6f','01c77837-2095-4953-bd89-5126a98c4f2d',
  '2d181638-aa4a-4969-9b50-591bce879243','183e91c4-96af-4518-8e40-7bc4412e5a4c',
  '65ce15ca-7fde-40ad-b4c6-9de073f42a5d'
];

// ── 추천 품질 metric 5개 (외부 only) ──
// 1. Catalog Coverage: 풀의 몇 %가 N일 동안 추천됐나
// 2. Long-tail share: top 10/50 곡 점유율 (편향 진단)
// 3. (1주+ 후) Intra-list Diversity, Position bias, Quality score
//
// ⚠️ Goodhart's Law: 이 metric들을 KPI로 설정하지 말 것.
// 변경 효과 측정·편향 진단용 가드레일로만 사용.
// 진짜 KPI는 user 만족 (save_rate, retention).

export async function GET(req: NextRequest) {
  if (!verifyAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(url, serviceKey ?? anonKey);

  // 기간 파라미터 (기본: 최근 30일)
  const days = Number(new URL(req.url).searchParams.get("days") ?? 30);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // ── 1. 풀 크기 (songs total) ──
  const { count: poolSize } = await supabase
    .from("songs")
    .select("*", { count: "exact", head: true });

  // ── 2. recommendation_logs (외부 only, N일) ──
  const { data: recsData } = await supabase
    .from("recommendation_logs")
    .select("song_id")
    .gte("created_at", since)
    .not("device_id", "in", `(${INTERNAL_DEVICES.map(d => `"${d}"`).join(",")})`);

  const totalRecs = recsData?.length ?? 0;

  // 곡별 카운트
  const songCounts = new Map<string, number>();
  for (const row of (recsData ?? []) as { song_id: string }[]) {
    if (row.song_id) songCounts.set(row.song_id, (songCounts.get(row.song_id) ?? 0) + 1);
  }
  const uniqueSongs = songCounts.size;

  // ── Metric 1: Catalog Coverage ──
  const coveragePct = poolSize ? (uniqueSongs * 100) / poolSize : 0;

  // ── Metric 2: Long-tail share ──
  const sortedCounts = [...songCounts.values()].sort((a, b) => b - a);
  const top10Sum = sortedCounts.slice(0, 10).reduce((s, c) => s + c, 0);
  const top50Sum = sortedCounts.slice(0, 50).reduce((s, c) => s + c, 0);
  const top100Sum = sortedCounts.slice(0, 100).reduce((s, c) => s + c, 0);
  const top10Share = totalRecs ? (top10Sum * 100) / totalRecs : 0;
  const top50Share = totalRecs ? (top50Sum * 100) / totalRecs : 0;
  const longTailShare = totalRecs ? ((totalRecs - top100Sum) * 100) / totalRecs : 0;

  // ── 추가 진단: 단일 곡 max + 1회만 추천된 곡 수 ──
  const maxSingleSong = sortedCounts[0] ?? 0;
  const oneOffSongs = sortedCounts.filter(c => c === 1).length;
  const oneOffPct = uniqueSongs ? (oneOffSongs * 100) / uniqueSongs : 0;

  // ── 추가: 7일 단기 metric (cycle 효과 빠른 측정) ──
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recs7d } = await supabase
    .from("recommendation_logs")
    .select("song_id")
    .gte("created_at", since7d)
    .not("device_id", "in", `(${INTERNAL_DEVICES.map(d => `"${d}"`).join(",")})`);

  const recs7dTotal = recs7d?.length ?? 0;
  const songCounts7d = new Map<string, number>();
  for (const row of (recs7d ?? []) as { song_id: string }[]) {
    if (row.song_id) songCounts7d.set(row.song_id, (songCounts7d.get(row.song_id) ?? 0) + 1);
  }
  const sortedCounts7d = [...songCounts7d.values()].sort((a, b) => b - a);
  const max7d = sortedCounts7d[0] ?? 0;
  const top10Sum7d = sortedCounts7d.slice(0, 10).reduce((s, c) => s + c, 0);
  const top10Share7d = recs7dTotal ? (top10Sum7d * 100) / recs7dTotal : 0;

  return NextResponse.json({
    period_days: days,
    pool_size: poolSize ?? 0,
    period_30d: {
      total_recs: totalRecs,
      unique_songs_recommended: uniqueSongs,
      coverage_pct: Number(coveragePct.toFixed(1)),
      top10_share_pct: Number(top10Share.toFixed(1)),
      top50_share_pct: Number(top50Share.toFixed(1)),
      long_tail_share_pct: Number(longTailShare.toFixed(1)),
      max_single_song: maxSingleSong,
      one_off_songs: oneOffSongs,
      one_off_pct: Number(oneOffPct.toFixed(1)),
    },
    period_7d: {
      total_recs: recs7dTotal,
      unique_songs_recommended: songCounts7d.size,
      max_single_song: max7d,
      top10_share_pct: Number(top10Share7d.toFixed(1)),
    },
  });
}
