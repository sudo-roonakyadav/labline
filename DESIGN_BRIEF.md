# LABLINE / SIGNAL — Design Brief & Creative Direction

## 1. Concept: The Carrier & The Signal

In a modern university or coding bootcamp computer lab, students do not have "tickets" — they have **signals**. A student stuck on a memory leak, broken build, or segfault emits a distress signal. Without a disciplined system, signals are lost to hand-waving, queue-jumping, and mentor exhaustion.

**LabLine** treats the lab queue as a high-precision signal pipeline:
- **Emission**: A student frames their doubt into structured telemetry (category, topic, description, reproduction code).
- **Propagation**: The signal enters an immutable, FIFO carrier wave.
- **Attunement**: A mentor locks onto the signal atomically.
- **Harmonization**: An active session takes place; knowledge transfers.
- **Resolution**: The signal concludes with recorded resolution outcomes and feedback.

---

## 2. Palette & Visual Atmosphere

Inspired by laboratory oscilloscopes, technical typography, and Swiss editorial design:

| Token | Hex | Role | Contrast Ratio |
| :--- | :--- | :--- | :--- |
| **Deep Ink** | `#0B0D0C` | Primary background canvas | Base layer |
| **Raised Charcoal** | `#151916` | Surface cards, headers, panels | Subtle elevation |
| **Elevated Border** | `#222824` | 1px structural framing rules | High-precision geometry |
| **Subtle Rule** | `#1A201C` | Secondary internal dividers | Soft separation |
| **Warm White** | `#F3F1E8` | Primary headlines, display text | 16.8:1 against Deep Ink |
| **Muted Neutral** | `#969D94` | Body copy, technical labels, hints | 7.2:1 against Deep Ink |
| **Signal Chartreuse** | `#D6FF55` | Primary signal accent, active states, CTA | 14.5:1 against Deep Ink |
| **Active Blue** | `#55D6FF` | In-progress session indicator | 12.1:1 against Deep Ink |
| **Amber Pulse** | `#E5B842` | Waiting queue position pill | 9.8:1 against Deep Ink |
| **Restrained Red** | `#FF5C5C` | Destructive actions (Cancel signal) | 6.4:1 against Deep Ink |

**Rules:**
- No purple or pink gradients.
- No glassmorphism, blur effects, or oversized drop shadows.
- No indiscriminate rounded pill shapes.
- Precision 2px radius maximum for strict architectural containment.

---

## 3. Typography & Hierarchy

### Pairing
- **Display / Expressive (`Syne`)**: A geometric, sculpted, editorial display typeface with striking weight distribution. Used for primary headlines, wordmark, section markers, and hero statements.
- **Interface / Reading (`Inter`)**: Neutral, crystal-clear, highly readable grotesque for inputs, descriptions, and data tables at 14–16px body scale.
- **Technical / Telemetry (`JetBrains Mono` / System Mono)**: Micro-labels (`11px`, `letter-spacing: 0.08em`, uppercase) for timestamps, queue coordinates, code snippets, and system states.

### Scale Contrast
- Hero Display: `48px` to `64px` (`Syne 700 / 800`)
- Section Header: `24px` to `32px` (`Syne 600`)
- Workspace Card Title: `16px` to `18px` (`Syne 600` / `Inter 600`)
- Body Copy: `14px` to `15px` (`Inter 400 / 500`)
- Metadata / Labels: `11px` to `12px` (`Mono 500 / 600`)

---

## 4. Interaction Philosophy

1. **The Signature Signal Visualizer**:
   A living SVG canvas representing the 5 phases of a lab doubt. Carrier lines connect each stage, illustrating latency, queue pressure, and mentor throughput without mocking fake data.
2. **Immediate Clarity Over Clutter**:
   Progressive disclosure is applied. When a student has an active signal, the tracker is front-and-center; history and composer remain accessible but subordinate.
3. **State Fidelity**:
   Every state is real: live WebSocket indicators, atomic mentor claims, verified queue positions, and honest wait estimates (flagging when historical data is insufficient).
4. **Accessible by Design**:
   Full keyboard focus rings in Signal Chartreuse (`#D6FF55`), zero motion sickness with `@media (prefers-reduced-motion: reduce)`, and high contrast text ratios exceeding WCAG AAA standards.
