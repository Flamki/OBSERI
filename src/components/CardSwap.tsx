import {
  Children,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import gsap from "gsap";

type Dimension = number | string;

export interface CardSwapProps {
  width?: Dimension;
  height?: Dimension;
  cardDistance?: number;
  verticalDistance?: number;
  delay?: number;
  pauseOnHover?: boolean;
  onCardClick?: (index: number) => void;
  skewAmount?: number;
  easing?: "linear" | "elastic";
  className?: string;
  children: ReactNode;
}

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <article
      data-card-swap-card
      className={`absolute left-1/2 top-1/2 overflow-hidden rounded-[1.65rem] [backface-visibility:hidden] [transform-style:preserve-3d] [will-change:transform] ${className}`}
      {...props}
    />
  );
}

const cssDimension = (value: Dimension) => (typeof value === "number" ? `${value}px` : value);

const slotFor = (index: number, distanceX: number, distanceY: number, total: number) => ({
  x: index * distanceX,
  y: -index * distanceY,
  z: -index * distanceX * 1.5,
  zIndex: total - index,
});

export default function CardSwap({
  width = 520,
  height = 410,
  cardDistance = 48,
  verticalDistance = 56,
  delay = 4800,
  pauseOnHover = true,
  onCardClick,
  skewAmount = 4,
  easing = "elastic",
  className = "",
  children,
}: CardSwapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const orderRef = useRef<number[]>([]);
  const swapRef = useRef<() => void>(() => undefined);
  const childCount = Children.count(children);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cards = Array.from(
      container.querySelectorAll<HTMLElement>(":scope > [data-card-swap-card]"),
    );
    const total = cards.length;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    orderRef.current = Array.from({ length: total }, (_, index) => index);

    cards.forEach((card, index) => {
      const slot = slotFor(index, cardDistance, verticalDistance, total);
      card.style.width = cssDimension(width);
      card.style.height = cssDimension(height);
      gsap.set(card, {
        ...slot,
        xPercent: -50,
        yPercent: -50,
        skewY: skewAmount,
        transformOrigin: "center center",
        force3D: true,
      });
    });

    const config =
      easing === "elastic"
        ? {
            ease: "elastic.out(0.6,0.9)",
            drop: 1.35,
            move: 1.35,
            returnDuration: 1.35,
            overlap: 0.82,
          }
        : {
            ease: "power1.inOut",
            drop: 0.68,
            move: 0.68,
            returnDuration: 0.68,
            overlap: 0.45,
          };

    const swap = () => {
      const [front, ...rest] = orderRef.current;
      if (front === undefined || rest.length === 0 || timelineRef.current?.isActive()) return;

      const frontCard = cards[front];
      const timeline = gsap.timeline();
      timelineRef.current = timeline;
      timeline.to(frontCard, {
        y: `+=${Math.max(Number.parseFloat(cssDimension(height)), 380) + 140}`,
        duration: reducedMotion ? 0.01 : config.drop,
        ease: config.ease,
      });
      timeline.addLabel("promote", `-=${config.drop * config.overlap}`);

      rest.forEach((cardIndex, position) => {
        const slot = slotFor(position, cardDistance, verticalDistance, total);
        timeline.set(cards[cardIndex], { zIndex: slot.zIndex }, "promote");
        timeline.to(
          cards[cardIndex],
          {
            x: slot.x,
            y: slot.y,
            z: slot.z,
            duration: reducedMotion ? 0.01 : config.move,
            ease: config.ease,
          },
          `promote+=${reducedMotion ? 0 : position * 0.1}`,
        );
      });

      const backSlot = slotFor(total - 1, cardDistance, verticalDistance, total);
      timeline.addLabel("return", `promote+=${reducedMotion ? 0 : config.move * 0.08}`);
      timeline.set(frontCard, { zIndex: backSlot.zIndex }, "return");
      timeline.to(
        frontCard,
        {
          x: backSlot.x,
          y: backSlot.y,
          z: backSlot.z,
          duration: reducedMotion ? 0.01 : config.returnDuration,
          ease: config.ease,
        },
        "return",
      );
      timeline.call(() => {
        orderRef.current = [...rest, front];
      });
    };
    swapRef.current = swap;

    const clickHandlers = cards.map((card, index) => {
      const handler = () => {
        onCardClick?.(index);
        swapRef.current();
      };
      card.addEventListener("click", handler);
      return handler;
    });

    let interval: number | undefined;
    let inViewport = false;
    let hovered = false;
    const stopInterval = () => {
      if (interval !== undefined) window.clearInterval(interval);
      interval = undefined;
    };
    const startInterval = () => {
      if (reducedMotion || interval !== undefined) return;
      interval = window.setInterval(swap, delay);
    };
    const syncPlayback = () => {
      const shouldRun = inViewport && !document.hidden && !(pauseOnHover && hovered);
      if (shouldRun) {
        timelineRef.current?.play();
        startInterval();
      } else {
        timelineRef.current?.pause();
        stopInterval();
      }
    };
    const pause = () => {
      hovered = true;
      syncPlayback();
    };
    const resume = () => {
      hovered = false;
      syncPlayback();
    };
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        inViewport = entry.isIntersecting;
        syncPlayback();
      },
      { rootMargin: "100px 0px" },
    );
    const onVisibilityChange = () => syncPlayback();
    container.addEventListener("mouseenter", pause);
    container.addEventListener("mouseleave", resume);
    document.addEventListener("visibilitychange", onVisibilityChange);
    intersectionObserver.observe(container);

    return () => {
      stopInterval();
      timelineRef.current?.kill();
      container.removeEventListener("mouseenter", pause);
      container.removeEventListener("mouseleave", resume);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      intersectionObserver.disconnect();
      cards.forEach((card, index) => card.removeEventListener("click", clickHandlers[index]));
    };
  }, [
    cardDistance,
    childCount,
    delay,
    easing,
    height,
    onCardClick,
    pauseOnHover,
    skewAmount,
    verticalDistance,
    width,
  ]);

  const style: CSSProperties = {
    width: cssDimension(width),
    height: cssDimension(height),
    perspective: "900px",
  };

  return (
    <div
      ref={containerRef}
      className={`absolute bottom-0 right-0 origin-bottom-right translate-x-[4%] translate-y-[8%] overflow-visible max-lg:right-1/2 max-lg:translate-x-1/2 ${className}`}
      style={style}
      role="region"
      aria-label="Soul Studio views. Select a card to move through the stack."
    >
      {children}
    </div>
  );
}
