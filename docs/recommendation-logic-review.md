# Play the Picture — 곡 추천 로직 피드백 요청

## 서비스 개요

사용자가 사진 1~5장을 업로드하면 AI가 사진 분위기를 분석하고 어울리는 노래 1곡을 추천하는 앱.
- 스택: Next.js + Claude API (claude-sonnet-4-6) + Spotify Web API
- 타겟: 20대 한국 사용자

---

## 전체 흐름

```
1. 프론트에서 사진(base64, max 800px JPEG 80%) + 장르/기분/상황 전송
2. Claude API 호출 → 곡 추천 + 전체 UI 데이터 JSON 반환
3. Spotify API로 해당 곡 검증 (track ID 확보)
4. 검증 실패 시 최대 4회 재시도 (매번 다른 프롬프트)
5. 최종 결과 반환
```

---

## 입력값

| 항목 | 값 예시 |
|------|---------|
| photos | base64 이미지 1~5장 (멀티모달) |
| genre | 인디 / 팝 / K-POP / 힙합·R&B / 재즈·어쿠스틱 / 장르 발견하기 |
| mood | 신나 / 설레 / 여유로워 / 복잡해 / 지쳐 |
| listeningStyle | 출근·등교길 / 작업·공부 / 데이트 / 휴식 / 산책·드라이브 / 잠들기 전 |

---

## Claude 프롬프트 (attempt별)

### Attempt 0 — 기본 프롬프트

```
아래 정보를 바탕으로 사진에 가장 잘 어울리는 노래 1곡을 추천하고 결과를 반환해줘.

[타겟 사용자]
20대 한국 사용자. "들어본 것 같은데 제목은 몰랐던" 곡 위주. 완전한 언더그라운드 곡은 지양.

[사진 분석]
업로드된 사진들의 색감, 장소, 분위기, 감정을 분석해서 반영해줘.

[사용자 취향]
- 선호 장르: {genre}
- 현재 기분: {mood}
- 상황: {listeningStyle}

[장르별 추천 방향]
인디 → 한국 인디 중심. 날것의 감성, 덜 알려진 곡도 포함. 한국 곡 위주.
K-POP → 타이틀/수록곡 구분 없이 자유롭게. 잘 알려진 곡과 숨은 명곡 균형있게.
힙합/R&B → 한국 곡 60%, 글로벌 40% 비중으로. 다양한 스타일 자유롭게.
팝 → 인디팝, 드림팝, 얼터너티브팝 등 서브장르 자유롭게. 외국 곡 위주.
재즈/어쿠스틱 → 악기 중심의 잔잔한 곡. 외국 곡 비중 허용.
장르 발견하기 → 인디팝, 드림팝, 시티팝, 네오소울, 얼터너티브, 포스트록, 앰비언트팝, 침머, 로파이 범위 내.
               월간 리스너 100만 이상. 한국 곡 우선으로.

[절대 추천 금지 - 어떤 상황에서도 제외]
- Bloom - The Paper Kites
- 봄날 - BTS
- Bon Iver의 모든 곡 (아티스트 전체 제외)
- 곡 제목에 "Interlude", "Skit", "Intro", "Outro"가 포함된 모든 트랙
- 곡 제목에 "Cherry Blossom"이 포함된 모든 곡 (Spotify KR에 없음)
  봄 관련 대안: 봄봄봄-로이킴, 벚꽃 엔딩-버스커버스커, 봄사랑 벚꽃 말고-에일리,
               봄이 좋냐-하림, 꽃-아이유, Blossom-헤이즈

[공통 조건]
- 반드시 Spotify에 실제 존재하는 곡만 추천
- 곡명과 아티스트명은 Spotify 검색에 최적화된 정확한 영문/한글로
- 오리지널 스튜디오 음원만 (커버/라이브/리믹스 제외)

[응답 형식 - JSON만 반환, 다른 텍스트 없이]
{
  "song": "곡명 - 아티스트명",
  "spotifyQuery": {
    "song": "song 필드와 동일한 곡의 Spotify 검색용 영문 제목. 반드시 같은 곡이어야 함.
             Spotify에 등록된 정확한 곡명 전체 입력 (축약 금지).
             예: 'Goodbye Seoul' (O) / 'Seoul' (X).
             예: song이 '꽃-아이유'면 'Flower' (O) / 'Palette' (X - 다른 곡)",
    "artist": "Spotify에 등록된 정확한 영문 아티스트명.
               예: 혁오→Hyukoh, 아이유→IU, 악동뮤지션→AKMU, 방탄소년단→BTS, 빅뱅→BIGBANG"
  },
  "reason": "2-3문장. 사진에서 오늘의 이야기를 상상해서 짧은 스토리처럼 표현.
             감성적이고 시적인 톤. 마지막 문장은 신비롭거나 위트있게. 존댓말(~요체)",
  "tags": [
    "장르/서브장르 (최대 6자, # 없이)",
    "무드/감정 (최대 6자, # 없이)",
    "상황/시간대 (최대 6자, # 없이)"
  ],
  "emotions": { "행복함": 0~100, "설레임": 0~100, "에너지": 0~100, "특별함": 0~100 },
  "hidden_emotion": "오늘의 숨은 감정 한 줄 (이모지 포함)",
  "emotion_comment": "4개 감정 중 가장 높은 수치 기반 한 줄 코멘트. 존댓말, 20자 이내",
  "vibe_type": "이모지 + 오늘의 나 유형명 (10자 이내, 한글만)",
  "vibe_description": "오늘 상황/감정 20자 이내. 20대 카톡 상태메시지 말투",
  "background": {
    "from": "시작 hex (어두운 톤, 곡 분위기 반영)",
    "to": "끝 hex (어두운 톤, 곡 분위기 반영)"
  },
  "discoveredGenre": "장르 발견하기 선택 시에만 포함. AI가 선택한 장르명 한국어"
}

배경 색상 가이드:
- 잔잔하고 감성적 → from: #0d1a10, to: #1a0d18
- 설레는 곡 → from: #0d1218, to: #1a1408
- 위로 발라드 → from: #1a0d0d, to: #0d0d1a
- 신나는 곡 → from: #1a1208, to: #081a12
반드시 어두운 톤(밝기 10-15% 이하)으로 설정해줘.

---

곡을 추천하기 전에 반드시 아래 검증 과정을 거쳐줘:

STEP 1 - 자가 검증:
추천하려는 곡에 대해 스스로 답해줘:
- 이 곡이 실제로 존재하는가? (확신도 0~100%)
- 아티스트명 정확한 스펠링은?
- 이 곡이 수록된 앨범/싱글 이름은?
확신도가 80% 미만이면 이 곡은 버리고 다른 곡을 선택해.

STEP 2 - 대체 기준:
확신하지 못하는 곡 대신 아래 조건의 곡으로 대체해:
- 해당 아티스트의 대표곡 또는 가장 많이 알려진 곡
- 월간 스트리밍 100만 이상이 확실한 곡
- 앨범 수록곡보다 싱글/타이틀곡 우선

STEP 3 - 최종 출력:
확신하는 곡 1개만 최종 추천해줘.
절대 없는 곡을 만들어내지 마.
모르면 모른다고 하지 말고, 대신 확실히 아는 곡으로 바꿔줘.

예시:
❌ 폴킴의 "나만의 계절" → 없는 곡이므로 버림
✅ 폴킴의 "나만 몰랐던 이야기" → 확실한 곡으로 대체
```

### Attempt 1 — Spotify 검증 1회 실패 후

앞에 아래 prefix 추가:
```
앞서 추천한 곡이 Spotify에 없었어요. 이번엔 반드시:
- 같은 장르 내에서 더 유명한 곡으로
- 월간 리스너 500만 이상의 아티스트
- Spotify에 확실히 존재하는 곡으로 추천해줘
```

### Attempt 2 — Spotify 검증 2회 실패 후

```
앞선 추천 곡들이 Spotify에 없었어요. 이번엔 장르를 완전히 바꿔서 추천해줘.
- 사진 분위기와 100% 일치하지 않아도 돼
- 이전에 추천한 장르와 다른 장르로
- Spotify에 확실히 존재하는 곡만
```

### Attempt 3 — Spotify 검증 3회 실패 후 (마지막)

```
Spotify 검증이 계속 실패하고 있어요. 팝 / K-POP / 힙합 중 하나를 선택해서,
월간 리스너 1000만 이상 아티스트의 확실히 존재하는 곡으로 추천해줘.
```

### 장르 발견하기 전용 (attempt 0에만)

```
[장르 발견하기 주의사항]
월간 리스너 100만 이상 아티스트의 곡만 추천. Spotify에 확실히 존재하는 곡이어야 함.
```

---

## Spotify 검증 로직 (findOnSpotify)

```
검색 URL: /v1/search?q={song} {artist}&type=track&limit=5&market=KR

필터 1 — 오리지널 트랙 필터:
  "live", "cover", "acoustic", "remix", "instrumental", "라이브", "커버",
  "어쿠스틱", "리믹스", "inst", "(from", "ver.", "version" 포함 트랙 제외
  + album_type="compilation" 제외

필터 2 — 아티스트 매칭 (토큰 단위):
  norm(s) = s.toLowerCase().replace(/[^a-z0-9가-힣]/g, "")
  tokenize(s) = 영숫자·한글 각각 분리 후 배열화
  qTokens.every(w => tTokens.includes(w)) || tTokens.every(w => qTokens.includes(w))
  → "crush"→"acrush", "iu"→"iuliafridrik" 오매칭 방지 목적

필터 3 — 곡명 매칭 (substring):
  trackName.includes(querySong) || querySong.includes(trackName)
  ⚠️ 알려진 문제: "seoul"이 "goodbyeseoul"에 포함되는 식의 오매칭 가능

한글 체크 및 표시명 처리:
  hasKorean = /[\u3131-\u318E\uAC00-\uD7A3]/.test(originalSong)
  - hasKorean=true → 원본 song 유지 (Spotify 메타로 덮어쓰기 안 함)
  - hasKorean=false → Spotify trackName으로 덮어쓰기
  ⚠️ 알려진 문제: 한글 포함이면 Spotify가 다른 곡을 반환해도 원본 유지됨
```

---

## 재시도 및 fallback 로직

```
maxAttempts = 4

각 attempt:
  1. Claude API 호출 (withRetry: 529 과부하 시 최대 3회, 3초/6초/9초 딜레이)
  2. JSON 파싱 실패 → continue (lastValidResult 업데이트 안 됨)
  3. JSON 파싱 성공 → lastValidResult = result
  4. Spotify 검증:
     - 성공 → finalResult 설정, break
     - 429  → 즉시 현재 result 반환, break
     - 실패 → continue (마지막 attempt면 finalResult = result)
  5. Spotify 토큰 없음 → 즉시 result 반환

루프 후:
  finalResult가 null이면:
    → lastValidResult 있으면 그걸로 fallback (spotifyTrackId=null)
    → lastValidResult도 없으면 500 에러
```

---

## Claude 응답 JSON 필드별 용도

| 필드 | 추천/UI | 설명 |
|------|---------|------|
| song | 추천 | 곡명 - 아티스트명 (표시 + Spotify 재시도 기준) |
| spotifyQuery | 추천 인프라 | Spotify 검색용 영문 쿼리. 최종 응답에서 제거됨 |
| reason | UI | 2~3문장 감성 추천 이유 |
| tags | UI | 장르/무드/상황 3개 태그 |
| emotions | UI | 행복함/설레임/에너지/특별함 수치 (게이지) |
| hidden_emotion | UI | 숨은 감정 한 줄 |
| emotion_comment | UI | 감정 기반 코멘트 |
| vibe_type | UI | 오늘의 나 유형 |
| vibe_description | UI | 상태메시지 스타일 한 줄 |
| background | UI | 결과 화면 배경 그라데이션 |
| discoveredGenre | UI | 장르 발견하기 선택 시만 사용 |

---

## 알려진 문제 및 현황

### 1. Spotify 검증 실패율 높음 (인디 장르 특히)
- Claude가 실제로 없는 곡을 hallucination으로 추천하는 경우 발생
- 예: "오늘도 맑음 - 볼빨간사춘기", "Your Day - 혁오" (존재하지 않는 곡)
- 4회 모두 실패 시 spotifyTrackId=null로 반환 (플레이어 없음)

### 2. songOk substring 매칭 오매칭
- "Seoul" 검색 → "Goodbye Seoul" 매칭
- trackName.includes(querySong) 방식의 한계

### 3. hasKorean + 다른 곡 매칭
- 한글 포함 곡명이면 Spotify가 다른 곡 ID를 반환해도 원본 표시명 유지
- 예: "꽃 - 아이유" 표시되지만 Spotify ID는 "Palette" 트랙인 케이스 발생 (이후 spotifyQuery 프롬프트 강화로 완화)

### 4. attempt 간 컨텍스트 없음
- 재시도 시 이전에 어떤 곡을 추천했는지 Claude에게 전달 안 됨
- "다른 장르로" 지시해도 Claude가 비슷한 선택을 반복할 수 있음

---

## 피드백 요청 포인트

1. **프롬프트 구조**: 사진 분석 결과가 곡 추천에 더 직접적으로 반영되게 할 방법?
2. **hallucination 감소**: 자가 검증 STEP 1~3 외에 없는 곡 추천을 줄이는 전략?
3. **재시도 전략**: attempt별 프롬프트 변화 방향이 적절한지? 더 나은 escalation 전략?
4. **songOk 검증**: substring 매칭 대신 더 정확한 곡명 검증 방법?
5. **emotions 활용**: 현재 UI 표시용으로만 쓰이는데, 추천 품질 향상에 활용할 방법?
