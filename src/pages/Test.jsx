// src/pages/Test.jsx — 출제 모드(뜻/발음) + 날짜 필터(전체/단일/기간)
// 옵션: 후리가나 표시(뜻 모드에서), 부분일치 허용
import React, { useMemo, useRef, useState } from "react";

/* =============== 날짜 유틸 =============== */
// Excel serial number → Date (UTC 기준: 1899-12-30)
const excelSerialToDate = (n) => {
  const base = Date.UTC(1899, 11, 30); // 1899-12-30
  const ms = base + Math.floor(Number(n)) * 86400000;
  return new Date(ms);
};

// Date → 'YYYY-MM-DD' (UTC 고정)
const toYYYYMMDD = (d) => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// 문자열/숫자/Date 어떤 형식이든 'YYYY-MM-DD'로
const normalizeDateAny = (v) => {
  if (v == null && v !== 0) return "";

  // Date
  if (v instanceof Date && !isNaN(v)) return toYYYYMMDD(v);

  // Number (엑셀 시리얼)
  if (typeof v === "number" && isFinite(v)) {
    const d = excelSerialToDate(v);
    return isNaN(d) ? "" : toYYYYMMDD(d);
  }

  // String
  const raw = String(v).trim();
  if (!raw) return "";

  // 숫자 문자열(엑셀 시리얼; 소수점 포함 허용)
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const n = Math.floor(parseFloat(raw));
    if (Number.isFinite(n) && n >= 20000 && n <= 70000) {
      return toYYYYMMDD(excelSerialToDate(n));
    }
  }

  // 'YYYY-MM-DD...' → 앞의 10자리
  const iso = raw.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];

  // 'YYYY.MM.DD' / 'YYYY/MM/DD' / 'YYYY-M-D'
  const dashy = raw.replace(/[./]/g, "-");
  const m = dashy.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;

  // 'YYYYMMDD'
  const m2 = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;

  // 마지막 시도(브라우저 파서)
  const d = new Date(raw);
  if (!isNaN(d)) return toYYYYMMDD(d);

  return "";
};

/* =============== 문자열/정답 유틸 =============== */
const normalizeKo = (s = "", { stripParen = true } = {}) => {
  let x = (s + "").trim();
  if (stripParen) x = x.replace(/[(){}「」『』<>.,/·~!@#$%^&*?:;'"|_-]/g, " ");
  x = x
    .replace(/\s+/g, " ")
    .replace(
      /(하는\s*것|하기|함|합니다|하다|하였다|하게|되어|된다|되는|적|적임|상태|성|력)$/g,
      ""
    )
    .replace(/\s+/g, "")
    .toLowerCase();
  return x;
};

const splitMeanings = (s = "") =>
  s
    .split(/[;,/]|(?:\sor\s)|(?:\s또는\s)/g)
    .map((t) => normalizeKo(t))
    .filter(Boolean);

const buildAnswerSet = (meaning = "", alt = "") => {
  const set = new Set();
  splitMeanings(meaning).forEach((v) => set.add(v));
  splitMeanings(alt).forEach((v) => set.add(v));
  return set;
};

const isCorrectKo = (user, meaning, altMeaning, { partial = true } = {}) => {
  const u = normalizeKo(user);
  if (!u) return false;
  const answers = buildAnswerSet(meaning, altMeaning);
  if (answers.has(u)) return true;
  if (partial) {
    for (const a of answers) {
      if (a.length >= 2 && (a.includes(u) || u.includes(a))) return true;
    }
  }
  return false;
};

/* =============== 가나 → 한글 표기 & 비교 =============== */
// 카타카나→히라가나
const toHiragana = (str = "") =>
  (str + "").replace(/[\u30A1-\u30FA]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );

// 한글만 남기기
const normalizeHangul = (s = "") =>
  (s + "").trim().replace(/\s+/g, "").replace(/[^\u3131-\u318E\uAC00-\uD7A3]/g, "");

// 요음(ゃゅょ) 합자
const DIGRAPH = {
  "きゃ": "캬", "きゅ": "큐", "きょ": "쿄",
  "ぎゃ": "갸", "ぎゅ": "규", "ぎょ": "교",
  "しゃ": "샤", "しゅ": "슈", "しょ": "쇼",
  "じゃ": "자",  "じゅ": "주", "じょ": "조",
  "ちゃ": "챠", "ちゅ": "츄", "ちょ": "초",
  "にゃ": "냐", "にゅ": "뉴", "にょ": "뇨",
  "ひゃ": "햐", "ひゅ": "휴", "ひょ": "효",
  "びゃ": "뱌", "びゅ": "뷰", "びょ": "뵤",
  "ぴゃ": "퍄", "ぴゅ": "퓨", "ぴょ": "표",
  "みゃ": "먀", "みゅ": "뮤", "みょ": "묘",
  "りゃ": "랴", "りゅ": "류", "りょ": "료",
};

// 단음(간이)
const MONO = {
  "あ":"아","い":"이","う":"우","え":"에","お":"오",
  "か":"카","き":"키","く":"쿠","け":"케","こ":"코",
  "が":"가","ぎ":"기","ぐ":"구","げ":"게","ご":"고",
  "さ":"사","し":"시","す":"스","せ":"세","そ":"소",
  "ざ":"자","じ":"지","ず":"즈","ぜ":"제","ぞ":"조",
  "た":"타","ち":"치","つ":"츠","て":"테","と":"토",
  "だ":"다","ぢ":"지","づ":"즈","で":"데","ど":"도",
  "な":"나","に":"니","ぬ":"누","ね":"네","の":"노",
  "は":"하","ひ":"히","ふ":"후","へ":"헤","ほ":"호",
  "ば":"바","び":"비","ぶ":"부","べ":"베","ぼ":"보",
  "ぱ":"파","ぴ":"피","ぷ":"푸","ぺ":"페","ぽ":"포",
  "ま":"마","み":"미","む":"무","め":"메","も":"모",
  "や":"야","ゆ":"유","よ":"요",
  "ら":"라","り":"리","る":"루","れ":"레","ろ":"로",
  "わ":"와","を":"오","ん":"ん",
  "ぁ":"아","ぃ":"이","ぅ":"우","ぇ":"에","ぉ":"오",
  "ゎ":"와",
};

// 촉음 っ → 다음 음절 된소리(간단 버전)
const strengthenInitial = (syll) => {
  return syll
    .replace(/^카/, "까").replace(/^키/, "끼").replace(/^쿠/, "꾸").replace(/^케/, "께").replace(/^코/, "꼬")
    .replace(/^타/, "따").replace(/^티/, "띠").replace(/^투/, "뚜").replace(/^테/, "떼").replace(/^토/, "또")
    .replace(/^파/, "빠").replace(/^피/, "삐").replace(/^푸/, "뿌").replace(/^페/, "뻬").replace(/^포/, "뽀")
    .replace(/^사/, "싸").replace(/^시/, "씨").replace(/^스/, "쓰").replace(/^세/, "쎄").replace(/^소/, "쏘")
    .replace(/^자/, "짜").replace(/^지/, "찌").replace(/^즈/, "쯔").replace(/^제/, "쩨").replace(/^조/, "쪼")
    .replace(/^차/, "짜").replace(/^치/, "찌");
};

/* ===== 한글 음절 조합/분해 & 종성(받침) 유틸 ===== */
const H_BASE = 0xac00;
const CHOSEONG = 588;
const JUNGSEONG = 28;

// 종성 인덱스 표 (0=없음)
const JONG_INDEX = {
  "": 0,
  "ㄱ": 1, "ㄲ": 2, "ㄳ": 3,
  "ㄴ": 4, "ㄵ": 5, "ㄶ": 6,
  "ㄷ": 7,
  "ㄹ": 8, "ㄺ": 9, "ㄻ": 10, "ㄼ": 11, "ㄽ": 12, "ㄾ": 13, "ㄿ": 14, "ㅀ": 15,
  "ㅁ": 16,
  "ㅂ": 17, "ㅄ": 18,
  "ㅅ": 19, "ㅆ": 20,
  "ㅇ": 21,
  "ㅈ": 22,
  "ㅊ": 23,
  "ㅋ": 24,
  "ㅌ": 25,
  "ㅍ": 26,
  "ㅎ": 27,
};

const isHangulSyllable = (ch) => {
  const code = ch.charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3;
};

const addBatchimToLast = (str, jong = "ㅇ") => {
  if (!str) return "응"; // 문두에 'ん'이 오면 '응'으로
  const last = str[str.length - 1];
  if (!isHangulSyllable(last)) return str + "응";

  const code = last.charCodeAt(0) - H_BASE;
  const cho = Math.floor(code / CHOSEONG);
  const jung = Math.floor((code % CHOSEONG) / JUNGSEONG);
  const oldJong = code % JUNGSEONG;

  if (oldJong !== 0) return str; // 이미 받침이 있으면 유지

  const jongIdx = JONG_INDEX[jong] ?? 21; // 기본 ㅇ
  const composed = String.fromCharCode(H_BASE + cho * CHOSEONG + jung * JUNGSEONG + jongIdx);
  return str.slice(0, -1) + composed;
};


// 한글 분해/합성
const decomposeHangul = (ch) => {
  const code = ch.charCodeAt(0) - H_BASE;
  const cho = Math.floor(code / CHOSEONG);
  const jung = Math.floor((code % CHOSEONG) / JUNGSEONG);
  const jong = code % JUNGSEONG;
  return { cho, jung, jong };
};
const composeHangul = (cho, jung, jong) =>
  String.fromCharCode(H_BASE + cho * CHOSEONG + jung * JUNGSEONG + jong);

// 한글 음절의 초성 기호 추출
const getInitialJamo = (syll) => {
  if (!syll) return "ㅇ";
  const ch = syll[0];
  if (!isHangulSyllable(ch)) return "ㅇ";
  const code = ch.charCodeAt(0) - H_BASE;
  const cho = Math.floor(code / CHOSEONG);
  const CHO_TABLE = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  return CHO_TABLE[cho] || "ㅇ";
};

// 다음 초성에 따라 'ん'의 받침 결정
const nBatchimByNextInitial = (init) => {
  if (["ㅂ","ㅃ","ㅍ","ㅁ"].includes(init)) return "ㅁ"; // 양순음
  if (["ㄷ","ㅌ","ㅅ","ㅆ","ㅈ","ㅉ","ㅊ","ㄴ","ㄹ"].includes(init)) return "ㄴ"; // 치조/치경
  return "ㅇ"; // 연구개/기타
};

// 가나 → 한글 표기 (ん은 받침 ㄴ/ㅁ/ㅇ로 처리)
const kanaToHangulKo = (kana = "") => {
  const h = toHiragana(kana).replace(/[ｰー―－]/g, ""); // 장음기호 무시
  let out = "";
  let i = 0;
  let gem = false;      // 촉음(っ)
  let pendingN = false; // ん 보류

  const applyPendingN = (nextSyl) => {
    const init = getInitialJamo(nextSyl);
    const jong = nBatchimByNextInitial(init);
    out = addBatchimToLast(out, jong);
    pendingN = false;
  };

  while (i < h.length) {
    const ch = h[i];

    if (ch === "っ") { gem = true; i += 1; continue; } // 촉음
    if (ch === "ん") { pendingN = true; i += 1; continue; } // 비강음

    // 합자
    if (i + 1 < h.length) {
      const dig = h.slice(i, i + 2);
      if (DIGRAPH[dig]) {
        let syl = DIGRAPH[dig];
        if (gem) { syl = strengthenInitial(syl); gem = false; }
        if (pendingN) applyPendingN(syl);
        out += syl;
        i += 2;
        continue;
      }
    }

    // 단음
    const mono = MONO[ch];
    if (mono) {
      let syl = mono;
      if (gem) { syl = strengthenInitial(syl); gem = false; }
      if (pendingN) applyPendingN(syl);
      out += syl;
      i += 1;
      continue;
    }

    // 미정의: 스킵
    i += 1;
  }

  // 끝에 남은 ん → ㅇ 받침
  if (pendingN) out = addBatchimToLast(out, "ㅇ");

  return out;
};

/* ===== ‘ん(비강음)’ 유연 매칭 (ㄴ/ㅁ/ㅇ 허용) ===== */
const buildNasalFlexibleRegex = (answerHangul) => {
  const JONG_N = JONG_INDEX["ㄴ"];   // 4
  const JONG_M = JONG_INDEX["ㅁ"];   // 16
  const JONG_NG = JONG_INDEX["ㅇ"];  // 21
  const NASAL_SET = new Set([JONG_N, JONG_M, JONG_NG]);

  let pattern = "^";
  for (const ch of answerHangul) {
    if (isHangulSyllable(ch)) {
      const { cho, jung, jong } = decomposeHangul(ch);
      if (NASAL_SET.has(jong)) {
        const a = composeHangul(cho, jung, JONG_N);
        const b = composeHangul(cho, jung, JONG_M);
        const c = composeHangul(cho, jung, JONG_NG);
        const choices = Array.from(new Set([a, b, c])).join("");
        pattern += `(?:[${choices}])`;
      } else {
        pattern += ch;
      }
    } else {
      pattern += ch.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    }
  }
  pattern += "$";
  return new RegExp(pattern);
};

/* ===== 촉음(っ) 유연 허용: 앞 음절로 ㅅ/ㅆ 받침 흡수 ===== */
// 예) 미까 ↔ 밋카(밋까)
const generateGeminateVariants = (answerHangul) => {
  const variants = new Set([answerHangul]);
  const chars = [...answerHangul];

  for (let i = 1; i < chars.length; i++) {
    const cur = chars[i];
    const prev = chars[i - 1];
    if (!isHangulSyllable(cur) || !isHangulSyllable(prev)) continue;

    const p = decomposeHangul(prev);

    // 현재 음절이 '까/따/빠/싸/짜'로 시작하면 → 평음으로 바꾸고 앞 음절에 받침 부여
    if (/^(까|따|빠|싸|짜)/.test(cur)) {
      const base = cur
        .replace(/^까/, "카")
        .replace(/^따/, "타")
        .replace(/^빠/, "파")
        .replace(/^싸/, "사")
        .replace(/^짜/, "차");

      // (1) 앞 음절 받침 ㅅ
      const mergedS = [...chars];
      mergedS[i - 1] = composeHangul(p.cho, p.jung, JONG_INDEX["ㅅ"]);
      mergedS[i] = base;
      variants.add(mergedS.join(""));

      // (2) 앞 음절 받침 ㅆ
      const mergedSS = [...chars];
      mergedSS[i - 1] = composeHangul(p.cho, p.jung, JONG_INDEX["ㅆ"]);
      mergedSS[i] = base;
      variants.add(mergedSS.join(""));
    }
  }
  return [...variants];
};

/* ===== 발음 정답 비교 (‘ん’ + 촉음 유연) ===== */
const isCorrectKanaKo = (
  userHangul,
  kanaReading,
  { nasalFlexible = true, geminateFlexible = true } = {}
) => {
  const ansRaw = kanaToHangulKo(kanaReading || "");
  const user = normalizeHangul(userHangul);
  if (!user) return false;

  // 정답 후보(기본 + 촉음 유연)
  const baseAns = normalizeHangul(ansRaw);
  const candidates = geminateFlexible
    ? generateGeminateVariants(baseAns).map(normalizeHangul)
    : [baseAns];

  // 각 후보마다 ‘ん’ 유연 정규식으로 검사
  for (const cand of candidates) {
    if (nasalFlexible) {
      const re = buildNasalFlexibleRegex(cand);
      if (re.test(user)) return true;
    } else {
      if (user === cand) return true;
    }
  }
  return false;
};

/* =============== 샘플 데이터 =============== */
const SAMPLE_WORDS = [
  { id: 1, jp: "地下鉄", reading: "ちかてつ",   meaning: "지하철", alt_meanings: "전철", study_date: "2025-10-10" },
  { id: 2, jp: "約束",   reading: "やくそく",   meaning: "약속",   alt_meanings: "약조", study_date: "2025-10-10" },
  { id: 3, jp: "注意",   reading: "ちゅうい",   meaning: "주의",   alt_meanings: "유의; 경계", study_date: "2025-10-11" },
  { id: 4, jp: "便利",   reading: "べんり",     meaning: "편리",   alt_meanings: "유용", study_date: "2025-10-12" },
  { id: 5, jp: "練習",   reading: "れんしゅう", meaning: "연습",   alt_meanings: "훈련", study_date: "2025-10-12" },
  { id: 6, jp: "情報",   reading: "じょうほう", meaning: "정보",   alt_meanings: "소식; 뉴스", study_date: "2025-10-13" },
  { id: 7, jp: "経験",   reading: "けいけん",   meaning: "경험",   alt_meanings: "체험", study_date: "2025-10-14" },
  { id: 8, jp: "感謝",   reading: "かんしゃ",   meaning: "감사",   alt_meanings: "고마움", study_date: "2025-10-15" },
  { id: 9, jp: "挑戦",   reading: "ちょうせん", meaning: "도전",   alt_meanings: "챌린지", study_date: "2025-10-15" },
  { id:10, jp: "三日",   reading: "みっか",     meaning: "삼일",   alt_meanings: "3일",   study_date: "2025-10-16" },
];

/* =============== 스타일 =============== */
const S = {
  page: { minHeight: "100vh", display: "grid", placeItems: "center", background: "#f7f7fb", padding: 20 },
  card: { width: "min(840px, 94vw)", background: "#fff", border: "1px solid #eee", borderRadius: 16, boxShadow: "0 6px 24px rgba(0,0,0,.06)", padding: 24 },
  h2: { margin: "0 0 12px", fontSize: 22 },
  row: { display: "flex", gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" },
  input: { flex: 1, minWidth: 160, padding: "12px 14px", border: "1px solid #ddd", borderRadius: 10, fontSize: 16 },
  btn: { padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd", background: "#fff", cursor: "pointer" },
  btnPrimary: { padding: "10px 16px", borderRadius: 10, border: "1px solid #2b66f6", background: "#2b66f6", color: "#fff", fontWeight: 600, cursor: "pointer" },
  topbar: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, marginBottom: 12, color: "#666" },
  jpBox: { background: "#f9fbff", border: "1px solid #eef3ff", borderRadius: 12, padding: "18px 16px", marginTop: 4, marginBottom: 12 },
  kanji: { fontSize: 28, fontWeight: 700, lineHeight: 1.1 },
  reading: { marginLeft: 8, fontSize: 18, color: "#2b66f6" },
  prompt: { marginTop: 8, color: "#555" },
  hint: { marginTop: 8, padding: "8px 10px", background: "#fff8e1", border: "1px solid #ffe9a8", color: "#6b5200", borderRadius: 8, fontSize: 13 },
  feedbackOk: { marginTop: 12, padding: "10px 12px", background: "#ecf8ee", border: "1px solid #c9e8cf", color: "#136d2b", borderRadius: 10, fontWeight: 600 },
  feedbackNo: { marginTop: 12, padding: "10px 12px", background: "#fff0f0", border: "1px solid #ffd9d9", color: "#a02222", borderRadius: 10, fontWeight: 600 },
  footer: { marginTop: 14, display: "flex", justifyContent: "space-between", fontSize: 13, color: "#666" },
  divider: { height: 1, background: "#f0f0f0", margin: "16px 0" },
  small: { fontSize: 12, color: "#777" },
  label: { display: "flex", gap: 8, alignItems: "center" },
};

/* =============== 컴포넌트 =============== */
export default function Test({ words }) {
  const raw = Array.isArray(words) && words.length ? words : SAMPLE_WORDS;

  // study_date 표준화 + 스키마 보정
  const data = useMemo(() => {
    return raw
      .map((w, i) => {
        const id = w.id ?? `${Date.now()}_${i}`;
        const jp = (w.jp ?? w.kanji ?? w.kana ?? "").toString().trim();
        const reading = (w.reading ?? w.kana ?? "").toString().trim();
        const meaning = (w.meaning ?? w.meaning_ko ?? "").toString().trim();
        const alt_meanings = (w.alt_meanings ?? "").toString();

        // 컬럼명 변형 흡수
        const rawDate =
          w.study_date ?? w.studyDate ?? w.date ?? w.학습일 ?? w.날짜 ?? w["Study Date"];
        const sd = normalizeDateAny(rawDate); // 'YYYY-MM-DD' 또는 ''

        return { id, jp, reading, meaning, alt_meanings, study_date: sd };
      })
      .filter((w) => w.jp && (w.meaning || w.reading));
  }, [raw]);

  const [status, setStatus] = useState("start"); // start | quiz | result
  const [showReading, setShowReading] = useState(true);
  const [allowPartial, setAllowPartial] = useState(true);

  // 출제 모드: meaning(뜻) | hangul(발음)
  const [quizMode, setQuizMode] = useState("meaning");

  // 날짜 필터
  const [dateFilterMode, setDateFilterMode] = useState("all"); // all | single | range
  const [dateSingle, setDateSingle] = useState(""); // YYYY-MM-DD
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // 퀴즈 상태
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState(null); // { ok, message }
  const [wrongIds, setWrongIds] = useState([]);
  const inputRef = useRef(null);

  // 날짜 필터링(양쪽 모두 normalizeDateAny로 비교)
  const filtered = useMemo(() => {
    if (dateFilterMode === "single" && dateSingle) {
      const want = normalizeDateAny(dateSingle);
      return data.filter((w) => normalizeDateAny(w.study_date) === want);
    }
    if (dateFilterMode === "range" && (dateFrom || dateTo)) {
      const from = normalizeDateAny(dateFrom) || "0000-01-01";
      const to = normalizeDateAny(dateTo) || "9999-12-31";
      const [lo, hi] = from > to ? [to, from] : [from, to];
      return data.filter((w) => {
        const d = normalizeDateAny(w.study_date);
        return d && d >= lo && d <= hi;
      });
    }
    return data;
  }, [data, dateFilterMode, dateSingle, dateFrom, dateTo]);

  // 모드별 출제 가능 데이터
  const eligible = useMemo(() => {
    return quizMode === "hangul"
      ? filtered.filter((w) => !!w.reading)
      : filtered.filter((w) => !!w.meaning);
  }, [filtered, quizMode]);

  // 현재 문제
  const current = queue[idx];

  // 힌트
  const hint = useMemo(() => {
    if (!current) return null;
    if (quizMode === "hangul") {
      const r = (current.reading || "").trim();
      const first = r[0] || "";
      const len = r.replace(/\s/g, "").length;
      return { first, len, type: "hangul" };
    } else {
      const m = (current.meaning || "").split(/[;,/]/)[0]?.trim() || "";
      const first = m[0] || "";
      const len = m.replace(/\s/g, "").length;
      return { first, len, type: "meaning" };
    }
  }, [current, quizMode]);

  // 셔플
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const startQuiz = () => {
    if (eligible.length === 0) {
      alert("선택한 필터/모드에 해당하는 데이터가 없습니다.");
      return;
    }
    const q = shuffle(eligible);
    setQueue(q);
    setIdx(0);
    setInput("");
    setFeedback(null);
    setWrongIds([]);
    setStatus("quiz");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // 채점
  const submit = () => {
    if (!current) return;
    let ok = false;

    if (quizMode === "hangul") {
      // ‘ん’ 변형 + 촉음 유연(밋카 허용) ON
      ok = isCorrectKanaKo(input, current.reading, {
        nasalFlexible: true,
        geminateFlexible: true, // << 여기!
      });
    } else {
      ok = isCorrectKo(input, current.meaning, current.alt_meanings, { partial: allowPartial });
    }

    if (ok) {
      setFeedback({ ok: true, message: "정답!" });
      setTimeout(() => {
        setInput("");
        setFeedback(null);
        setIdx((i) => i + 1);
        setTimeout(() => inputRef.current?.focus(), 0);
      }, 400);
    } else {
      const correctMsg =
        quizMode === "hangul"
          ? `정답(한글 표기): ${kanaToHangulKo(current.reading || "")}`
          : `정답: ${current.meaning}${current.alt_meanings ? ` (허용: ${current.alt_meanings})` : ""}`;

      setFeedback({ ok: false, message: correctMsg });
      setWrongIds((w) => [...w, current.id]);
      setQueue((q) => [...q, current, current]); // 라이트 SRS
      setTimeout(() => {
        setInput("");
        setFeedback(null);
        setIdx((i) => i + 1);
        setTimeout(() => inputRef.current?.focus(), 0);
      }, 900);
    }
  };

  const pass = () => {
    if (!current) return;
    setWrongIds((w) => [...w, current.id]);
    setQueue((q) => [...q, current]); // 한 번만 재삽입
    setInput("");
    setFeedback(null);
    setIdx((i) => i + 1);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const onKeyDown = (e) => {
    if (e.isComposing) return; // IME 조합 중 Enter 무시
    if (e.key === "Enter") submit();
  };

  // 화면 렌더
  if (status === "start") {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <h2 style={S.h2}>단어 테스트 시작</h2>
          <p style={{ color: "#555", marginBottom: 8 }}>
            출제 모드와 날짜를 선택한 뒤 시작하세요.
          </p>

          <div style={S.divider} />

          {/* 출제 모드 */}
          <div style={{ display: "grid", gap: 12 }}>
            <div style={S.row}>
              <span style={{ width: 120 }}>출제 모드</span>
              <label style={S.label}>
                <input
                  type="radio"
                  name="quizMode"
                  value="meaning"
                  checked={quizMode === "meaning"}
                  onChange={() => setQuizMode("meaning")}
                />
                한국어 뜻 입력
              </label>
              <label style={S.label}>
                <input
                  type="radio"
                  name="quizMode"
                  value="hangul"
                  checked={quizMode === "hangul"}
                  onChange={() => setQuizMode("hangul")}
                />
                발음 입력(한글)
              </label>
            </div>

            {/* 날짜 필터 */}
            <div style={S.row}>
              <span style={{ width: 120 }}>날짜 필터</span>
              <label style={S.label}>
                <input
                  type="radio"
                  name="dateFilterMode"
                  value="all"
                  checked={dateFilterMode === "all"}
                  onChange={() => setDateFilterMode("all")}
                />
                전체
              </label>

              <label style={S.label}>
                <input
                  type="radio"
                  name="dateFilterMode"
                  value="single"
                  checked={dateFilterMode === "single"}
                  onChange={() => setDateFilterMode("single")}
                />
                단일 날짜
              </label>

              {dateFilterMode === "single" && (
                <input
                  type="date"
                  value={dateSingle}
                  onChange={(e) => setDateSingle(e.target.value)}
                  style={S.input}
                />
              )}
            </div>

            <div style={S.row}>
              <span style={{ width: 120 }} />
              <label style={S.label}>
                <input
                  type="radio"
                  name="dateFilterMode"
                  value="range"
                  checked={dateFilterMode === "range"}
                  onChange={() => setDateFilterMode("range")}
                />
                기간
              </label>

              {dateFilterMode === "range" && (
                <>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    style={S.input}
                    placeholder="시작일"
                  />
                  <span>~</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    style={S.input}
                    placeholder="종료일"
                  />
                </>
              )}
            </div>

            {/* 옵션 */}
            {quizMode === "meaning" && (
              <>
                <label style={S.label}>
                  <input
                    type="checkbox"
                    checked={showReading}
                    onChange={(e) => setShowReading(e.target.checked)}
                  />
                  후리가나(읽기) 표시
                </label>

                <label style={S.label}>
                  <input
                    type="checkbox"
                    checked={allowPartial}
                    onChange={(e) => setAllowPartial(e.target.checked)}
                  />
                  부분일치 허용
                </label>
              </>
            )}
          </div>

          <div style={{ ...S.row, justifyContent: "space-between" }}>
            <span style={S.small}>
              {eligible.length === 0
                ? "⚠️ 선택한 필터/모드에 해당하는 데이터가 없습니다."
                : `출제 예정: ${eligible.length}문항 (모두 출제)`}
            </span>
            <button
              style={S.btnPrimary}
              onClick={startQuiz}
              disabled={eligible.length === 0}
              title={eligible.length === 0 ? "출제할 데이터가 없습니다" : undefined}
            >
              시작하기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 결과 화면 (큐를 모두 소비했을 때)
  if (status === "quiz" && !current) {
    const total = idx;
    const wrong = wrongIds.length;
    const correct = total - wrong;
    const rate = total ? Math.round((correct / total) * 100) : 0;

    return (
      <div style={S.page}>
        <div style={S.card}>
          <h2 style={S.h2}>결과</h2>
          <p style={{ marginBottom: 8 }}>
            정답: <b>{correct}</b> / {total} ({rate}%)
          </p>
          <p style={S.small}>
            오답 재출제(큐 뒤 재삽입)를 적용했기 때문에 실제 풀이 문항 수가 늘어날 수 있어요.
          </p>

          <div style={S.row}>
            <button style={S.btn} onClick={() => setStatus("start")}>
              옵션 바꾸기
            </button>
            <button style={S.btnPrimary} onClick={startQuiz}>
              같은 옵션으로 다시 풀기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 퀴즈 화면
  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.topbar}>
          <div>단어 테스트 {quizMode === "hangul" ? "· 한글 발음 입력" : "· 뜻 입력"}</div>
          <div>{Math.min(idx + 1, queue.length)} / {queue.length}</div>
        </div>

        <div style={S.jpBox}>
          <div>
            <span style={S.kanji}>{current.jp}</span>
            {quizMode === "meaning" && showReading && current.reading ? (
              <span style={S.reading}>（{current.reading}）</span>
            ) : null}
          </div>
          <div style={S.prompt}>
            {quizMode === "hangul" ? "→ 발음(한글)을 입력하세요" : "→ 한국어 뜻을 입력하세요"}
          </div>
        </div>

        <div style={S.row}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={quizMode === "hangul" ? "예: 치카테츠 / 밋카" : "예: 지하철"}
            style={S.input}
            autoFocus
          />
          <button style={S.btnPrimary} onClick={submit}>채점(Enter)</button>
          <button style={S.btn} onClick={pass}>패스</button>
        </div>

        {hint && (
          <div style={S.hint}>
            힌트: 글자수 {hint.len} / 첫글자 ‘{hint.first || "?"}’
          </div>
        )}

        {feedback && (
          <div style={feedback.ok ? S.feedbackOk : S.feedbackNo}>
            {feedback.message}
          </div>
        )}

        <div style={S.footer}>
          <div>남은: {queue.length - (idx + 1)} | 오답 큐: {wrongIds.length}</div>
          <div style={S.small}>Enter: 채점</div>
        </div>
      </div>
    </div>
  );
}
