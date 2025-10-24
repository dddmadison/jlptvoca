import React, { useEffect, useMemo, useState, useCallback } from "react";
import * as XLSX from "xlsx";

const TEMPLATE_URL = `${process.env.PUBLIC_URL}/templates/master.xlsx`;

/* =====================
   Design Tokens (P0)
   ===================== */
const TOKENS = {
  color: {
    bg: "#FAFAFB",
    card: "#FFFFFF",
    text: "#20222A",
    subtext: "#687082",
    line: "#EAECEF",
    accent: "#5865F2",
    accentSubtle: "#E8ECFF",
    hover: "#F9FBFF",
    headerBg: "#F6F7FA",
  },
  radius: { xs: 6, sm: 8, md: 12, lg: 16 },
  shadow: {
    card: "0 1px 2px rgba(16,24,40,.06), 0 1px 1px rgba(16,24,40,.04)",
    header: "inset 0 -1px 0 #EAECEF, 0 2px 4px rgba(16,24,40,.05)",
  },
  typo: {
    family:
      "'Noto Sans', 'Noto Sans JP', system-ui, -apple-system, 'Apple SD Gothic Neo', '맑은 고딕', Segoe UI, Roboto, sans-serif",
  },
};

// --- utils & alias
const norm = (s = "") => s.replace(/[\s_():\-.\u3000]/g, "").toLowerCase();
const ALIAS_JP = ["jp", "kanji", "word", "표기", "일본어", "단어", "漢字", "語", "語彙", "単語"];
const ALIAS_READING = [
  "reading",
  "kana",
  "yomi",
  "후리가나",
  "읽음",
  "가나",
  "読み",
  "よみ",
  "ふりがな",
  "仮名",
];
const isJPHeader = (h) => ALIAS_JP.some((a) => norm(a) === norm(h));
const isReadingHeader = (h) => ALIAS_READING.some((a) => norm(a) === norm(h));

const FIELD_ALIASES = {
  jp: ALIAS_JP,
  reading: ALIAS_READING,
  meaning: ["meaning", "meaning_ko", "뜻", "의미", "説明", "解説"],
  pos: ["pos", "품사", "品詞"],
  jlpt: ["jlpt", "jlptlevel", "jlpt_level"],
  date: ["studydate", "study_date", "date", "날짜"],
};
const resolveField = (headers, key) => {
  const candidates = FIELD_ALIASES[key] || [];
  return headers.find((h) => candidates.some((c) => norm(c) === norm(h))) || null;
};

// 숨김 컬럼 (romaji 비표시 기본)
const HIDDEN_COLUMNS = new Set(
  [
    "romaji",
    "example_jp",
    "example_ko",
    "tags",
    "notes",
    "srs_reps",
    "srs_interval",
    "srs_ease",
    "srs_next_due",
  ].map(norm)
);

// 열 너비 힌트
const colWidthHint = (h) => {
  if (isJPHeader(h)) return "minmax(200px, 2.2fr)";
  if (isReadingHeader(h)) return "minmax(150px, 1.6fr)";
  return "minmax(140px, 1fr)";
};

/* =====================
   Cell style builders
   ===================== */
const baseCell = (density) => ({
  padding: density === "compact" ? "8px 10px" : "12px 14px",
  verticalAlign: "top",
  whiteSpace: "pre-wrap",
  wordBreak: "keep-all",
  overflowWrap: "anywhere",
  lineHeight: 1.5,
  color: TOKENS.color.text,
});
const cellStyle = (h, density, jpScale, readingScale) => {
  const base = baseCell(density);
  if (isJPHeader(h))
    return {
      ...base,
      fontSize: 26 * jpScale,
      fontWeight: 450,
      fontVariationSettings: '"wght" 450',
      lineHeight: 1.7,
      letterSpacing: "0.01em",
    };
  if (isReadingHeader(h))
    return {
      ...base,
      fontSize: 18 * readingScale,
      opacity: 0.9,
      lineHeight: 1.7,
    };
  return base;
};

/* =====================
   날짜 헬퍼
   ===================== */
// Excel serial, JS Date, 또는 YYYY-MM-DD 문자열을 모두 YYYY-MM-DD로 통일
const toDateStr = (v) => {
  if (v == null || v === "") return "";

  // 이미 YYYY-MM-DD 문자열이면 그대로
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) {
    return v.trim();
  }

  // JS Date 객체
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Excel serial 숫자/문자
  const n = Number(v);
  if (!Number.isNaN(n) && n > 0 && n < 60000) {
    const base = Date.UTC(1899, 11, 30); // 1899-12-30
    const ms = base + Math.floor(n) * 86400000;
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }

  // 그 외: 문자열로 반환
  return String(v);
};

export default function Voca() {
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [density, setDensity] = useState("regular");
  const [jpScale, setJpScale] = useState(1.2);
  const [readingScale, setReadingScale] = useState(1.1);

  // 집중 모드 상태 + 시작위치 제어
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(0); // 테이블에서 클릭해 둔 시작점
  const [hideMeaning, setHideMeaning] = useState(false);

  // 날짜 프리셋 필터 (전체/오늘/7일/30일)
  const [datePreset, setDatePreset] = useState("all");

  const load = useCallback(async (signal) => {
    setStatus("loading");
    setError("");
    const res = await fetch(`${TEMPLATE_URL}?v=${Date.now()}`, { signal });
    if (!res.ok) throw new Error("엑셀 파일을 불러올 수 없습니다.");
    const buf = await res.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error("엑셀 파일에 시트가 없습니다.");
    const ws = wb.Sheets[sheetName];

    const rowsAoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    const hdrs = (rowsAoa[0] || []).map(String);
    const data = rowsAoa.slice(1).map((r) =>
      Object.fromEntries(hdrs.map((h, idx) => [h, r[idx] ?? ""]))
    );
    const cleaned = data.filter((r) =>
      Object.values(r).some((v) => String(v).trim() !== "")
    );
    setHeaders(hdrs);
    setRows(cleaned);
    setStatus("done");
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        await load(ac.signal);
      } catch (e) {
        if (e.name !== "AbortError") {
          setStatus("error");
          setError(e.message || String(e));
        }
      }
    })();
    return () => ac.abort();
  }, [load]);

  const visibleHeaders = useMemo(
    () => headers.filter((h) => !HIDDEN_COLUMNS.has(norm(h))),
    [headers]
  );

  // 날짜 필드
  const dateField = useMemo(() => resolveField(headers, "date"), [headers]);

  // 검색 + 날짜 프리셋 필터
  const filteredRows = useMemo(() => {
    const qq = q.trim().toLowerCase();

    // 1) 우선 전방위 like
    let base = rows.filter((r) =>
      !qq
        ? true
        : visibleHeaders.some((h) => String(r[h] ?? "").toLowerCase().includes(qq))
    );

    // 2) 날짜 프리셋 적용
    if (datePreset !== "all" && dateField) {
      const now = new Date();
      const toKey = (d) =>
        `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
          d.getUTCDate()
        ).padStart(2, "0")}`;
      const today = toKey(now);
      const since = (days) => {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        d.setUTCDate(d.getUTCDate() - days);
        return toKey(d);
      };
      const lower =
        datePreset === "7d" ? since(7) : datePreset === "30d" ? since(30) : null;

      base = base.filter((r) => {
        const s = toDateStr(r[dateField]);
        if (!s) return false;
        if (datePreset === "today") return s === today;
        if (lower) return s >= lower && s <= today;
        return true;
      });
    }

    return base;
  }, [q, rows, visibleHeaders, datePreset, dateField]);

  const gridTemplateLegacy = useMemo(() => {
    if (visibleHeaders.length === 0) return undefined;
    return visibleHeaders.map(colWidthHint).join(" ");
  }, [visibleHeaders]);

  // === 필드 매핑 (집중 모드용) ===
  const jpField = useMemo(() => resolveField(headers, "jp"), [headers]);
  const readingField = useMemo(() => resolveField(headers, "reading"), [headers]);
  const meaningField = useMemo(() => resolveField(headers, "meaning"), [headers]);
  const posField = useMemo(() => resolveField(headers, "pos"), [headers]);
  const jlptField = useMemo(() => resolveField(headers, "jlpt"), [headers]);

  // === 집중 모드 키보드 조작 & 포커스 제거 ===
  useEffect(() => {
    if (!isFocusMode) return;
    // 포커스 강제 해제
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
    const onKey = (e) => {
      if (e.key === "Escape") {
        setIsFocusMode(false);
        return;
      }
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        setHideMeaning((v) => !v);
      } else if (e.key === "ArrowRight") {
        setCurrentIdx((i) => Math.min(filteredRows.length - 1, i + 1));
      } else if (e.key === "ArrowLeft") {
        setCurrentIdx((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFocusMode, filteredRows.length]);

  // 집중 모드 진입 시 시작 위치 결정
  const enterFocusFrom = useCallback(() => {
    const safeStart =
      selectedIdx >= 0 && selectedIdx < filteredRows.length ? selectedIdx : 0;
    setCurrentIdx(safeStart);
    setHideMeaning(false);
    setIsFocusMode(true);
    setTimeout(() => {
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }
    }, 0);
  }, [filteredRows.length, selectedIdx]);

  // === 스타일 ===
  const toolbarStyle = {
    display: "flex",
    gap: 12,
    alignItems: "center",
    marginBottom: 14,
    flexWrap: "wrap",
    background: TOKENS.color.card,
    border: `1px solid ${TOKENS.color.line}`,
    borderRadius: TOKENS.radius.lg,
    boxShadow: TOKENS.shadow.card,
    padding: 12,
  };
  const inputStyle = {
    width: "100%",
    height: 36,
    padding: "0 12px",
    borderRadius: TOKENS.radius.sm,
    border: `1px solid ${TOKENS.color.line}`,
    outline: "none",
  };
  const selectStyle = {
    height: 32,
    borderRadius: TOKENS.radius.sm,
    border: `1px solid ${TOKENS.color.line}`,
    padding: "0 8px",
    background: "#fff",
  };
  const buttonStyle = {
    height: 36,
    padding: "0 12px",
    borderRadius: TOKENS.radius.sm,
    border: `1px solid ${TOKENS.color.line}`,
    background: "#fff",
    cursor: "pointer",
  };

  // 집중 모드 카드 스타일
  const focusWrap = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "62vh",
    background: TOKENS.color.card,
    border: `1px solid ${TOKENS.color.line}`,
    borderRadius: TOKENS.radius.lg,
    boxShadow: TOKENS.shadow.card,
    padding: 24,
    gap: 12,
  };
  const jpStyle = {
    fontSize: 32 * jpScale,
    fontWeight: 500,
    fontVariationSettings: '"wght" 500',
    lineHeight: 1.8,
    letterSpacing: "0.01em",
  };
  const readingStyle = { fontSize: 20 * readingScale, opacity: 0.9, lineHeight: 1.7 };
  const meaningStyle = { fontSize: 22, lineHeight: 1.8 };
  const metaStyle = {
    display: "flex",
    gap: 8,
    alignItems: "center",
    fontSize: 13,
    color: TOKENS.color.subtext,
  };
  const navStyle = { display: "flex", gap: 10, marginTop: 12 };
  const progressStyle = { marginTop: 8, fontSize: 13, color: TOKENS.color.subtext };

  // === 렌더 ===
  return (
    <div
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: 16,
        fontFamily: TOKENS.typo.family,
        background: TOKENS.color.bg,
        color: TOKENS.color.text,
      }}
    >
      {/* Toolbar */}
      <div style={toolbarStyle}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TOKENS.color.text }}>
          master.xlsx
        </h2>

        <div style={{ flex: 1, minWidth: 240 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="검색: 일본어/읽음/뜻 등"
            aria-label="검색"
            style={inputStyle}
            disabled={isFocusMode}
          />
        </div>

        {/* 날짜 프리셋: 전체/오늘/7일/30일 */}
        <select
          value={datePreset}
          onChange={(e) => setDatePreset(e.target.value)}
          style={selectStyle}
          disabled={isFocusMode}
          title="study_date 기준으로 필터링"
        >
          <option value="all">날짜: 전체</option>
          <option value="today">오늘</option>
          <option value="7d">최근 7일</option>
          <option value="30d">최근 30일</option>
        </select>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 12, color: TOKENS.color.subtext }}>밀도</label>
          <select
            value={density}
            onChange={(e) => setDensity(e.target.value)}
            style={selectStyle}
            disabled={isFocusMode}
          >
            <option value="regular">보통</option>
            <option value="compact">컴팩트</option>
          </select>
        </div>

        {/* JP/Reading 폰트 스케일 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 12, color: TOKENS.color.subtext }}>JP</label>
          <input
            type="range"
            min="1.0"
            max="1.6"
            step=".05"
            value={jpScale}
            onChange={(e) => setJpScale(parseFloat(e.target.value))}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 12, color: TOKENS.color.subtext }}>Reading</label>
          <input
            type="range"
            min="1.0"
            max="1.6"
            step=".05"
            value={readingScale}
            onChange={(e) => setReadingScale(parseFloat(e.target.value))}
          />
        </div>

        {/* 집중 모드: 선택된 행/날짜 필터 반영해서 시작 */}
        {!isFocusMode ? (
          <button
            onClick={enterFocusFrom}
            style={{ ...buttonStyle, background: filteredRows.length ? "#fff" : "#f3f4f6" }}
            disabled={filteredRows.length === 0}
            title="선택한 행(또는 0번)부터 집중 모드 시작"
          >
            집중 모드 시작
          </button>
        ) : (
          <button
            onClick={() => setIsFocusMode(false)}
            style={{ ...buttonStyle, background: TOKENS.color.accentSubtle }}
            title="집중 모드 종료 (Esc)"
          >
            집중 모드 종료 (Esc)
          </button>
        )}

        <button
          onClick={() => {
            const ac = new AbortController();
            load(ac.signal).catch(() => {});
          }}
          disabled={status === "loading" || isFocusMode}
          style={buttonStyle}
        >
          {status === "loading" ? "불러오는 중..." : "다시 불러오기"}
        </button>
      </div>

      <div role="status" aria-live="polite" style={{ height: 0, overflow: "hidden" }}>
        {status === "loading" ? "불러오는 중" : ""}
      </div>

      {status === "error" && (
        <div
          style={{
            padding: 12,
            border: `1px solid #ffd6d6`,
            background: "#fff6f6",
            borderRadius: TOKENS.radius.md,
            marginBottom: 12,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>에러</div>
          <div>{error}</div>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
            위치: <code>public/templates/master.xlsx</code> · 첫 시트 1행=헤더
          </div>
        </div>
      )}

      {/* === 집중 학습 모드 === */}
      {isFocusMode && filteredRows.length > 0 && (
        <div style={focusWrap}>
          {(() => {
            const r = filteredRows[currentIdx] || {};
            const jp = (jpField && r[jpField]) || r.jp || r.kanji || r.word || "";
            const rd = (readingField && r[readingField]) || r.reading || r.kana || r.yomi || "";
            const meaning = (meaningField && r[meaningField]) || r.meaning_ko || r.meaning || "";
            const pos = (posField && r[posField]) || r.pos || "";
            const jlpt = (jlptField && r[jlptField]) || r.jlpt || r.jlpt_level || "";

            return (
              <>
                <div style={jpStyle}>{String(jp)}</div>
                {rd ? <div style={readingStyle}>{String(rd)}</div> : null}
                {!hideMeaning && meaning ? (
                  <div style={meaningStyle}>{String(meaning)}</div>
                ) : null}
                <div style={metaStyle}>
                  {pos ? <span>[{String(pos)}]</span> : null}
                  {jlpt ? <span>{String(jlpt).toUpperCase()}</span> : null}
                </div>

                <div style={navStyle}>
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    style={buttonStyle}
                    onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                    disabled={currentIdx === 0}
                  >
                    ← 이전
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    style={buttonStyle}
                    onClick={() => setHideMeaning((v) => !v)}
                  >
                    {hideMeaning ? "뜻 보기 (Space)" : "뜻 숨기기 (Space)"}
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    style={buttonStyle}
                    onClick={() =>
                      setCurrentIdx((i) => Math.min(filteredRows.length - 1, i + 1))
                    }
                    disabled={currentIdx >= filteredRows.length - 1}
                  >
                    다음 →
                  </button>
                </div>

                <div style={progressStyle}>
                  {filteredRows.length > 0 ? `${currentIdx + 1} / ${filteredRows.length}` : null}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* === 기본 표 뷰 === */}
      {!isFocusMode && rows.length > 0 && (
        <div
          style={{
            overflowX: "auto",
            border: `1px solid ${TOKENS.color.line}`,
            borderRadius: TOKENS.radius.lg,
            boxShadow: TOKENS.shadow.card,
            background: TOKENS.color.card,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: visibleHeaders.map(colWidthHint).join(" "),
              position: "sticky",
              top: 0,
              zIndex: 1,
              background: TOKENS.color.headerBg,
              borderBottom: `1px solid ${TOKENS.color.line}`,
              boxShadow: TOKENS.shadow.header,
            }}
          >
            {visibleHeaders.map((h) => (
              <div
                key={h}
                style={{ padding: "10px 12px", fontWeight: 700, color: TOKENS.color.subtext }}
              >
                {h}
              </div>
            ))}
          </div>

          {/* Rows */}
          <div>
            {filteredRows.map((r, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: gridTemplateLegacy,
                  borderTop: `1px solid ${TOKENS.color.line}`,
                  background: i % 2 ? "#FCFCFD" : "#FFFFFF",
                  transition: "background .15s ease",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = TOKENS.color.hover)}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = i % 2 ? "#FCFCFD" : "#FFFFFF")
                }
                onClick={() => setSelectedIdx(i)}
                onDoubleClick={() => {
                  setSelectedIdx(i);
                  enterFocusFrom();
                }}
              >
                {visibleHeaders.map((h) => {
                  const isDateCol = dateField && norm(h) === norm(dateField);
                  const raw = r[h] ?? "";
                  const shown = isDateCol ? toDateStr(raw) : String(raw);
                  return (
                    <div key={h} style={cellStyle(h, density, jpScale, readingScale)}>
                      {shown}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {visibleHeaders.length === 0 && (
            <div style={{ padding: 12, color: TOKENS.color.subtext }}>
              모든 컬럼이 숨김 상태입니다. 표시할 열을 조정하세요.
            </div>
          )}
        </div>
      )}

      {filteredRows.length === 0 && status === "done" && (
        <div style={{ padding: 24, textAlign: "center", color: TOKENS.color.subtext }}>
          조건에 맞는 결과가 없습니다.
        </div>
      )}

      {rows.length === 0 && status !== "error" && status !== "loading" && (
        <div style={{ padding: 24, textAlign: "center", color: TOKENS.color.subtext }}>
          표시할 데이터가 없습니다. 엑셀 첫 시트의 1행은 헤더, 2행부터 데이터여야 합니다.
        </div>
      )}
    </div>
  );
}