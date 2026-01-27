import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Inspect, Send, X } from "lucide-react";
import { toast } from "react-hot-toast";

const Inspector: React.FC = () => {
    const [isActive, setIsActive] = useState(false);
    const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(null);
    const [selectedInfo, setSelectedInfo] = useState<{ file: string; line: string; col: string; target: HTMLElement; elementType: string } | null>(null);
    const [prompt, setPrompt] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isActive || selectedInfo) return;

        const target = e.target as HTMLElement;
        const sourceEl = target.closest("[data-source-file]") as HTMLElement | null;

        if (sourceEl) {
            setHoveredElement(sourceEl);
        } else {
            setHoveredElement(null);
        }
    }, [isActive, selectedInfo]);

    const handleClick = useCallback((e: MouseEvent) => {
        if (!isActive) return;
        if ((e.target as HTMLElement).closest(".dev-inspector-ui")) return;

        e.preventDefault();
        e.stopPropagation();

        const target = e.target as HTMLElement;
        const sourceEl = target.closest("[data-source-file]") as HTMLElement | null;

        if (sourceEl) {
            const file = sourceEl.getAttribute("data-source-file") || "";
            const line = sourceEl.getAttribute("data-source-line") || "";
            const col = sourceEl.getAttribute("data-source-column") || "";
            const elementType = sourceEl.tagName.toLowerCase();

            setSelectedInfo({ file, line, col, target: sourceEl, elementType });
            setPrompt("");
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isActive]);

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!prompt.trim() || !selectedInfo) return;

        setIsSubmitting(true);
        try {
            const response = await fetch("/__ai-cli", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt,
                    file: selectedInfo.file,
                    line: selectedInfo.line,
                    elementType: selectedInfo.elementType,
                }),
            });

            if (response.ok) {
                toast.success("Task sent to Cursor CLI!");
                setSelectedInfo(null);
                setPrompt("");
            } else {
                toast.error("Failed to send task.");
            }
        } catch (error) {
            console.error(error);
            toast.error("Connection error.");
        } finally {
            setIsSubmitting(false);
        }
    };

    useEffect(() => {
        if (isActive && !selectedInfo) {
            window.addEventListener("mousemove", handleMouseMove, true);
            window.addEventListener("click", handleClick, true);
            document.body.style.cursor = "crosshair";
        } else {
            window.removeEventListener("mousemove", handleMouseMove, true);
            window.removeEventListener("click", handleClick, true);
            document.body.style.cursor = selectedInfo ? "default" : "default";
            if (!selectedInfo) setHoveredElement(null);
        }

        return () => {
            window.removeEventListener("mousemove", handleMouseMove, true);
            window.removeEventListener("click", handleClick, true);
            document.body.style.cursor = "default";
        };
    }, [isActive, handleMouseMove, handleClick, selectedInfo]);

    return (
        <div className="dev-inspector-ui">
            {isActive && (hoveredElement || selectedInfo) && (
                <HighlightOverlay element={selectedInfo?.target || hoveredElement!} isSelected={!!selectedInfo} />
            )}

            <AnimatePresence>
                {selectedInfo && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        style={{
                            position: "fixed",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                            zIndex: 100000,
                            width: "400px",
                            backgroundColor: "#111827",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            borderRadius: "16px",
                            padding: "20px",
                            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
                            color: "white",
                        }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>AI Task</h3>
                                <p style={{ margin: 0, fontSize: "12px", color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {selectedInfo.file.split(/[\\/]/).pop()}:{selectedInfo.line}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedInfo(null)}
                                style={{ background: "transparent", border: "none", color: "#9ca3af", cursor: "pointer" }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <input
                                ref={inputRef}
                                type="text"
                                placeholder="What should AI do with this element?"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                style={{
                                    width: "100%",
                                    backgroundColor: "#1f2937",
                                    border: "1px solid rgba(255, 255, 255, 0.1)",
                                    borderRadius: "8px",
                                    padding: "10px 12px",
                                    color: "white",
                                    fontSize: "14px",
                                    marginBottom: "12px",
                                    outline: "none",
                                }}
                            />
                            <button
                                disabled={isSubmitting || !prompt.trim()}
                                type="submit"
                                style={{
                                    width: "100%",
                                    backgroundColor: "#3b82f6",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "8px",
                                    padding: "10px",
                                    fontWeight: 600,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: "8px",
                                    cursor: (isSubmitting || !prompt.trim()) ? "not-allowed" : "pointer",
                                    opacity: (isSubmitting || !prompt.trim()) ? 0.5 : 1,
                                }}
                            >
                                <Send size={16} />
                                {isSubmitting ? "Sending..." : "Send to Cursor"}
                            </button>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.div
                drag
                dragMomentum={false}
                initial={{ x: 0, y: 0 }}
                style={{
                    position: "fixed",
                    bottom: "100px",
                    right: "20px",
                    zIndex: 99999,
                    cursor: "grab",
                    touchAction: "none",
                }}
                whileDrag={{ cursor: "grabbing" }}
            >
                <button
                    onClick={() => setIsActive(!isActive)}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "10px 20px",
                        backgroundColor: isActive ? "#ef4444" : "#111827",
                        color: "white",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: "12px",
                        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)",
                        fontSize: "13px",
                        fontWeight: 700,
                        transition: "all 0.2s ease",
                        userSelect: "none",
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    {isActive ? (
                        <>
                            <motion.div
                                animate={{ opacity: [1, 0.5, 1] }}
                                transition={{ repeat: Infinity, duration: 1 }}
                                style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "white" }}
                            />
                            <span>EXIT INSPECTOR</span>
                        </>
                    ) : (
                        <>
                            <Inspect size={18} />
                            <span>DEV INSPECTOR</span>
                        </>
                    )}
                </button>
            </motion.div>
        </div>
    );
};

const HighlightOverlay: React.FC<{ element: HTMLElement; isSelected: boolean }> = ({ element, isSelected }) => {
    const [rect, setRect] = useState<DOMRect | null>(null);

    useEffect(() => {
        const updateRect = () => setRect(element.getBoundingClientRect());
        updateRect();
        window.addEventListener("scroll", updateRect, true);
        window.addEventListener("resize", updateRect);
        return () => {
            window.removeEventListener("scroll", updateRect, true);
            window.removeEventListener("resize", updateRect);
        };
    }, [element]);

    if (!rect) return null;

    return (
        <div
            style={{
                position: "fixed",
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
                backgroundColor: isSelected ? "rgba(16, 185, 129, 0.2)" : "rgba(59, 130, 246, 0.3)",
                border: `2px solid ${isSelected ? "#10b981" : "#3b82f6"}`,
                pointerEvents: "none",
                zIndex: 99998,
                transition: "all 0.12s cubic-bezier(0.4, 0, 0.2, 1)",
                boxSizing: "border-box",
            }}
        />
    );
};

export default Inspector;
