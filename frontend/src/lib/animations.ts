import { Variants, Transition } from "framer-motion";

// ── Spring presets ────────────────────────────────────────────────────────────
export const spring = {
  snappy:  { type: "spring", stiffness: 400, damping: 30 } as Transition,
  smooth:  { type: "spring", stiffness: 280, damping: 32 } as Transition,
  gentle:  { type: "spring", stiffness: 180, damping: 28 } as Transition,
  bouncy:  { type: "spring", stiffness: 340, damping: 22 } as Transition,
} as const;

// ── Easing curves (mirrors CSS tokens) ───────────────────────────────────────
export const ease = {
  outSoft: [0.22, 1, 0.36, 1] as [number, number, number, number],
  inSoft:  [0.64, 0, 0.78, 0] as [number, number, number, number],
  fluid:   [0.34, 1.56, 0.64, 1] as [number, number, number, number],
} as const;

// ── Stagger containers ────────────────────────────────────────────────────────
export const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

export const staggerFast: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.05 },
  },
};

export const staggerSlow: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.2 },
  },
};

// ── Item / child variants ─────────────────────────────────────────────────────
export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { ...spring.smooth },
  },
};

export const itemSlideLeft: Variants = {
  hidden: { opacity: 0, x: -16 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { ...spring.smooth },
  },
};

export const itemSlideRight: Variants = {
  hidden: { opacity: 0, x: 16 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { ...spring.smooth },
  },
};

// ── Fade ─────────────────────────────────────────────────────────────────────
export const fadeInVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.28, ease: ease.outSoft },
  },
};

// ── Scale ─────────────────────────────────────────────────────────────────────
export const scaleUpVariants: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { ...spring.smooth },
  },
};

// ── Page transition (route changes) ──────────────────────────────────────────
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: ease.outSoft },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.16, ease: ease.inSoft },
  },
};

// ── Modal / dialog ────────────────────────────────────────────────────────────
export const modalVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 4 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.22, ease: ease.outSoft },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    transition: { duration: 0.16, ease: ease.inSoft },
  },
};

export const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit:   { opacity: 0, transition: { duration: 0.16 } },
};

// ── Side panel / drawer ───────────────────────────────────────────────────────
export const panelRightVariants: Variants = {
  hidden:  { opacity: 0, x: "100%" },
  visible: { opacity: 1, x: 0, transition: { ...spring.smooth } },
  exit:    { opacity: 0, x: "100%", transition: { duration: 0.2, ease: ease.inSoft } },
};

export const panelLeftVariants: Variants = {
  hidden:  { opacity: 0, x: "-100%" },
  visible: { opacity: 1, x: 0, transition: { ...spring.smooth } },
  exit:    { opacity: 0, x: "-100%", transition: { duration: 0.2, ease: ease.inSoft } },
};

export const panelBottomVariants: Variants = {
  hidden:  { opacity: 0, y: "100%" },
  visible: { opacity: 1, y: 0, transition: { ...spring.smooth } },
  exit:    { opacity: 0, y: "100%", transition: { duration: 0.2, ease: ease.inSoft } },
};

// ── Score / viral orb ─────────────────────────────────────────────────────────
export const scoreRevealVariants: Variants = {
  hidden:  { opacity: 0, scale: 0.7, y: 8 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { ...spring.bouncy, delay: 0.2 },
  },
};

// ── Card ──────────────────────────────────────────────────────────────────────
export const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { ...spring.smooth },
  },
  hover: {
    y: -3,
    transition: { duration: 0.16, ease: ease.outSoft },
  },
};

// ── Tooltip / popover ─────────────────────────────────────────────────────────
export const tooltipVariants: Variants = {
  hidden:  { opacity: 0, scale: 0.94, y: 4 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.14, ease: ease.outSoft } },
  exit:    { opacity: 0, scale: 0.96, transition: { duration: 0.1 } },
};
