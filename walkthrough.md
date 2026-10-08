# Walkthrough: Database-Driven Refactor & Authentication

## Overview
We have successfully refactored the Auction Application to be fully database-driven, using MongoDB as the single source of truth, and implemented secure Token-Based Authentication (JWT).

## Key Changes

### 1. Authentication System
- **Backend**: 
  - Implemented JWT generation in `POST /api/auth/login`.
  - Added Authorization Middleware to protect auction routes (`/api/auction/*`).
  - Added `activeSessions` management to ensure single-session per team.
  - Implemented `POST /api/logout`.
  - **Robustness**: Login normalizes `teamCode` to support uppercase/lowercase variants (e.g., 'RCB' vs 'rcb').
- **Frontend**:
  - Created `AuthContext` to manage token and user state.
  - Updated `LoginPage` to use `AuthContext`.
  - Updated `RequireAuth` to protect routes based on `AuthContext`.
  - Added Axios interceptor in `api.js` to attach `Bearer` token to all requests.
  - **Dashboard**: Added User Profile Badge in the header showing logged-in team and logout button.

### 2. Database Integration (MongoDB)
- The application now pulls all data from MongoDB:
  - `Team` collection for purses and squads.
  - `Player` collection for potential buys.
  - `AuctionState` collection for **Live Bidding**.

### 3. Real-Time Bidding System
- **Single Source of Truth**: All auction state (current bidder, price, timer) is stored in `AuctionState` collection.
- **Robust Timer**:
  - Timer is no longer an in-memory counter.
  - Backend sets `timerEndsAt` (Timestamp) in DB.
  - Socket loop checks DB every second for expiration.
  - Frontend (`AuctionPage`) calculates remaining time locally from `timerEndsAt` for smooth 60fps countdown.
- **Fail-Safe**:
  - Server restarts do not lose auction state.
  - Users joining late receive exact remaining time.
  - **Players**: `GET /api/players` is now protected and DB-backed.
  - **Auction State**: All auction actions (`bid`, `start`, `end`) update the `AuctionState` document in MongoDB.

### 4. Real-Time Synchronization (Socket.io)
- **Authentication**: Socket connection now requires a valid JWT token in the handshake.
- **Session Control**: Disconnecting the socket (e.g., closing tab) clears the active session in the backend.
- **State Sync**: Sockets broadcast the FULL state from the Database (`AuctionState` + `Team` collections) ensuring all clients are perfectly in sync with the DB.

### 4. Admin Panel
- **Secure Access**: Admin page uses `useAuth` to login securely as 'admin'.
- **Control**: Admin actions interact with backend Protected APIs.

## Verification
- **Backend Verification Script**: Confirmed Login, Logout, Duplicate Login prevention, and Team data fetching.
- **Frontend Build**: Confirmed clear build with no syntax errors.

## New Files
- `client/src/context/AuthContext.jsx`
- `server/sessionStore.js`

## Setup Instructions
1. Ensure `.env` in `client` has `VITE_API_BASE_URL=http://localhost:5000`.
2. Ensure `.env` in `server` has `MONGO_URI`, `JWT_SECRET`, and `ADMIN_PASSWORD`.
3. Run `npm start` in `server`.
4. Run `npm run dev` in `client`.

## 6. Optimization & Serial Numbering
To improve performance and ensuring sequential auction flow, the following features were added:

### **Features Implemented**
- **Sequential Player Order (`srNo`)**:
  - Players are now auctioned strictly in order of their Serial Number (`srNo`).
  - Added `srNo` to the `Player` schema and migrated all existing players.
  - Displayed `srNo` (e.g., `#12`) on both the **Admin Dashboard** and **Auction Page**.
- **Performance Optimization**:
  - **Socket Loop Refactor**: Replaced the 1-second MongoDB polling loop with an efficient in-memory timer check.
  - **Admin Session Persistence**: Fixed the issue where refreshing the admin page would cause an auto-logout.
  - **Real-Time Sync**: Ensured smooth timer updates without redundant database reads.

### **Verification**
- **Sequential Flow**: Confirmed `Next Player` functionality accurately selects the next available player by `srNo`.
- **UI Updates**: Verified that `srNo` is visible next to player names.
- **Performance**: Observed no DB polling spam in console logs.

## 7. Recovery & Stabilization Mode
To resolve synchronization issues, the application is currently running in a **Stabilization Mode**:
- **Socket.IO Disabled**: Real-time pushing is temporarily disabled to isolate logic.
- **HTTP Polling**: The Frontend (`AuctionPage`, `AdminPage`) now polls the backend every 1 second for the latest state.
- **Single Source of Truth**: All actions (`start`, `bid`, `next`) write essentially to MongoDB, and clients read from MongoDB.
- **Verification**: Core flows authenticated and verified via scripts `verify_auction.js` and `verify_status_poll.js`.

## 8. Final Status: Perfect Synchronization
The system has been upgraded to Phase 4:
- **Strict DB Truth**: Every auction action (Bid/Next/Start) writes to MongoDB first.
- **Broadcast Snapshots**: The backend emits the **Full Auction State** (including all team budgets) via Socket.IO after every write.
- **Client Passive Sync**: Clients (Admin & Team) listen primarily to `auction:state`. All local logic/timers are visual only; data comes 100% from the server.
- **Result**: Admin and Teams are perfectly synchronized. Refreshing restores the exact state from DB.
