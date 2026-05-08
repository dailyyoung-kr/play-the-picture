import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보 처리방침 — 플더픽",
  description: "플더픽의 개인정보 처리방침",
};

// 한국 PIPA 2025.4.21 작성지침 + 2026.3 개정 법령 반영
// App Store 5.1.1 / 5.1.2 Privacy 가이드라인 충족
// 시행일: 2026-05-08

export default function PrivacyPage() {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: "linear-gradient(158deg, #0d1a10 0%, #0d1218 50%, #1a1408 100%)",
        color: "#fff",
      }}
    >
      {/* 상단 헤더 */}
      <div
        style={{
          paddingTop: 60,
          paddingBottom: 24,
          paddingLeft: 20,
          paddingRight: 20,
          borderBottom: "0.5px solid rgba(255,255,255,0.08)",
        }}
      >
        <Link
          href="/"
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.5)",
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
            color: "#fff",
            letterSpacing: -0.5,
            marginBottom: 6,
          }}
        >
          개인정보 처리방침
        </h1>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
          시행일자: 2026년 5월 8일
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
            color: "rgba(255,255,255,0.7)",
            lineHeight: 1.8,
            marginBottom: 32,
          }}
        >
          플더픽(이하 &quot;서비스&quot;)은 「개인정보 보호법」 제30조에 따라 정보주체의 개인정보를
          보호하고 이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록 하기 위하여
          다음과 같이 개인정보 처리방침을 수립·공개합니다.
        </p>

        <Section title="제1조. 처리하는 개인정보 항목">
          <p>서비스는 다음의 개인정보 항목을 처리하고 있습니다.</p>
          <List
            items={[
              "사진 데이터: 사용자가 업로드한 사진 (분석 즉시 삭제, 저장하지 않음)",
              "기기 식별자: device_id (UUID 형태의 익명 식별자, 광고 추적 목적 X)",
              "이용 로그: 분석 요청 기록, 음악 추천 결과, 듣기/공유 클릭 이벤트, 오류 로그",
              "선호 정보: 사용자가 선택한 장르·분위기 (선택 사항)",
              "보관 기록: 사용자가 &apos;보관&apos; 버튼으로 명시적으로 저장한 분석 결과",
            ]}
          />
          <p style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
            ※ 이름, 이메일, 전화번호, 주민등록번호 등 식별 가능한 개인정보는
            수집하지 않습니다.
          </p>
        </Section>

        <Section title="제2조. 개인정보의 수집 및 이용 목적">
          <List
            items={[
              "AI 사진 분석: 업로드된 사진의 분위기를 AI가 분석하여 어울리는 음악을 추천",
              "서비스 개선: 추천 정확도 향상, 오류 분석, 사용 패턴 통계",
              "공유 기능: 사용자가 명시적으로 공유 링크를 생성한 경우 해당 결과 페이지 제공",
              "부정 사용 방지: 단시간 과도한 요청 차단 (Rate Limit)",
            ]}
          />
        </Section>

        <Section title="제3조. 개인정보의 보유 및 이용 기간">
          <List
            items={[
              "사진 데이터: 분석 직후 즉시 삭제 (서버에 저장하지 않음)",
              "이용 로그: 6개월간 보관 후 자동 삭제",
              "device_id: 앱 또는 브라우저 데이터 삭제 시까지 (서버에는 익명 식별자로만 보관)",
              "보관 기록: 사용자가 직접 삭제하기 전까지 보관 (앱 내 &apos;기록 삭제&apos; 기능 제공)",
              "공유 링크: 사용자가 직접 삭제하기 전까지 보관",
            ]}
          />
        </Section>

        <Section title="제4조. 개인정보의 파기 절차 및 방법">
          <p>
            보유 기간이 경과한 개인정보는 자동으로 파기됩니다. 사용자가
            앱 내 &quot;기록 삭제&quot; 기능을 통해 즉시 삭제할 수도 있습니다.
          </p>
          <List
            items={[
              "전자적 파일 형태: 복구 및 재생이 불가능한 방법으로 영구 삭제",
              "데이터베이스 레코드: 즉시 삭제 (soft delete가 아닌 hard delete)",
            ]}
          />
        </Section>

        <Section title="제5조. 개인정보의 제3자 제공">
          <p>
            서비스는 정보주체의 개인정보를 원칙적으로 제3자에게 제공하지
            않습니다. 다만, 다음의 경우는 예외로 합니다.
          </p>
          <List
            items={[
              "정보주체로부터 별도의 동의를 받은 경우",
              "법령에 특별한 규정이 있거나 수사기관의 정당한 요청이 있는 경우",
            ]}
          />
        </Section>

        <Section title="제6조. 개인정보 처리업무의 위탁">
          <p>
            서비스는 안정적인 운영을 위해 다음과 같이 개인정보 처리업무를
            위탁하고 있습니다. 위탁 시에는 「개인정보 보호법」 제26조에 따라
            업무 위탁에 관한 계약을 체결하고 있습니다.
          </p>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginTop: 12,
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.05)" }}>
                <th
                  style={{
                    padding: "10px 12px",
                    textAlign: "left",
                    borderBottom: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.7)",
                    fontWeight: 500,
                  }}
                >
                  수탁업체
                </th>
                <th
                  style={{
                    padding: "10px 12px",
                    textAlign: "left",
                    borderBottom: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.7)",
                    fontWeight: 500,
                  }}
                >
                  위탁 업무
                </th>
              </tr>
            </thead>
            <tbody style={{ color: "rgba(255,255,255,0.7)" }}>
              <tr>
                <td
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  Anthropic, Inc. (미국)
                </td>
                <td
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  AI 사진 분석 (Claude API)
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  Vercel Inc. (미국)
                </td>
                <td
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  웹 호스팅 및 서버리스 인프라
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  Supabase Inc. (미국)
                </td>
                <td
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  데이터베이스 및 인증
                </td>
              </tr>
              <tr>
                <td style={{ padding: "10px 12px" }}>
                  Spotify AB / Google LLC
                </td>
                <td style={{ padding: "10px 12px" }}>
                  음악 메타데이터 검색 (이름·앨범 정보 조회)
                </td>
              </tr>
            </tbody>
          </table>
          <p
            style={{
              marginTop: 12,
              fontSize: 12,
              color: "rgba(255,255,255,0.55)",
            }}
          >
            ※ 사진 데이터는 Anthropic API로 전송되어 즉시 분석된 후
            Anthropic 측에서도 모델 학습 등에 사용되지 않으며 30일 이내
            자동 삭제됩니다 (Anthropic 정책 기준).
          </p>
        </Section>

        <Section title="제7조. 정보주체의 권리·의무 및 행사 방법">
          <p>정보주체는 언제든지 다음과 같은 권리를 행사할 수 있습니다.</p>
          <List
            items={[
              "개인정보 열람 요구",
              "오류 등이 있을 경우 정정 요구",
              "삭제 요구 (앱 내 &quot;기록 삭제&quot; 기능 또는 보호책임자 이메일)",
              "처리 정지 요구",
            ]}
          />
          <p style={{ marginTop: 12 }}>
            권리 행사는 서비스에 대해 서면, 이메일 등을 통하여 하실 수 있으며
            서비스는 이에 대해 지체 없이 조치하겠습니다.
          </p>
        </Section>

        <Section title="제8조. 개인정보의 안전성 확보 조치">
          <List
            items={[
              "개인정보 암호화: 전송 구간(HTTPS) 및 저장 데이터 암호화",
              "접근 통제: 권한 분리 및 최소 권한 원칙 적용",
              "접속기록 보관: 서버 로그 6개월 이상 보관",
              "악성프로그램 방지: 보안 업데이트 정기 적용",
              "물리적 보안: 클라우드 데이터센터 보안 인증 (SOC 2, ISO 27001) 받은 업체 이용",
            ]}
          />
        </Section>

        <Section title="제9조. 개인정보 자동 수집 장치의 설치·운영 및 거부">
          <p>
            서비스는 다음과 같은 기기 식별자를 사용합니다.
          </p>
          <List
            items={[
              "device_id: UUID 형태의 익명 식별자로, 사용자별 추천 이력 관리 및 부정 사용 방지에 사용됩니다.",
              "광고 식별자(IDFA, AAID) 사용 안 함: 서비스는 광고 추적 식별자를 수집하지 않습니다.",
            ]}
          />
          <p style={{ marginTop: 12 }}>
            device_id는 앱 데이터 또는 브라우저 데이터 삭제 시 함께 삭제되며,
            새로 생성된 device_id는 이전 데이터와 연결되지 않습니다.
          </p>
        </Section>

        <Section title="제10조. 14세 미만 아동의 개인정보 처리">
          <p>
            서비스는 만 14세 미만 아동의 개인정보를 수집하지 않습니다.
            서비스 가입 및 이용은 만 14세 이상 사용자만 가능합니다.
          </p>
          <p style={{ marginTop: 8 }}>
            만약 만 14세 미만 아동의 개인정보가 수집된 사실을 인지한 경우,
            지체 없이 해당 정보를 삭제하겠습니다.
          </p>
        </Section>

        <Section title="제11조. 개인정보 보호책임자">
          <div
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              padding: "16px 18px",
              marginTop: 8,
            }}
          >
            <p style={{ fontWeight: 500, marginBottom: 6 }}>
              개인정보 보호책임자
            </p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
              · 이름: 박찬영
              <br />· 이메일:{" "}
              <a
                href="mailto:pcy2177@gmail.com"
                style={{ color: "#C4687A", textDecoration: "none" }}
              >
                pcy2177@gmail.com
              </a>
            </p>
          </div>
          <p style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
            개인정보 보호 관련 문의·불만 처리·피해구제 등은 위 연락처로
            문의해주시기 바랍니다.
          </p>
        </Section>

        <Section title="제12조. 권익침해 구제 방법">
          <p>
            정보주체는 개인정보 침해로 인한 구제를 받기 위하여 아래 기관에
            분쟁해결이나 상담 등을 신청할 수 있습니다.
          </p>
          <List
            items={[
              "개인정보분쟁조정위원회: 1833-6972 (privacy.kr)",
              "개인정보침해신고센터: 118 (privacy.go.kr)",
              "대검찰청 사이버범죄수사단: 1301 (spo.go.kr)",
              "경찰청 사이버수사국: 182 (cyberbureau.police.go.kr)",
            ]}
          />
        </Section>

        <Section title="제13조. 개인정보 처리방침의 변경">
          <p>
            본 개인정보 처리방침은 시행일로부터 적용되며, 법령 및 방침에 따른
            변경 내용의 추가, 삭제 및 정정이 있을 경우에는 변경사항의 시행 7일
            전부터 본 페이지를 통해 고지할 것입니다.
          </p>
          <p style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
            · 공고일자: 2026년 5월 8일
            <br />· 시행일자: 2026년 5월 8일
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
    <section style={{ marginBottom: 32 }}>
      <h2
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "#C4687A",
          marginBottom: 12,
          letterSpacing: -0.3,
        }}
      >
        {title}
      </h2>
      <div
        style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.7)",
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
              color: "rgba(196,104,122,0.6)",
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
