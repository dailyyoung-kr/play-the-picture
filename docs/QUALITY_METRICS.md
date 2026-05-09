# Quality Metrics — 추천 시스템 진단 지표

> 영구 참조용 박제. 추천 알고리즘 변경 시 효과 측정 + 편향 진단 표준.
> 처음 박제: 2026-05-09 (handoff 5/9 part2 후속)
> 관련: [SESSION_HANDOFF_2026-05-09_part2.md](./SESSION_HANDOFF_2026-05-09_part2.md)

---

## ⚠️ 운영 원칙 (반드시 먼저 읽기)

> **Goodhart's Law**: "When a measure becomes a target, it ceases to be a good measure."

이 metric들은 **KPI/목표값으로 사용하지 말 것**.
- 진짜 KPI는 user 만족 (save_rate, retention, listen_rate)
- 이 metric들은 **알고리즘 변경 시 부작용 감지용 가드레일**로만 사용

❌ 안 좋은 예: "Catalog Coverage 90% 달성을 OKR로 잡자"
→ rnb 사장 곡 강제 노출 → save_rate 하락 → 실제 사용자 경험 악화

✅ 좋은 예: "7일 cycle 도입 후 coverage +14%, save_rate 유지" → 성공
🚨 정정 예: "coverage +20%, save_rate -30%" → 롤백 (다양성 강조가 만족 희생)

---

## 1. Catalog Coverage

### 정의
N일 동안 풀(songs) 전체 중 몇 %가 한 번 이상 추천됐나.

### 의미
- 100%: 모든 곡이 노출 → 다양성 ⭐⭐⭐
- 50%: 풀의 절반 사장
- 30% 미만: 심한 편향, 풀 정리 또는 알고리즘 변경 검토

### 측정 SQL (외부 only, 30일)
```sql
WITH internal AS (
  SELECT unnest(ARRAY[/* INTERNAL 20개 device */]) AS device_id
)
SELECT
  COUNT(DISTINCT song_id) * 100.0 / (SELECT COUNT(*) FROM songs) AS coverage_pct,
  COUNT(DISTINCT song_id) AS unique_songs,
  (SELECT COUNT(*) FROM songs) AS pool_size
FROM recommendation_logs
WHERE created_at > now() - interval '30 days'
  AND device_id NOT IN (SELECT device_id FROM internal);
```

### Baseline (2026-05-09)
- **56.7%** (784 / 1,383곡, 23일 누적)
- → 풀의 43%가 사장 (599곡 한 번도 추천 안 됨)
- → 7일 cycle 도입 후 5/16에 70%+ 기대

---

## 2. Long-tail Share (편향 지표)

### 정의
- **Top 10 share**: 추천 전체의 몇 %가 상위 10곡에 집중되나
- **Top 50 share**: 상위 50곡 점유율
- **Long-tail share**: top 100 외 곡들의 점유율 (= 100 - top100_share)

### 의미
- Top 10 share **5% 이하** = 매우 분산
- Top 10 share **10-15%** = 보통
- Top 10 share **20%+** = 편향 심함 🚨

### 측정 SQL
```sql
WITH internal AS (...),
ranked AS (
  SELECT song_id, COUNT(*) AS cnt,
    ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) AS rn
  FROM recommendation_logs
  WHERE created_at > now() - interval '30 days'
    AND device_id NOT IN (SELECT device_id FROM internal)
  GROUP BY song_id
)
SELECT
  ROUND(SUM(cnt) FILTER (WHERE rn <= 10) * 100.0 / SUM(cnt), 1) AS top10_share_pct,
  ROUND(SUM(cnt) FILTER (WHERE rn <= 50) * 100.0 / SUM(cnt), 1) AS top50_share_pct,
  ROUND(SUM(cnt) FILTER (WHERE rn > 100) * 100.0 / SUM(cnt), 1) AS long_tail_share_pct
FROM ranked;
```

### Baseline (2026-05-09, handoff §4-3)
- Top 10 share: **7.4%**
- Top 50 share: **24%**
- Long-tail share: **62%**
- 단일 곡 max: **22회** (Blue Hour - 투모로우바이투게더, 23일)
- → 7일 cycle 도입 후 Top 10 share 5% 이하 기대

---

## 3. (1주+ 후) Intra-list Diversity

### 정의
한 추천 호출의 후보 50곡이 얼마나 다양한가.

### 측정 가능 시점
candidate_logs 데이터 100+ calls 누적 후 (1주 이상)

### 측정 SQL
```sql
WITH calls AS (
  SELECT cl.device_id, cl.created_at::timestamp(0) AS call_time,
    COUNT(DISTINCT s.genre) AS unique_genres,
    COUNT(DISTINCT s.energy) AS unique_energies,
    COUNT(DISTINCT s.artist) AS unique_artists
  FROM candidate_logs cl
  JOIN songs s ON s.id = cl.song_id
  GROUP BY cl.device_id, cl.created_at::timestamp(0)
)
SELECT
  ROUND(AVG(unique_genres), 2) AS avg_genres_per_call,
  ROUND(AVG(unique_energies), 2) AS avg_energies_per_call,
  ROUND(AVG(unique_artists), 2) AS avg_artists_per_call
FROM calls;
```

### 해석 기준
- **discover 모드**: 6 장르 / 5 에너지 / 30+ 아티스트 = 다양성 좋음
- **단일 장르 모드**: 1 장르 / 3 에너지 / 30+ 아티스트 = 기대치 다름

---

## 4. (1주+ 후) Position Bias

### 정의
Claude가 후보 50곡 중 어느 위치를 자주 선택하나.

### 이상적
- 모든 position 균등 = 1/50 = 2%

### 측정 SQL
```sql
SELECT
  CASE WHEN position <= 5 THEN '01-05'
       WHEN position <= 10 THEN '06-10'
       WHEN position <= 25 THEN '11-25'
       ELSE '26-50' END AS bucket,
  COUNT(*) FILTER (WHERE was_selected) * 100.0 / COUNT(*) AS selection_rate_pct
FROM candidate_logs
GROUP BY 1;
```

### 진단 기준
- 분산 ±50% 초과 시 (예: 01-05 = 5%, 26-50 = 0.5%) → primacy bias 의심
- 후보 ordering 변경 (랜덤 셔플 vs weight 순) 검증 필요

---

## 5. (3개월+) Engagement-weighted Quality Score

### 정의
곡당 (selection rate × engagement rate) — 단순 selection이 아닌 만족 기반.

### 측정 가능 시점
곡당 평균 engagement 5-10회 누적 시 (현재 0.1회)

### 측정 SQL (Bayesian smoothed)
```sql
WITH song_stats AS (
  SELECT s.id, s.song, s.artist,
    COUNT(rl.id) AS recs,
    COUNT(sl.id) AS saves,
    COUNT(ll.id) AS listens
  FROM songs s
  LEFT JOIN recommendation_logs rl ON rl.song_id = s.id
  LEFT JOIN entries e ON e.song = s.song AND e.artist = s.artist
  LEFT JOIN save_logs sl ON sl.entry_id = e.id
  LEFT JOIN listen_logs ll ON ll.entry_id = e.id
  WHERE rl.created_at > now() - interval '30 days'
  GROUP BY s.id, s.song, s.artist
  HAVING COUNT(rl.id) >= 5
)
SELECT
  -- α=5로 cold start 보정 (5번 추천될 때까진 평균에 가깝게 추정)
  ROUND((saves + listens * 0.5 + 1) / (recs + 5)::numeric, 3) AS quality_score
FROM song_stats;
```

---

## 운영 프로세스

### 1. 알고리즘 변경 시 score card 박제
변경 전후 metric 비교를 handoff에 박제:

```markdown
## 변경: 7일 글로벌 가중치 (k=0.10) 도입 (2026-05-09 → 5/16)

| Metric | 변경 전 | 변경 후 | delta | 평가 |
|---|---|---|---|---|
| Coverage (30d) | 56.7% | ?% | ? | |
| Top 10 share | 7.4% | ?% | ? | |
| 단일 곡 max (7d) | 14회 | ?회 | ? | |
| save_rate | 6% (참고) | ?% | ? | KPI |

Verdict: [ship / iterate / rollback]
```

### 2. 매주 monthly check (선택)
- Admin 대시보드에서 "추천 품질" 섹션 확인
- 큰 변동 (top 10 share 20%+ 같은) 발견 시 원인 분석

### 3. Admin 대시보드
`/admin` 페이지의 "📊 추천 품질" 섹션 (2026-05-09 추가)
- 실시간 fetch — `/api/admin/quality-metrics`
- 30일 baseline + 7일 cycle 효과
- 6개 카드 (coverage / top10 / top50 / long-tail / max / one-off)
- 7일 단기 cycle 효과 측정 카드 3개

---

## 향후 추가 검토할 metric

candidate_logs 데이터 누적 후 가능:
- **Novelty**: "사용자가 처음 노출되는 곡" 비율
- **Serendipity**: novelty + engagement (사용자가 모를 만한 좋은 곡)
- **Catalog Gini coefficient**: 추천 분포 불평등 정량
- **Position-weighted NDCG**: 순위 기반 추천 품질

---

## 참고: Spotify처럼 운영했다면 추가했을 metric

- Streaming attribution (추천 → 실제 재생 완료 → playlist 추가)
- L7/L28 retention by acquisition cohort
- Audio feature alignment (사진 색감 → audio mood 매칭 정확도)
- Premium conversion uplift

→ 인디는 Catalog Coverage + Long-tail + Intra-list Diversity 3개로 충분.
→ 자세한 비교: [handoff 5/9 part2 §3 — Spotify 가설 사고 실험](./SESSION_HANDOFF_2026-05-09_part2.md)
