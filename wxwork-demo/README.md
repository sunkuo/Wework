# WxWork Demo (Refactored)

This project has been refactored to use NestJS for the backend and Vue 3 + TypeScript + Element Plus for the frontend.

## Directory Structure

- `backend/`: NestJS Backend (with Prisma)
- `frontend/`: Vue 3 Frontend (with Vite)
- `_legacy/`: Original Express + HTML implementation

## Getting Started

### Backend

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Generate Prisma Client:
   ```bash
   npx prisma generate
   ```
4. Start the backend server:
   ```bash
   npm run start:dev
   ```
   The server will run on `http://localhost:3000`.

### Frontend

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
   The frontend will run on `http://localhost:5173`.
