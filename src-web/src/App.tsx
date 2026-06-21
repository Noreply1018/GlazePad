import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  AppSettings,
  ClipboardPayload,
  Slot,
  cleanupImages,
  hideWindow,
  imageSrc,
  loadState,
  listenAbout,
  listenAutostartChanged,
  listenAutostartFailed,
  listenTrayAutostart,
  listenGlobalToggle,
  listenTrayOpacity,
  listenTrayHide,
  listenTrayTheme,
  readClipboard,
  readAutostart,
  saveState,
  setWindowReady,
  showWindow,
  syncTraySettings,
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
  settings: {
    theme: "ice",
    opacity: "standard",
    autostart: false,
  },
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
  const usedNumbers = new Set(
    slots
      .map((slot) => /^Tab\s+(\d+)$/.exec(slot.title)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number),
  );
  let next = 1;
  while (usedNumbers.has(next)) next += 1;
  return `Tab ${next}`;
}

function normalizeState(loaded: AppState | null): AppState {
  if (!loaded || !loaded.slots.length) return defaultState;
  const hasActiveSlot = loaded.slots.some((slot) => slot.id === loaded.activeId);
  const settings: AppSettings = {
    ...defaultState.settings,
    ...(loaded.settings ?? {}),
  };
  if (!["ice", "smoke", "mint", "rose"].includes(settings.theme)) {
    settings.theme = defaultState.settings.theme;
  }
  return {
    ...loaded,
    settings,
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

function blankTextSlot(title: string): Slot {
  return { id: createSlotId(), title, type: "text", content: "" };
}

export function App() {
  const [state, setState] = useState<AppState>(defaultState);
  const [saveText, setSaveText] = useState("已本地保存");
  const [switching, setSwitching] = useState(false);
  const [wakePulling, setWakePulling] = useState(false);
  const [booted, setBooted] = useState(false);
  const [aboutText, setAboutText] = useState("");
  const padRef = useRef<HTMLElement | null>(null);
  const padMotion = useRef<Animation | null>(null);
  const tabsRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hiddenRef = useRef(defaultState.hidden);
  const transitionRef = useRef(false);

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
    transitionRef.current = false;
  }, []);

  const animatePad = useCallback(
    (keyframes: Keyframe[], options: KeyframeAnimationOptions, done: () => void) => {
      const pad = padRef.current;
      if (!pad) {
        done();
        return;
      }

      stopPadMotion();
      transitionRef.current = true;
      padMotion.current = pad.animate(keyframes, { fill: "forwards", ...options });
      padMotion.current.onfinish = () => {
        padMotion.current = null;
        transitionRef.current = false;
        done();
      };
      padMotion.current.oncancel = () => {
        padMotion.current = null;
        transitionRef.current = false;
      };
    },
    [stopPadMotion],
  );

  useEffect(() => {
    let alive = true;
    let readyHidden = defaultState.hidden;
    loadState()
      .then((loaded) => {
        if (!alive) return;
        const nextState = normalizeState(loaded);
        readyHidden = nextState.hidden;
        setState(nextState);
        cleanupImages(nextState).catch(() => {});
        readAutostart()
          .then((enabled) => {
            if (!alive) return;
            setState((current) => ({
              ...current,
              settings: { ...current.settings, autostart: enabled },
            }));
          })
          .catch(() => {});
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

  useEffect(() => {
    hiddenRef.current = state.hidden;
  }, [state.hidden]);

  useEffect(() => {
    if (!booted) return;
    syncTraySettings(state.settings).catch(() => {});
  }, [booted, state.settings]);

  const setHidden = useCallback(
    (hidden: boolean) => {
      if (transitionRef.current && hidden !== hiddenRef.current) return;
      setWakePulling(false);
      const pad = padRef.current;

      if (reducedMotion || !pad) {
        stopPadMotion();
        hiddenRef.current = hidden;
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
        hiddenRef.current = true;
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
            hiddenRef.current = true;
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
      hiddenRef.current = false;
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
    document.body.dataset.theme = state.settings.theme;
    document.body.dataset.opacity = state.settings.opacity;
    return () => {
      delete document.body.dataset.theme;
      delete document.body.dataset.opacity;
    };
  }, [state.settings.opacity, state.settings.theme]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.code === "Space") {
        event.preventDefault();
        setHidden(!hiddenRef.current);
        return;
      }
      if (event.key === "Escape" && !hiddenRef.current) {
        event.preventDefault();
        setHidden(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [setHidden]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listenGlobalToggle(() => {
      setHidden(!hiddenRef.current);
    }).then((dispose) => {
      unlisten = dispose;
    });
    return () => unlisten?.();
  }, [setHidden]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listenTrayHide(() => {
      setHidden(true);
    }).then((dispose) => {
      unlisten = dispose;
    });
    return () => unlisten?.();
  }, [setHidden]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listenAbout((message) => {
      setAboutText(message);
      setHidden(false);
    }).then((dispose) => {
      unlisten = dispose;
    });
    return () => unlisten?.();
  }, [setHidden]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listenTrayTheme((theme) => {
      setState((current) => ({
        ...current,
        settings: { ...current.settings, theme },
      }));
      setSaved("已切换配色");
    }).then((dispose) => {
      unlisten = dispose;
    });
    return () => unlisten?.();
  }, [setSaved]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listenTrayOpacity((opacity) => {
      setState((current) => ({
        ...current,
        settings: { ...current.settings, opacity },
      }));
      setSaved("已调整透明度");
    }).then((dispose) => {
      unlisten = dispose;
    });
    return () => unlisten?.();
  }, [setSaved]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listenTrayAutostart(() => {
      setSaved("正在切换开机自启动");
    }).then((dispose) => {
      unlisten = dispose;
    });
    return () => unlisten?.();
  }, [setSaved]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listenAutostartChanged((enabled) => {
      setState((current) => ({
        ...current,
        settings: { ...current.settings, autostart: enabled },
      }));
      setSaved(enabled ? "已开启开机自启动" : "已关闭开机自启动");
    }).then((dispose) => {
      unlisten = dispose;
    });
    return () => unlisten?.();
  }, [setSaved]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listenAutostartFailed((message) => {
      setSaved(message);
    }).then((dispose) => {
      unlisten = dispose;
    });
    return () => unlisten?.();
  }, [setSaved]);

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

  const appendSlot = useCallback(
    (nextSlot: Slot, savedText: string) => {
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
      return saveState(nextState)
        .then(() => {
          setSaved(savedText);
        })
        .catch((error) => {
          setSaved(`保存失败：${String(error).slice(0, 46)}`);
        });
    },
    [pulseSlot, scrollActiveTabIntoView, setSaved, state],
  );

  const addBlankTab = async () => {
    await appendSlot(blankTextSlot(nextTabTitle(state.slots)), "已新增空白 Tab");
  };

  const collectClipboardTab = async () => {
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

    await appendSlot(nextSlot, nextSlot.type === "image" ? "已收纳图片" : "已收纳文本");
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
      .catch((error) => setSaved(`复制失败：${String(error).slice(0, 44)}`));
  };

  const kind = activeSlot.type === "image" ? "image" : "text";
  const meta = imageMeta(activeSlot);

  return (
    <main className={`desktop${state.hidden ? " is-window-hidden" : ""}`}>
      <p className="workspace-hint">透明浮窗贴在桌面上，只保留当前暂存槽。每个 Tab 是一个独立槽位，不再是分类列表。</p>

      {aboutText ? (
        <div className="about-backdrop" role="presentation" onClick={() => setAboutText("")}>
          <section
            className="about-panel"
            role="dialog"
            aria-modal="true"
            aria-label="关于 GlazePad"
            onClick={(event) => event.stopPropagation()}
          >
            <div>
              <h2>GlazePad</h2>
              <p>{aboutText}</p>
            </div>
            <p>透明暂存槽，常驻系统托盘。按 Alt + Space 唤醒或隐藏。</p>
            <button type="button" onClick={() => setAboutText("")}>关闭</button>
          </section>
        </div>
      ) : null}

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
              <button className="copy-tab" type="button" aria-label="复制当前槽位内容" onClick={copySlot}>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <rect x="9" y="5" width="10" height="10" rx="2.8" fill="none" stroke="currentColor" />
                  <rect x="5" y="9" width="10" height="10" rx="2.8" fill="var(--copy-icon-mask)" stroke="currentColor" />
                </svg>
              </button>
              <button className="new-tab danger" type="button" aria-label="删除当前 Tab" onClick={deleteTab}>−</button>
              <button
                className="new-tab"
                type="button"
                aria-label="单击新增空白 Tab，右键收纳当前剪贴板"
                onClick={addBlankTab}
                onContextMenu={(event) => {
                  event.preventDefault();
                  collectClipboardTab();
                }}
              >
                +
              </button>
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
