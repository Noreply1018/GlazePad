import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  ClipboardPayload,
  Slot,
  cleanupImages,
  hideWindow,
  imageSrc,
  loadState,
  listenGlobalToggle,
  readClipboard,
  saveState,
  setWindowReady,
  showWindow,
  writeSlot,
} from "./tauri";

const defaultSlots: Slot[] = [
  { id: "tab-1", title: "Tab 1", type: "text", content: "把临时要复用的内容放在这里。当前 Tab 只有这一个存储框。" },
  { id: "tab-2", title: "Tab 2", type: "text", content: "例如：一段回复、一条命令、一个链接，随时改、随时复制。" },
  { id: "tab-3", title: "Tab 3", type: "text", content: "" },
  { id: "tab-4", title: "Tab 4", type: "text", content: "" },
];

const defaultState: AppState = {
  activeId: "tab-1",
  hidden: false,
  slots: defaultSlots,
};

const codePattern = /const|function|await|=>|npm|git|\.js|\.tsx/;

function createSlotId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `tab-${crypto.randomUUID()}`;
  }
  return `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nextTabTitle(slots: Slot[]) {
  const usedNumbers = slots
    .map((slot) => /^Tab\s+(\d+)$/.exec(slot.title)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number);
  const next = usedNumbers.length ? Math.max(...usedNumbers) + 1 : slots.length + 1;
  return `Tab ${next}`;
}

function normalizeState(loaded: AppState | null): AppState {
  if (!loaded || !loaded.slots.length) return defaultState;
  const hasActiveSlot = loaded.slots.some((slot) => slot.id === loaded.activeId);
  return {
    ...loaded,
    activeId: hasActiveSlot ? loaded.activeId : loaded.slots[0].id,
  };
}

function imageMeta(slot: Slot) {
  if (slot.type !== "image") return "IMG · —";
  const label = slot.imageType.includes("png")
    ? "PNG"
    : slot.imageType.includes("jpeg") || slot.imageType.includes("jpg")
      ? "JPG"
      : slot.imageType.includes("webp")
        ? "WEBP"
        : slot.imageType.includes("gif")
          ? "GIF"
          : "IMG";
  return `${label} · ${slot.width}×${slot.height}`;
}

function slotFromClipboard(payload: ClipboardPayload, title: string): Slot | null {
  if (payload.type === "text") {
    return { id: createSlotId(), title, type: "text", content: payload.content };
  }

  if (payload.type === "image") {
    const imagePath = payload.imagePath ?? payload.image_path ?? "";
    const imageType = payload.imageType ?? payload.image_type ?? "image/png";
    if (!imagePath) return null;

    return {
      id: createSlotId(),
      title,
      type: "image",
      content: "",
      imagePath,
      imageType,
      width: payload.width,
      height: payload.height,
    };
  }

  return null;
}

export function App() {
  const [state, setState] = useState<AppState>(defaultState);
  const [saveText, setSaveText] = useState("已本地保存");
  const [switching, setSwitching] = useState(false);
  const [wakePulling, setWakePulling] = useState(false);
  const [booted, setBooted] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const padRef = useRef<HTMLElement | null>(null);
  const padMotion = useRef<Animation | null>(null);
  const tabsRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeSlot = useMemo(
    () => state.slots.find((slot) => slot.id === state.activeId) ?? state.slots[0],
    [state.activeId, state.slots],
  );
  const activeImageSrc = useMemo(
    () => (activeSlot.type === "image" ? imageSrc(activeSlot.imagePath) : ""),
    [activeSlot],
  );

  const reducedMotion = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const setSaved = useCallback((text = "已本地保存") => {
    setSaveText(text);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      setSaveText("已本地保存");
    }, 900);
  }, []);

  const pulseSlot = useCallback(() => {
    if (reducedMotion) return;
    setSwitching(false);
    requestAnimationFrame(() => {
      setSwitching(true);
      window.setTimeout(() => setSwitching(false), 210);
    });
  }, [reducedMotion]);

  const hiddenTransform = useCallback(
    () => "translateX(calc(100% + clamp(18px, 4vw, 54px))) scale(0.965)",
    [],
  );

  const stopPadMotion = useCallback(() => {
    if (!padMotion.current) return;
    padMotion.current.cancel();
    padMotion.current = null;
  }, []);

  const animatePad = useCallback(
    (keyframes: Keyframe[], options: KeyframeAnimationOptions, done: () => void) => {
      const pad = padRef.current;
      if (!pad) {
        done();
        return;
      }

      stopPadMotion();
      padMotion.current = pad.animate(keyframes, { fill: "forwards", ...options });
      padMotion.current.onfinish = () => {
        padMotion.current = null;
        done();
      };
      padMotion.current.oncancel = () => {
        padMotion.current = null;
      };
    },
    [stopPadMotion],
  );

  useEffect(() => {
    let alive = true;
    let readyHidden = defaultState.hidden;
    loadState()
      .then((loaded) => {
        if (!alive || !loaded) return;
        readyHidden = loaded.hidden;
        const nextState = normalizeState(loaded);
        setState(nextState);
        cleanupImages(nextState).catch(() => {});
      })
      .finally(() => {
        if (!alive) return;
        setBooted(true);
        setWindowReady(readyHidden).catch(() => {});
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!booted) return;
    saveState(state).catch((error) => {
      setSaved(`保存失败：${String(error).slice(0, 46)}`);
    });
  }, [booted, setSaved, state]);

  const setHidden = useCallback(
    (hidden: boolean) => {
      setWakePulling(false);
      const pad = padRef.current;

      if (reducedMotion || !pad) {
        stopPadMotion();
        setState((current) => ({ ...current, hidden }));
        if (pad) {
          pad.style.transform = hidden ? hiddenTransform() : "translateX(0) scaleX(1) scaleY(1)";
          pad.style.opacity = hidden ? "0" : "1";
        }
        if (hidden) hideWindow().catch(() => {});
        else showWindow().catch(() => {});
        setSaved(hidden ? "已隐藏，按 Alt + Space 唤醒" : "已唤醒");
        if (!hidden) {
          requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));
        }
        return;
      }

      if (hidden) {
        setState((current) => ({ ...current, hidden: false }));
        animatePad(
          [
            { transform: "translateX(0) scaleX(1) scaleY(1)", opacity: 1, offset: 0 },
            { transform: "translateX(-26px) scaleX(1.035) scaleY(0.99)", opacity: 1, offset: 0.24 },
            { transform: "translateX(32px) scaleX(0.955) scaleY(1.012)", opacity: 0.96, offset: 0.48 },
            { transform: hiddenTransform(), opacity: 0, offset: 1 },
          ],
          {
            duration: 430,
            easing: "cubic-bezier(0.62, 0, 0.18, 1)",
          },
          () => {
            setState((current) => ({ ...current, hidden: true }));
            pad.style.transform = hiddenTransform();
            pad.style.opacity = "0";
            hideWindow().catch(() => {});
          },
        );
        setSaved("已隐藏，按 Alt + Space 唤醒");
        return;
      }

      setWakePulling(true);
      setState((current) => ({ ...current, hidden: false }));
      showWindow().catch(() => {});
      pad.style.transform = hiddenTransform();
      pad.style.opacity = "0";
      pad.getBoundingClientRect();
      animatePad(
        [
          { transform: hiddenTransform(), opacity: 0, offset: 0 },
          { transform: "translateX(62px) scaleX(0.952) scaleY(1.012)", opacity: 0.62, offset: 0.38 },
          { transform: "translateX(-44px) scaleX(1.052) scaleY(0.982)", opacity: 1, offset: 0.68 },
          { transform: "translateX(16px) scaleX(0.986) scaleY(1.004)", opacity: 1, offset: 0.84 },
          { transform: "translateX(-6px) scaleX(1.004) scaleY(0.999)", opacity: 1, offset: 0.93 },
          { transform: "translateX(0) scaleX(1) scaleY(1)", opacity: 1, offset: 1 },
        ],
        {
          duration: 760,
          easing: "cubic-bezier(0.14, 0.84, 0.14, 1)",
        },
        () => {
          pad.style.transform = "translateX(0) scaleX(1) scaleY(1)";
          pad.style.opacity = "1";
          setWakePulling(false);
        },
      );
      setSaved("已唤醒");
      requestAnimationFrame(() => {
        textareaRef.current?.focus({ preventScroll: true });
      });
    },
    [animatePad, hiddenTransform, reducedMotion, setSaved, stopPadMotion],
  );

  useEffect(() => {
    document.body.classList.toggle("is-window-hidden", state.hidden);
    return () => document.body.classList.remove("is-window-hidden");
  }, [state.hidden]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.code === "Space") {
        event.preventDefault();
        setHidden(!state.hidden);
        return;
      }
      if (event.key === "Escape" && !state.hidden) {
        event.preventDefault();
        setHidden(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [setHidden, state.hidden]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listenGlobalToggle(() => {
      setHidden(!state.hidden);
    }).then((dispose) => {
      unlisten = dispose;
    });
    return () => unlisten?.();
  }, [setHidden, state.hidden]);

  const scrollActiveTabIntoView = useCallback((id: string) => {
    requestAnimationFrame(() => {
      const tab = tabsRef.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${id}"]`);
      tab?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }, []);

  useEffect(() => {
    scrollActiveTabIntoView(state.activeId);
  }, [scrollActiveTabIntoView, state.activeId]);

  const activate = (id: string) => {
    if (state.activeId === id) {
      scrollActiveTabIntoView(id);
      return;
    }
    setState((current) => ({ ...current, activeId: id }));
    pulseSlot();
  };

  const addTab = async () => {
    const payload = await readClipboard().catch((error) => {
      setSaved(`剪贴板读取失败：${String(error).slice(0, 34)}`);
      return null;
    });

    if (!payload) {
      setSaved("剪贴板读取失败");
      return;
    }

    const nextSlot = slotFromClipboard(payload, nextTabTitle(state.slots));

    if (!nextSlot) {
      setSaved(payload.type === "empty" ? "剪贴板为空" : "剪贴板图片缺少路径");
      return;
    }

    const nextState = {
      ...state,
      activeId: nextSlot.id,
      slots: [...state.slots, nextSlot],
    };

    setState(nextState);
    pulseSlot();
    requestAnimationFrame(() => {
      scrollActiveTabIntoView(nextSlot.id);
    });
    await saveState(nextState)
      .then(() => {
        setSaved(nextSlot.type === "image" ? "已收纳图片" : "已新增 Tab");
      })
      .catch((error) => {
        setSaved(`保存失败：${String(error).slice(0, 46)}`);
      });
  };

  const deleteTab = () => {
    if (state.slots.length <= 1) {
      setSaved("至少保留一个暂存槽");
      return;
    }

    const index = state.slots.findIndex((slot) => slot.id === state.activeId);
    const nextSlots = state.slots.filter((slot) => slot.id !== state.activeId);
    const nextIndex = Math.min(index, nextSlots.length - 1);
    const nextState = {
      ...state,
      activeId: nextSlots[nextIndex].id,
      slots: nextSlots,
    };
    setState(nextState);
    pulseSlot();
    saveState(nextState)
      .then(() => setSaved("已删除 Tab"))
      .catch((error) => setSaved(`保存失败：${String(error).slice(0, 46)}`));
  };

  const updateText = (content: string) => {
    setState((current) => ({
      ...current,
      slots: current.slots.map((slot) =>
        slot.id === current.activeId && slot.type === "text" ? { ...slot, content } : slot,
      ),
    }));
    setSaved("正在保存");
  };

  const copySlot = async () => {
    if (activeSlot.type === "text" && !activeSlot.content.trim()) {
      setSaved("当前文本为空");
      return;
    }

    await writeSlot(activeSlot)
      .then(() => setSaved(activeSlot.type === "image" ? "已复制图片" : "已复制"))
      .catch(() => setSaved(activeSlot.type === "image" ? "图片复制失败" : "复制失败"));
  };

  const kind = activeSlot.type === "image" ? "image" : "text";
  const meta = imageMeta(activeSlot);

  return (
    <main className={`desktop${state.hidden ? " is-window-hidden" : ""}`}>
      <p className="workspace-hint">透明浮窗贴在桌面上，只保留当前暂存槽。每个 Tab 是一个独立槽位，不再是分类列表。</p>

      <button
        className={`wake-edge${state.hidden ? " is-visible" : ""}${wakePulling ? " is-pulling" : ""}`}
        type="button"
        aria-label="唤醒 GlazePad"
        onClick={() => setHidden(false)}
      />

      <section ref={padRef} className={`pad${state.hidden ? " is-hidden" : ""}`} aria-label="GlazePad 透明暂存槽">
        <div className="handle"><span aria-hidden="true" /></div>

        <header className="top">
          <div className="bar">
            <div className="brand">
              <h1>GlazePad</h1>
              <span className="saved">{saveText}</span>
            </div>
            <div className="top-actions" aria-label="Tab 操作">
              <button className="copy-tab" type="button" aria-label="复制当前槽位内容" onClick={copySlot}>⧉</button>
              <button className="new-tab danger" type="button" aria-label="删除当前 Tab" onClick={deleteTab}>−</button>
              <button className="new-tab" type="button" aria-label="新增 Tab 并收纳当前剪贴板" onClick={addTab}>+</button>
              <button className="hide-pad" type="button" aria-label="隐藏 GlazePad" onClick={() => setHidden(true)}>›</button>
            </div>
          </div>
          <nav className="tabs" ref={tabsRef} aria-label="暂存槽">
            {state.slots.map((slot) => (
              <button
                className={`tab${slot.id === state.activeId ? " active" : ""}`}
                type="button"
                key={slot.id}
                data-tab-id={slot.id}
                onClick={() => activate(slot.id)}
              >
                {slot.title}
              </button>
            ))}
          </nav>
        </header>

        <section className="slot" aria-label="当前暂存内容">
          <div className={`slot-body${switching ? " is-switching" : ""}`} data-kind={kind}>
            <textarea
              className={`content-box${activeSlot.type === "text" && codePattern.test(activeSlot.content) ? " mono" : ""}`}
              ref={textareaRef}
              spellCheck={false}
              aria-label="暂存内容"
              disabled={kind === "image"}
              value={activeSlot.type === "text" ? activeSlot.content : ""}
              onChange={(event) => updateText(event.target.value)}
            />
            <div className="image-slot" aria-label="暂存图片预览">
              <div className={`image-frame${activeSlot.type === "image" && !activeImageSrc ? " is-empty" : ""}`}>
                {activeSlot.type === "image" && activeImageSrc ? (
                  <img src={activeImageSrc} alt="当前暂存图片" />
                ) : (
                  <img src="" alt="当前暂存图片" />
                )}
                <span className="image-empty">等待收纳图片</span>
              </div>
              <div className="image-caption">
                <strong>剪贴板图片</strong>
                <span className="image-type">{meta.split(" · ")[0] ?? "IMG"}</span>
                <span id="imageMeta">{meta}</span>
              </div>
            </div>
          </div>
        </section>

        <footer className="foot">
          <span className="foot-left">
            <span>{state.slots.length} 个暂存槽 · {kind === "image" ? "图片" : "文本"}</span>
            <span className={`image-foot-meta${kind === "image" ? " is-visible" : ""}`}>{meta}</span>
          </span>
          <span className="foot-right dots"><span className="dot" /><span>透明桌面模式</span></span>
        </footer>
      </section>
    </main>
  );
}
