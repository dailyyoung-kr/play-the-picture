# UI/UX 실험 박제 — 2026-05-13: Pikter 마스코트 + SETLOG 스타일 랜딩

> **목적**: 캐릭터 마스코트(픽터) + Charlie/SETLOG 스타일 랜딩 UX 도입 실험. 로컬에서 테스트하고 미적용 상태로 박제.
>
> **현재 상태**: 로컬 변경만 있음 (uncommitted). Production은 영향 없음.

---

## 1. 한 줄 요약

랜딩 페이지를 **다크/액션 중심** → **라벤더/캐릭터 중심**으로 전면 리브랜딩 시도. 픽터 픽셀 마스코트 + 말풍선 + 바텀시트 모달 + 2단계 안내. 평가 후 conversion 우려로 production 미적용 결정.

---

## 2. 실험한 변경 사항 (총괄)

### 2-1. 신규 자산
| 경로 | 설명 |
|---|---|
| `public/characters/pikter/welcome.png` | 픽터 인사 자세 (랜딩 hero용) |
| `public/characters/pikter/analyzing.png` | 돋보기 + 윙크 (분석 단계 1) |
| `public/characters/pikter/music-picking.png` | 헤드폰 + 음표 (분석 단계 2) |
| `public/characters/pikter/found.png` | 카드 + 하트 (결과 도출) |
| `public/characters/pikter/embarrassed.png` | 멋쩍음 (에러 UX) |
| `public/characters/pikter/sleepy.png` | 졸림 (빈 상태) |
| `public/characters/pikter/surprised.png` | 놀람 (새 vibe 발견) |
| `public/characters/pikter/celebrate.png` | 응원 (축하·streak) |
| `public/branding/play-the-picture-logo-one-line.png` | 가로형 로고 (1024×256, 투명 배경) |

**생성 방식**: ChatGPT Pro로 픽셀 아트 캐릭터 8자세 생성 → Python(PIL)로 배경 투명 처리(flood fill 4 corners) → public 폴더 배치. 자세한 프롬프트는 §6 참고.

### 2-2. 코드 변경

#### `src/app/layout.tsx`
- **추가**: `Gaegu` 폰트 import (`next/font/google`)
- **변수**: `--font-gaegu` (weight 400, 700)
- **html className**: `${gaegu.variable}` 추가
- **용도**: 헤드라인 또는 말풍선용 한국 손글씨체

#### `src/app/globals.css`
- **추가 클래스**:
  - `.pixel-art` — 픽셀 이미지 렌더링 (`image-rendering: pixelated`)
  - `.font-pixel` — Galmuri11 (jsdelivr CDN) 픽셀 한글체 (테스트 후 미사용)
  - `.font-handwritten` — Gaegu 손글씨체 (`var(--font-gaegu)`)

#### `src/app/page.tsx` (메인 랜딩 — 가장 많이 변경)
324 lines 변경. 핵심:

1. **테마 변경** (다크 → 라벤더):
   - 배경: `linear-gradient(180deg, #c5beda 0%, #b3acd2 45%, #c8c0e0 100%)`
   - 텍스트 컬러: `#fff` → `#2e2547` (deep purple)
   - 포인트 컬러: `#C4687A` → `#5D4F8C` (deep purple)
   - 업로드 박스 bg: 흰색 4% → 화이트 50% (반투명 카드)
   - 하단 탭: 검정 45% → 화이트 70%

2. **로고 교체** (텍스트 → 이미지):
   - "Play the Picture" 텍스트 → `<img src="/branding/play-the-picture-logo-one-line.png" height={48}>`

3. **헤드라인**:
   - "오늘 찍은 사진에 어떤 노래가 어울릴까?" → "사진에 딱 맞는 노래를 골라줄게!"
   - fontSize 26 → 22, 가운데 정렬, 색상 deep purple

4. **픽터 마스코트** (메인 hero):
   - 위치: 헤드라인과 안내 스텝 사이
   - 크기: 320×320 (pixel-art rendering)
   - 사진 추가 시 우상단 카운트 배지 (`X / 5`, 보더 화이트 60%, 그림자)
   - Pikter 위치: top: 60, right: 36 (캐릭터 우상단 가까이)

5. **말풍선** (픽터 대화체):
   - 위치: 픽터 바로 아래 (`marginTop: -70` 으로 픽터 발 가까이)
   - 스타일: 반투명 화이트 40% + backdrop-filter blur(8px) + 라벤더 보더
   - 꼬리: CSS 삼각형 (외곽 8px + 내부 7px, border-color + bg-color 매칭)
   - 폰트: **Gaegu Bold 14px** (font-handwritten 클래스)
   - 텍스트 동적 변경:
     - 0장: "오늘 사진을 기다리는 중..."
     - 1~4장: "좋아, 더 보여줘!"
     - 5장: "이제 음악 찾아볼까?"

6. **+ 버튼** (사진 추가 트리거):
   - 위치: 말풍선 아래, 안내 스텝 위
   - 스타일: 라운드 사각형 (border-radius 14px), 반투명 (rgba 10%), 1px 보더
   - 크기: padding 8×22, fontSize 22
   - 동작: `setShowUploadSheet(true)` — 바텀 시트 모달 오픈

7. **안내 스텝** (2단계 온보딩):
   - 가운데 정렬 블록 (max-width 320px)
   - Step 1: 번호 원 + "위의 [+] 버튼으로 사진을 추가해주세요" + "최대 5장 · 노래 추천에만 사용돼요"
   - Step 2: 번호 원 + "아래 [노래 찾으러 가기] 버튼을 눌러주세요" + "픽터가 분위기를 읽고 딱 맞는 한 곡을 골라드려요"
   - 번호 원: 22×22, deep purple bg, 흰색 텍스트, flex-start gap-2.5 (좌측 인라인)

8. **메인 CTA** (노래 찾으러 가기):
   - 표시 조건: `photos.length > 0 && !showUploadSheet` (사진 있고 모달 닫혔을 때만)
   - 사진 없으면 **완전 숨김** (disabled 회색이 아니라 렌더링 자체 X)
   - 동작: `handleNext()` → `/preference` 이동

9. **바텀 시트 모달** (사진 업로드 UI):
   - `showUploadSheet` state로 토글
   - 백드롭 (rgba 50%) + 흰색 시트 (radius 20px 20px 0 0)
   - 핸들 바, "사진 추가" 타이틀, ✕ 닫기 버튼
   - 사진 슬롯 그리드 (가로 스크롤, 100×124px 슬롯)
   - 헬퍼 텍스트 ("최대 5장…")
   - CTA "사진 추가하기" (0장) / "사진 추가 완료" (1장+, 클릭 시 모달 닫기만 함, navigate X)

10. **제거된 요소**:
    - 페이지네이션 도트 (3단 점 표시)
    - 헤더 우상단 + 버튼 (B안 1차 시도 후 메인 본문으로 이동)
    - 사진 슬롯 메인 직접 노출 (모달로 이동)
    - 기존 "다음 →" CTA (메인에 직접 노출)

### 2-3. 컬러 팔레트 변천사
| 시도 | hex | 평가 |
|---|---|---|
| 원본 | `#C4687A` | 무톤 로즈핑크·소프트 |
| 1차 | `#ee3358` | 비비드 핑크레드 |
| 2차 | `#FF0457` | 네온·형광 핑크 |
| 다크 테마 최종 | `#DE2A60` | 균형 잡힌 딥 핑크 (production candidate) |
| **라벤더 테마 최종** | **`#5D4F8C`** | **Slate Blue 딥 퍼플 (실험 최종)** |

### 2-4. 폰트 실험
| 폰트 | 사용 시도 | 최종 |
|---|---|---|
| Galmuri11 (픽셀체) | 전체 텍스트 적용 후 제거 | 사용 안 함 |
| Hi Melody (손글씨) | 헤드라인 시도 | CSS @import 위치 문제로 교체 |
| **Gaegu (손글씨)** | next/font/google 로드, 헤드라인 시도 후 **말풍선만 적용** | **말풍선 only** |
| Noto Sans KR | body 기본값 | 나머지 텍스트 유지 |

---

## 3. UX 흐름 비교

### Production (현재 운영)
```
[랜딩]
  ↓
사진 슬롯·CTA 즉시 노출 (2 tap → 분석)
  ↓
"사진 추가하기" 클릭 → 파일 피커
  ↓
"다음 →" 클릭 → /preference
```

### 실험 (테스트 버전)
```
[랜딩 — 라벤더 + 픽터 hero + 말풍선]
  ↓
+ 버튼 클릭 (5 tap → 분석)
  ↓
[바텀시트 모달 슬라이드 업]
  ↓
사진 슬롯에서 추가
  ↓
"사진 추가 완료" 클릭 → 모달 닫힘 (랜딩 복귀)
  ↓
[랜딩 — 픽터 카운트 배지 X/5 표시, "노래 찾으러 가기" 버튼 활성화]
  ↓
"노래 찾으러 가기" 클릭 → /preference
```

---

## 4. 평가 결과 (요약)

### 강점 (테스트 버전)
- ✅ 브랜드 정체성 강함 (픽터 캐릭터 hero)
- ✅ 차별화 (음악 앱 카테고리에서 unique)
- ✅ 18-24 여성 인스타 트렌드 매칭 (라벤더·doodle·소프트걸)
- ✅ 공유·캡처 가치 ↑
- ✅ 친근감·페르소나

### 약점 (테스트 버전)
- ❌ 2 tap → 5 tap 마찰 증가 (conversion 우려)
- ❌ AI 음악 앱 정체성 약화 (MBTI/다이어리 앱처럼 보임)
- ❌ 헤드라인 ↔ 액션 직접 연결 단절
- ❌ 첫 진입 시 "뭐 하는 앱?" 인식 늦음
- ❌ 결과·공유 페이지와 톤 불일치 (랜딩만 라벤더, 나머지 다크)

### 최종 결정
**production 미적용** — conversion·service identity 측면에서 현재 production이 더 강함.
픽터·라벤더는 **부분 도입(하이브리드)**으로 향후 검토 권장.

---

## 5. 재도입 가이드

### 5-1. 전체 그대로 다시 적용하려면
```bash
# 픽터·로고 자산은 이미 public 폴더에 있음 (untracked)
# 코드만 다시 작성하면 됨

# 1) 이 문서 §2 참고해서 page.tsx·globals.css·layout.tsx 수정
# 2) 또는 git stash에서 복원 (만약 stash 해뒀다면)
```

### 5-2. 권장: 하이브리드로 부분 도입
production 다크 테마 베이스에 픽터만 살리는 방식:

1. **layout.tsx**: Gaegu 폰트 추가 (`--font-gaegu` 변수)
2. **globals.css**: `.pixel-art`, `.font-handwritten` 클래스만 추가
3. **page.tsx**: 다크 테마 유지, 픽터 100~140px 작게 헤드라인 위/옆 배치
4. **preference/page.tsx**: 분석 로딩 단계별 픽터 추가 (가장 큰 ROI 영역)
5. **결과 카드 (result/page.tsx)**: 픽터 워터마크 코너 배치
6. **공유 카드 (생성기)**: 픽터 워터마크 → 인스타 자산 강화

### 5-3. 자산 재생성 가이드 (픽터 변형 추가)

ChatGPT 프롬프트 (참고 이미지: Charlie + Junimo + 기존 픽터 8자세 첨부):

```
[참고 이미지 첨부]

이전에 만든 픽터 캐릭터의 [원하는 자세] 변형 1장.

[가장 중요 — 진짜 픽셀아트 퀄리티]
- TRUE 64x64 pixel sprite → 1024x1024 nearest-neighbor 업스케일
- 절대 NO 안티앨리어싱, NO smooth edges
- 모든 라인이 단일 픽셀 두께 (1px 또는 2px)
- 대각선은 명확한 픽셀 계단(staircase)
- 한 픽셀에 한 색만

[캐릭터 정체성 유지]
- 형태: 삼각형(플레이 버튼) 몸체
- 라인 두께 2px 일관
- 눈: 작은 점 2개 (1~2px)
- 미소: 작은 ω 또는 v 모양 (3~4px)
- 블러시: 양 볼 분홍 작은 픽셀 (2~3px)
- 친근하고 귀여운 마스코트 (intense/scary X)
- Junimo 얼굴 디테일 정밀도 참고

[자세 디테일]
- (예: 손 흔들기 + 카메라 / 돋보기 + 윙크 / 헤드폰 + 음표)

[컬러]
- 외곽선: #1a1a1a
- 내부 fill: 흰색
- 블러시·sparkle·하트 등: 분홍 #DE2A60 또는 #F4C2C2

[배경]
- transparent (체크무늬·흰색·다른 색 절대 X)

[금지]
- NO 안티앨리어싱
- NO 회색 그라디언트
- NO 3D 렌더링
- NO 큰 눈/와이드 입 (kawaii 톤만)
```

후처리 (배경 투명 처리):
```bash
# python3 + Pillow로 flood fill 4 corners
python3 << 'EOF'
from PIL import Image, ImageDraw
img = Image.open("input.png").convert('RGBA')
for seed in [(0,0), (img.width-1,0), (0,img.height-1), (img.width-1,img.height-1)]:
    ImageDraw.floodfill(img, seed, (0,0,0,0), thresh=30)
img.save("public/characters/pikter/[name].png", 'PNG')
EOF
```

### 5-4. 라벤더 팔레트 (재사용)
```css
/* 배경 그라데이션 */
linear-gradient(180deg, #c5beda 0%, #b3acd2 45%, #c8c0e0 100%)

/* 텍스트 */
헤드라인·섹션 타이틀: #2e2547
부제목: rgba(46,37,71,0.7)
헬퍼: rgba(46,37,71,0.55)

/* 포인트 */
CTA·배지·헤더: #5D4F8C
링크: rgba(93,79,140,0.8)

/* 카드 */
업로드 박스 bg: rgba(255,255,255,0.5)
업로드 박스 보더: rgba(93,79,140,0.4)

/* 페이지네이션·하단 탭 */
도트 active: #2e2547
도트 inactive: rgba(46,37,71,0.25)
탭 bg: rgba(255,255,255,0.7)
탭 보더: rgba(46,37,71,0.12)
```

### 5-5. 핑크 팔레트 (다크 테마 production 후보)
```css
/* 포인트 컬러 */
#DE2A60 (rgba 222,42,96) — Material Pink 700 근처, 균형 잡힌 비비드
```

---

## 6. 학습된 인사이트 (다음 라운드 위한 박제)

### UX
1. **SETLOG 스타일은 매일 케어 앱에 최적** — 플더픽처럼 1회성 분석·공유 앱엔 마찰 비용이 큼
2. **광고 콜드 트래픽 conversion = 즉시성** — 헤드라인 → 액션 직접 연결이 결정적
3. **vibeType 카드 = 진짜 viral 자산** — 랜딩보다 결과·공유 화면이 핵심
4. **2 tap → 5 tap 마찰 증가의 비용** — UX 변경 시 step count 반드시 추적

### Visual
1. **흰 fill + 검정 outline 픽셀 캐릭터가 다크 배경에서 글로우 효과** — 시그니처 인상
2. **포인트 컬러 outline만 + 검정 내부는 픽셀 퀄리티가 매우 중요해짐** — 거친 라인 노출
3. **라벤더는 음악 앱 카테고리에서 차별화 강함** — but AI 신뢰감 trade-off
4. **꼬리 처리는 CSS triangle (두 개 겹침) > 회전 사각형** — 깔끔하고 깨끗

### 폰트
1. **CSS `@import` URL은 모든 다른 규칙 앞에 와야 함** — PostCSS가 tailwindcss expand 후 다른 규칙이 앞에 와서 빌드 에러
2. **next/font/google 사용이 정답** — 빌드 타임 최적화 + 자동 self-host
3. **손글씨 폰트는 Gaegu가 한국어 톤 매칭 가장 좋음** — Hi Melody는 가독성 약함

### 캐릭터 자산
1. **ChatGPT 픽셀아트는 사이즈가 곧 퀄리티** — 큰 사이즈에서 거친 라인 노출. Aseprite·픽셀 전용 도구 cleanup 필요
2. **Junimo 같은 검증된 픽셀 캐릭터를 reference로 첨부 시 퀄리티 ↑**
3. **AI 생성 → Python flood fill로 배경 투명 처리** 워크플로우 안정적
4. **흰색 fill 100% 제거 요청해도 AI가 살짝 남김** — Pillow에서 후처리 필요할 수도

---

## 7. 변경된 코드 git 상태

### 변경된 파일 (uncommitted, 로컬 only)
```
src/app/page.tsx       (+288 lines, -74)  ← 가장 큰 변경
src/app/globals.css    (+28 lines)
src/app/layout.tsx     (+10 lines, modified)
```

### Untracked (신규 자산·폴더)
```
public/characters/pikter/  ← 8자세 PNG
public/branding/           ← logo
```

### Production state (롤백 시점)
- `b92c6be` revert(share): Kakao SDK Share 도입 전체 롤백
- prompt 변경 (vibeType 가이드)은 `a2e49a6`로 이미 production 배포됨 (영향 없음)

---

## 8. 롤백 명령어 (즉시 production 복귀)

```bash
# 코드 변경 롤백
git checkout src/app/page.tsx src/app/globals.css src/app/layout.tsx

# 자산은 유지 (다음 도입을 위해)
# 만약 자산도 지우고 싶으면:
# rm -rf public/characters/ public/branding/
```

---

## 9. 다음 액션 권장 (우선순위)

1. **이 문서로 박제 완료** — 언제든 재현 가능
2. **production 롤백** — `git checkout` 으로 코드 원복 (자산은 public/에 유지)
3. **하이브리드 부분 도입 검토**:
   - 1순위: 분석 로딩 화면에 픽터 단계별 (preference/page.tsx)
   - 2순위: 결과 카드 코너에 픽터 워터마크 (result/page.tsx)
   - 3순위: 공유 카드 생성기에 픽터 (인스타 자산)
   - 4순위: 랜딩에 작은 픽터 추가 (140px, 헤드라인 위)
4. **A/B 테스트 설계** (전면 도입 시) — conversion·공유율·이탈률 추적

---

## 끝

이 문서로 모든 실험 내용이 박제됨. 필요할 때 재현 또는 부분 도입 가능.
