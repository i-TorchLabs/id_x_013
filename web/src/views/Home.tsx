"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/context/ThemeContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Modal, Button } from "@heroui/react";
import { motion, AnimatePresence } from "framer-motion";
import { dataGraphqlApi, userGraphqlApi, type FieldInfo, type FieldDef, type DbConfig } from "@/api/graphql";
import { getTokens, SF_DISPLAY, SF_TEXT, SF_MONO } from "@/utils/tokens";

// Card MUST be defined outside Home to prevent re-mount on every state change
const Card = ({ children, className = "", bg, shadow }: { children: React.ReactNode; className?: string; bg: string; shadow: string }) => (
  <div className={`rounded-2xl overflow-visible ${className}`} style={{ background: bg, boxShadow: shadow }}>
    <div style={{ padding: "28px" }}>{children}</div>
  </div>
);

const DTYPE_OPTIONS = ["TEXT", "INTEGER", "DOUBLE PRECISION", "BOOLEAN", "TIMESTAMP"];
const ease = [0.25, 0.4, 0.25, 1] as [number, number, number, number];

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.55, ease } }),
  exit: { opacity: 0, y: -12, transition: { duration: 0.3 } },
};
const scaleIn = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.45, ease } },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.25 } },
};
const pulseRing = {
  animate: { scale: [1, 1.8], opacity: [0.5, 0] },
  transition: { duration: 1.6, ease: [0.25, 0.4, 0.25, 1] as [number, number, number, number], repeat: Infinity },
};
const dotBounce = {
  animate: { y: [0, -6, 0], opacity: [0.4, 1, 0.4] },
  transition: { duration: 0.9, ease: [0.25, 0.4, 0.25, 1] as [number, number, number, number], repeat: Infinity },
};

export default function Home() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [parsedFields, setParsedFields] = useState<FieldInfo[]>([]);
  const [fieldDefs, setFieldDefs] = useState<FieldDef[]>([]);
  const [tableName, setTableName] = useState("");
  const [tableComment, setTableComment] = useState("");
  const [dbConfig, setDbConfig] = useState<DbConfig | null>(null);
  const [dbConfigLoading, setDbConfigLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string; sql?: string; rowsImported?: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [fieldPage, setFieldPage] = useState(1);
  const PAGE_SIZE = 8;
  const totalPages = useMemo(() => Math.ceil(parsedFields.length / PAGE_SIZE), [parsedFields.length]);
  const pageFields = useMemo(() => {
    const start = (fieldPage - 1) * PAGE_SIZE;
    return parsedFields.slice(start, start + PAGE_SIZE).map((field, pageIdx) => ({ field, globalIndex: start + pageIdx }));
  }, [parsedFields, fieldPage]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = getTokens(isDark);
  const { bg, fg, fg2, fg3, fg4, card, inputBg, inputBorder, divider, shadow, navBg, accent, accentFg, iconContainerBg, completedStepBg } = t;
  const SF = SF_DISPLAY;
  const SFT = SF_TEXT;

  useEffect(() => { (async () => { try { const r = await dataGraphqlApi.getDbConfig(); setDbConfig(r.getDbConfig); } catch {} finally { setDbConfigLoading(false); } })(); }, []);
  useEffect(() => { setFieldPage(1); }, [parsedFields, currentStep]);

  const handleFileSelect = useCallback(async (file: File) => {
    setSelectedFile(file); setIsParsing(true); setSubmitResult(null); setParsedFields([]); setFieldDefs([]);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1]; setFileBase64(base64);
      try { const r = await dataGraphqlApi.parseFile(base64, file.name); if (r.parseFile.success) { setParsedFields(r.parseFile.fields); setFieldDefs(r.parseFile.fields.map(f => ({ name: f.name, dtype: mapDtype(f.dtype), comment: "" }))); setCurrentStep(1); } else { setSubmitResult({ success: false, message: r.parseFile.message || "文件解析失败" }); } }
      catch (e: any) { setSubmitResult({ success: false, message: e.message || "文件解析失败" }); } finally { setIsParsing(false); }
    };
    reader.onerror = () => { setIsParsing(false); setSubmitResult({ success: false, message: "文件读取失败" }); };
    reader.readAsDataURL(file);
  }, []);

  const mapDtype = (d: string) => { const l = d.toLowerCase(); if (l.includes("int")) return "INTEGER"; if (l.includes("float") || l.includes("double") || l.includes("decimal") || l.includes("number")) return "DOUBLE PRECISION"; if (l.includes("bool")) return "BOOLEAN"; if (l.includes("date") || l.includes("time") || l.includes("timestamp")) return "TIMESTAMP"; return "TEXT"; };
  const updateFieldDef = (i: number, k: keyof FieldDef, v: string) => setFieldDefs(p => { const u = [...p]; u[i] = { ...u[i], [k]: v }; return u; });
  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }, [handleFileSelect]);
  const handleSubmit = useCallback(async () => {
    if (!tableName.trim()) { setSubmitResult({ success: false, message: "请输入表名" }); return; }
    if (!dbConfig) { setSubmitResult({ success: false, message: "数据库连接配置未加载" }); return; }
    setIsSubmitting(true); setSubmitResult(null);
    try { const r = await dataGraphqlApi.createTableAndImport({ tableName: tableName.trim(), tableComment: tableComment.trim(), fields: fieldDefs, host: dbConfig.host, port: Number(dbConfig.port), username: dbConfig.username, password: dbConfig.password, database: dbConfig.database, fileData: fileBase64, filename: selectedFile?.name || "" }); setSubmitResult({ success: r.createTableAndImport.success, message: r.createTableAndImport.message, sql: r.createTableAndImport.sql, rowsImported: r.createTableAndImport.rowsImported }); }
    catch (e: any) { setSubmitResult({ success: false, message: e.message || "操作失败" }); } finally { setIsSubmitting(false); }
  }, [tableName, tableComment, fieldDefs, dbConfig, fileBase64, selectedFile]);
  const handleLogout = useCallback(async () => { setShowLogoutConfirm(false); try { await userGraphqlApi.logout(); } catch {} localStorage.removeItem("token"); localStorage.removeItem("user"); router.push("/f/login"); }, [router]);
  const handleReset = useCallback(() => { setSelectedFile(null); setFileBase64(""); setParsedFields([]); setFieldDefs([]); setTableName(""); setTableComment(""); setSubmitResult(null); setCurrentStep(0); }, []);
  const canSubmit = tableName.trim() && parsedFields.length > 0 && dbConfig && !isSubmitting;

  const steps = [
    { n: 1, label: "Upload", icon: "upload" },
    { n: 2, label: "Configure", icon: "config" },
    { n: 3, label: "Connect", icon: "db" },
    { n: 4, label: "Import", icon: "import" },
  ];


  // Inner: another 16px padded section inside card content
  const P = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
    <div style={{ padding: "16px", ...style }}>{children}</div>
  );

  const StepNav = ({ onPrev, onNext, prevDisabled = false, nextDisabled = false, nextLabel = "Next", prevLabel = "Back" }: {
    onPrev: () => void; onNext: () => void; prevDisabled?: boolean; nextDisabled?: boolean; nextLabel?: string; prevLabel?: string;
  }) => (
    <div className="flex items-center justify-between" style={{ marginTop: "24px", paddingTop: "20px", borderTop: `1px solid ${divider}` }}>
      <button onClick={onPrev} disabled={prevDisabled} className="text-base font-medium transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ fontFamily: SFT, background: accent, color: accentFg, border: "none", borderRadius: "980px", letterSpacing: "-0.32px", cursor: prevDisabled ? "not-allowed" : "pointer" }}>
        <div style={{ padding: "9px 26px" }}>{prevLabel}</div>
      </button>
      <button onClick={onNext} disabled={nextDisabled} className="text-base font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ fontFamily: SFT, background: accent, color: accentFg, border: "none", borderRadius: "980px", letterSpacing: "-0.32px", cursor: nextDisabled ? "not-allowed" : "pointer" }}>
        <div style={{ padding: "9px 26px" }}>{nextLabel}</div>
      </button>
    </div>
  );

  return (
    <div className="h-screen flex flex-col" style={{ background: bg }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 h-14 shrink-0 z-50"
        style={{ background: navBg, backdropFilter: "saturate(180%) blur(20px)", WebkitBackdropFilter: "saturate(180%) blur(20px)", borderBottom: `0.5px solid ${divider}` }}>
        <div className="flex items-center gap-2.5" style={{ marginLeft: "27px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.ico" alt="TorchLabs logo" style={{ width: 22, height: 22 }} />
          <span style={{ fontFamily: SF, fontSize: "17px", fontWeight: 600, color: fg, letterSpacing: "-0.374px" }}>TorchLabs</span>
        </div>
        <div className="flex items-center gap-4" style={{ padding: "0 27px" }}>
          <ThemeToggle />
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className={`p-3 rounded-full transition-colors duration-200 ${isDark ? "hover:bg-[rgba(255,255,255,0.08)]" : "hover:bg-[rgba(0,0,0,0.05)]"}`}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: fg2,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Log out"
            title="Log out"
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
          </button>
        </div>
      </nav>

      {/* Main */}
      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex flex-col items-center min-h-full px-6">

          {/* Hero */}
          <div className="w-full max-w-[1080px] text-center shrink-0" style={{ marginTop: "24px" }}>
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease }}
              style={{
                background: `linear-gradient(135deg, ${card} 0%, ${card} 60%, ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)"} 100%)`,
                border: `1px solid ${divider}`,
                borderRadius: "20px",
                boxShadow: shadow,
                padding: "40px 32px 36px",
                marginBottom: "20px",
              }}
            >
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15, duration: 0.5, ease }}
                className="inline-block"
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: accent,
                  background: t.badgeBg,
                  padding: "5px 14px",
                  borderRadius: "980px",
                  marginBottom: "18px",
                }}
              >
                Data Pipeline
              </motion.span>
              <h1 style={{ fontFamily: SF, fontSize: "52px", fontWeight: 600, lineHeight: 1.05, letterSpacing: "-0.52px", color: fg, margin: 0 }}>Data Forge</h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                style={{
                  fontFamily: SFT,
                  fontSize: "18px",
                  fontWeight: 400,
                  lineHeight: 1.5,
                  letterSpacing: "-0.3px",
                  color: fg3,
                  marginTop: "14px",
                  marginBottom: 0,
                  maxWidth: "520px",
                  marginLeft: "auto",
                  marginRight: "auto",
                }}
              >
                Upload a spreadsheet, map the columns, and import into your database.
              </motion.p>
            </motion.div>
          </div>

          {/* Step Indicator */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
            className="w-full max-w-[1080px] shrink-0"
            style={{
              background: card,
              border: `1px solid ${divider}`,
              borderRadius: "16px",
              boxShadow: shadow,
              padding: "22px 24px",
              marginBottom: "20px",
            }}>
            <div className="flex items-center justify-center">
              {steps.map((step, i) => {
                const isActive = currentStep >= i;
                const isCurrent = currentStep === i;
                return (
                  <div key={step.n} className="flex items-center">
                    <div className="flex items-center gap-3 cursor-pointer transition-opacity duration-200" style={{ opacity: isActive ? 1 : 0.5 }} onClick={() => { if (isActive) setCurrentStep(i); }}>
                      <motion.div
                        animate={{ scale: isCurrent ? 1 : 0.92 }}
                        transition={{ duration: 0.3, ease }}
                        className="rounded-full flex items-center justify-center transition-all duration-300"
                        style={{
                          width: 36, height: 36,
                          background: isCurrent ? accent : isActive ? completedStepBg : inputBg,
                          border: isCurrent ? "none" : `1.5px solid ${isActive ? accent : inputBorder}`,
                        }}
                      >
                        {isActive && !isCurrent ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                        ) : (
                          <span style={{ fontFamily: SFT, fontSize: "13px", fontWeight: 600, color: isCurrent ? (isDark ? "#000" : "#fff") : isActive ? accent : fg4 }}>{step.n}</span>
                        )}
                      </motion.div>
                      <span style={{ fontFamily: SFT, fontSize: "14px", fontWeight: isCurrent ? 600 : 400, color: isCurrent ? fg : fg3, letterSpacing: "-0.224px" }}>{step.label}</span>
                    </div>
                    {i < steps.length - 1 && <div className="mx-4" style={{ width: 48, height: "2px", borderRadius: "1px", background: isActive && currentStep > i ? accent : divider, transition: "background 0.3s" }} />}
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* Step Content */}
          <div className="w-full max-w-[1080px] flex-1" style={{ paddingBottom: "48px" }}>
            <AnimatePresence mode="wait">

              {/* Step 0: Upload */}
              {currentStep === 0 && (
                <motion.div key="step0" variants={scaleIn} initial="hidden" animate="visible" exit="exit">
                  <Card bg={card} shadow={shadow}>
                    <div className="transition-all duration-300 cursor-pointer"
                      style={{ border: `1.5px dashed ${isDragOver ? accent : divider}`, background: isDragOver ? iconContainerBg : inputBg, padding: "56px 32px", borderRadius: "16px", transition: "all 0.3s ease" }}
                      onClick={() => { if (!isParsing) fileInputRef.current?.click(); }}
                      onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                      onDragLeave={() => setIsDragOver(false)}
                      onDrop={handleDrop}>
                      <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
                      <div className="flex flex-col items-center gap-6">
                        {isParsing ? (
                          <div className="flex flex-col items-center gap-6" style={{ padding: "24px 0" }}>
                            <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
                              <motion.span
                                variants={pulseRing}
                                initial={false}
                                animate="animate"
                                className="absolute rounded-full"
                                style={{ width: 96, height: 96, border: `2px solid ${accent}` }}
                              />
                              <motion.span
                                variants={pulseRing}
                                initial={false}
                                animate="animate"
                                transition={{ ...pulseRing.transition, delay: 0.5 }}
                                className="absolute rounded-full"
                                style={{ width: 96, height: 96, border: `2px solid ${accent}` }}
                              />
                              <div
                                className="rounded-full animate-spin"
                                style={{
                                  width: 56,
                                  height: 56,
                                  border: `3px solid ${fg4}`,
                                  borderTopColor: accent,
                                }}
                              />
                            </div>
                            <div className="text-center">
                              {selectedFile && (
                                <p style={{ fontFamily: SFT, fontSize: "17px", fontWeight: 600, color: fg, letterSpacing: "-0.374px", marginBottom: "8px" }}>
                                  {selectedFile.name}
                                </p>
                              )}
                              <div className="flex items-center justify-center gap-1.5">
                                <span style={{ fontFamily: SFT, fontSize: "17px", color: fg2, letterSpacing: "-0.374px" }}>Parsing</span>
                                <span className="flex" style={{ gap: 4 }}>
                                  {[0, 1, 2].map(d => (
                                    <motion.span
                                      key={d}
                                      variants={dotBounce}
                                      initial={false}
                                      animate="animate"
                                      transition={{ ...dotBounce.transition, delay: d * 0.15 }}
                                      style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: accent }}
                                    />
                                  ))}
                                </span>
                              </div>
                              <p style={{ fontFamily: SFT, fontSize: "13px", color: fg3, letterSpacing: "-0.224px", marginTop: "10px" }}>
                                Reading file and parsing field structure, please wait
                              </p>
                            </div>
                          </div>
                        ) : selectedFile ? (
                          <>
                            <div className="text-center">
                              <p style={{ fontFamily: SFT, fontSize: "17px", fontWeight: 600, color: fg, letterSpacing: "-0.374px" }}>{selectedFile.name}</p>
                              <p style={{ fontFamily: SFT, fontSize: "14px", color: fg3, letterSpacing: "-0.224px", marginTop: "6px" }}>{(selectedFile.size / 1024).toFixed(1)} KB · Click to change</p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center justify-center" style={{ width: 72, height: 72, borderRadius: "20px", background: iconContainerBg }}>
                              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
                            </div>
                            <div className="text-center">
                              <p style={{ fontFamily: SFT, fontSize: "17px", fontWeight: 600, color: fg, letterSpacing: "-0.374px" }}>Drop your file here</p>
                              <p style={{ fontFamily: SFT, fontSize: "14px", color: fg3, letterSpacing: "-0.224px", marginTop: "6px" }}>or click to browse · CSV, XLSX, XLS</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <StepNav onPrev={() => {}} onNext={() => setCurrentStep(1)} prevDisabled={true} nextDisabled={!selectedFile || isParsing} nextLabel={isParsing ? "Parsing..." : "Next"} />
                   </Card>
                 </motion.div>
                )}

              {/* Step 1: Configure */}
              {currentStep === 1 && parsedFields.length > 0 && (
                <motion.div key="step1" variants={scaleIn} initial="hidden" animate="visible" exit="exit">
                  <Card bg={card} shadow={shadow}>
                    <h3 style={{ fontFamily: SF, fontSize: "13px", fontWeight: 600, color: fg3, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "20px" }}>Table Details</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div>
                        <label style={{ fontFamily: SFT, fontSize: "13px", fontWeight: 500, color: fg3, letterSpacing: "-0.2px", display: "block", marginBottom: "8px" }}>Table Name</label>
                        <input value={tableName} onChange={e => setTableName(e.target.value)} placeholder="my_table"
                          style={{ fontFamily: SFT, fontSize: "16px", color: fg, background: inputBg, borderRadius: "12px", letterSpacing: "-0.32px", border: `1px solid ${inputBorder}`, padding: "12px 14px", width: "100%", outline: "none" }} />
                      </div>
                      <div>
                        <label style={{ fontFamily: SFT, fontSize: "13px", fontWeight: 500, color: fg3, letterSpacing: "-0.2px", display: "block", marginBottom: "8px" }}>Table Comment</label>
                        <input value={tableComment} onChange={e => setTableComment(e.target.value)} placeholder="Description"
                          style={{ fontFamily: SFT, fontSize: "16px", color: fg, background: inputBg, borderRadius: "12px", letterSpacing: "-0.32px", border: `1px solid ${inputBorder}`, padding: "12px 14px", width: "100%", outline: "none" }} />
                      </div>
                    </div>

                    <div style={{ margin: "24px -28px 0", borderTop: `1px solid ${divider}` }} />

                    <h3 style={{ fontFamily: SF, fontSize: "13px", fontWeight: 600, color: fg3, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: "20px", marginBottom: "4px" }}>
                      Fields · {parsedFields.length}
                    </h3>
                    <div className="grid grid-cols-12 gap-4" style={{ padding: "14px 0", borderBottom: `1px solid ${divider}` }}>
                      <div className="col-span-4"><span style={{ fontFamily: SFT, fontSize: "11px", fontWeight: 600, color: fg4, letterSpacing: "0.08em", textTransform: "uppercase" }}>Field</span></div>
                      <div className="col-span-3"><span style={{ fontFamily: SFT, fontSize: "11px", fontWeight: 600, color: fg4, letterSpacing: "0.08em", textTransform: "uppercase" }}>Type</span></div>
                      <div className="col-span-5"><span style={{ fontFamily: SFT, fontSize: "11px", fontWeight: 600, color: fg4, letterSpacing: "0.08em", textTransform: "uppercase" }}>Comment</span></div>
                    </div>
                    {pageFields.map(({ field, globalIndex: index }) => (
                      <div key={field.name} className="grid grid-cols-12 gap-4 items-center" style={{ padding: "14px 0", borderBottom: index === parsedFields.length - 1 ? "none" : `1px solid ${divider}` }}>
                        <div className="col-span-4"><span style={{ fontFamily: SFT, fontSize: "17px", fontWeight: 500, color: fg, letterSpacing: "-0.374px" }}>{field.name}</span></div>
                        <div className="col-span-3">
                          <select
                            value={fieldDefs[index]?.dtype || "TEXT"}
                            onChange={e => updateFieldDef(index, "dtype", e.target.value)}
                            className="w-full py-2.5 outline-none transition-colors duration-150 cursor-pointer"
                            style={{ fontFamily: SFT, fontSize: "15px", color: fg, background: inputBg, borderRadius: "6px", border: `1px solid ${inputBorder}`, paddingLeft: "8px", appearance: "none", WebkitAppearance: "none" }}
                            onFocus={e => { e.currentTarget.style.borderColor = accent; }}
                            onBlur={e => { e.currentTarget.style.borderColor = inputBorder; }}
                          >
                            {DTYPE_OPTIONS.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-5">
                          <input
                            type="text"
                            value={fieldDefs[index]?.comment || ""}
                            onChange={e => updateFieldDef(index, "comment", e.target.value)}
                            placeholder="—"
                            className="w-full py-2.5 outline-none transition-colors duration-150"
                            style={{ fontFamily: SFT, fontSize: "15px", color: fg, background: inputBg, borderRadius: "6px", border: `1px solid ${inputBorder}`, paddingLeft: "8px" }}
                            onFocus={e => { e.currentTarget.style.borderColor = accent; }}
                            onBlur={e => { e.currentTarget.style.borderColor = inputBorder; }}
                          />
                        </div>
                      </div>
                    ))}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-center" style={{ padding: "16px 0 0" }}>
                        <div className="flex items-center" style={{ gap: "4px" }}>
                          <button
                            onClick={() => setFieldPage(p => Math.max(1, p - 1))}
                            disabled={fieldPage === 1}
                            className="transition-all duration-200 disabled:opacity-30"
                            style={{ fontFamily: SFT, fontSize: "13px", background: "transparent", color: fg2, border: `1px solid ${divider}`, borderRadius: "6px", cursor: fieldPage === 1 ? "not-allowed" : "pointer", lineHeight: 1 }}
                          >
                            <div style={{ padding: "5px 10px" }}>‹</div>
                          </button>
                          {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                            <button
                              key={page}
                              onClick={() => setFieldPage(page)}
                              className="transition-all duration-200"
                              style={{
                                fontFamily: SFT, fontSize: "13px", fontWeight: page === fieldPage ? 600 : 400,
                                background: page === fieldPage ? fg : "transparent",
                                color: page === fieldPage ? (isDark ? "#000" : "#fff") : fg3,
                                border: page === fieldPage ? "none" : `1px solid ${divider}`,
                                borderRadius: "6px", cursor: "pointer", lineHeight: 1, minWidth: "32px", textAlign: "center"
                              }}
                            >
                              <div style={{ padding: "5px 4px" }}>{page}</div>
                            </button>
                          ))}
                          <button
                            onClick={() => setFieldPage(p => Math.min(totalPages, p + 1))}
                            disabled={fieldPage === totalPages}
                            className="transition-all duration-200 disabled:opacity-30"
                            style={{ fontFamily: SFT, fontSize: "13px", background: "transparent", color: fg2, border: `1px solid ${divider}`, borderRadius: "6px", cursor: fieldPage === totalPages ? "not-allowed" : "pointer", lineHeight: 1 }}
                          >
                            <div style={{ padding: "5px 10px" }}>›</div>
                          </button>
                        </div>
                      </div>
                    )}
                    <StepNav onPrev={() => setCurrentStep(0)} onNext={() => setCurrentStep(2)} />
                   </Card>
                </motion.div>
              )}

              {/* Step 2: DB Connection */}
              {currentStep === 2 && parsedFields.length > 0 && (
                <motion.div key="step2" variants={scaleIn} initial="hidden" animate="visible" exit="exit">
                  <Card bg={card} shadow={shadow}>
                    <h3 style={{ fontFamily: SF, fontSize: "13px", fontWeight: 600, color: fg3, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "20px" }}>Database Connection</h3>
                    {dbConfigLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: fg3, borderTopColor: "transparent" }} />
                      </div>
                    ) : dbConfig ? (
                      <div style={{ background: inputBg, borderRadius: "16px", border: `1px solid ${inputBorder}`, padding: "6px 20px" }}>
                        {[
                          { label: "Host", value: dbConfig.host },
                          { label: "Port", value: String(dbConfig.port) },
                          { label: "Username", value: dbConfig.username },
                          { label: "Password", value: "••••••••" },
                          { label: "Database", value: dbConfig.database },
                        ].map((item, idx, arr) => (
                          <div key={item.label} className="flex items-center justify-between" style={{ padding: "16px 0", borderBottom: idx === arr.length - 1 ? "none" : `1px solid ${divider}` }}>
                            <span style={{ fontFamily: SFT, fontSize: "15px", fontWeight: 500, color: fg3, letterSpacing: "-0.2px" }}>{item.label}</span>
                            <span style={{ fontFamily: SFT, fontSize: "16px", color: fg, letterSpacing: "-0.3px", fontWeight: 500 }}>{item.value}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontFamily: SFT, fontSize: "15px", color: fg3, textAlign: "center", padding: "48px 0" }}>No database configuration found</p>
                    )}
                    <StepNav onPrev={() => setCurrentStep(1)} onNext={() => setCurrentStep(3)} />
                  </Card>
                </motion.div>
              )}

              {/* Step 3: Submit */}
              {currentStep === 3 && parsedFields.length > 0 && (
                <motion.div key="step3" variants={scaleIn} initial="hidden" animate="visible" exit="exit">
                  <Card bg={card} shadow={shadow}>
                    <div className="text-center" style={{ padding: "20px 0 24px" }}>
                      <div className="flex items-center justify-center" style={{ marginBottom: "16px" }}>
                        <div style={{ width: 56, height: 56, borderRadius: "16px", background: iconContainerBg }} className="flex items-center justify-center">
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
                        </div>
                      </div>
                      <h3 style={{ fontFamily: SF, fontSize: "26px", fontWeight: 600, color: fg, letterSpacing: "-0.4px", lineHeight: 1.14 }}>Ready to Import</h3>
                      <p style={{ fontFamily: SFT, fontSize: "15px", color: fg3, letterSpacing: "-0.24px", marginTop: "10px" }}>
                        {tableName.trim() || "Untitled"} · {parsedFields.length} columns · {dbConfig?.database || "—"}
                      </p>
                    </div>

                    {submitResult && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl p-6 mb-8"
                        style={{ background: submitResult.success ? iconContainerBg : t.errorBg, border: `1px solid ${submitResult.success ? divider : t.errorBorder}` }}>
                        <div className="flex items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <p style={{ fontFamily: SFT, fontSize: "15px", fontWeight: 600, color: submitResult.success ? fg : t.error, letterSpacing: "-0.24px" }}>{submitResult.message}</p>
                            {submitResult.success && submitResult.rowsImported !== undefined && <p style={{ fontFamily: SFT, fontSize: "14px", color: fg2, marginTop: "6px" }}>{submitResult.rowsImported} rows imported</p>}
                            {submitResult.sql && <pre className="mt-4 p-4 rounded-lg overflow-x-auto" style={{ fontFamily: SF_MONO, fontSize: "12px", background: isDark ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.03)", color: fg2, border: `1px solid ${divider}`, whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.6 }}>{submitResult.sql}</pre>}
                          </div>
                        </div>
                      </motion.div>
                    )}

                    <div className="flex items-center justify-between" style={{ marginTop: "20px", paddingTop: "20px", borderTop: `1px solid ${divider}` }}>
                      <button onClick={() => { setCurrentStep(2); setSubmitResult(null); }} className="text-base font-medium transition-all duration-200"
                        style={{ fontFamily: SFT, background: accent, color: accentFg, border: "none", borderRadius: "980px", letterSpacing: "-0.32px", cursor: "pointer" }}>
                        <div style={{ padding: "8px 24px" }}>Back</div>
                      </button>
                      <button onClick={handleSubmit} disabled={!canSubmit} className="text-base font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ fontFamily: SFT, background: accent, color: accentFg, border: "none", borderRadius: "980px", letterSpacing: "-0.32px", cursor: canSubmit ? "pointer" : "not-allowed" }}
                        onMouseEnter={e => { if (canSubmit) e.currentTarget.style.opacity = "0.85"; }} onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}>
                        <div style={{ padding: "8px 32px" }}>
                          {isSubmitting ? <span className="flex items-center gap-2.5"><span className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: isDark ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.3)", borderTopColor: "transparent" }} />Importing...</span> : "Submit"}
                        </div>
                      </button>
                    </div>
                   </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Logout Dialog */}
      <Modal state={{ isOpen: showLogoutConfirm, setOpen: setShowLogoutConfirm, open: () => setShowLogoutConfirm(true), close: () => setShowLogoutConfirm(false), toggle: () => setShowLogoutConfirm(prev => !prev) }}>
        <Modal.Backdrop>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading style={{ fontFamily: SF, fontSize: "17px", color: fg, letterSpacing: "-0.374px" }}>Sign Out</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <p style={{ fontFamily: SFT, color: fg2, fontSize: "15px", letterSpacing: "-0.24px", margin: 0 }}>Are you sure you want to sign out?</p>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" onPress={() => setShowLogoutConfirm(false)} style={{ fontFamily: SFT, background: accent, color: accentFg, borderRadius: "980px", border: "none", fontSize: "15px" }}>Cancel</Button>
                <Button variant="primary" onPress={handleLogout} style={{ fontFamily: SFT, background: accent, color: accentFg, borderRadius: "980px", border: "none", fontSize: "15px" }}>Sign Out</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
