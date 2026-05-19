import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보 처리방침 — 플더픽",
  description: "플더픽의 개인정보 처리방침",
};

// 한국 PIPA 2025.4.21 작성지침 + 2026.3 개정 + App Store 5.1.1/5.1.2 준수
// 시행일: 2026-05-18 (5/18 개정 — 사용자 액션 표현을 실제 앱 버튼명과 동기화)

export default function PrivacyPage() {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: "linear-gradient(180deg, #c5beda 0%, #b3acd2 45%, #c8c0e0 100%)",
        color: "#2e2547",
      }}
    >
      {/* 상단 헤더 */}
      <div
        style={{
          paddingTop: 60,
          paddingBottom: 24,
          paddingLeft: 20,
          paddingRight: 20,
          borderBottom: "0.5px solid rgba(46,37,71,0.12)",
        }}
      >
        <Link
          href="/"
          style={{
            fontSize: 13,
            color: "#5D4F8C",
            textDecoration: "none",
            display: "inline-block",
            marginBottom: 12,
          }}
        >
          ← 돌아가기
        </Link>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: "#2e2547",
            letterSpacing: -0.5,
            marginBottom: 6,
          }}
        >
          개인정보 처리방침
        </h1>
        <p style={{ fontSize: 12, color: "rgba(46,37,71,0.5)" }}>
          시행일자: 2026년 5월 18일
        </p>
      </div>

      {/* 본문 */}
      <div
        style={{
          flex: 1,
          padding: "32px 20px 60px",
          maxWidth: 720,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <p
          style={{
            fontSize: 13,
            color: "rgba(46,37,71,0.75)",
            lineHeight: 1.8,
            marginBottom: 32,
          }}
        >
          플더픽(Play the Picture, 이하 &quot;서비스&quot;)은 「개인정보 보호법」에 따라
          정보주체의 개인정보를 보호하고 권익을 신속하게 처리하기 위해
          본 개인정보 처리방침을 수립·공개합니다.
        </p>

        <Section title="1. 수집하는 개인정보">
          <p style={{ marginBottom: 8 }}>
            서비스 이용 형태에 따라 다음 정보를 수집합니다.
          </p>
          <List
            items={[
              "사진: 분석에만 사용되며 서버에 저장되지 않습니다 (사용자가 '아카이브 보관', '결과 공유하기', '스토리용 이미지' 중 하나를 선택한 경우에만 저장)",
              "익명 기기 식별자: 사용자 구분을 위한 임의 ID (개인을 직접 식별하지 않음)",
              "서비스 이용 기록: 분석 요청, 추천 결과, 클릭 이벤트 등",
              "선호 정보: 장르·분위기 등 사용자가 선택한 항목",
              "가입 정보 (OAuth 가입 시): Google·Apple·카카오 계정에서 받는 이메일·닉네임·프로필 사진·회원번호 (제공자 측 동의 항목에 따름)",
            ]}
          />
          <p style={{ marginTop: 12, fontSize: 12, color: "rgba(46,37,71,0.55)" }}>
            ※ 전화번호·실명·주소·금융정보는 수집하지 않습니다. 가입 정보는 사용자가 OAuth
            제공자에서 동의한 항목에 한해 받으며, 비회원으로 이용 시에는 익명 기기 식별자만
            사용됩니다.
          </p>
        </Section>

        <Section title="2. 이용 목적">
          <List
            items={[
              "AI 기반 음악 추천 서비스 제공",
              "회원 가입·로그인·계정 관리 (OAuth 가입자에 한함)",
              "서비스 품질 개선 및 통계 분석",
              "결과 공유 카드 또는 스토리용 이미지 생성 (사용자가 직접 요청한 경우)",
            ]}
          />
        </Section>

        <Section title="3. 보유 기간">
          <List
            items={[
              "사진: 분석 직후 삭제 ('아카이브 보관'·'결과 공유하기'·'스토리용 이미지' 선택 시에만 저장, 아카이브의 '기록 삭제하기'로 즉시 삭제 가능)",
              "익명 기기 식별자·이용 기록: 서비스 운영 기간 동안 보관",
              "회원 가입 정보(OAuth): 회원 자격 유지 기간 동안 보관, 탈퇴 시 즉시 파기 (법령상 보존 의무 있는 경우 해당 기간 동안 보관)",
              "삭제 요청 시: 즉시 영구 삭제",
            ]}
          />
        </Section>

        <Section title="4. 제3자 제공 및 위탁">
          <p>
            서비스는 개인정보를 제3자에게 별도로 제공하지 않습니다. 다만, 서비스 운영을
            위해 아래 영역에서 외부 사업자의 도움을 받습니다.
          </p>
          <List
            items={[
              "AI 분석: Anthropic (사진은 7일 이내 자동 삭제, 모델 학습에 사용되지 않음)",
              "클라우드 인프라: Vercel, Supabase (국제 보안 인증 보유)",
              "OAuth 인증: Google, Apple, Kakao (가입 시 회원 동의에 따라 계정 정보 일부를 제공받음)",
              "음악 정보 검색: Spotify, YouTube",
              "서비스 통계: Google Analytics, Meta",
            ]}
          />
        </Section>

        <Section title="5. 정보주체의 권리">
          <p>언제든지 다음 권리를 행사할 수 있습니다.</p>
          <List
            items={[
              "수집된 정보의 열람·정정·삭제 요청",
              "처리 정지 요청",
              "앱 내 아카이브의 '기록 삭제하기' 기능으로 즉시 삭제",
            ]}
          />
          <p style={{ marginTop: 12, fontSize: 12, color: "rgba(46,37,71,0.55)" }}>
            요청은 아래 보호책임자 연락처로 보내주시면 지체 없이 조치합니다.
          </p>
        </Section>

        <Section title="6. 안전성 확보 조치">
          <p>
            전송·저장 데이터 암호화, 접근 권한 분리, 보안 인증을 받은 서버 이용 등
            관련 법령에서 정한 안전성 확보 조치를 적용합니다.
          </p>
        </Section>

        <Section title="7. 자동 수집 정보의 거부">
          <p>
            서비스는 익명 기기 식별자와 일부 통계 쿠키를 사용합니다. 다음 방법으로
            거부할 수 있습니다.
          </p>
          <List
            items={[
              "앱 데이터·브라우저 데이터 삭제로 식별자 초기화",
              "브라우저 설정에서 쿠키 차단",
            ]}
          />
        </Section>

        <Section title="8. 만 14세 미만 아동">
          <p>
            본 서비스는 만 14세 이상의 사용자를 대상으로 합니다. 만 14세 미만
            아동의 개인정보가 수집된 사실을 인지하는 즉시 해당 정보를 삭제합니다.
          </p>
        </Section>

        <Section title="9. 개인정보 보호책임자 및 회사 정보">
          <div
            style={{
              background: "rgba(255,255,255,0.5)",
              border: "1px solid rgba(93,79,140,0.18)",
              borderRadius: 12,
              padding: "16px 18px",
              marginTop: 8,
            }}
          >
            <p style={{ fontWeight: 500, marginBottom: 6 }}>
              개인정보 보호책임자
            </p>
            <p style={{ fontSize: 13, color: "rgba(46,37,71,0.75)", lineHeight: 1.9 }}>
              · 이름: 박찬영
              <br />· 이메일:{" "}
              <a
                href="mailto:dailyyoung@linareen.com"
                style={{ color: "#5D4F8C", textDecoration: "none" }}
              >
                dailyyoung@linareen.com
              </a>
            </p>
            <p style={{ fontWeight: 500, marginBottom: 6, marginTop: 14 }}>회사 정보</p>
            <p style={{ fontSize: 13, color: "rgba(46,37,71,0.75)", lineHeight: 1.9 }}>
              · 상호: 리나린
              <br />· 대표자: 박찬영, 김판준
              <br />· 사업자등록번호: 501-31-30511
              <br />· 주소: 서울특별시 강동구 성내로6가길 8, 101호
              <br />· 전화: 0507-1303-5742
            </p>
          </div>
        </Section>

        <Section title="10. 권익 침해 구제">
          <p>아래 기관에 분쟁조정·상담을 신청할 수 있습니다.</p>
          <List
            items={[
              "개인정보분쟁조정위원회 (1833-6972)",
              "개인정보침해신고센터 (118)",
              "경찰청 사이버수사국 (182)",
            ]}
          />
        </Section>

        <Section title="11. 처리방침 변경">
          <p style={{ fontSize: 13 }}>
            법령·서비스 변경에 따라 처리방침이 변경될 수 있으며, 변경 시 본 페이지를
            통해 사전 고지합니다.
          </p>
          <p style={{ marginTop: 12, fontSize: 12, color: "rgba(46,37,71,0.55)" }}>
            · 시행일자: 2026년 5월 18일 (직전 개정: 2026년 5월 12일)
          </p>
        </Section>
      </div>
    </div>
  );
}

// ── 섹션 컴포넌트 ──
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "#5D4F8C",
          marginBottom: 10,
          letterSpacing: -0.3,
        }}
      >
        {title}
      </h2>
      <div
        style={{
          fontSize: 13,
          color: "rgba(46,37,71,0.75)",
          lineHeight: 1.85,
        }}
      >
        {children}
      </div>
    </section>
  );
}

// ── 리스트 컴포넌트 ──
function List({ items }: { items: string[] }) {
  return (
    <ul style={{ marginTop: 8, paddingLeft: 0, listStyle: "none" }}>
      {items.map((item, i) => (
        <li
          key={i}
          style={{
            position: "relative",
            paddingLeft: 16,
            marginBottom: 6,
          }}
        >
          <span
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              color: "rgba(93,79,140,0.6)",
            }}
          >
            ·
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}
