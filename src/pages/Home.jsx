// src/pages/Home.jsx
import { useNavigate } from "react-router-dom";

export default function Home({ words = [] }) {
  const nav = useNavigate();

  // ====== 튜닝 변수(값만 바꿔서 크기 조절) ======
  const BTN_W = 30;      // vw (가로 %): 30 → 화면 폭의 30%
  const BTN_H = 30;      // vh (세로 %)
  const LABEL_MIN = 20;  // px
  const LABEL_MAX = 32;  // px
  const SUB_MIN = 12;    // px
  const SUB_MAX = 16;    // px

  const container = {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#f6f7fb",
    padding: 24,
  };

  const center = {
    width: "min(1200px, 94vw)",
    textAlign: "center",
  };

  const title = {
    fontSize: 32,
    fontWeight: 800,
    letterSpacing: -0.2,
    marginBottom: 32,
  };

  const row = {
    display: "flex",
    gap: 24,
    justifyContent: "center",
    alignItems: "stretch",
    flexWrap: "wrap",
  };

  const btnBase = {
    width: `${BTN_W}vw`,    // ← 변수 적용
    minWidth: 280,
    height: `${BTN_H}vh`,   // ← 변수 적용
    minHeight: 220,
    borderRadius: 24,
    border: "none",
    cursor: "pointer",
    outline: "none",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
    transition: "transform .15s ease, box-shadow .15s ease",
    userSelect: "none",
  };

  const hoverFx = (e, isOver) => {
    e.currentTarget.style.transform = isOver ? "translateY(-2px) scale(1.02)" : "none";
    e.currentTarget.style.boxShadow = isOver
      ? "0 14px 32px rgba(0,0,0,0.12)"
      : "0 8px 24px rgba(0,0,0,0.08)";
  };

  const leftBtn = {
    ...btnBase,
    color: "#fff",
    background:
      "radial-gradient(120% 120% at 10% 10%, #6366f1 0%, #4f46e5 55%, #4338ca 100%)",
  };

  const rightBtn = {
    ...btnBase,
    color: "#4f46e5",
    background: "#ffffff",
    border: "2px solid #4f46e5",
  };

  const label = {
    fontSize: `clamp(${LABEL_MIN}px, 2.6vw, ${LABEL_MAX}px)`, // ← 변수 적용
    fontWeight: 800,
  };

  const sub = {
    fontSize: `clamp(${SUB_MIN}px, 1.2vw, ${SUB_MAX}px)`, // ← 변수 적용
    opacity: 0.85,
    marginTop: 4,
  };

  return (
    <div style={container}>
      <div style={center}>
        <h1 style={title}>JLPT 단어 학습앱</h1>

        <div style={row}>
          {/* 왼쪽: 단어장 버튼 */}
          <button
            aria-label="단어장 보기"
            style={leftBtn}
            onMouseEnter={(e) => hoverFx(e, true)}
            onMouseLeave={(e) => hoverFx(e, false)}
            onClick={() => nav("/voca")}
          >
            <div style={label}>단어장</div>
            <div style={sub}>목록 · 검색 · 태그</div>
          </button>

          {/* 오른쪽: 테스트 버튼 */}
          <button
            aria-label="테스트 시작"
            style={rightBtn}
            onMouseEnter={(e) => hoverFx(e, true)}
            onMouseLeave={(e) => hoverFx(e, false)}
            onClick={() => nav("/test")}
          >
            <div style={label}>테스트</div>
            <div style={sub}>뜻/발음 · 날짜 필터</div>
          </button>
        </div>
      </div>
    </div>
  );
}
