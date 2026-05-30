import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "이용약관 — 플더픽",
  description: "플더픽의 이용약관",
};

// 한국 PIPA + 전자상거래법 + 공정거래위 표준약관 참고
// 시행일: 2026-05-30 (5/30 개정 — '오늘의 발견' 기능 도입에 따른 서비스 정의 갱신)

export default function TermsPage() {
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
          이용약관
        </h1>
        <p style={{ fontSize: 12, color: "rgba(46,37,71,0.5)" }}>
          시행일자: 2026년 5월 30일
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
          본 약관은 리나린(이하 &quot;회사&quot;)이 운영하는 플더픽(Play the Picture, 이하
          &quot;서비스&quot;)의 이용 조건과 회원과 회사 간 권리·의무에 관한 사항을 정합니다.
        </p>

        <Section title="제1조 (목적 및 정의)">
          <List
            items={[
              "본 약관은 회사가 제공하는 서비스의 이용 조건·절차, 회원과 회사 간 권리·의무를 정합니다.",
              "‘서비스’: 사진 업로드를 통해 분위기를 분석하고 어울리는 음악을 추천하는 기능, 매일 큐레이션된 아티스트를 소개하는 ‘오늘의 발견’ 기능 일체.",
              "‘회원’: 본 약관에 동의하고 서비스를 이용하는 자 (비회원·OAuth 가입자 포함).",
              "‘콘텐츠’: 회원이 업로드·생성·공유하는 사진, 분석 결과, vibeType, 닉네임 등 일체.",
            ]}
          />
        </Section>

        <Section title="제2조 (이용 자격)">
          <p>
            본 서비스는 만 14세 이상이 이용할 수 있습니다. 만 14세 미만 아동의 가입이
            확인되는 경우 회사는 즉시 해당 계정 및 정보를 삭제합니다.
          </p>
        </Section>

        <Section title="제3조 (회원의 의무)">
          <List
            items={[
              "타인의 권리·명예·사생활을 침해하지 않습니다.",
              "제5조에 따른 부적절한 콘텐츠를 업로드·공유하지 않습니다.",
              "서비스의 정상 운영을 방해하거나 보안을 침해하는 행위를 하지 않습니다.",
              "관련 법령과 본 약관, 회사가 공지한 운영 정책을 준수합니다.",
            ]}
          />
        </Section>

        <Section title="제4조 (회사의 권리 및 책임)">
          <List
            items={[
              "회사는 안정적인 서비스 제공을 위해 노력합니다.",
              "회사는 회원이 본 약관을 위반하거나 부적절한 행위를 한 경우 사전 통지 없이 서비스 이용을 제한할 수 있습니다.",
              "회사는 운영상·기술상 필요에 따라 서비스의 일부 또는 전부를 변경·중단할 수 있으며, 중요한 변경은 사전 공지합니다.",
            ]}
          />
        </Section>

        <Section title="제5조 (부적절한 콘텐츠 무관용 정책)">
          <p>
            회원은 다음 콘텐츠를 업로드·공유·게시해서는 안 됩니다.
          </p>
          <List
            items={[
              "음란물 및 성적 콘텐츠, 미성년자 대상 성적 표현 또는 유해 콘텐츠",
              "폭력·자해·범죄·위험행위를 미화하거나 조장하는 콘텐츠",
              "특정 개인 또는 집단에 대한 혐오·차별·모욕·괴롭힘·위협",
              "타인의 사진·초상·동의 없는 촬영물 등 초상권 침해 콘텐츠",
              "타인의 개인정보(전화번호·주소·금융정보 등) 또는 사생활을 침해하는 내용",
              "제3자의 저작권·상표권·기타 권리를 침해하는 콘텐츠",
              "사칭·기망·허위사실 유포·명예훼손",
              "스팸·광고성 콘텐츠, 악성코드 또는 서비스 운영을 방해하는 행위",
              "기타 회사가 합리적인 사유로 서비스 목적·운영 정책에 반한다고 판단하는 콘텐츠",
            ]}
          />
          <p style={{ marginTop: 12 }}>
            전항에 해당하는 콘텐츠 또는 행위가 확인되거나 합리적으로 의심되는 경우,
            회사는 사전 통지 없이 다음의 조치를 취할 수 있습니다.
          </p>
          <List
            items={[
              "콘텐츠 비공개·차단·삭제",
              "서비스 이용 제한 또는 회원 자격 정지(영구 정지 포함)",
              "관계 법령에 따른 신고 및 수사기관 협조",
            ]}
          />
        </Section>

        <Section title="제6조 (책임 제한)">
          <List
            items={[
              "회사는 천재지변·시스템 장애·통신 장애 등 불가항력으로 인한 서비스 중단에 대해 책임을 지지 않습니다.",
              "회원이 업로드한 콘텐츠에 대한 책임은 원칙적으로 해당 회원에게 있습니다.",
              "회사는 AI 기반 추천 결과의 정확성·만족도를 보증하지 않으며, 추천 결과로 인한 손해에 대해 책임지지 않습니다.",
              "회원 간 또는 회원과 제3자 사이의 분쟁에 회사는 개입하지 않으며, 이로 인한 책임을 부담하지 않습니다.",
            ]}
          />
        </Section>

        <Section title="제7조 (약관 변경)">
          <p>
            회사는 본 약관을 변경할 수 있으며, 변경 시 본 페이지에 사전 공지합니다.
            공지 후에도 서비스를 계속 이용하는 경우 변경된 약관에 동의한 것으로 간주됩니다.
            다만, 법령상 별도 동의가 필요한 경우 회사는 관련 법령이 정한 절차에 따라 별도
            동의를 받습니다.
          </p>
        </Section>

        <Section title="제8조 (준거법 및 분쟁 해결)">
          <p>
            본 약관은 대한민국 법률에 따라 해석·적용되며, 본 약관과 관련하여 분쟁이 발생한
            경우 서울중앙지방법원을 관할 법원으로 합니다.
          </p>
        </Section>

        <Section title="회사 정보">
          <div
            style={{
              background: "rgba(255,255,255,0.5)",
              border: "1px solid rgba(93,79,140,0.18)",
              borderRadius: 12,
              padding: "16px 18px",
              marginTop: 8,
              fontSize: 13,
              color: "rgba(46,37,71,0.75)",
              lineHeight: 1.9,
            }}
          >
            · 상호: 리나린
            <br />· 대표자: 박찬영, 김판준
            <br />· 사업자등록번호: 501-31-30511
            <br />· 주소: 서울특별시 강동구 성내로6가길 8, 101호
            <br />· 전화: 0507-1303-5742
            <br />· 이메일:{" "}
            <a
              href="mailto:dailyyoung@linareen.com"
              style={{ color: "#5D4F8C", textDecoration: "none" }}
            >
              dailyyoung@linareen.com
            </a>
          </div>
        </Section>

        <p style={{ marginTop: 24, fontSize: 12, color: "rgba(46,37,71,0.5)" }}>
          시행일자: 2026년 5월 30일
        </p>
      </div>
    </div>
  );
}

// ── 섹션 컴포넌트 (/privacy와 동일) ──
function Section({ title, children }: { title: string; children: React.ReactNode }) {
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
      <div style={{ fontSize: 13, color: "rgba(46,37,71,0.75)", lineHeight: 1.85 }}>
        {children}
      </div>
    </section>
  );
}

// ── 리스트 컴포넌트 (/privacy와 동일) ──
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
