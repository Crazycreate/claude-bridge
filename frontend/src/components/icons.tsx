/**
 * Inline SVG icons — replacements for emoji, which render as tofu boxes in
 * environments without an emoji font. All icons are 24×24 line glyphs that
 * inherit `currentColor`, so they pick up the surrounding text colour.
 */
import type { CSSProperties } from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

const baseStyle: CSSProperties = { display: 'inline-block', verticalAlign: '-0.15em', flexShrink: 0 };

function Svg({
  size = 16,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={baseStyle}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconFolder(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 8a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </Svg>
  );
}

export function IconFolderOpen(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 8a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2" />
      <path d="M3 8v9a2 2 0 0 0 2 2h13.5a2 2 0 0 0 1.9-1.4l1.6-5A1 1 0 0 0 21 11H7a2 2 0 0 0-1.9 1.4z" />
    </Svg>
  );
}

export function IconChat(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
    </Svg>
  );
}

export function IconTerminal(p: IconProps) {
  return (
    <Svg {...p}>
      <polyline points="5 8 9 12 5 16" />
      <line x1="12" y1="16" x2="19" y2="16" />
    </Svg>
  );
}

export function IconTool(p: IconProps) {
  // A bolt — "an action is being executed".
  return (
    <Svg {...p}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
    </Svg>
  );
}

export function IconLock(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

export function IconBell(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 9a6 6 0 0 1 12 0c0 6 2 8 2 8H4s2-2 2-8" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </Svg>
  );
}

export function IconBellOff(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 9a6 6 0 0 1 12 0c0 6 2 8 2 8H4s2-2 2-8" />
      <path d="M10 21a2 2 0 0 0 4 0" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </Svg>
  );
}

export function IconFile(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" />
      <path d="M13 3v6h6" />
    </Svg>
  );
}

export function IconMenu(p: IconProps) {
  return (
    <Svg {...p}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </Svg>
  );
}

export function IconGear(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
    </Svg>
  );
}
