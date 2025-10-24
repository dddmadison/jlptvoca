// src/App.js
import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import Test from "./pages/Test";
import Voca from "./pages/Voca";
import { loadWordsFromXlsx } from "./utils/LoadWordFromXlsx";

const TEMPLATE_URL = "/templates/master.xlsx";

export default function App() {
  const [words, setWords] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [error, setError] = useState("");

  // ---------- 엑셀 단어 데이터 로드 ----------
  useEffect(() => {
    const loadData = async () => {
      try {
        setStatus("loading");
        const data = await loadWordsFromXlsx(TEMPLATE_URL);
        setWords(data);
        setStatus("done");
      } catch (e) {
        console.error("[Excel Load Error]", e);
        setError(e.message || "엑셀 파일을 불러오는 중 오류가 발생했습니다.");
        setStatus("error");
      }
    };
    loadData();
  }, []);

  // ---------- 상태별 공통 UI ----------
  if (status === "loading") {
    return <div style={{ padding: 24 }}> 엑셀 단어 데이터를 불러오는 중...</div>;
  }
  if (status === "error") {
    return (
      <div style={{ padding: 24, color: "#a00" }}>
        {error}
        <br />
        <small>파일 위치: <code>public/templates/master.xlsx</code></small>
      </div>
    );
  }

  // ---------- 라우팅 ----------
  return (
    <BrowserRouter>
      <nav style={{ padding: 12, borderBottom: "1px solid #eee" }}>
        <Link to="/" style={{ marginRight: 12 }}>Home</Link>
        <Link to="/test" style={{ marginRight: 12 }}>Test</Link>
        <Link to="/voca">Voca</Link>
      </nav>

      <Routes>
        <Route path="/" element={<Home words={words} />} />
        <Route
          path="/test"
          element={
            words.length
              ? <Test words={words} />
              : <div style={{ padding: 24 }}> 단어 데이터가 없습니다. 엑셀 파일을 확인하세요.</div>
          }
        />
        <Route path="/voca" element={<Voca />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
