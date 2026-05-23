"use client";

import { useEffect, useState } from "react";

const APP_STORE_URL = "https://apps.apple.com/kr/app/id6770438873";
const DISMISS_KEY = "ptp_app_promo_dismissed_at";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SHOW_DELAY_MS = 1500;

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua);
}

function isDismissedRecently(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const dismissedAt = window.localStorage.getItem(DISMISS_KEY);
    if (!dismissedAt) return false;
    const elapsed = Date.now() - parseInt(dismissedAt, 10);
    return elapsed < ONE_DAY_MS;
  } catch {
    return false;
  }
}

interface Props {
  /** 결과 로드 완료 시 true — 1.5초 후 시트 노출 트리거 */
  trigger: boolean;
}

/**
 * iOS Safari 사용자에게 결과 로드 후 앱 다운로드를 권하는 하단 시트.
 * - iOS 사용자에게만 노출
 * - 결과 로드 후 1.5초 지연 → 결과를 잠시 음미할 시간
 * - dismiss 시 LocalStorage에 시간 저장 → 1일간 재노출 안 함
 */
export default function AppInstallSheet({ trigger }: Props) {
  const [visible, setVisible] = useState(false);

  // 표시 트리거
  useEffect(() => {
    if (!trigger || visible) return;
    if (!isIOS() || isDismissedRecently()) return;

    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [trigger, visible]);

  // body scroll lock — 시트 열린 동안 뒤 스크롤 방지
  useEffect(() => {
    if (!visible) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [visible]);

  const handleInstall = () => {
    window.open(APP_STORE_URL, "_blank");
    setVisible(false);
  };

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleDismiss}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(46,37,71,0.45)",
          zIndex: 100,
        }}
      />

      {/* Bottom Sheet */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "#f3f0fa",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding:
            "28px 24px calc(28px + env(safe-area-inset-bottom)) 24px",
          zIndex: 101,
          boxShadow: "0 -4px 24px rgba(46,37,71,0.15)",
        }}
      >
        {/* 픽터 아이콘 */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: 14,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/branding/pikter-mark.png"
            alt="픽터"
            width={64}
            height={64}
            style={{ borderRadius: 14 }}
          />
        </div>

        {/* 헤드라인 */}
        <p
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "#2e2547",
            textAlign: "center",
            lineHeight: 1.5,
            margin: "0 0 20px 0",
          }}
        >
          생각날 때마다 편하게
          <br />
          분석 결과를 받아보고 싶다면?
        </p>

        {/* CTA */}
        <button
          type="button"
          onClick={handleInstall}
          style={{
            width: "100%",
            backgroundColor: "#5D4F8C",
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
            border: "none",
            borderRadius: 12,
            padding: "14px 0",
            cursor: "pointer",
            marginBottom: 10,
          }}
        >
          앱으로 계속하기
        </button>

        {/* Dismiss */}
        <button
          type="button"
          onClick={handleDismiss}
          style={{
            width: "100%",
            backgroundColor: "transparent",
            color: "rgba(46,37,71,0.5)",
            fontSize: 13,
            border: "none",
            padding: "10px 0",
            cursor: "pointer",
          }}
        >
          모바일 웹으로 볼게요
        </button>
      </div>
    </>
  );
}
