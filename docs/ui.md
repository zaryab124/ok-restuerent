# UI / UX Design System & Guidelines — OK Restaurant

## 1. Design Aesthetics & Visual Identity
- **Brand Palette**:
  - Primary Accent: Amber / Gold (`#F59E0B`, `#D97706`) - appetizing, energetic restaurant vibe.
  - Dark Neutral / Slate background tones (`#0F172A`, `#1E293B`, `#020617`) for KDS & modern dark theme support.
  - Light Clean Surface (`#FFFFFF`, `#F8FAFC`, `#F1F5F9`) for customer mobile ordering & admin table layouts.
  - Status Colors:
    - Pending: Amber (`#F59E0B`)
    - Confirmed / Preparing: Blue (`#3B82F6`)
    - Ready / Out for Delivery: Emerald (`#10B981`)
    - Rejected / Cancelled: Rose (`#F43F5E`)

## 2. Customer UX & Layouts
- **Hero & Branch Selector**: Immediate brand impact, branch switcher with live capabilities badges (Delivery available / Takeaway only).
- **Menu Experience**: Sticky category bar, search & filter, visual menu cards with pricing variants (Full / Half / Small / Medium / Large), instant item details drawer, sticky cart floating action bar on mobile.
- **QR Table Flow**: Auto-selects branch & table from URL token (`/table/[token]`), displays banner "Ordering for Dera Chungi — Table T-12". Prevents invalid delivery selection for dine-in.
- **Realtime Order Tracker**: Step progress bar showing live status updates from admin approval down to rider arrival.

## 3. Management Portals UX
- **Branch Admin Portal**: Clean dashboard cards for daily metrics, quick order action buttons (Approve / Reject), interactive Table Manager with printable QR modal.
- **Kitchen Display System (KDS)**: Dark high-contrast Kanban board, enlarged item text & quantities, timer countdowns since order placement, audio tone triggers on new orders.
- **Rider Portal**: High-touch mobile UI, swipe/tap action buttons (Accept Order, Picked Up, Delivered), direct tap-to-call customer button and address navigation links.
- **Owner Portal**: Multi-branch analytics overview, branch comparison charts, financial summaries, branch capability toggle switches.
