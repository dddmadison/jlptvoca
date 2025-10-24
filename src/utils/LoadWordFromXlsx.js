// src/utils/LoadWordFromXlsx.js
import * as XLSX from "xlsx";

/** ---------- 📅 날짜 변환 유틸 ---------- **/
const excelSerialToDate = (n) => {
  const base = Date.UTC(1899, 11, 30);
  return new Date(base + Math.floor(Number(n)) * 86400000);
};

const toYYYYMMDD = (d) => {
  if (!(d instanceof Date) || isNaN(d)) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const normalizeDateAny = (v) => {
  if (v == null || v === "") return "";

  if (v instanceof Date) return toYYYYMMDD(v);
  if (typeof v === "number" && isFinite(v))
    return toYYYYMMDD(excelSerialToDate(v));

  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return "";
    // 엑셀 시리얼 숫자 문자열
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = Math.floor(parseFloat(s));
      if (n >= 20000 && n <= 70000) return toYYYYMMDD(excelSerialToDate(n));
    }
    // 다양한 포맷 허용
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    if (/^\d{4}[./-]\d{1,2}[./-]\d{1,2}$/.test(s)) {
      const [y, m, d] = s.split(/[./-]/);
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
    const parsed = new Date(s);
    return isNaN(parsed) ? "" : toYYYYMMDD(parsed);
  }
  return "";
};

/** ---------- 🏷️ 헤더 매칭 유틸 ---------- **/
const norm = (s = "") => String(s).replace(/[\s_():\-.\u3000]/g, "").toLowerCase();

const ALIAS = {
  jp: ["jp", "kanji", "word", "일본어", "단어", "漢字", "語", "語彙", "単語"],
  reading: ["reading", "kana", "yomi", "후리가나", "읽기", "가나", "よみ", "ふりがな"],
  meaning: ["meaning", "뜻", "의미", "한국어", "해석", "뜻풀이"],
  alt: ["alt_meanings", "동의어", "유의어", "대체뜻", "허용"],
  studyDate: ["study_date", "date", "날짜", "학습일", "일자"],
  source: ["source", "출처", "책", "원문"],
  sourcePg: ["page", "쪽", "페이지"],
  sourceUrl: ["url", "link", "웹주소"],
};

const matchHeader = (header, aliases) => {
  const h = norm(header);
  return aliases.some((a) => {
    const A = norm(a);
    return h === A || h.includes(A) || A.includes(h);
  });
};

/** ---------- 📘 Excel 로더 ---------- **/
export async function loadWordsFromXlsx(url) {
  const res = await fetch(`${url}?v=${Date.now()}`);
  if (!res.ok) throw new Error("엑셀 파일을 불러올 수 없습니다.");

  const buf = await res.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("엑셀 파일에 시트가 없습니다.");

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (!rows.length) return [];

  const headers = rows[0].map(String);
  const aliasIndex = Object.fromEntries(
    Object.entries(ALIAS).map(([key, list]) => [
      key,
      headers.findIndex((h) => matchHeader(h, list)),
    ])
  );

  const data = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const jp = row[aliasIndex.jp];
    const meaning = row[aliasIndex.meaning];
    if (!jp || !meaning) continue;

    data.push({
      id: `${sheetName}-${r}`,
      jp: String(jp).trim(),
      reading: String(row[aliasIndex.reading] ?? "").trim(),
      meaning: String(meaning).trim(),
      alt_meanings: String(row[aliasIndex.alt] ?? "").trim(),
      study_date: normalizeDateAny(row[aliasIndex.studyDate]),
      source: String(row[aliasIndex.source] ?? "").trim(),
      source_page: String(row[aliasIndex.sourcePg] ?? "").trim(),
      source_url: String(row[aliasIndex.sourceUrl] ?? "").trim(),
    });
  }
  return data;
}

export default loadWordsFromXlsx;
