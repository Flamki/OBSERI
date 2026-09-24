import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";

/** Becomes true once the element has scrolled into view (and stays true). */
export function useInView<T extends Element>(options?: {
  threshold?: number;
  rootMargin?: string;
}) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  const threshold = options?.threshold ?? 0.2;
  const rootMargin = options?.rootMargin ?? "0px 0px -8% 0px";

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return [ref, inView] as const;
}

export function Reveal({
  as,
  children,
  className = "",
  delay = 0,
  style,
}: {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  delay?: number;
  style?: CSSProperties;
}) {
  const Tag = as ?? "div";
  const [ref, inView] = useInView<HTMLElement>();

  return (
    <Tag
      ref={ref}
      data-visible={inView}
      className={`obs-reveal ${className}`}
      style={{ ...style, ["--obs-delay" as string]: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

/** Types through a list of phrases, deleting and retyping in a loop. */
export function useTypewriter(phrases: readonly string[], { typeMs = 70, holdMs = 1600 } = {}) {
  const [text, setText] = useState("");

  useEffect(() => {
    let phrase = 0;
    let index = 0;
    let deleting = false;
    let timer = 0;

    const step = () => {
      const current = phrases[phrase] ?? "";
      if (!deleting) {
        index += 1;
        setText(current.slice(0, index));
        if (index >= current.length) {
          deleting = true;
          timer = window.setTimeout(step, holdMs);
          return;
        }
        timer = window.setTimeout(step, typeMs);
        return;
      }
      index -= 1;
      setText(current.slice(0, index));
      if (index <= 0) {
        deleting = false;
        phrase = (phrase + 1) % phrases.length;
        timer = window.setTimeout(step, 360);
        return;
      }
      timer = window.setTimeout(step, typeMs / 2);
    };

    timer = window.setTimeout(step, 600);
    return () => window.clearTimeout(timer);
  }, [phrases, typeMs, holdMs]);

  return text;
}
