# Product Specification — OK Restaurant Multi-Branch Platform

## 1. Overview & Vision
OK Restaurant is a premium, multi-branch food ordering and management platform. It offers a seamless customer ordering experience across mobile and desktop devices, alongside role-specific management portals for Branch Admins, Kitchen Display Systems (KDS), Delivery Riders, and the Restaurant Owner.

## 2. Business Model & Branches
The platform manages **1 Restaurant Business** across **3 Physical Branches**:
1. **Dera Chungi (Opposite Shell Pump, Jampur)**
   - Capabilities: `DINING_IN`, `TAKEAWAY`, `DELIVERY`
   - Primary hub for delivery operations and full menu catalog.
2. **Sherifalon Bypass Road**
   - Capabilities: `DINING_IN`, `TAKEAWAY` (No Delivery)
3. **Kot Chuta / Appo Chuta**
   - Capabilities: `DINING_IN`, `TAKEAWAY` (No Delivery)

### Key Architectural Constraint
- Capabilities are strictly database-driven (`branch_capabilities` table).
- Additional branches can be provisioned dynamically without application code changes.
- Delivery options are rejected at backend level if requested at non-delivery branches.

## 3. Core User Roles & Portals
- **Customer Portal** (`/`, `/menu`, `/cart`, `/checkout`, `/order-tracking`, `/table/[token]`): Guest checkout or authenticated account, QR table ordering, branch selection, realtime order tracking.
- **Branch Admin Portal** (`/admin`): Restricted by `branch_id`. Order approvals/rejections, table management, QR generation, menu availability toggling, staff assignment, branch analytics.
- **Kitchen Display System (KDS)** (`/kitchen`): Kanban order flow (NEW → CONFIRMED → PREPARING → READY → COMPLETED). Restricted by `branch_id`.
- **Rider Portal** (`/rider`): Delivery order pool for authorized delivery branches (Dera Chungi). Concurrency-safe order claiming, route details, delivery state machine transitions.
- **Owner Portal** (`/owner`): Multi-branch executive dashboard, cross-branch sales analytics, global user/staff administration, branch capability configuration.

## 4. Order Workflow & State Machine
Valid Transitions:
- `PENDING` → `CONFIRMED` or `REJECTED` (Admin approval)
- `CONFIRMED` → `PREPARING` (Kitchen starts order)
- `PREPARING` → `READY` (Kitchen completes food prep)
- **If Delivery**:
  - `READY` → `ASSIGNED` (Rider accepts delivery)
  - `ASSIGNED` → `PICKED_UP` (Rider picks up from kitchen)
  - `PICKED_UP` → `OUT_FOR_DELIVERY` (Rider en route)
  - `OUT_FOR_DELIVERY` → `DELIVERED` / `COMPLETED`
- **If Dine-In / Takeaway**:
  - `READY` → `COMPLETED` (Customer served / picked up)
- Any state before completion → `CANCELLED` (with reason)

Every state transition writes to `order_status_history` and emits Supabase Realtime signals to connected clients.
